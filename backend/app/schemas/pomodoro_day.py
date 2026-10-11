from datetime import date as date_type

from pydantic import BaseModel, ConfigDict, Field


class PomodoroSessionComplete(BaseModel):
    """Body for recording one completed focus session against a date."""

    focus_ms: int = Field(..., ge=0, le=4 * 3600 * 1000)
    partial: bool = False      # stopped early: the minutes count, the session doesn't


class PomodoroDayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date_type
    sessions: int
    focus_ms: int
