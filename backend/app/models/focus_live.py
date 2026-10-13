"""The focus timer that's running right now, shared by every device on the
account (phone app, website, laptop). One row per account."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FocusLive(Base):
    __tablename__ = "focus_live"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    timer: Mapped[str] = mapped_column(Text, default="")            # the timer as JSON (js/pomodoro.js)
    rev: Mapped[int] = mapped_column(Integer, default=0)             # goes up with every change
    finished_id: Mapped[str] = mapped_column(String(40), default="")  # the last block counted, so it's counted once
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
