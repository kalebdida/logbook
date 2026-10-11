"""the Telegram bot: server settings and chat links

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
    )
    op.create_table(
        "telegram_links",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("tz_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("morning_hour", sa.Integer(), nullable=True),
        sa.Column("last_morning", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_telegram_links_chat_id", "telegram_links", ["chat_id"], unique=True)


def downgrade() -> None:
    op.drop_table("telegram_links")
    op.drop_table("app_settings")
