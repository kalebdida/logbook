from datetime import date as date_type

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ActivityCategory, UTCDateTime


class ActivityCreate(BaseModel):
    day_date: date_type
    title: str = Field(..., min_length=1, max_length=300)
    activity_category: ActivityCategory | None = None
    duration_minutes: int | None = Field(None, ge=0, le=1440)


class ActivityUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    activity_category: ActivityCategory | None = None
    duration_minutes: int | None = Field(None, ge=0, le=1440)


class ActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day_date: date_type
    title: str
    activity_category: ActivityCategory | None
    duration_minutes: int | None
    created_at: UTCDateTime
    updated_at: UTCDateTime
