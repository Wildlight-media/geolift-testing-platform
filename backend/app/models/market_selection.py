import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDMixin

# status: queued -> running -> succeeded | failed


class MarketSelectionRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "market_selection_runs"

    experiment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("experiments.id"))
    params_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    rq_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)


class MarketSelectionResult(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "market_selection_results"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("market_selection_runs.id"))
    best_markets_json: Mapped[list] = mapped_column(JSONB, default=list)
    power_curves_json: Mapped[list] = mapped_column(JSONB, default=list)


class CandidateSimulation(Base, UUIDMixin, TimestampMixin):
    """A pre-test 'what would this look like' preview for one candidate
    market combination - injects a hypothetical effect into its real
    historical data and runs the real GeoLift() pipeline on it. Can take a
    long time on large real datasets (same as a real analyze run), so this
    is a background job like MarketSelectionRun, not a synchronous call.
    """

    __tablename__ = "candidate_simulations"

    market_selection_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("market_selection_runs.id"))
    locations: Mapped[list] = mapped_column(JSONB, default=list)
    duration: Mapped[int] = mapped_column(Integer)
    effect_sizes: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    rq_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
