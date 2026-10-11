"""Dates that matter: an application deadline, an exam, an event, a birthday
(kind "birthday" comes round every year). Shown as countdowns on the Today
page and on the calendar."""

from datetime import date as date_type

from sqlalchemy import Boolean, Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, owner_column


class Deadline(Base, TimestampMixin):
    __tablename__ = "deadlines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = owner_column()
    title: Mapped[str] = mapped_column(String(300))
    due_date: Mapped[date_type] = mapped_column(Date, index=True)
    due_time: Mapped[str | None] = mapped_column(String(5), default=None)   # "23:59", local time; None = end of day
    kind: Mapped[str] = mapped_column(String(20), default="deadline")
    note: Mapped[str] = mapped_column(Text, default="")
    activity_category: Mapped[str | None] = mapped_column(String(50), default=None)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
