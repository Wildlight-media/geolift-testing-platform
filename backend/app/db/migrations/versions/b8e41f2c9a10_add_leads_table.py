"""add leads table (homepage fit-check submissions)

Revision ID: b8e41f2c9a10
Revises: 72a5b66bdddd
Create Date: 2026-09-23 17:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b8e41f2c9a10"
down_revision: Union[str, None] = "72a5b66bdddd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "leads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("brand", sa.String(length=300), nullable=False),
        sa.Column("monthly_revenue", sa.String(length=50), nullable=False),
        sa.Column("orders_per_day", sa.String(length=50), nullable=False),
        sa.Column("channel", sa.String(length=300), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("source_ip", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leads_email", "leads", ["email"])


def downgrade() -> None:
    op.drop_index("ix_leads_email", table_name="leads")
    op.drop_table("leads")
