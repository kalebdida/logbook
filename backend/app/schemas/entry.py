"""Pydantic schemas for journal entries."""

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Mood, UTCDateTime


class EntryCreate(BaseModel):
    mood: Mood
    text: str = Field(..., min_length=1)
    # Optional: normal saves omit both and get a server id and "now".
    # Imports send the originals so restored entries keep their dates.
    id: str | None = Field(None, max_length=64)
    occurred_at: UTCDateTime | None = None


class EntryUpdate(BaseModel):
    mood: Mood | None = None
    text: str | None = Field(None, min_length=1)


class EntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    occurred_at: UTCDateTime
    mood: Mood
    text: str
