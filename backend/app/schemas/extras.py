"""Sleep, photos and letters."""

from datetime import date as date_type

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UTCDateTime


class SleepUpdate(BaseModel):
    bed_at: UTCDateTime | None = None
    wake_at: UTCDateTime | None = None


class SleepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date_type
    bed_at: UTCDateTime | None
    wake_at: UTCDateTime | None


class PhotoUpload(BaseModel):
    image: str = Field(..., min_length=10, max_length=4_000_000)     # base64, about 3 MB at most
    thumb: str = Field(..., min_length=10, max_length=300_000)
    mime: str = Field("image/jpeg", pattern=r"^image/(jpeg|png|webp)$")
    caption: str = Field("", max_length=300)


class PhotoInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date_type
    caption: str
    created_at: UTCDateTime


class LetterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    month: str
    text: str
    created_at: UTCDateTime
