"""CRUD for journal entries."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.entry import Entry
from app.schemas.entry import EntryCreate, EntryResponse, EntryUpdate

router = APIRouter(prefix="/entries", tags=["Entries"])


@router.post("/", response_model=EntryResponse, status_code=status.HTTP_201_CREATED)
def create_entry(entry: EntryCreate, db: Session = Depends(get_db)):
    if entry.id is not None and db.get(Entry, entry.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An entry with that id already exists"
        )

    db_entry = Entry(
        mood=entry.mood,
        text=entry.text,
        occurred_at=entry.occurred_at or datetime.now(timezone.utc),
    )
    if entry.id is not None:
        db_entry.id = entry.id
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry


@router.get("/", response_model=list[EntryResponse])
def list_entries(skip: int = 0, limit: int = 5000, db: Session = Depends(get_db)):
    return (
        db.query(Entry)
        .order_by(Entry.occurred_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return entry


@router.patch("/{entry_id}", response_model=EntryResponse)
def update_entry(entry_id: str, patch: EntryUpdate, db: Session = Depends(get_db)):
    entry = db.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    for field, value in patch.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    db.delete(entry)
    db.commit()
