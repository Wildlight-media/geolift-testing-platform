import uuid
from datetime import datetime

from pydantic import BaseModel


class TestConfigCreate(BaseModel):
    market_selection_result_id: uuid.UUID | None = None
    locations: list[str]
    treatment_start_time: int
    treatment_end_time: int
    model: str = "none"
    fixed_effects: bool = True
    alpha: float = 0.1
    confidence_intervals: bool = False
    spend: float | None = None


class TestConfigOut(BaseModel):
    id: uuid.UUID
    experiment_id: uuid.UUID
    locations: list[str]
    treatment_start_time: int
    treatment_end_time: int
    model: str
    fixed_effects: bool
    alpha: float
    confidence_intervals: bool
    spend: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalysisOut(BaseModel):
    id: uuid.UUID
    experiment_id: uuid.UUID
    test_config_id: uuid.UUID
    status: str
    result_json: dict
    error: str | None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
