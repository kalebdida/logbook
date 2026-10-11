"""Photo of the day. The bytes only ever go to the account that owns them."""

import base64
import binascii
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.photo import Photo
from app.schemas.extras import PhotoInfo, PhotoUpload

router = APIRouter(prefix="/photos", tags=["Photos"])
SIGNATURES = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"RIFF": "image/webp"}


def decode(text: str, what: str) -> bytes:
    if "," in text[:100]:
        text = text.split(",", 1)[1]           # a data: URL
    try:
        data = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"The {what} isn't valid base64") from exc
    if not any(data.startswith(sig) for sig in SIGNATURES):
        raise HTTPException(status_code=422, detail=f"The {what} isn't a JPEG, PNG or WebP image")
    return data


def save_photo(db: Session, uid: int, day: date_type, image: bytes, thumb: bytes, mime: str, caption: str = "") -> Photo:
    row = db.get(Photo, (uid, day))
    if row is None:
        row = Photo(user_id=uid, date=day, data=image, thumb=thumb)
        db.add(row)
    row.data, row.thumb, row.mime, row.caption = image, thumb, mime, caption.strip()[:300]
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=list[PhotoInfo])
def list_photos(start: date_type | None = None, end: date_type | None = None,
                uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    q = db.query(Photo.date, Photo.caption, Photo.created_at).filter(Photo.user_id == uid)
    if start:
        q = q.filter(Photo.date >= start)
    if end:
        q = q.filter(Photo.date <= end)
    return [PhotoInfo(date=d, caption=c, created_at=t) for d, c, t in q.order_by(Photo.date).all()]


@router.put("/{day}", response_model=PhotoInfo)
def put_photo(day: date_type, body: PhotoUpload, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = save_photo(db, uid, day, decode(body.image, "photo"), decode(body.thumb, "thumbnail"), body.mime, body.caption)
    return PhotoInfo(date=row.date, caption=row.caption, created_at=row.created_at)


@router.get("/{day}")
def get_photo(day: date_type, size: str = "full", uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = db.get(Photo, (uid, day))
    if row is None:
        raise HTTPException(status_code=404, detail="No photo that day")
    return Response(content=row.thumb if size == "thumb" else row.data,
                    media_type="image/jpeg" if size == "thumb" else row.mime,
                    headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(day: date_type, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = db.get(Photo, (uid, day))
    if row is None:
        raise HTTPException(status_code=404, detail="No photo that day")
    db.delete(row)
    db.commit()
