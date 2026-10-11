"""A night's sleep, filed under the day you woke up."""

from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, owner_column


class SleepLog(Base, TimestampMixin):
    __tablename__ = "sleep_logs"

    user_id: Mapped[int] = owner_column(primary_key=True)
    date: Mapped[date_type] = mapped_column(Date, primary_key=True)        # the morning you woke up
    bed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    wake_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
