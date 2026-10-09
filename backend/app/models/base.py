"""Shared building blocks for ORM models."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


class TimestampMixin:
    """Adds created_at / updated_at columns to any model that inherits it."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def owner_column(primary_key: bool = False) -> Mapped[int]:
    """Whose row this is. Every data table has one, and every query filters
    on it (see app/routers): that's what keeps accounts apart."""
    return mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=primary_key, index=not primary_key
    )


class ActivityFieldsMixin:
    """Fields shared by Task and Activity: both are day-scoped items that
    can optionally carry a density-map category and a duration, matching
    how densityMap.js already reads them off either collection."""

    title: Mapped[str] = mapped_column(String(300), default="")
    activity_category: Mapped[str | None] = mapped_column(String(50), default=None)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, default=None)


