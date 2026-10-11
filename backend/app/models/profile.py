"""Small things about the account that every device should agree on: the
birthday (for the age clock) and the companion cat's name."""

from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class Profile(Base, TimestampMixin):
    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    birthday: Mapped[date_type | None] = mapped_column(Date, default=None)
    pet_name: Mapped[str] = mapped_column(String(24), default="")
