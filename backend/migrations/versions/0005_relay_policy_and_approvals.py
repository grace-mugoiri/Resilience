"""relay policy memberships and multi-party approvals

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "support_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_support_groups_org_id"), "support_groups", ["org_id"])
    op.create_table(
        "support_group_memberships",
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("member_hash", sa.String(length=64), nullable=False),
        sa.Column("role", sa.Text(), server_default="member", nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('member', 'moderator')", name="ck_group_member_role"),
        sa.ForeignKeyConstraint(["group_id"], ["support_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "member_hash"),
    )
    op.create_index(
        op.f("ix_support_group_memberships_expires_at"),
        "support_group_memberships",
        ["expires_at"],
    )
    op.create_table(
        "disbursement_approvals",
        sa.Column("disbursement_id", sa.UUID(), nullable=False),
        sa.Column("actor_pubkey", sa.String(length=64), nullable=False),
        sa.Column("auth_event_id", sa.String(length=64), nullable=False),
        sa.Column(
            "approved_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["disbursement_id"], ["disbursements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("disbursement_id", "actor_pubkey"),
        sa.UniqueConstraint("auth_event_id"),
    )


def downgrade() -> None:
    op.drop_table("disbursement_approvals")
    op.drop_index(
        op.f("ix_support_group_memberships_expires_at"),
        table_name="support_group_memberships",
    )
    op.drop_table("support_group_memberships")
    op.drop_index(op.f("ix_support_groups_org_id"), table_name="support_groups")
    op.drop_table("support_groups")
