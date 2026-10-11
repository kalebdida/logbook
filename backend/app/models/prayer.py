"""A prayer request, and later how it was answered."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, owner_column


class Prayer(Base, TimestampMixin):
    __tablename__ = "prayers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = owner_column()
    text: Mapped[str] = mapped_column(Text)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    answer: Mapped[str] = mapped_column(Text, default="")
