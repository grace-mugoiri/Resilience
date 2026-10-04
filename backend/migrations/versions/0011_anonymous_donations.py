"""anonymous Lightning donations

Revision ID: 0011
Revises: 0010
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "donations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("amount_sat", sa.Integer(), nullable=False),
        sa.Column("state", sa.Text(), server_default="PENDING", nullable=False),
        sa.Column("payment_hash", sa.String(length=64), nullable=False),
        sa.Column("invoice", sa.Text(), nullable=True),
        sa.Column("invoice_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount_sat > 0", name="ck_donation_amount_positive"),
        sa.CheckConstraint("state IN ('PENDING', 'PAID', 'EXPIRED')", name="ck_donation_state"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_hash"),
    )
    op.create_index(
        op.f("ix_donations_invoice_expires_at"),
        "donations",
        ["invoice_expires_at"],
        unique=False,
    )
    op.create_index(op.f("ix_donations_org_id"), "donations", ["org_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_donations_org_id"), table_name="donations")
    op.drop_index(op.f("ix_donations_invoice_expires_at"), table_name="donations")
    op.drop_table("donations")
