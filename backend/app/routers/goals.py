"""
completed and completed_at are never set directly by the client, both are
derived from progress on every write, mirroring saveProgress()/createGoal()
in goals.js: completed = progress === 100, and completed_at is set once on
the transition into completed and preserved across further saves (only
cleared if the goal drops back out of completed).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import current_user_id
from app.database import get_db
from app.models.goal import Goal
from app.schemas.goal import GoalCreate, GoalResponse, GoalUpdate

router = APIRouter(prefix="/goals", tags=["Goals"])


def _apply_completion_rule(goal: Goal) -> None:
    now_completed = goal.progress == 100
    if now_completed and not goal.completed:
        goal.completed_at = datetime.now(timezone.utc)
    elif not now_completed:
        goal.completed_at = None
    goal.completed = now_completed


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(goal: GoalCreate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    db_goal = Goal(**goal.model_dump(), user_id=uid, created_at=now, updated_at=now)
    _apply_completion_rule(db_goal)
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal


@router.get("/", response_model=list[GoalResponse])
def list_goals(
    category: str | None = None,
    completed: bool | None = None,
    skip: int = 0,
    limit: int = 5000,
    uid: int = Depends(current_user_id),
    db: Session = Depends(get_db),
):
    query = db.query(Goal).filter(Goal.user_id == uid)
    if category is not None:
        query = query.filter(Goal.category == category)
    if completed is not None:
        query = query.filter(Goal.completed == completed)
    return query.order_by(Goal.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{goal_id}", response_model=GoalResponse)
def get_goal(goal_id: str, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    goal = db.get(Goal, (uid, goal_id))
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(goal_id: str, patch: GoalUpdate, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    goal = db.get(Goal, (uid, goal_id))
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)

    _apply_completion_rule(goal)
    goal.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: str, uid: int = Depends(current_user_id), db: Session = Depends(get_db)):
    goal = db.get(Goal, (uid, goal_id))
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    db.delete(goal)
    db.commit()
