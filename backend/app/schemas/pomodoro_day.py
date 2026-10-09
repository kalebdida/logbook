from datetime import date as date_type

from pydantic import BaseModel, ConfigDict, Field


class PomodoroSessionComplete(BaseModel):
    """Body for recording one completed focus session against a date."""

    focus_ms: int = Field(..., ge=0)


class PomodoroDayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date_type
    sessions: int
    focus_ms: int
