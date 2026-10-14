"""settings that follow the account to every device; what each photo shows (for the companion)

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("data", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("stamp", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("photos", sa.Column("seen", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("photos", "seen")
    op.drop_table("user_settings")
