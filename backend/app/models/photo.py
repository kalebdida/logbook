"""One photo per day. The browser shrinks it before upload (about 1280px
and a 240px thumbnail), so a year of them stays small."""

from datetime import date as date_type

from sqlalchemy import Text, Date, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, owner_column


class Photo(Base, TimestampMixin):
    __tablename__ = "photos"

    user_id: Mapped[int] = owner_column(primary_key=True)
    date: Mapped[date_type] = mapped_column(Date, primary_key=True)
    mime: Mapped[str] = mapped_column(String(32), default="image/jpeg")
    data: Mapped[bytes] = mapped_column(LargeBinary)
    thumb: Mapped[bytes] = mapped_column(LargeBinary)
    caption: Mapped[str] = mapped_column(String(300), default="")
    seen: Mapped[str] = mapped_column(Text, default="")     # a short description of the photo, written once by the AI, for the companion
