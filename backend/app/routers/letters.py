"""The monthly letter from the cat."""

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import letters
from app.auth import current_user
from app.database import get_db
from app.models import Letter, User
from app.schemas.extras import LetterResponse

router = APIRouter(prefix="/letters", tags=["Letters"])


@router.get("/", response_model=list[LetterResponse])
def list_letters(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.query(Letter).filter(Letter.user_id == user.id).order_by(Letter.month.desc()).all()


@router.post("/{month}", response_model=LetterResponse)
async def open_letter(month: str, tz_minutes: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(status_code=422, detail="Month looks like 2026-10")
    local_today = (datetime.now(timezone.utc) + timedelta(minutes=max(-840, min(840, tz_minutes)))).date()
    if month >= local_today.strftime("%Y-%m"):
        raise HTTPException(status_code=409, detail="That month isn't over yet")
    return await letters.letter_for(db, user, month, tz_minutes)
