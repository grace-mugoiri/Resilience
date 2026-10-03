"""private room routing boxes and support request metadata

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("disbursements", sa.Column("note", sa.Text(), nullable=True))
    op.add_column(
        "support_groups",
        sa.Column("membership_revision", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "private_circles",
        sa.Column("membership_revision", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column("private_circle_members", sa.Column("member_box", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("private_circle_members", "member_box")
    op.drop_column("private_circles", "membership_revision")
    op.drop_column("support_groups", "membership_revision")
    op.drop_column("disbursements", "note")
