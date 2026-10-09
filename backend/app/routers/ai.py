from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app import ai
from app.config import settings

router = APIRouter(prefix="/ai", tags=["AI"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=60000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=40)
    system: str = Field("", max_length=60000)
    max_tokens: int = Field(900, ge=16, le=4000)


@router.get("/status")
def ai_status():
    return {"available": ai.configured(), "provider": ai.provider_name() or None, "model": ai.model_name() or None}


@router.post("/chat")
async def ai_chat(body: ChatRequest):
    if not ai.configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI isn't set up on this server")
    try:
        text = await ai.chat([m.model_dump() for m in body.messages], body.system, body.max_tokens)
    except ai.AIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return {"text": text, "model": ai.model_name()}
