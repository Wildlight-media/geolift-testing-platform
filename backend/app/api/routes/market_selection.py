import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from rq.command import send_stop_job_command
from rq.exceptions import InvalidJobOperation, NoSuchJobError
from rq.job import Job
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.experiments import get_owned_experiment
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.market_selection import CandidateSimulation, MarketSelectionResult, MarketSelectionRun
from app.models.user import User
from app.schemas.market_selection import (
    CandidateSimulationCreate,
    CandidateSimulationOut,
    MarketSelectionDetailRequest,
    MarketSelectionResultOut,
    MarketSelectionRunCreate,
    MarketSelectionRunOut,
)
from app.services import r_client
from app.services.dataset_loader import load_records, mapping_for
from app.services.replay import apply_planned_start
from app.services.r_client import RServiceError
from app.workers.jobs import run_candidate_simulation_job, run_market_selection_job
from app.workers.queue import job_queue, redis_conn

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


@router.post("/{run_id}/cancel", response_model=MarketSelectionRunOut)
def cancel_run(
    experiment_id: uuid.UUID,
    run_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarketSelectionRun:
    """Cancels a queued or in-progress run.

    A queued job is removed outright before it ever reaches r-service - no
    compute wasted, fully effective. A job already running is trickier:
    r-service (plain plumber, no concurrency) processes one request at a
    time, so its actual R computation can't be interrupted mid-flight
    without restarting the container - something this endpoint deliberately
    doesn't do itself (that needs Docker socket access, which we specifically
    avoid granting app containers). What this does instead: immediately stop
    the *worker* from waiting on that request (freeing it to pick up the
    next queued job right away) and mark the run failed/cancelled so the UI
    reflects it instantly. The abandoned R computation may keep running
    briefly in the background until r-service is next restarted.
    """
    get_owned_experiment(experiment_id, db, user)
    run = db.get(MarketSelectionRun, run_id)
    if not run or run.experiment_id != experiment_id:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ("queued", "running"):
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}, nothing to cancel")

    if run.rq_job_id:
        try:
            job = Job.fetch(run.rq_job_id, connection=redis_conn)
            if job.get_status() == "queued":
                job.cancel()
            elif job.get_status() == "started":
                send_stop_job_command(redis_conn, run.rq_job_id)
        except (NoSuchJobError, InvalidJobOperation):
            pass  # already gone from Redis one way or another - just fix the DB row below

    run.status = "failed"
    run.error = "Cancelled by user"
    run.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(run)
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
    # Same seasonal replay the run used, so the detail power curve is
    # calibrated on the same window as the ranked table.
    try:
        records, _window = apply_planned_start(
            records,
            date_col=dataset.date_col,
            date_format=dataset.date_format,
            planned_start=run.params_json.get("planned_start_date"),
            duration=payload.duration,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

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


@router.post("/{run_id}/simulate", response_model=CandidateSimulationOut)
def start_candidate_simulation(
    experiment_id: uuid.UUID,
    run_id: uuid.UUID,
    payload: CandidateSimulationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CandidateSimulation:
    """Kicks off a pre-test 'what would this look like' preview for one
    candidate market combination. This runs the real GeoLift() pipeline
    against a copy of the real data with a hypothetical effect injected -
    on a large real dataset this can take as long as a real analyze run
    (confirmed: ~27 minutes with confidence intervals on), so it's a
    background job polled like MarketSelectionRun, not a synchronous call.
    """
    experiment = get_owned_experiment(experiment_id, db, user)
    run = db.get(MarketSelectionRun, run_id)
    if not run or run.experiment_id != experiment.id:
        raise HTTPException(status_code=404, detail="Run not found")

    simulation = CandidateSimulation(
        market_selection_run_id=run.id,
        locations=payload.locations,
        duration=payload.duration,
        effect_sizes=payload.effect_sizes,
        status="queued",
    )
    db.add(simulation)
    db.commit()
    db.refresh(simulation)

    job = job_queue.enqueue(run_candidate_simulation_job, str(simulation.id))
    simulation.rq_job_id = job.id
    db.commit()
    db.refresh(simulation)
    return simulation


@router.get("/{run_id}/simulate/{simulation_id}", response_model=CandidateSimulationOut)
def get_candidate_simulation(
    experiment_id: uuid.UUID,
    run_id: uuid.UUID,
    simulation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CandidateSimulation:
    get_owned_experiment(experiment_id, db, user)
    simulation = db.get(CandidateSimulation, simulation_id)
    if not simulation or simulation.market_selection_run_id != run_id:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return simulation
