"""completed is never accepted as input: the server derives it from
progress (completed = progress == 100), same rule as goals.js."""

from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ActivityCategory, UTCDateTime

GoalCategory = Literal["daily", "weekly", "monthly", "long-term"]
GoalPriority = Literal["low", "medium", "high"]


class GoalCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = ""
    category: GoalCategory = "daily"
    priority: GoalPriority = "medium"
    progress: int = Field(0, ge=0, le=100)
    target_date: date_type | None = None
    # life area, so a completed goal shows up on the density map
    activity_category: ActivityCategory | None = None


class GoalUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = None
    category: GoalCategory | None = None
    priority: GoalPriority | None = None
    progress: int | None = Field(None, ge=0, le=100)
    target_date: date_type | None = None
    activity_category: ActivityCategory | None = None


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str
    category: GoalCategory
    priority: GoalPriority
    progress: int
    completed: bool
    created_at: UTCDateTime
    updated_at: UTCDateTime
    completed_at: UTCDateTime | None
    target_date: date_type | None
    activity_category: ActivityCategory | None
