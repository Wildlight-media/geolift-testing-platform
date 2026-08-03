import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.experiment import Experiment
from app.models.user import User
from app.schemas.experiment import ExperimentCreate, ExperimentOut

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


@router.post("", response_model=ExperimentOut)
def create_experiment(
    payload: ExperimentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Experiment:
    dataset = db.get(Dataset, payload.dataset_id)
    if not dataset or dataset.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    experiment = Experiment(
        org_id=user.org_id,
        dataset_id=dataset.id,
        name=payload.name,
        created_by_id=user.id,
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return experiment


@router.get("", response_model=list[ExperimentOut])
def list_experiments(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Experiment]:
    return (
        db.query(Experiment)
        .filter(Experiment.org_id == user.org_id)
        .order_by(Experiment.created_at.desc())
        .all()
    )


@router.get("/{experiment_id}", response_model=ExperimentOut)
def get_experiment(
    experiment_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Experiment:
    experiment = db.get(Experiment, experiment_id)
    if not experiment or experiment.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


def get_owned_experiment(experiment_id: uuid.UUID, db: Session, user: User) -> Experiment:
    experiment = db.get(Experiment, experiment_id)
    if not experiment or experiment.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment
