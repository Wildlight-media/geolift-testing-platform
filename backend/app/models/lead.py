from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin, UUIDMixin


class Lead(Base, UUIDMixin, TimestampMixin):
    """A 'see if your brand can run a test' submission from the public homepage."""

    __tablename__ = "leads"

    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), index=True)
    brand: Mapped[str] = mapped_column(String(300))
    monthly_revenue: Mapped[str] = mapped_column(String(50))
    orders_per_day: Mapped[str] = mapped_column(String(50))
    channel: Mapped[str] = mapped_column(String(300), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    source_ip: Mapped[str] = mapped_column(String(64), default="")
