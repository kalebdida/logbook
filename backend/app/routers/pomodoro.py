"""
POST .../sessions increments rather than overwrites, recording "one more
focus session just finished" is safer than trusting a client to PUT the
correct running total, and matches how pomodoro.js's own completeTimer()
increments stats.sessions/stats.focusMs rather than replacing them.
"""

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.pomodoro_day import PomodoroDay
from app.schemas.pomodoro_day import PomodoroDayResponse, PomodoroSessionComplete

router = APIRouter(prefix="/pomodoro", tags=["Pomodoro"])


@router.post("/{session_date}/sessions", response_model=PomodoroDayResponse)
def record_session(session_date: date_type, payload: PomodoroSessionComplete, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    day = db.get(PomodoroDay, (uid, session_date))
    if day is None:
        day = PomodoroDay(user_id=uid, date=session_date, sessions=0, focus_ms=0)
        db.add(day)

    day.sessions += 1
    day.focus_ms += payload.focus_ms

    db.commit()
    db.refresh(day)
    return day


@router.get("/", response_model=list[PomodoroDayResponse])
def list_pomodoro_days(skip: int = 0, limit: int = 5000, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    return (
        db.query(PomodoroDay)
        .filter(PomodoroDay.user_id == uid)
        .order_by(PomodoroDay.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{session_date}", response_model=PomodoroDayResponse)
def get_pomodoro_day(session_date: date_type, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    day = db.get(PomodoroDay, (uid, session_date))
    if day is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pomodoro data for that date")
    return day
