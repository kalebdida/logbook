"""The Telegram bot: its settings (token, webhook secret) and which chat
belongs to which account."""

from datetime import date as date_type
from datetime import datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AppSetting(Base):
    """Server-wide settings the admin sets from the app (never sent to a browser)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class TelegramLink(Base):
    __tablename__ = "telegram_links"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    chat_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    tz_minutes: Mapped[int] = mapped_column(Integer, default=0)       # local time = UTC + this
    morning_hour: Mapped[int | None] = mapped_column(Integer, default=7)
    last_morning: Mapped[date_type | None] = mapped_column(Date, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
