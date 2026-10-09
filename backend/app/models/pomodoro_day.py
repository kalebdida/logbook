"""
Matches pomodoro.js's own per-day aggregate (state.days[date] = {sessions,
focusMs}) exactly. Deliberately does not model the live timer (mode,
status, remainingMs, startedAt/endsAt), that's client-side UI state with
no cross-device meaning, not something a backend needs to persist.
"""

from datetime import date as date_type

from sqlalchemy import Date, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PomodoroDay(Base):
    __tablename__ = "pomodoro_days"

    date: Mapped[date_type] = mapped_column(Date, primary_key=True)
    sessions: Mapped[int] = mapped_column(Integer, default=0)
    focus_ms: Mapped[int] = mapped_column(Integer, default=0)
