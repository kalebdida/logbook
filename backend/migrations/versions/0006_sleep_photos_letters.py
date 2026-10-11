"""sleep log, photo of the day, the monthly letter, and where an entry came from

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def _owner():
    return sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


def _stamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "sleep_logs", _owner(),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("bed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("wake_at", sa.DateTime(timezone=True), nullable=True),
        *_stamps(),
        sa.PrimaryKeyConstraint("user_id", "date"),
    )
    op.create_index("ix_sleep_logs_created_at", "sleep_logs", ["created_at"])
    op.create_table(
        "photos", _owner(),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("mime", sa.String(32), nullable=False, server_default="image/jpeg"),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("thumb", sa.LargeBinary(), nullable=False),
        sa.Column("caption", sa.String(300), nullable=False, server_default=""),
        *_stamps(),
        sa.PrimaryKeyConstraint("user_id", "date"),
    )
    op.create_index("ix_photos_created_at", "photos", ["created_at"])
    op.create_table(
        "letters", _owner(),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        *_stamps(),
        sa.PrimaryKeyConstraint("user_id", "month"),
    )
    op.create_index("ix_letters_created_at", "letters", ["created_at"])
    with op.batch_alter_table("entries") as batch:
        batch.add_column(sa.Column("source", sa.String(20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("entries") as batch:
        batch.drop_column("source")
    op.drop_table("letters")
    op.drop_table("photos")
    op.drop_table("sleep_logs")
