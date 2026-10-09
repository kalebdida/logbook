"""Login, invite-only sign up, and account management.

The admin can make invites, see who has an account (name and join date,
nothing else), give someone a password-reset code, and remove an account.
There is deliberately no endpoint that shows the admin anyone else's data.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.auth import (
    authenticate, auth_required, check_not_locked, clear_failures, current_user, display_name,
    hash_password, make_token, normalize_username, optional_user, password_problem, record_failure,
    require_admin, username_problem, verify_password,
)
from app.config import settings
from app.database import get_db
from app.models.user import OWNER_ID, Invite, User

router = APIRouter(prefix="/auth", tags=["Auth"])

# no 0/o/1/l/i: codes get read out loud and typed on phones
CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)  # SQLite drops the zone


def _new_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def _code_hash(code: str) -> str:
    clean = "".join(ch for ch in (code or "").lower() if ch.isalnum())
    return hashlib.sha256(f"logbook-invite:{clean}".encode()).hexdigest()


def _user_json(user: User) -> dict:
    return {"username": display_name(user), "is_admin": user.is_admin}


def _token_json(user: User) -> dict:
    token, expires = make_token(user)
    return {"token": token, "expires_at": expires, "required": True, "user": _user_json(user)}


def _bad_request(detail: str):
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _usable_code(db: Session, code: str, kind: str) -> Invite | None:
    invite = db.query(Invite).filter(Invite.code_hash == _code_hash(code), Invite.kind == kind).first()
    if invite is None or invite.used_at is not None or _aware(invite.expires_at) <= _now():
        return None
    return invite


def _claim(db: Session, invite: Invite) -> bool:
    """Mark the code used, atomically: of two requests racing with the same
    code, exactly one gets True. Part of the caller's transaction, so a later
    failure (name taken) rolls the claim back too."""
    result = db.execute(
        update(Invite).where(Invite.id == invite.id, Invite.used_at.is_(None)).values(used_at=_now())
    )
    return result.rowcount == 1


# ---------- everyone ----------

class LoginRequest(BaseModel):
    username: str = Field("", max_length=64)
    password: str = Field(..., max_length=500)


class SignupRequest(BaseModel):
    invite: str = Field(..., max_length=40)
    username: str = Field(..., max_length=64)
    password: str = Field(..., max_length=500)


class ResetRequest(BaseModel):
    username: str = Field(..., max_length=64)
    code: str = Field(..., max_length=40)
    password: str = Field(..., max_length=500)


class PasswordChange(BaseModel):
    current: str = Field(..., max_length=500)
    new: str = Field(..., max_length=500)


class PasswordConfirm(BaseModel):
    password: str = Field(..., max_length=500)


@router.get("/status")
def auth_status(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = optional_user(authorization, db)
    return {
        "required": auth_required(),
        "authenticated": user is not None,
        "accounts": auth_required(),
        "user": _user_json(user) if user is not None and auth_required() else None,
    }


@router.post("/login")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    if not auth_required():
        return {"token": "", "expires_at": None, "required": False, "user": None}
    user = authenticate(request, db, body.username, body.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="wrong username or password")
    return _token_json(user)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, request: Request, db: Session = Depends(get_db)):
    if not auth_required():
        _bad_request("this server has no accounts. it runs for one person without a login.")
    check_not_locked(request)
    invite = _usable_code(db, body.invite, "signup")
    if invite is None:
        record_failure(request, login=False)
        _bad_request("that invite code doesn't work. it may be used up or expired.")
    name = normalize_username(body.username)
    problem = username_problem(name) or password_problem(body.password)
    if problem:
        _bad_request(problem)
    if db.query(User).filter(User.username == name).first():
        _bad_request("that username is taken.")
    password_hash = hash_password(body.password)  # slow: before the claim, so the transaction stays short
    if not _claim(db, invite):
        db.rollback()
        _bad_request("that invite code doesn't work. it may be used up or expired.")
    user = User(username=name, password_hash=password_hash, is_admin=False)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # someone took the name a moment ago
        db.rollback()
        _bad_request("that username is taken.")
    if db.query(User).count() > settings.max_users:
        db.rollback()
        _bad_request("this server is full. ask the admin.")
    db.execute(update(Invite).where(Invite.id == invite.id).values(used_by=user.id))
    db.commit()
    clear_failures(request)
    return _token_json(user)


@router.post("/reset")
def reset_password(body: ResetRequest, request: Request, db: Session = Depends(get_db)):
    """Set a new password with a one-time reset code from the admin."""
    name = normalize_username(body.username)
    check_not_locked(request, name)
    invite = _usable_code(db, body.code, "reset")
    user = db.get(User, invite.for_user_id) if invite and invite.for_user_id else None
    if user is None or user.username != name or user.id == OWNER_ID:
        record_failure(request, name, login=False)
        _bad_request("that reset code doesn't work for that username.")
    problem = password_problem(body.password)
    if problem:
        _bad_request(problem)
    password_hash = hash_password(body.password)
    if not _claim(db, invite):
        db.rollback()
        _bad_request("that reset code doesn't work for that username.")
    user.password_hash = password_hash
    user.token_version += 1
    db.execute(update(Invite).where(Invite.id == invite.id).values(used_by=user.id))
    db.commit()
    clear_failures(request, name)
    return _token_json(user)


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """last_reset_at: when a reset code from the admin last set this account's
    password. Shown to the person, so a reset they didn't ask for can't go
    unnoticed."""
    last_reset = (db.query(Invite.used_at)
                  .filter(Invite.kind == "reset", Invite.for_user_id == user.id, Invite.used_at.is_not(None))
                  .order_by(Invite.used_at.desc()).first())
    return {**_user_json(user), "created_at": user.created_at, "last_reset_at": last_reset[0] if last_reset else None}


@router.post("/password")
def change_password(body: PasswordChange, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.id == OWNER_ID:
        _bad_request("the admin password is LOGBOOK_PASSWORD. change it in your host's settings (render → environment).")
    check_not_locked(request, user.username)
    if not verify_password(body.current, user.password_hash):
        record_failure(request, user.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="current password is wrong")
    problem = password_problem(body.new)
    if problem:
        _bad_request(problem)
    user.password_hash = hash_password(body.new)
    user.token_version += 1
    db.commit()
    return _token_json(user)  # this device stays logged in; every other one is signed out


@router.post("/logout-everywhere")
def logout_everywhere(user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.token_version += 1
    db.commit()
    return {"ok": True}


def _delete_account(db: Session, user: User) -> None:
    from app.models import Activity, DayRecord, Entry, Goal, Habit, HabitLog, PomodoroDay, Task

    # children before parents, so this works with or without ON DELETE CASCADE
    for model in (HabitLog, Task, Activity, Habit, Entry, Goal, PomodoroDay, DayRecord):
        db.query(model).filter(model.user_id == user.id).delete(synchronize_session=False)
    db.query(Invite).filter(Invite.for_user_id == user.id).delete(synchronize_session=False)
    db.query(Invite).filter(Invite.used_by == user.id).update({Invite.used_by: None}, synchronize_session=False)
    db.delete(user)
    db.commit()


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_own_account(body: PasswordConfirm, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.id == OWNER_ID:
        _bad_request("the admin account can't be deleted.")
    check_not_locked(request, user.username)
    if not verify_password(body.password, user.password_hash):
        record_failure(request, user.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="wrong password")
    _delete_account(db, user)


# ---------- admin ----------

class InviteCreate(BaseModel):
    note: str = Field("", max_length=60)
    days: int = Field(0, ge=0, le=30)


def _invite_json(invite: Invite, db: Session) -> dict:
    used_by = db.get(User, invite.used_by) if invite.used_by else None
    for_user = db.get(User, invite.for_user_id) if invite.for_user_id else None
    expired = invite.used_at is None and _aware(invite.expires_at) <= _now()
    return {
        "id": invite.id,
        "kind": invite.kind,
        "note": invite.note,
        "created_at": invite.created_at,
        "expires_at": invite.expires_at,
        "used_at": invite.used_at,
        "used_by": display_name(used_by) if used_by else None,
        "for_user": display_name(for_user) if for_user else None,
        "status": "used" if invite.used_at else "expired" if expired else "open",
    }


def _make_code(db: Session, kind: str, note: str, days: int, for_user_id: int | None = None) -> dict:
    code = _new_code()
    invite = Invite(
        kind=kind, code_hash=_code_hash(code), note=note.strip(), for_user_id=for_user_id,
        expires_at=_now() + timedelta(days=days or settings.invite_days),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return {**_invite_json(invite, db), "code": code}  # the only time the code is ever shown


@router.post("/invites", status_code=status.HTTP_201_CREATED)
def create_invite(body: InviteCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not auth_required():
        _bad_request("set LOGBOOK_PASSWORD first: without it this server has no accounts.")
    if db.query(User).count() >= settings.max_users:
        _bad_request(f"the server is at its limit of {settings.max_users} accounts (LOGBOOK_MAX_USERS).")
    return _make_code(db, "signup", body.note, body.days)


@router.get("/invites")
def list_invites(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [_invite_json(i, db) for i in db.query(Invite).order_by(Invite.created_at.desc(), Invite.id.desc()).limit(100)]


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def cancel_invite(invite_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    invite = db.get(Invite, invite_id)
    if invite is not None and invite.used_at is None:
        db.delete(invite)
        db.commit()


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Names and join dates only. Nothing about what anyone wrote."""
    users = db.query(User).order_by(User.id).all()
    return [{"id": u.id, "username": display_name(u), "is_admin": u.is_admin, "created_at": u.created_at} for u in users]


@router.post("/users/{user_id}/reset-code", status_code=status.HTTP_201_CREATED)
def make_reset_code(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None or user.id == OWNER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no such account")
    # older unused codes for this person stop working
    db.query(Invite).filter(Invite.kind == "reset", Invite.for_user_id == user.id, Invite.used_at.is_(None)).delete()
    return _make_code(db, "reset", f"reset for {user.username}", 2, for_user_id=user.id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def remove_user(user_id: int, body: PasswordConfirm, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Removes the account and everything in it. Needs the admin password again."""
    if authenticate(request, db, "", body.password) is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="wrong password")
    user = db.get(User, user_id)
    if user is None or user.id == OWNER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no such account")
    _delete_account(db, user)
