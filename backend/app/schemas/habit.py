from datetime import date as date_type

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ActivityCategory, UTCDateTime


class HabitCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    icon: str = Field("", max_length=16)
    activity_category: ActivityCategory | None = None


class HabitUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    icon: str | None = Field(None, max_length=16)
    activity_category: ActivityCategory | None = None
    archived: bool | None = None
    sort: int | None = None


class HabitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str
    activity_category: ActivityCategory | None
    archived: bool
    sort: int
    created_at: UTCDateTime
    updated_at: UTCDateTime


class HabitLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    habit_id: int
    date: date_type
