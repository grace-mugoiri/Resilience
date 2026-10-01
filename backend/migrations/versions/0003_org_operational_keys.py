"""organization operational keys and explicit directory visibility

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-02 01:20:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("directory_visibility", sa.Text(), server_default="public", nullable=False),
    )
    op.create_check_constraint(
        "ck_org_directory_visibility", "organizations", "directory_visibility IN ('public')"
    )
    op.create_table(
        "organization_operational_keys",
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("pubkey", sa.String(length=64), nullable=False),
        sa.Column("authorization_event_id", sa.String(length=64), nullable=False),
        sa.Column("authorization_event", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocation_event", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("org_id", "pubkey"),
        sa.UniqueConstraint("authorization_event_id"),
    )
    op.add_column("roster_events", sa.Column("signer_pubkey", sa.String(length=64)))
    op.add_column("roster_events", sa.Column("key_authorization_event_id", sa.String(length=64)))


def downgrade() -> None:
    op.drop_column("roster_events", "key_authorization_event_id")
    op.drop_column("roster_events", "signer_pubkey")
    op.drop_table("organization_operational_keys")
    op.drop_constraint("ck_org_directory_visibility", "organizations", type_="check")
    op.drop_column("organizations", "directory_visibility")
