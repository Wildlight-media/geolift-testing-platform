import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.dataset import DatasetOut
from app.services import r_client, storage, zip_dma
from app.services.dataset_loader import densify_panel, parse_csv_bytes
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
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dataset:
    content = file.file.read()
    covariates = [c.strip() for c in covariate_cols.split(",") if c.strip()]

    try:
        df = parse_csv_bytes(content, y_col=y_col, covariate_cols=covariates)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}") from exc

    missing = [c for c in [location_col, date_col, y_col, *covariates] if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columns not found in file: {missing}")

    if df[y_col].isna().any():
        raise HTTPException(status_code=400, detail=f"Column '{y_col}' has non-numeric values")

    dropped_zip_row_count = 0
    dropped_zip_codes: list[str] = []
    if convert_zip_to_dma:
        df, unmapped, dropped_zip_row_count = zip_dma.convert_zip_column_to_dma(
            df, location_col, drop_unmapped=drop_unmapped_zips
        )
        if unmapped and not drop_unmapped_zips:
            # structured detail (not just a string) so the frontend can offer
            # a "drop these rows and continue" recovery action instead of a
            # dead-end error
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "zip_mismatch",
                    "location_col": location_col,
                    "unmapped_count": len(unmapped),
                    "sample": unmapped[:20],
                    "message": (
                        f"{len(unmapped)} zip code(s) in '{location_col}' didn't match the zip→DMA crosswalk. "
                        "Check for non-US zips, typos, or blank values that got filled with placeholder numbers."
                    ),
                },
            )
        dropped_zip_codes = unmapped
        df = zip_dma.aggregate_to_dma(df, location_col=location_col, date_col=date_col, sum_cols=[y_col, *covariates])

    # Always fill gaps to a complete panel - GeoDataRead silently drops any
    # location missing even one date, and most sales/conversion exports only
    # record days something happened rather than explicit zero rows.
    df, filled_missing_row_count = densify_panel(
        df, location_col=location_col, date_col=date_col, y_col=y_col, covariate_cols=covariates
    )
    content = df.to_csv(index=False).encode("utf-8")

    mapping = {"date_id": date_col, "location_id": location_col, "Y_id": y_col, "format": date_format, "X": covariates}

    try:
        r_result = r_client.read_data(data=df.to_dict(orient="records"), mapping=mapping)
    except RServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    storage_path = storage.save_bytes(subdir=f"datasets/{user.org_id}", filename=file.filename, content=content)

    dataset = Dataset(
        org_id=user.org_id,
        uploaded_by_id=user.id,
        name=name,
        filename=file.filename,
        storage_path=storage_path,
        location_col=location_col,
        date_col=date_col,
        y_col=y_col,
        date_format=date_format,
        covariate_cols=covariates,
        converted_from_zip=convert_zip_to_dma,
        dropped_zip_row_count=dropped_zip_row_count,
        dropped_zip_codes=dropped_zip_codes,
        filled_missing_row_count=filled_missing_row_count,
        row_count=r_result["row_count"],
        location_count=r_result["location_count"],
        time_period_count=r_result["time_period_count"],
        locations=r_result["locations"],
        period_dates=r_result["period_dates"],
        summary_json=r_result,
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
