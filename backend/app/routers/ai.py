from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app import ai
from app.auth import current_user
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
    return {"available": True, "provider": ai.provider_name() or None, "model": ai.model_name() or None}


@router.post("/chat")
async def ai_chat(body: ChatRequest, user: User = Depends(current_user)):
    if not _allowed(user):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI isn't set up on this server")
    try:
        text = await ai.chat([m.model_dump() for m in body.messages], body.system, body.max_tokens)
    except ai.AIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"text": text, "model": ai.model_name()}
