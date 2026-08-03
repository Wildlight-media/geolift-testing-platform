import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class TestConfig(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "test_configs"

    experiment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("experiments.id"))
    market_selection_result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("market_selection_results.id"), nullable=True
    )
    locations: Mapped[list] = mapped_column(JSONB, default=list)
    treatment_start_time: Mapped[int] = mapped_column(Integer)
    treatment_end_time: Mapped[int] = mapped_column(Integer)
    model: Mapped[str] = mapped_column(String(32), default="none")
    fixed_effects: Mapped[bool] = mapped_column(Boolean, default=True)
    alpha: Mapped[float] = mapped_column(Float, default=0.1)
    confidence_intervals: Mapped[bool] = mapped_column(Boolean, default=False)
    spend: Mapped[float | None] = mapped_column(Float, nullable=True)
