"""Export everything as one JSON file, and restore from one."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models import Activity, DayRecord, Entry, Goal, Habit, HabitLog, PomodoroDay, Task
from app.schemas.backup import BackupExport, RestoreCount, RestorePayload, RestoreResult

router = APIRouter(prefix="/backup", tags=["Backup"])

DAY_TEXT_FIELDS = [
    "morning_intention", "morning_main_focus", "journal", "reflection_what_happened",
    "reflection_wins", "reflection_lessons", "reflection_tomorrow_plan",
    "reflection_gratitude", "brain_dump",
]


@router.get("", response_model=BackupExport)
def export_backup(uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    return BackupExport(
        exported_at=datetime.now(timezone.utc),
        entries=db.query(Entry).filter(Entry.user_id == uid).order_by(Entry.occurred_at).all(),
        day_records=db.query(DayRecord).filter(DayRecord.user_id == uid).order_by(DayRecord.date).all(),
        tasks=db.query(Task).filter(Task.user_id == uid).order_by(Task.day_date, Task.id).all(),
        activities=db.query(Activity).filter(Activity.user_id == uid).order_by(Activity.day_date, Activity.id).all(),
        goals=db.query(Goal).filter(Goal.user_id == uid).order_by(Goal.created_at).all(),
        pomodoro_days=db.query(PomodoroDay).filter(PomodoroDay.user_id == uid).order_by(PomodoroDay.date).all(),
        habits=db.query(Habit).filter(Habit.user_id == uid).order_by(Habit.sort, Habit.id).all(),
        habit_logs=db.query(HabitLog).filter(HabitLog.user_id == uid).order_by(HabitLog.date).all(),
    )


@router.post("/restore", response_model=RestoreResult)
def restore_backup(payload: RestorePayload, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    """Additive merge. Existing rows are never overwritten:
    entries and goals are matched by id, day records only fill fields that
    are still empty, tasks/activities are matched by day + title, and
    pomodoro days keep the larger of the two totals."""
    result = {k: RestoreCount() for k in RestoreResult.model_fields}

    # Day records first: tasks and activities have a foreign key to them.
    existing_days = {d.date: d for d in db.query(DayRecord).filter(DayRecord.user_id == uid).all()}

    def ensure_day(day_date):
        if day_date not in existing_days:
            day = DayRecord(user_id=uid, date=day_date)
            db.add(day)
            existing_days[day_date] = day

    for item in payload.day_records:
        day = existing_days.get(item.date)
        if day is None:
            day = DayRecord(user_id=uid, **item.model_dump())
            db.add(day)
            existing_days[item.date] = day
            result["day_records"].added += 1
            continue
        filled = False
        for field in DAY_TEXT_FIELDS:
            incoming = getattr(item, field)
            if incoming and not (getattr(day, field) or "").strip():
                setattr(day, field, incoming)
                filled = True
        if filled:
            result["day_records"].merged += 1
        else:
            result["day_records"].skipped += 1
    db.flush()

    entry_ids = {row[0] for row in db.query(Entry.id).filter(Entry.user_id == uid).all()}
    for item in payload.entries:
        if item.id and item.id in entry_ids:
            result["entries"].skipped += 1
            continue
        entry = Entry(user_id=uid, mood=item.mood, text=item.text, occurred_at=item.occurred_at)
        if item.id:
            entry.id = item.id
            entry_ids.add(item.id)
        db.add(entry)
        result["entries"].added += 1

    task_keys = {(t.day_date, t.title) for t in db.query(Task).filter(Task.user_id == uid).all()}
    for item in payload.tasks:
        key = (item.day_date, item.title)
        if key in task_keys:
            result["tasks"].skipped += 1
            continue
        ensure_day(item.day_date)
        db.flush()
        db.add(Task(user_id=uid, **item.model_dump()))
        task_keys.add(key)
        result["tasks"].added += 1

    activity_keys = {(a.day_date, a.title, a.duration_minutes) for a in db.query(Activity).filter(Activity.user_id == uid).all()}
    for item in payload.activities:
        key = (item.day_date, item.title, item.duration_minutes)
        if key in activity_keys:
            result["activities"].skipped += 1
            continue
        ensure_day(item.day_date)
        db.flush()
        db.add(Activity(user_id=uid, **item.model_dump()))
        activity_keys.add(key)
        result["activities"].added += 1

    goal_ids = {row[0] for row in db.query(Goal.id).filter(Goal.user_id == uid).all()}
    now = datetime.now(timezone.utc)
    for item in payload.goals:
        if item.id and item.id in goal_ids:
            result["goals"].skipped += 1
            continue
        completed = item.progress == 100
        goal = Goal(user_id=uid, 
            title=item.title,
            description=item.description,
            category=item.category,
            priority=item.priority,
            progress=item.progress,
            completed=completed,
            created_at=item.created_at or now,
            updated_at=item.updated_at or item.created_at or now,
            completed_at=(item.completed_at or item.updated_at or now) if completed else None,
            target_date=item.target_date,
            activity_category=item.activity_category,
        )
        if item.id:
            goal.id = item.id
            goal_ids.add(item.id)
        db.add(goal)
        result["goals"].added += 1

    existing_pomo = {p.date: p for p in db.query(PomodoroDay).filter(PomodoroDay.user_id == uid).all()}
    for item in payload.pomodoro_days:
        day = existing_pomo.get(item.date)
        if day is None:
            day = PomodoroDay(user_id=uid, date=item.date, sessions=item.sessions, focus_ms=item.focus_ms)
            db.add(day)
            existing_pomo[item.date] = day
            result["pomodoro_days"].added += 1
        elif item.sessions > day.sessions or item.focus_ms > day.focus_ms:
            day.sessions = max(day.sessions, item.sessions)
            day.focus_ms = max(day.focus_ms, item.focus_ms)
            result["pomodoro_days"].merged += 1
        else:
            result["pomodoro_days"].skipped += 1

    # habits are matched by name (ids differ between databases); logs follow
    # their habit through that mapping
    by_name = {h.name.strip().lower(): h for h in db.query(Habit).filter(Habit.user_id == uid).all()}
    id_map = {}
    for item in payload.habits:
        key = item.name.strip().lower()
        habit = by_name.get(key)
        if habit is None:
            habit = Habit(user_id=uid, name=item.name.strip(), icon=item.icon, activity_category=item.activity_category,
                          archived=item.archived, sort=len(by_name))
            db.add(habit)
            db.flush()
            by_name[key] = habit
            result["habits"].added += 1
        else:
            result["habits"].skipped += 1
        if item.id is not None:
            id_map[item.id] = habit.id

    existing_logs = {(log.habit_id, log.date) for log in db.query(HabitLog).filter(HabitLog.user_id == uid).all()}
    for item in payload.habit_logs:
        habit_id = id_map.get(item.habit_id)
        if habit_id is None or (habit_id, item.date) in existing_logs:
            result["habit_logs"].skipped += 1
            continue
        db.add(HabitLog(user_id=uid, habit_id=habit_id, date=item.date))
        existing_logs.add((habit_id, item.date))
        result["habit_logs"].added += 1

    db.commit()
    return RestoreResult(**result)
