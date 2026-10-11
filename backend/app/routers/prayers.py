"""Prayer requests, and how they were answered."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.prayer import Prayer
from app.schemas.prayer import PrayerCreate, PrayerResponse, PrayerUpdate

router = APIRouter(prefix="/prayers", tags=["Prayers"])


def _own(prayer_id: int, uid: int, db: Session) -> Prayer:
    row = db.get(Prayer, prayer_id)
    if row is None or row.user_id != uid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prayer not found")
    return row


@router.post("/", response_model=PrayerResponse, status_code=status.HTTP_201_CREATED)
def create_prayer(item: PrayerCreate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    row = Prayer(user_id=uid, text=item.text.strip(), created_at=now, updated_at=now)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=list[PrayerResponse])
def list_prayers(answered: bool | None = None, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    query = db.query(Prayer).filter(Prayer.user_id == uid)
    if answered is True:
        query = query.filter(Prayer.answered_at.is_not(None))
    elif answered is False:
        query = query.filter(Prayer.answered_at.is_(None))
    return query.order_by(Prayer.created_at.desc(), Prayer.id.desc()).limit(5000).all()


@router.patch("/{prayer_id}", response_model=PrayerResponse)
def update_prayer(prayer_id: int, patch: PrayerUpdate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = _own(prayer_id, uid, db)
    changes = patch.model_dump(exclude_unset=True)
    if changes.get("text"):
        row.text = changes["text"].strip()
    if "answered" in changes and changes["answered"] is not None:
        if changes["answered"] and row.answered_at is None:
            row.answered_at = datetime.now(timezone.utc)
        elif not changes["answered"]:
            row.answered_at = None
            row.answer = ""
    if changes.get("answer") is not None and row.answered_at is not None:
        row.answer = changes["answer"].strip()
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{prayer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prayer(prayer_id: int, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    db.delete(_own(prayer_id, uid, db))
    db.commit()
