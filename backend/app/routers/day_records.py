from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.day_record import DayRecord
from app.schemas.day_record import DayRecordResponse, DayRecordUpsert

router = APIRouter(prefix="/days", tags=["Day Records"])


@router.put("/{record_date}", response_model=DayRecordResponse)
def upsert_day(record_date: date_type, payload: DayRecordUpsert, db: Session = Depends(get_db)):
    """
    True partial update on an existing record: a field the client didn't
    send is left alone rather than reset to its schema default. This
    matters because dailyPage.js only ever sends the fields its own form
    has, never brain_dump for instance, so a naive full-model_dump()
    overwrite would silently blank out any field the caller omitted.
    """
    day = db.get(DayRecord, record_date)

    if day is None:
        day = DayRecord(date=record_date, **payload.model_dump())
        db.add(day)
    else:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(day, field, value)

    db.commit()
    db.refresh(day)
    return day


@router.get("/", response_model=list[DayRecordResponse])
def list_days(skip: int = 0, limit: int = 5000, db: Session = Depends(get_db)):
    return (
        db.query(DayRecord)
        .order_by(DayRecord.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{record_date}", response_model=DayRecordResponse)
def get_day(record_date: date_type, db: Session = Depends(get_db)):
    day = db.get(DayRecord, record_date)
    if day is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No record for that date")
    return day


@router.delete("/{record_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day(record_date: date_type, db: Session = Depends(get_db)):
    day = db.get(DayRecord, record_date)
    if day is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No record for that date")
    db.delete(day)
    db.commit()
