"""
One row per calendar day: the structured "daily page" content (morning
intention/focus, journal, night reflection, brain dump). Deliberately does
NOT include timeline or mood, both are computed from Entry at read time,
matching exactly how the frontend's getDayRecord() already works. Does not
include tasks/activities either, those are now their own tables (see
task.py, activity.py) linked back here by day_date.
"""

from datetime import date as date_type

from sqlalchemy import Date, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, owner_column


class DayRecord(Base, TimestampMixin):
    __tablename__ = "day_records"

    user_id: Mapped[int] = owner_column(primary_key=True)
    date: Mapped[date_type] = mapped_column(Date, primary_key=True)

    morning_intention: Mapped[str] = mapped_column(Text, default="")
    morning_main_focus: Mapped[str] = mapped_column(Text, default="")

    journal: Mapped[str] = mapped_column(Text, default="")

    reflection_what_happened: Mapped[str] = mapped_column(Text, default="")
    reflection_wins: Mapped[str] = mapped_column(Text, default="")
    reflection_lessons: Mapped[str] = mapped_column(Text, default="")
    reflection_tomorrow_plan: Mapped[str] = mapped_column(Text, default="")
    reflection_gratitude: Mapped[str] = mapped_column(Text, default="")

    brain_dump: Mapped[str] = mapped_column(Text, default="")
