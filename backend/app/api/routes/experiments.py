import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.experiment import Experiment
from app.models.user import User
from app.schemas.dataset import DatasetOut
from app.schemas.experiment import ExperimentCreate, ExperimentOut
from app.services.dataset_upload import process_dataset_upload

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


@router.post("/{experiment_id}/dataset", response_model=DatasetOut)
def attach_refreshed_dataset(
    experiment_id: uuid.UUID,
    name: str = Form(...),
    location_col: str = Form("location"),
    date_col: str = Form("date"),
    y_col: str = Form("Y"),
    date_format: str = Form("yyyy-mm-dd"),
    covariate_cols: str = Form(""),
    convert_zip_to_dma: bool = Form(False),
    drop_unmapped_zips: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dataset:
    """Uploads a new dataset and points this experiment at it, in place -
    for re-running the same test against a refreshed data pull mid-test
    without losing the experiment's history (past analyses/reports stay
    exactly as they were; only what a *new* analysis reads changes)."""
    experiment = get_owned_experiment(experiment_id, db, user)

    dataset = process_dataset_upload(
        file=file,
        name=name,
        location_col=location_col,
        date_col=date_col,
        y_col=y_col,
        date_format=date_format,
        covariate_cols=covariate_cols,
        convert_zip_to_dma=convert_zip_to_dma,
        drop_unmapped_zips=drop_unmapped_zips,
        org_id=user.org_id,
        uploaded_by_id=user.id,
    )
    db.add(dataset)
    db.flush()

    experiment.dataset_id = dataset.id
    db.commit()
    db.refresh(dataset)
    return dataset


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
