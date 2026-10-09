"""
day_date is a real foreign key (see models/task.py for why), which means
a day_records row has to exist before a task can point at it. Rather than
force the client to create one first, _ensure_day_exists mirrors exactly
what updateDayRecord() already does client-side: auto-vivify a bare day
record the first time anything gets saved against that date.
"""

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.day_record import DayRecord
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def _ensure_day_exists(day_date: date_type, db: Session) -> None:
    if db.get(DayRecord, day_date) is None:
        db.add(DayRecord(date=day_date))
        db.flush()


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    _ensure_day_exists(task.day_date, db)
    db_task = Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.get("/", response_model=list[TaskResponse])
def list_tasks(
    day_date: date_type | None = None,
    before: date_type | None = None,
    completed: bool | None = None,
    skip: int = 0,
    limit: int = 5000,
    db: Session = Depends(get_db),
):
    query = db.query(Task)
    if day_date is not None:
        query = query.filter(Task.day_date == day_date)
    if before is not None:
        query = query.filter(Task.day_date < before)
    if completed is not None:
        query = query.filter(Task.completed == completed)
    return query.order_by(Task.day_date.desc(), Task.created_at.asc()).offset(skip).limit(limit).all()


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, patch: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    changes = patch.model_dump(exclude_unset=True)
    if changes.get("day_date") is not None:
        _ensure_day_exists(changes["day_date"], db)
    for field, value in changes.items():
        if field == "day_date" and value is None:
            continue
        setattr(task, field, value)

    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    db.delete(task)
    db.commit()
