"""
Import every model here so:
1. `from app.models import X` works from anywhere.
2. SQLAlchemy's Base.metadata knows about every table before
   Base.metadata.create_all() runs in main.py.

Add each new model's import to this file as you create it.
"""

from app.models.activity import Activity
from app.models.day_record import DayRecord
from app.models.entry import Entry
from app.models.goal import Goal
from app.models.habit import Habit, HabitLog
from app.models.pomodoro_day import PomodoroDay
from app.models.task import Task

__all__ = ["Entry", "DayRecord", "Task", "Activity", "Goal", "PomodoroDay", "Habit", "HabitLog"]
