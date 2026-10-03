"""private messaging relationships, moderation, and availability

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("support_groups", sa.Column("slug", sa.String(80), nullable=True))
    op.add_column("support_groups", sa.Column("title", sa.String(120), nullable=True))
    op.add_column("support_groups", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "support_groups",
        sa.Column("access", sa.Text(), server_default="request", nullable=False),
    )
    op.add_column("support_groups", sa.Column("leader_name", sa.String(80), nullable=True))
    op.create_unique_constraint("uq_support_groups_slug", "support_groups", ["slug"])
    op.create_check_constraint("ck_group_access", "support_groups", "access IN ('open', 'request')")
    op.add_column("support_group_memberships", sa.Column("member_box", sa.Text(), nullable=True))

    op.create_table(
        "support_group_join_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("member_hash", sa.String(64), nullable=False),
        sa.Column("member_box", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("reviewed_by_pubkey", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_group_join_status"
        ),
        sa.ForeignKeyConstraint(["group_id"], ["support_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "member_hash", name="uq_group_join_member"),
    )
    op.create_index(
        "ix_support_group_join_requests_group_id", "support_group_join_requests", ["group_id"]
    )

    op.create_table(
        "private_circles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("owner_hash", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_hash"),
    )
    op.create_table(
        "private_circle_members",
        sa.Column("circle_id", sa.UUID(), nullable=False),
        sa.Column("member_hash", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["circle_id"], ["private_circles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("circle_id", "member_hash"),
    )
    op.create_table(
        "circle_invites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("circle_id", sa.UUID(), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("inviter_pubkey", sa.String(64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["circle_id"], ["private_circles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash"),
    )
    op.create_index("ix_circle_invites_circle_id", "circle_invites", ["circle_id"])
    op.create_index("ix_circle_invites_expires_at", "circle_invites", ["expires_at"])

    op.create_table(
        "blocked_peers",
        sa.Column("blocker_hash", sa.String(64), nullable=False),
        sa.Column("blocked_hash", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("blocker_hash", "blocked_hash"),
    )
    op.create_table(
        "safety_reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reporter_hash", sa.String(64), nullable=False),
        sa.Column("subject_pubkey", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(80), nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.Text(), server_default="open", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_safety_reports_reporter_hash", "safety_reports", ["reporter_hash"])
    op.create_index("ix_safety_reports_subject_pubkey", "safety_reports", ["subject_pubkey"])
    op.create_table(
        "counsellor_availability",
        sa.Column("counsellor_pubkey", sa.String(64), nullable=False),
        sa.Column("available", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("working_hours", sa.String(120), nullable=True),
        sa.Column("auth_event", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("counsellor_pubkey"),
    )


def downgrade() -> None:
    op.drop_table("counsellor_availability")
    op.drop_index("ix_safety_reports_subject_pubkey", table_name="safety_reports")
    op.drop_index("ix_safety_reports_reporter_hash", table_name="safety_reports")
    op.drop_table("safety_reports")
    op.drop_table("blocked_peers")
    op.drop_index("ix_circle_invites_expires_at", table_name="circle_invites")
    op.drop_index("ix_circle_invites_circle_id", table_name="circle_invites")
    op.drop_table("circle_invites")
    op.drop_table("private_circle_members")
    op.drop_table("private_circles")
    op.drop_index(
        "ix_support_group_join_requests_group_id", table_name="support_group_join_requests"
    )
    op.drop_table("support_group_join_requests")
    op.drop_column("support_group_memberships", "member_box")
    op.drop_constraint("ck_group_access", "support_groups", type_="check")
    op.drop_constraint("uq_support_groups_slug", "support_groups", type_="unique")
    op.drop_column("support_groups", "leader_name")
    op.drop_column("support_groups", "access")
    op.drop_column("support_groups", "description")
    op.drop_column("support_groups", "title")
    op.drop_column("support_groups", "slug")
