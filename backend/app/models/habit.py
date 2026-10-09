"""Habits: things you want to do every day (pray, gym, read), checked off
per day. Different from tasks, which are one-off and belong to one day."""

from datetime import date as date_type

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class Habit(Base, TimestampMixin):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80))
    icon: Mapped[str] = mapped_column(String(16), default="")
    activity_category: Mapped[str | None] = mapped_column(String(50), default=None)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    sort: Mapped[int] = mapped_column(Integer, default=0)


class HabitLog(Base):
    __tablename__ = "habit_logs"

    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[date_type] = mapped_column(Date, primary_key=True, index=True)
