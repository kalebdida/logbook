"""
A task logged against a specific day. day_date is a real foreign key,
not just a plain date column like Entry uses, because tasks currently
only ever exist nested under a day's stored record on the frontend
(unlike entries, which are a fully independent flat list). The router
auto-creates an empty day_records row on first write if one doesn't
exist yet, so this doesn't force a separate "create the day" step.
"""

from datetime import date as date_type

from sqlalchemy import Boolean, Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import ActivityFieldsMixin, TimestampMixin


class Task(Base, ActivityFieldsMixin, TimestampMixin):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    day_date: Mapped[date_type] = mapped_column(Date, ForeignKey("day_records.date"), index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
