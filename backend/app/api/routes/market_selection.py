import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.experiments import get_owned_experiment
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.market_selection import MarketSelectionResult, MarketSelectionRun
from app.models.user import User
from app.schemas.market_selection import (
    MarketSelectionDetailRequest,
    MarketSelectionResultOut,
    MarketSelectionRunCreate,
    MarketSelectionRunOut,
)
from app.services import r_client
from app.services.dataset_loader import load_records, mapping_for
from app.services.r_client import RServiceError
from app.workers.jobs import run_market_selection_job
from app.workers.queue import job_queue

router = APIRouter(prefix="/api/experiments/{experiment_id}/market-selection", tags=["market-selection"])

# Params carried over from the run into an on-demand candidate detail lookup.
_DETAIL_PARAM_KEYS = {"cpic", "alpha", "model", "fixed_effects", "side_of_test", "lookback_window"}


@router.post("", response_model=MarketSelectionRunOut)
def start_market_selection(
    experiment_id: uuid.UUID,
    payload: MarketSelectionRunCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarketSelectionRun:
    experiment = get_owned_experiment(experiment_id, db, user)

    run = MarketSelectionRun(
        experiment_id=experiment.id,
        params_json=payload.params.model_dump(),
        status="queued",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    job = job_queue.enqueue(run_market_selection_job, str(run.id))
    run.rq_job_id = job.id
    experiment.status = "market_selection_running"
    db.commit()
    db.refresh(run)
    return run


@router.get("", response_model=list[MarketSelectionRunOut])
def list_runs(
    experiment_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[MarketSelectionRun]:
    experiment = get_owned_experiment(experiment_id, db, user)
    return (
        db.query(MarketSelectionRun)
        .filter(MarketSelectionRun.experiment_id == experiment.id)
        .order_by(MarketSelectionRun.created_at.desc())
        .all()
    )


@router.get("/{run_id}", response_model=MarketSelectionRunOut)
def get_run(
    experiment_id: uuid.UUID,
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarketSelectionRun:
    get_owned_experiment(experiment_id, db, user)
    run = db.get(MarketSelectionRun, run_id)
    if not run or run.experiment_id != experiment_id:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/result", response_model=MarketSelectionResultOut)
def get_result(
    experiment_id: uuid.UUID,
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarketSelectionResult:
    get_owned_experiment(experiment_id, db, user)
    result = db.query(MarketSelectionResult).filter(MarketSelectionResult.run_id == run_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not ready")
    return result


@router.post("/{run_id}/detail")
def get_candidate_detail(
    experiment_id: uuid.UUID,
    run_id: uuid.UUID,
    payload: MarketSelectionDetailRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    experiment = get_owned_experiment(experiment_id, db, user)
    run = db.get(MarketSelectionRun, run_id)
    if not run or run.experiment_id != experiment.id:
        raise HTTPException(status_code=404, detail="Run not found")

    dataset = db.get(Dataset, experiment.dataset_id)
    records = load_records(dataset)

    params = {k: v for k, v in run.params_json.items() if k in _DETAIL_PARAM_KEYS}
    if payload.effect_size:
        params["effect_size"] = payload.effect_size

    try:
        return r_client.market_selection_detail(
            data=records,
            mapping=mapping_for(dataset),
            locations=payload.locations,
            duration=payload.duration,
            params=params,
        )
    except RServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
