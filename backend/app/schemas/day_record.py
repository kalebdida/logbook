"""Schemas for the daily page. Every field is optional on write: the
client sends only the fields it changed and the rest are left alone."""

from datetime import date as date_type

from pydantic import BaseModel, ConfigDict

from app.schemas.common import UTCDateTime


class DayRecordUpsert(BaseModel):
    morning_intention: str = ""
    morning_main_focus: str = ""
    journal: str = ""
    reflection_what_happened: str = ""
    reflection_wins: str = ""
    reflection_lessons: str = ""
    reflection_tomorrow_plan: str = ""
    reflection_gratitude: str = ""
    brain_dump: str = ""


class DayRecordResponse(DayRecordUpsert):
    model_config = ConfigDict(from_attributes=True)

    date: date_type
    created_at: UTCDateTime
    updated_at: UTCDateTime
