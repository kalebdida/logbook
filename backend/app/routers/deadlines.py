"""Dates that matter, with countdowns. Every query filters on the account."""

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.deadline import Deadline
from app.schemas.deadline import DeadlineCreate, DeadlineResponse, DeadlineUpdate

router = APIRouter(prefix="/deadlines", tags=["Deadlines"])


def _own(deadline_id: int, uid: int, db: Session) -> Deadline:
    row = db.get(Deadline, deadline_id)
    if row is None or row.user_id != uid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deadline not found")
    return row


@router.post("/", response_model=DeadlineResponse, status_code=status.HTTP_201_CREATED)
def create_deadline(item: DeadlineCreate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = Deadline(**item.model_dump(), user_id=uid)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=list[DeadlineResponse])
def list_deadlines(
    start: date_type | None = None,
    end: date_type | None = None,
    done: bool | None = None,
    uid: int = Depends(current_user_id),
    db: Session = Depends(get_db),
):
    query = db.query(Deadline).filter(Deadline.user_id == uid)
    if start is not None:
        query = query.filter(Deadline.due_date >= start)
    if end is not None:
        query = query.filter(Deadline.due_date <= end)
    if done is not None:
        query = query.filter(Deadline.done == done)
    return query.order_by(Deadline.due_date.asc(), Deadline.id.asc()).limit(5000).all()


@router.patch("/{deadline_id}", response_model=DeadlineResponse)
def update_deadline(deadline_id: int, patch: DeadlineUpdate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    row = _own(deadline_id, uid, db)
    for field, value in patch.model_dump(exclude_unset=True).items():
        if value is None and field in ("title", "due_date", "kind", "note", "done"):
            continue
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{deadline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deadline(deadline_id: int, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    db.delete(_own(deadline_id, uid, db))
    db.commit()
