"""
Import every model here so:
1. `from app.models import X` works from anywhere.
2. SQLAlchemy's Base.metadata knows about every table before
   Base.metadata.create_all() runs in main.py.

Add each new model's import to this file as you create it.
"""

from app.models.activity import Activity
from app.models.day_record import DayRecord
from app.models.deadline import Deadline
from app.models.entry import Entry
from app.models.goal import Goal
from app.models.habit import Habit, HabitLog
from app.models.pomodoro_day import PomodoroDay
from app.models.prayer import Prayer
from app.models.profile import Profile
from app.models.sleep import SleepLog
from app.models.photo import Photo
from app.models.letter import Letter
from app.models.task import Task
from app.models.telegram import AppSetting, TelegramLink
from app.models.user import Invite, User

__all__ = ["Entry", "DayRecord", "Task", "Activity", "Goal", "PomodoroDay", "Habit", "HabitLog", "User", "Invite", "Deadline", "Prayer", "AppSetting", "TelegramLink", "Profile", "SleepLog", "Photo", "Letter"]
