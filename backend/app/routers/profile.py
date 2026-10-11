"""The account's birthday and the cat's name, the same on every device."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.profile import Profile
from app.schemas.profile import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["Profile"])


def read_profile(db: Session, uid: int) -> ProfileResponse:
    row = db.get(Profile, uid)
    return ProfileResponse(birthday=row.birthday, pet_name=row.pet_name or "") if row else ProfileResponse()


@router.get("", response_model=ProfileResponse)
def get_profile(uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    return read_profile(db, uid)


@router.put("", response_model=ProfileResponse)
def put_profile(body: ProfileUpdate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = db.get(Profile, uid)
    if row is None:
        row = Profile(user_id=uid)
        db.add(row)
    changes = body.model_dump(exclude_unset=True)
    if "birthday" in changes:
        row.birthday = changes["birthday"]
    if changes.get("pet_name") is not None:
        row.pet_name = changes["pet_name"].strip()
    db.commit()
    return read_profile(db, uid)
