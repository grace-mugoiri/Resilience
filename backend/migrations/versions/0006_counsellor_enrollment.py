"""counsellor invitations and credential review

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "counsellor_invites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("credential_recipient_pubkey", sa.String(length=64), nullable=False),
        sa.Column("created_by_pubkey", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_pubkey", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash"),
    )
    op.create_index(op.f("ix_counsellor_invites_org_id"), "counsellor_invites", ["org_id"])
    op.create_index(op.f("ix_counsellor_invites_expires_at"), "counsellor_invites", ["expires_at"])
    op.create_table(
        "counsellor_enrollments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("invite_id", sa.UUID(), nullable=False),
        sa.Column("counsellor_pubkey", sa.String(length=64), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column("profile_event_id", sa.String(length=64), nullable=False),
        sa.Column("profile_event", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("encrypted_credentials", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("review_message", sa.Text(), nullable=True),
        sa.Column("reviewed_by_pubkey", sa.String(length=64), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            "status IN ('draft', 'under_review', 'more_information', 'approved', 'rejected')",
            name="ck_counsellor_enrollment_status",
        ),
        sa.ForeignKeyConstraint(["invite_id"], ["counsellor_invites.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invite_id"),
        sa.UniqueConstraint("org_id", "counsellor_pubkey", name="uq_counsellor_enrollment_org_key"),
    )
    op.create_index(op.f("ix_counsellor_enrollments_org_id"), "counsellor_enrollments", ["org_id"])
    op.create_index(
        op.f("ix_counsellor_enrollments_counsellor_pubkey"),
        "counsellor_enrollments",
        ["counsellor_pubkey"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_counsellor_enrollments_counsellor_pubkey"),
        table_name="counsellor_enrollments",
    )
    op.drop_index(op.f("ix_counsellor_enrollments_org_id"), table_name="counsellor_enrollments")
    op.drop_table("counsellor_enrollments")
    op.drop_index(op.f("ix_counsellor_invites_expires_at"), table_name="counsellor_invites")
    op.drop_index(op.f("ix_counsellor_invites_org_id"), table_name="counsellor_invites")
    op.drop_table("counsellor_invites")
