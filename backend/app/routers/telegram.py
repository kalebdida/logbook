"""Settings for the Telegram bot (app/telegram.py), and the address
Telegram delivers messages to."""

import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import telegram as bot
from app.auth import current_user, require_admin
from app.database import get_db
from app.models import TelegramLink, User

router = APIRouter(prefix="/telegram", tags=["Telegram"])
webhook_router = APIRouter(prefix="/telegram", tags=["Telegram"])


class SetupBody(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)


class LinkBody(BaseModel):
    tz_minutes: int = Field(0, ge=-14 * 60, le=14 * 60)


class LinkPatch(BaseModel):
    morning_hour: int | None = Field(None, ge=0, le=23)
    morning_off: bool = False
    tz_minutes: int | None = Field(None, ge=-14 * 60, le=14 * 60)


def public_url(request: Request) -> str:
    url = os.environ.get("LOGBOOK_SELF_URL") or os.environ.get("RENDER_EXTERNAL_URL") or ""
    if not url:
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme
        url = f"{proto}://{request.url.netloc}"
    return url.rstrip("/")


def status_for(db: Session, user: User) -> dict:
    token = bot.load_token(db)
    link = db.get(TelegramLink, user.id)
    return {
        "configured": bool(token),
        "bot": bot.state["username"] if token else "",
        "admin": user.is_admin,
        "linked": link is not None,
        "morning_hour": link.morning_hour if link else None,
    }


@router.get("/status")
def telegram_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return status_for(db, user)


@router.post("/setup")
async def telegram_setup(body: SetupBody, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        await bot.setup(db, body.token, public_url(request))
    except bot.TelegramError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    bot.refresh_links(db)
    return status_for(db, user)


@router.delete("/setup")
async def telegram_remove(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    await bot.remove(db)
    return status_for(db, user)


@router.post("/link")
def telegram_link(body: LinkBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not bot.load_token(db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The Telegram bot isn't set up on this server yet")
    code = bot.new_link_code(user.id, body.tz_minutes)
    return {"url": f"https://t.me/{bot.state['username']}?start={code}", "bot": bot.state["username"]}


@router.patch("/link")
def telegram_link_update(body: LinkPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    link = db.get(TelegramLink, user.id)
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Telegram isn't connected")
    if body.morning_off:
        link.morning_hour = None
    elif body.morning_hour is not None:
        link.morning_hour = body.morning_hour
    if body.tz_minutes is not None:
        link.tz_minutes = body.tz_minutes
    db.commit()
    bot.refresh_links(db)
    return status_for(db, user)


@router.delete("/link")
def telegram_unlink(user: User = Depends(current_user), db: Session = Depends(get_db)):
    link = db.get(TelegramLink, user.id)
    if link is not None:
        db.delete(link)
        db.commit()
        bot.refresh_links(db)
    return status_for(db, user)


@webhook_router.post("/webhook/{secret}", include_in_schema=False)
async def telegram_webhook(secret: str, request: Request, db: Session = Depends(get_db),
                           x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    bot.load_token(db)
    expected = bot.state["secret"]
    if not expected or not secrets.compare_digest(secret, expected) or not secrets.compare_digest(x_telegram_bot_api_secret_token or "", expected):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    try:
        update = await request.json()
    except ValueError:
        return {"ok": True}
    # answer Telegram at once; the reply (maybe an AI one) goes out on its own
    bot.spawn(bot.process(update))
    return {"ok": True}
