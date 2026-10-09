"""
Matches the shape createGoal()/normalizeGoal() already produce in goals.js
exactly: same field names (snake_cased), same category/priority options,
same completed-derived-from-progress rule. id is a string for the same
reason as Entry (see entry.py), goals.js already mints its own
"goal-<timestamp36>-<random>" ids client-side.
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import owner_column


def _generate_id() -> str:
    return "goal-" + uuid.uuid4().hex


class Goal(Base):
    __tablename__ = "goals"

    user_id: Mapped[int] = owner_column(primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_generate_id)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(20), default="daily")
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    target_date: Mapped[date_type | None] = mapped_column(Date, default=None)
    activity_category: Mapped[str | None] = mapped_column(String(50), default=None)
