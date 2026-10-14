from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import ai, photo_notes, recall
from app.auth import current_user
from app.database import get_db
from app.config import settings
from app.models.user import User

router = APIRouter(prefix="/ai", tags=["AI"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=60000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=40)
    system: str = Field("", max_length=60000)
    max_tokens: int = Field(900, ge=16, le=4000)


def _allowed(user: User) -> bool:
    """The server's AI key is the admin's money. Invited accounts use it only
    with LOGBOOK_AI_FOR_EVERYONE=true; otherwise they can add their own key
    in settings (it stays in their browser)."""
    return ai.configured() and (user.is_admin or settings.ai_for_everyone)


@router.get("/status")
def ai_status(user: User = Depends(current_user)):
    if not _allowed(user):
        return {"available": False, "provider": None, "model": None}
    body = {"available": True, "provider": ai.provider_name() or None, "model": ai.model_name() or None}
    if ai.last_check["ok"] is not None:  # what the startup check found (a bad key shows up here)
        body["check"] = {"ok": ai.last_check["ok"], "detail": ai.last_check["detail"]}
    return body


@router.post("/chat")
async def ai_chat(body: ChatRequest, user: User = Depends(current_user)):
    if not _allowed(user):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI isn't set up on this server")
    try:
        text = await ai.chat([m.model_dump() for m in body.messages], body.system, body.max_tokens)
    except ai.AIError as exc:
        ai.log.warning("logbook: AI chat failed (%s, %s): %s", ai.provider_name(), ai.model_name(), str(exc)[:300])
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"text": text, "model": ai.model_name()}


class RecallRequest(BaseModel):
    question: str = Field("", max_length=4000)
    share_text: bool = True
    tz_minutes: int = Field(0, ge=-14 * 60, le=14 * 60)    # local time = UTC + this


@router.post("/recall")
async def ai_recall(body: RecallRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """What the companion should know for this question, from the whole
    logbook since the first day (see app/recall.py). This account's rows only."""
    today = (datetime.now(timezone.utc) + timedelta(minutes=body.tz_minutes)).date()
    if body.share_text:
        photo_notes.later(photo_notes.describe_missing(user.id))
    return {"context": recall.build(db, user.id, today, body.tz_minutes, body.question, body.share_text)}
