"""Accounts. Invite-only: the admin (the person running the server) makes an
invite code, a friend signs up with it, and from then on every row they
write carries their user_id. Nobody, the admin included, can read another
account's data through the app.

User 1 always exists. Without LOGBOOK_PASSWORD (a server only you can reach)
the app runs as user 1 with no login; with a password, user 1 is the admin
and logs in with LOGBOOK_ADMIN_USERNAME + LOGBOOK_PASSWORD.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

OWNER_ID = 1


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(40), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # bumped to log every device out (password change, "log out everywhere")
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Invite(Base):
    """A one-time code. kind "signup" makes a new account; kind "reset" lets
    one existing account (for_user_id) set a new password. Only a hash of the
    code is stored, so reading the database doesn't reveal usable codes."""

    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(10), default="signup")
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    note: Mapped[str] = mapped_column(String(60), default="")
    for_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
