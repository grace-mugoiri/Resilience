"""encrypted organization NWC wallet connections

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organization_wallet_connections",
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("wallet_pubkey", sa.String(length=64), nullable=False),
        sa.Column("client_pubkey", sa.String(length=64), nullable=False),
        sa.Column("encrypted_client_secret", sa.Text(), nullable=False),
        sa.Column("relay_urls", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("lud16", sa.Text(), nullable=True),
        sa.Column("methods", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("network", sa.String(length=20), nullable=True),
        sa.Column("alias", sa.Text(), nullable=True),
        sa.Column(
            "connected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("org_id"),
        sa.UniqueConstraint("client_pubkey"),
    )


def downgrade() -> None:
    op.drop_table("organization_wallet_connections")
