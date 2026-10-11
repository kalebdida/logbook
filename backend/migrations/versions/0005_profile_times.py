"""profiles (birthday, the cat's name) and a time of day on deadlines

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("pet_name", sa.String(24), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_profiles_created_at", "profiles", ["created_at"])
    with op.batch_alter_table("deadlines") as batch:
        batch.add_column(sa.Column("due_time", sa.String(5), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("deadlines") as batch:
        batch.drop_column("due_time")
    op.drop_table("profiles")
