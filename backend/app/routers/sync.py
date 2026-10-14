"""Settings that follow the account: GET what's saved, PUT a newer copy.
The newest change wins (the device sends when it changed them)."""

import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.user_settings import UserSettings

router = APIRouter(prefix="/sync", tags=["Sync"])

ALLOWED = {"logbook-prefs", "logbook-theme", "logbook-custom-themes", "logbook-theme-vars", "logbook-look",
           "logbook-music", "logbook-mascot-gifts"}


class SettingsBody(BaseModel):
    data: dict[str, str] = Field(default_factory=dict)
    stamp: int = Field(..., ge=0)


def _json(row: UserSettings | None) -> dict:
    if row is None:
        return {"data": {}, "stamp": 0}
    return {"data": json.loads(row.data or "{}"), "stamp": row.stamp}


@router.get("/settings")
def get_settings(uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    return _json(db.get(UserSettings, uid))


@router.put("/settings")
def put_settings(body: SettingsBody, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    data = {k: v for k, v in body.data.items() if k in ALLOWED}
    text = json.dumps(data)
    if len(text) > 200_000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Those settings are too big")
    row = db.get(UserSettings, uid)
    if row is None:
        row = UserSettings(user_id=uid, data="{}", stamp=0)
        db.add(row)
    if body.stamp >= row.stamp:          # an older device doesn't undo a newer change
        row.data = text
        row.stamp = body.stamp
        db.commit()
    return _json(row)
