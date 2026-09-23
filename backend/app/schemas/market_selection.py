import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

# Mirrors every user-adjustable parameter of GeoLift::GeoLiftMarketSelection.
# Defaults match the R function's own defaults, except lookback_window (see
# below).


class MarketSelectionParams(BaseModel):
    treatment_periods: list[int] = Field(..., min_length=1, description="Candidate test durations")
    N: list[int] = Field(..., min_length=1, description="Candidate number of test markets")
    effect_size: list[float] = Field(default_factory=lambda: [round(-0.2 + 0.05 * i, 2) for i in range(9)])
    # GeoLift's own default is 1, but that only evaluates a single historical
    # window - the resulting Power column collapses to a binary 0%/100%
    # (whichever side of alpha that one window's p-value happened to land
    # on) rather than a real probability. Defaulting to 3 here trades some
    # runtime for a genuine, non-degenerate power estimate.
    lookback_window: int = 3
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
    # Planned real-world test start (ISO date). When set, every simulation
    # for this run is replayed on the most recent full occurrence of that
    # calendar window in the data instead of the last N days - see
    # services/replay.py. Not a GeoLift parameter; handled before R is called.
    planned_start_date: str | None = None

    @field_validator("planned_start_date")
    @classmethod
    def _valid_iso_date(cls, v: str | None) -> str | None:
        if v in (None, ""):
            return None
        try:
            return date.fromisoformat(v).isoformat()
        except ValueError as exc:
            raise ValueError("planned_start_date must be an ISO date (YYYY-MM-DD)") from exc


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


class CandidateSimulationCreate(BaseModel):
    locations: list[str]
    duration: int
    effect_sizes: list[float] = Field(..., min_length=1)


class CandidateSimulationOut(BaseModel):
    id: uuid.UUID
    market_selection_run_id: uuid.UUID
    locations: list[str]
    duration: int
    effect_sizes: list[float]
    status: str
    result_json: dict
    error: str | None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
