"""Full-database backup format.

GET /backup returns this shape, POST /backup/restore accepts it. Restore
is additive: it never deletes or overwrites what's already there, so
restoring the same file twice is safe.
"""

from datetime import date as date_type

from pydantic import BaseModel, Field

from app.schemas.activity import ActivityResponse
from app.schemas.common import ActivityCategory, Mood, UTCDateTime
from app.schemas.day_record import DayRecordResponse
from app.schemas.entry import EntryResponse
from app.schemas.goal import GoalCategory, GoalPriority, GoalResponse
from app.schemas.habit import HabitLogResponse, HabitResponse
from app.schemas.pomodoro_day import PomodoroDayResponse
from app.schemas.task import TaskResponse


class BackupExport(BaseModel):
    app: str = "logbook"
    version: int = 1
    exported_at: UTCDateTime
    entries: list[EntryResponse]
    day_records: list[DayRecordResponse]
    tasks: list[TaskResponse]
    activities: list[ActivityResponse]
    goals: list[GoalResponse]
    pomodoro_days: list[PomodoroDayResponse]
    habits: list[HabitResponse] = []
    habit_logs: list[HabitLogResponse] = []


class RestoreEntry(BaseModel):
    id: str | None = Field(None, max_length=64)
    occurred_at: UTCDateTime
    mood: Mood
    text: str = Field(..., min_length=1)


class RestoreDay(BaseModel):
    date: date_type
    morning_intention: str = ""
    morning_main_focus: str = ""
    journal: str = ""
    reflection_what_happened: str = ""
    reflection_wins: str = ""
    reflection_lessons: str = ""
    reflection_tomorrow_plan: str = ""
    reflection_gratitude: str = ""
    brain_dump: str = ""


class RestoreTask(BaseModel):
    day_date: date_type
    title: str = Field(..., min_length=1, max_length=300)
    completed: bool = False
    activity_category: ActivityCategory | None = None
    duration_minutes: int | None = Field(None, ge=0, le=1440)


class RestoreActivity(BaseModel):
    day_date: date_type
    title: str = Field(..., min_length=1, max_length=300)
    activity_category: ActivityCategory | None = None
    duration_minutes: int | None = Field(None, ge=0, le=1440)


class RestoreGoal(BaseModel):
    id: str | None = Field(None, max_length=64)
    title: str = Field(..., min_length=1, max_length=300)
    description: str = ""
    category: GoalCategory = "daily"
    priority: GoalPriority = "medium"
    progress: int = Field(0, ge=0, le=100)
    created_at: UTCDateTime | None = None
    updated_at: UTCDateTime | None = None
    completed_at: UTCDateTime | None = None
    target_date: date_type | None = None
    activity_category: ActivityCategory | None = None


class RestorePomodoroDay(BaseModel):
    date: date_type
    sessions: int = Field(0, ge=0)
    focus_ms: int = Field(0, ge=0)


class RestoreHabit(BaseModel):
    id: int | None = None  # id in the file; matched to this database by name
    name: str = Field(..., min_length=1, max_length=80)
    icon: str = Field("", max_length=16)
    activity_category: ActivityCategory | None = None
    archived: bool = False


class RestoreHabitLog(BaseModel):
    habit_id: int
    date: date_type


class RestorePayload(BaseModel):
    entries: list[RestoreEntry] = []
    day_records: list[RestoreDay] = []
    tasks: list[RestoreTask] = []
    activities: list[RestoreActivity] = []
    goals: list[RestoreGoal] = []
    pomodoro_days: list[RestorePomodoroDay] = []
    habits: list[RestoreHabit] = []
    habit_logs: list[RestoreHabitLog] = []


class RestoreCount(BaseModel):
    added: int = 0
    merged: int = 0
    skipped: int = 0


class RestoreResult(BaseModel):
    entries: RestoreCount
    day_records: RestoreCount
    tasks: RestoreCount
    activities: RestoreCount
    goals: RestoreCount
    pomodoro_days: RestoreCount
    habits: RestoreCount
    habit_logs: RestoreCount
