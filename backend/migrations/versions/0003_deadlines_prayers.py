"""deadlines (countdowns on Today and the calendar) and prayer requests

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _owner():
    return sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


def _timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "deadlines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _owner(),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="deadline"),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("activity_category", sa.String(50), nullable=True),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_timestamps(),
    )
    op.create_index("ix_deadlines_user_id", "deadlines", ["user_id"])
    op.create_index("ix_deadlines_due_date", "deadlines", ["due_date"])
    op.create_index("ix_deadlines_created_at", "deadlines", ["created_at"])

    op.create_table(
        "prayers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _owner(),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answer", sa.Text(), nullable=False, server_default=""),
        *_timestamps(),
    )
    op.create_index("ix_prayers_user_id", "prayers", ["user_id"])
    op.create_index("ix_prayers_created_at", "prayers", ["created_at"])


def downgrade() -> None:
    op.drop_table("prayers")
    op.drop_table("deadlines")
