"""Daily habits and their check-offs."""

from datetime import date as date_type

from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.habit import Habit, HabitLog
from app.schemas.habit import HabitCreate, HabitLogResponse, HabitResponse, HabitUpdate

router = APIRouter(prefix="/habits", tags=["Habits"])


def _get(uid: int, habit_id: int, db: Session) -> Habit:
    habit = db.get(Habit, habit_id)
    if habit is None or habit.user_id != uid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    return habit


@router.get("/", response_model=list[HabitResponse])
def list_habits(include_archived: bool = False, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    query = db.query(Habit).filter(Habit.user_id == uid)
    if not include_archived:
        query = query.filter(Habit.archived.is_(False))
    return query.order_by(Habit.sort, Habit.id).all()


@router.post("/", response_model=HabitResponse, status_code=status.HTTP_201_CREATED)
def create_habit(habit: HabitCreate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    count = db.query(Habit).filter(Habit.user_id == uid).count()
    row = Habit(**habit.model_dump(), user_id=uid, sort=count)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/logs", response_model=list[HabitLogResponse])
def list_logs(start: date_type | None = None, end: date_type | None = None, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    query = db.query(HabitLog).filter(HabitLog.user_id == uid)
    if start is not None:
        query = query.filter(HabitLog.date >= start)
    if end is not None:
        query = query.filter(HabitLog.date <= end)
    return query.order_by(HabitLog.date).all()


@router.patch("/{habit_id}", response_model=HabitResponse)
def update_habit(habit_id: int, patch: HabitUpdate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    habit = _get(uid, habit_id, db)
    for field, value in patch.model_dump(exclude_unset=True).items():
        if value is not None or field == "activity_category":
            setattr(habit, field, value)
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(habit_id: int, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    habit = _get(uid, habit_id, db)
    db.query(HabitLog).filter(HabitLog.habit_id == habit_id).delete()
    db.delete(habit)
    db.commit()


@router.put("/{habit_id}/days/{day}", response_model=HabitLogResponse)
def check_habit(habit_id: int, day: date_type, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    _get(uid, habit_id, db)
    log = db.get(HabitLog, (habit_id, day))
    if log is None:
        log = HabitLog(habit_id=habit_id, date=day, user_id=uid)
        db.add(log)
        try:
            db.commit()
        except IntegrityError:
            # two check-ins for the same day raced each other: the other one won, which is the same result
            db.rollback()
            log = db.get(HabitLog, (habit_id, day))
    return log


@router.delete("/{habit_id}/days/{day}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def uncheck_habit(habit_id: int, day: date_type, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    _get(uid, habit_id, db)
    log = db.get(HabitLog, (habit_id, day))
    if log is not None:
        db.delete(log)
        db.commit()
