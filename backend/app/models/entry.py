"""A single timestamped mood check-in. Multiple per day are expected."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import owner_column


def _generate_id() -> str:
    return uuid.uuid4().hex


class Entry(Base):
    __tablename__ = "entries"

    # String, not auto-increment: the frontend already mints its own ids
    # (Date.now().toString()) before ever talking to a server. Keeping this
    # a string column leaves room to import that existing data later without
    # a schema change, even though nothing accepts a client-supplied id yet.
    user_id: Mapped[int] = owner_column(primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=_generate_id)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    mood: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text)
