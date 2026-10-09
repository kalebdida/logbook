"""Same day_date FK reasoning and auto-vivify pattern as tasks.py."""

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.activity import Activity
from app.models.day_record import DayRecord
from app.schemas.activity import ActivityCreate, ActivityResponse, ActivityUpdate

router = APIRouter(prefix="/activities", tags=["Activities"])


def _ensure_day_exists(day_date: date_type, db: Session) -> None:
    if db.get(DayRecord, day_date) is None:
        db.add(DayRecord(date=day_date))
        db.flush()


@router.post("/", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
def create_activity(activity: ActivityCreate, db: Session = Depends(get_db)):
    _ensure_day_exists(activity.day_date, db)
    db_activity = Activity(**activity.model_dump())
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    return db_activity


@router.get("/", response_model=list[ActivityResponse])
def list_activities(
    day_date: date_type | None = None,
    skip: int = 0,
    limit: int = 5000,
    db: Session = Depends(get_db),
):
    query = db.query(Activity)
    if day_date is not None:
        query = query.filter(Activity.day_date == day_date)
    return (
        query.order_by(Activity.day_date.desc(), Activity.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.patch("/{activity_id}", response_model=ActivityResponse)
def update_activity(activity_id: int, patch: ActivityUpdate, db: Session = Depends(get_db)):
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(activity, field, value)

    db.commit()
    db.refresh(activity)
    return activity


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    db.delete(activity)
    db.commit()
