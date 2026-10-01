"""sensitive operation challenges

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-02 02:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "authorization_challenges",
        sa.Column("nonce_hash", sa.String(length=64), nullable=False),
        sa.Column("pubkey", sa.String(length=64), nullable=False),
        sa.Column("scope", sa.String(length=160), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("nonce_hash"),
    )
    op.create_index(
        op.f("ix_authorization_challenges_pubkey"),
        "authorization_challenges",
        ["pubkey"],
    )
    op.create_index(
        op.f("ix_authorization_challenges_expires_at"),
        "authorization_challenges",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_authorization_challenges_expires_at"),
        table_name="authorization_challenges",
    )
    op.drop_index(
        op.f("ix_authorization_challenges_pubkey"),
        table_name="authorization_challenges",
    )
    op.drop_table("authorization_challenges")
