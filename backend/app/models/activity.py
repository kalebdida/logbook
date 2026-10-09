"""Same reasoning as Task (see task.py) minus the completed flag, activities
are logged as having happened, not tracked toward completion."""

from datetime import date as date_type

from sqlalchemy import Date, ForeignKeyConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import ActivityFieldsMixin, TimestampMixin, owner_column


class Activity(Base, ActivityFieldsMixin, TimestampMixin):
    __tablename__ = "activities"

    # the day belongs to the same account as the row
    __table_args__ = (ForeignKeyConstraint(["user_id", "day_date"], ["day_records.user_id", "day_records.date"]),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = owner_column()
    day_date: Mapped[date_type] = mapped_column(Date, index=True)
