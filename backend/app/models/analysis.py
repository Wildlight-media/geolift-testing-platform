import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDMixin

# status: queued -> running -> succeeded | failed


class Analysis(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "analyses"

    experiment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("experiments.id"))
    test_config_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("test_configs.id"))
    status: Mapped[str] = mapped_column(String(32), default="queued")
    rq_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
