import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.experiments import get_owned_experiment
from app.db.session import get_db
from app.models.analysis import Analysis
from app.models.test_config import TestConfig
from app.models.user import User
from app.schemas.analysis import AnalysisOut, TestConfigCreate, TestConfigOut
from app.workers.jobs import run_analysis_job
from app.workers.queue import job_queue

router = APIRouter(prefix="/api/experiments/{experiment_id}", tags=["analyze"])


@router.post("/test-configs", response_model=TestConfigOut)
def create_test_config(
    experiment_id: uuid.UUID,
    payload: TestConfigCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TestConfig:
    experiment = get_owned_experiment(experiment_id, db, user)

    test_config = TestConfig(experiment_id=experiment.id, **payload.model_dump())
    db.add(test_config)
    experiment.status = "test_running"
    db.commit()
    db.refresh(test_config)
    return test_config


@router.get("/test-configs", response_model=list[TestConfigOut])
def list_test_configs(
    experiment_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[TestConfig]:
    experiment = get_owned_experiment(experiment_id, db, user)
    return (
        db.query(TestConfig)
        .filter(TestConfig.experiment_id == experiment.id)
        .order_by(TestConfig.created_at.desc())
        .all()
    )


@router.post("/test-configs/{test_config_id}/analyze", response_model=AnalysisOut)
def start_analysis(
    experiment_id: uuid.UUID,
    test_config_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Analysis:
    experiment = get_owned_experiment(experiment_id, db, user)
    test_config = db.get(TestConfig, test_config_id)
    if not test_config or test_config.experiment_id != experiment.id:
        raise HTTPException(status_code=404, detail="Test config not found")

    analysis = Analysis(experiment_id=experiment.id, test_config_id=test_config.id, status="queued")
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    job = job_queue.enqueue(run_analysis_job, str(analysis.id))
    analysis.rq_job_id = job.id
    db.commit()
    db.refresh(analysis)
    return analysis


@router.get("/analyses", response_model=list[AnalysisOut])
def list_analyses(
    experiment_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Analysis]:
    experiment = get_owned_experiment(experiment_id, db, user)
    return (
        db.query(Analysis)
        .filter(Analysis.experiment_id == experiment.id)
        .order_by(Analysis.created_at.desc())
        .all()
    )


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def get_analysis(
    experiment_id: uuid.UUID,
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Analysis:
    experiment = get_owned_experiment(experiment_id, db, user)
    analysis = db.get(Analysis, analysis_id)
    if not analysis or analysis.experiment_id != experiment.id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis
