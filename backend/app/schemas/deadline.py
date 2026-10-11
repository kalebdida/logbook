from datetime import date as date_type
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.common import ActivityCategory, UTCDateTime

DeadlineKind = Literal["deadline", "exam", "event", "birthday"]
TimeOfDay = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class DeadlineCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    due_date: date_type
    due_time: TimeOfDay | None = None
    kind: DeadlineKind = "deadline"
    note: str = Field("", max_length=4000)
    activity_category: ActivityCategory | None = None


class DeadlineUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    due_date: date_type | None = None
    due_time: TimeOfDay | None = None
    kind: DeadlineKind | None = None
    note: str | None = Field(None, max_length=4000)
    activity_category: ActivityCategory | None = None
    done: bool | None = None


class DeadlineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    due_date: date_type
    due_time: str | None = None
    kind: DeadlineKind
    note: str
    activity_category: ActivityCategory | None
    done: bool
    created_at: UTCDateTime
    updated_at: UTCDateTime
