from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ActivityCategory, UTCDateTime

DeadlineKind = Literal["deadline", "exam", "event"]


class DeadlineCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    due_date: date_type
    kind: DeadlineKind = "deadline"
    note: str = Field("", max_length=4000)
    activity_category: ActivityCategory | None = None


class DeadlineUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    due_date: date_type | None = None
    kind: DeadlineKind | None = None
    note: str | None = Field(None, max_length=4000)
    activity_category: ActivityCategory | None = None
    done: bool | None = None


class DeadlineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    due_date: date_type
    kind: DeadlineKind
    note: str
    activity_category: ActivityCategory | None
    done: bool
    created_at: UTCDateTime
    updated_at: UTCDateTime
