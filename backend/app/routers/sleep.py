"""A night's sleep, filed under the morning you woke up."""

from datetime import date as date_type
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.sleep import SleepLog
from app.schemas.extras import SleepResponse, SleepUpdate

router = APIRouter(prefix="/sleep", tags=["Sleep"])


def aware(when: datetime) -> datetime:
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)   # SQLite hands back naive UTC


def minutes_slept(row: SleepLog) -> int | None:
    if not (row.bed_at and row.wake_at):
        return None
    return round((aware(row.wake_at) - aware(row.bed_at)).total_seconds() / 60)


@router.get("/", response_model=list[SleepResponse])
def list_sleep(start: date_type | None = None, end: date_type | None = None,
               uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    q = db.query(SleepLog).filter(SleepLog.user_id == uid)
    if start:
        q = q.filter(SleepLog.date >= start)
    if end:
        q = q.filter(SleepLog.date <= end)
    return q.order_by(SleepLog.date).limit(2000).all()


@router.put("/{day}", response_model=SleepResponse)
def put_sleep(day: date_type, body: SleepUpdate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = db.get(SleepLog, (uid, day))
    if row is None:
        row = SleepLog(user_id=uid, date=day)
        db.add(row)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    slept = minutes_slept(row)
    if slept is not None and not 0 < slept <= 20 * 60:
        raise HTTPException(status_code=422, detail="Waking up has to come after going to bed, within 20 hours")
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sleep(day: date_type, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = db.get(SleepLog, (uid, day))
    if row is None:
        raise HTTPException(status_code=404, detail="Nothing logged that night")
    db.delete(row)
    db.commit()
