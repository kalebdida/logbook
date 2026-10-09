"""Same reasoning as Task (see task.py) minus the completed flag, activities
are logged as having happened, not tracked toward completion."""

from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import ActivityFieldsMixin, TimestampMixin


class Activity(Base, ActivityFieldsMixin, TimestampMixin):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    day_date: Mapped[date_type] = mapped_column(Date, ForeignKey("day_records.date"), index=True)
