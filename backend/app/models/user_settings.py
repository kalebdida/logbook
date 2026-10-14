"""An account's settings (theme, Today page cards, timer lengths, music
presets...), so every device looks and works the same. The app decides
which of its per-browser keys go here (js/settingsSync.js)."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[str] = mapped_column(Text, default="{}")        # {key: value as saved in the browser}
    stamp: Mapped[int] = mapped_column(BigInteger, default=0)     # when a device last changed them (ms)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
