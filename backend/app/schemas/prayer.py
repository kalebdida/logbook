from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UTCDateTime


class PrayerCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class PrayerUpdate(BaseModel):
    text: str | None = Field(None, min_length=1, max_length=4000)
    answered: bool | None = None
    answer: str | None = Field(None, max_length=4000)


class PrayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    answered_at: UTCDateTime | None
    answer: str
    created_at: UTCDateTime
    updated_at: UTCDateTime
