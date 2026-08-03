"""Reads a Dataset's stored CSV back into JSON records for r-service calls,
and builds the column-mapping payload every r-service endpoint expects.
"""

import io

import pandas as pd

from app.models.dataset import Dataset
from app.services import storage


def parse_csv_bytes(content: bytes, *, y_col: str, covariate_cols: list[str]) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(content), dtype=str)
    for col in [y_col, *covariate_cols]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def load_records(dataset: Dataset) -> list[dict]:
    content = storage.read_bytes(dataset.storage_path)
    df = parse_csv_bytes(content, y_col=dataset.y_col, covariate_cols=dataset.covariate_cols)
    return df.to_dict(orient="records")


def mapping_for(dataset: Dataset) -> dict:
    return {
        "date_id": dataset.date_col,
        "location_id": dataset.location_col,
        "Y_id": dataset.y_col,
        "format": dataset.date_format,
        "X": dataset.covariate_cols,
    }
