import uuid
from datetime import datetime

from pydantic import BaseModel


class PeriodDate(BaseModel):
    period: int
    date: str


class DatasetColumnMapping(BaseModel):
    location_col: str = "location"
    date_col: str = "date"
    y_col: str = "Y"
    date_format: str = "yyyy-mm-dd"
    covariate_cols: list[str] = []


class DatasetOut(BaseModel):
    id: uuid.UUID
    name: str
    filename: str
    location_col: str
    date_col: str
    y_col: str
    date_format: str
    covariate_cols: list[str]
    converted_from_zip: bool
    dropped_zip_row_count: int
    dropped_zip_codes: list[str]
    filled_missing_row_count: int
    row_count: int | None
    location_count: int | None
    time_period_count: int | None
    locations: list[str]
    period_dates: list[PeriodDate]
    summary_json: dict
    created_at: datetime

    model_config = {"from_attributes": True}
