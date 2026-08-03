import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# Mirrors every user-adjustable parameter of GeoLift::GeoLiftMarketSelection.
# Defaults match the R function's own defaults.


class MarketSelectionParams(BaseModel):
    treatment_periods: list[int] = Field(..., min_length=1, description="Candidate test durations")
    N: list[int] = Field(..., min_length=1, description="Candidate number of test markets")
    effect_size: list[float] = Field(default_factory=lambda: [round(-0.2 + 0.05 * i, 2) for i in range(9)])
    lookback_window: int = 1
    include_markets: list[str] = []
    exclude_markets: list[str] = []
    holdout: list[float] = []
    cpic: float = 1.0
    budget: float | None = None
    alpha: float = 0.1
    normalize: bool = False
    model: str = "none"
    fixed_effects: bool = True
    dtw: float = 0
    correlations: bool = False
    side_of_test: str = "two_sided"
    run_stochastic_process: bool = False


class MarketSelectionRunCreate(BaseModel):
    params: MarketSelectionParams


class MarketSelectionRunOut(BaseModel):
    id: uuid.UUID
    experiment_id: uuid.UUID
    status: str
    params_json: dict
    error: str | None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class MarketSelectionResultOut(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    best_markets_json: list
    power_curves_json: list

    model_config = {"from_attributes": True}


class MarketSelectionDetailRequest(BaseModel):
    locations: list[str]
    duration: int
    effect_size: list[float] | None = None
