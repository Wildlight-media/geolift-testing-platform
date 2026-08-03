import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.dataset import DatasetOut
from app.services import r_client
from app.services.dataset_loader import load_records, mapping_for
from app.services.dataset_upload import process_dataset_upload
from app.services.r_client import RServiceError

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.post("", response_model=DatasetOut)
def upload_dataset(
    name: str = Form(...),
    location_col: str = Form("location"),
    date_col: str = Form("date"),
    y_col: str = Form("Y"),
    date_format: str = Form("yyyy-mm-dd"),
    covariate_cols: str = Form(""),
    convert_zip_to_dma: bool = Form(False),
    drop_unmapped_zips: bool = Form(False),
    outcome_type: str = Form("revenue"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dataset:
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
        outcome_type=outcome_type,
        org_id=user.org_id,
        uploaded_by_id=user.id,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


@router.get("", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Dataset]:
    return (
        db.query(Dataset)
        .filter(Dataset.org_id == user.org_id)
        .order_by(Dataset.created_at.desc())
        .all()
    )


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(
    dataset_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.post("/{dataset_id}/refresh", response_model=DatasetOut)
def refresh_dataset(
    dataset_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Dataset:
    """Re-validates a dataset already on disk against GeoDataRead and updates
    its cached metadata (row/location counts, locations, period<->date map).

    Needed for datasets uploaded before a metadata field existed - e.g.
    period_dates - since that's only computed at upload time otherwise, and
    re-running this doesn't require the user to re-upload the file or redo
    their column mapping / zip-conversion settings.
    """
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    records = load_records(dataset)
    try:
        r_result = r_client.read_data(data=records, mapping=mapping_for(dataset))
    except RServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    dataset.row_count = r_result["row_count"]
    dataset.location_count = r_result["location_count"]
    dataset.time_period_count = r_result["time_period_count"]
    dataset.locations = r_result["locations"]
    dataset.period_dates = r_result["period_dates"]
    dataset.summary_json = r_result
    db.commit()
    db.refresh(dataset)
    return dataset
