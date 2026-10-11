"""The cat's letter about a month, written once on the first of the next."""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, owner_column


class Letter(Base, TimestampMixin):
    __tablename__ = "letters"

    user_id: Mapped[int] = owner_column(primary_key=True)
    month: Mapped[str] = mapped_column(String(7), primary_key=True)      # "2026-10"
    text: Mapped[str] = mapped_column(Text, default="")
