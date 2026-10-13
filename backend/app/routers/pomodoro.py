"""
POST .../sessions increments rather than overwrites, recording "one more
focus session just finished" is safer than trusting a client to PUT the
correct running total, and matches how pomodoro.js's own completeTimer()
increments stats.sessions/stats.focusMs rather than replacing them.
"""

import json
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.focus_live import FocusLive
from app.models.pomodoro_day import PomodoroDay
from app.schemas.pomodoro_day import PomodoroDayResponse, PomodoroSessionComplete

router = APIRouter(prefix="/pomodoro", tags=["Pomodoro"])


# ---- the running timer, shared by every device (declared before /{date}) ----

class LiveTimer(BaseModel):
    timer: dict = Field(...)        # {id, mode, status, durationMs, remainingMs, startedAt, endsAt}


class LiveFinish(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)


def _live(db: Session, uid: int) -> FocusLive:
    row = db.get(FocusLive, uid)
    if row is None:
        row = FocusLive(user_id=uid, timer="", rev=0, finished_id="")
        db.add(row)
        db.flush()
    return row


def _live_json(row: FocusLive | None) -> dict:
    if row is None or not row.timer:
        return {"timer": None, "rev": row.rev if row else 0}
    return {"timer": json.loads(row.timer), "rev": row.rev}


@router.get("/live")
def get_live(uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    return _live_json(db.get(FocusLive, uid))


@router.put("/live")
def put_live(body: LiveTimer, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    text = json.dumps(body.timer)
    if len(text) > 2000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That timer is too big")
    row = _live(db, uid)
    row.timer = text
    row.rev += 1
    db.commit()
    return _live_json(row)


@router.post("/live/finish")
def finish_live(body: LiveFinish, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    """A focus block ran out. Every device that was showing it asks; only the
    first gets first=true and counts it, so a block is never counted twice."""
    _live(db, uid)
    db.commit()
    won = db.query(FocusLive).filter(FocusLive.user_id == uid, FocusLive.finished_id != body.id).update({"finished_id": body.id})
    db.commit()
    return {"first": bool(won)}


@router.post("/{session_date}/sessions", response_model=PomodoroDayResponse)
def record_session(session_date: date_type, payload: PomodoroSessionComplete, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    day = db.get(PomodoroDay, (uid, session_date))
    if day is None:
        day = PomodoroDay(user_id=uid, date=session_date, sessions=0, focus_ms=0)
        db.add(day)

    if not payload.partial:
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
