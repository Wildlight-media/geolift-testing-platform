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


def densify_panel(
    df: pd.DataFrame, *, location_col: str, date_col: str, y_col: str, covariate_cols: list[str]
) -> tuple[pd.DataFrame, int]:
    """Fills in any missing (location, date) combination with Y=0 (and
    covariates=0).

    GeoLift::GeoDataRead drops a location entirely if it's missing even one
    of the dataset's distinct dates ("incomplete panel"), which silently
    discards a lot of real data - most sales/conversion exports only record
    days something happened, so a sparse location is the norm, not the
    exception, and a missing day almost always means zero activity that day.
    Densifying here means GeoDataRead never has anything to drop.
    """
    value_cols = [y_col, *covariate_cols]
    df = df[[location_col, date_col, *value_cols]]
    # collapse any duplicate (location, date) rows (e.g. multiple line items
    # per day) - reindexing below requires a unique index, and summing is
    # the same aggregation zip->DMA conversion already does.
    df = df.groupby([location_col, date_col], as_index=False)[value_cols].sum()

    locations = df[location_col].unique()
    dates = df[date_col].unique()
    full_index = pd.MultiIndex.from_product([locations, dates], names=[location_col, date_col])

    densified = df.set_index([location_col, date_col]).reindex(full_index)
    filled_count = int(densified[y_col].isna().sum())
    densified[value_cols] = densified[value_cols].fillna(0)

    return densified.reset_index(), filled_count


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
