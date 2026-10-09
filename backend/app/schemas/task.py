from datetime import date as date_type

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ActivityCategory, UTCDateTime


class TaskCreate(BaseModel):
    day_date: date_type
    title: str = Field(..., min_length=1, max_length=300)
    activity_category: ActivityCategory | None = None
    duration_minutes: int | None = Field(None, ge=0, le=1440)


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    completed: bool | None = None
    activity_category: ActivityCategory | None = None
    duration_minutes: int | None = Field(None, ge=0, le=1440)
    # moving a task to another day, e.g. carrying an unfinished one forward
    day_date: date_type | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day_date: date_type
    title: str
    completed: bool
    activity_category: ActivityCategory | None
    duration_minutes: int | None
    created_at: UTCDateTime
    updated_at: UTCDateTime
