import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class Dataset(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "datasets"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1024))

    # column mapping supplied at upload time (GeoDataRead inputs)
    location_col: Mapped[str] = mapped_column(String(255))
    date_col: Mapped[str] = mapped_column(String(255))
    y_col: Mapped[str] = mapped_column(String(255))
    date_format: Mapped[str] = mapped_column(String(64), default="yyyy-mm-dd")
    covariate_cols: Mapped[list] = mapped_column(JSONB, default=list)
    converted_from_zip: Mapped[bool] = mapped_column(Boolean, default=False)
    dropped_zip_row_count: Mapped[int] = mapped_column(Integer, default=0)
    dropped_zip_codes: Mapped[list] = mapped_column(JSONB, default=list)

    # populated from the GeoDataRead validation response
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    location_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_period_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    locations: Mapped[list] = mapped_column(JSONB, default=list)
    summary_json: Mapped[dict] = mapped_column(JSONB, default=dict)
