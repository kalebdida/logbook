"""Talks to an AI provider on the server, so the API key never reaches the browser.

Two protocols cover nearly everything:
  anthropic  Claude via the Messages API
  openai     any OpenAI-compatible chat API: OpenAI, OpenRouter, Groq, and
             local models through Ollama or LM Studio (free, fully private)
  gemini     Google's Gemini through its own generateContent API (a free key
             from Google AI Studio). Its OpenAI-compatible endpoint is skipped
             on purpose: AI Studio now hands out "AQ." auth keys, and those are
             reported to work on the native API but not on the OpenAI one.
"""

import logging

import httpx

from app.config import settings

ANTHROPIC_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULTS = {"anthropic": "claude-haiku-5-5", "openai": "gpt-4o-mini", "gemini": "gemini-3.5-flash-lite"}
# Gemini 3 models always think, and the thinking comes out of the same token
# budget as the reply. A tiny cap can leave nothing for the answer, so Gemini
# always gets at least this much room.
GEMINI_MIN_TOKENS = 1024

log = logging.getLogger("logbook")

# What the last self-check found: None (not checked), True, or False, plus a
# short reason. Filled in once at startup (see check()), shown in /health and
# to the admin in settings, so a bad key shows up before anyone asks the
# companion something.
last_check: dict = {"ok": None, "detail": ""}


class AIError(Exception):
    pass


def provider_name() -> str:
    """The provider in use. With none set, a LOGBOOK_AI_API_KEY (or
    ANTHROPIC_API_KEY) means Anthropic, and a GEMINI_API_KEY alone means Gemini."""
    if settings.ai_provider:
        return settings.ai_provider.strip().lower()
    if settings.ai_api_key:
        return "anthropic"
    if settings.gemini_api_key:
        return "gemini"
    return ""


def api_key() -> str:
    if provider_name() == "gemini":
        return settings.ai_api_key or settings.gemini_api_key
    return settings.ai_api_key


def configured() -> bool:
    provider = provider_name()
    if provider in ("anthropic", "gemini"):
        return bool(api_key())
    if provider == "openai":
        # local servers (Ollama) need no key, hosted ones do
        return bool(settings.ai_api_key or settings.ai_base_url)
    return False


def model_name() -> str:
    return settings.ai_model or DEFAULTS.get(provider_name(), "")


async def chat(messages: list[dict], system: str, max_tokens: int, transport: httpx.AsyncBaseTransport | None = None) -> str:
    provider = provider_name()
    async with httpx.AsyncClient(timeout=90, transport=transport) as client:
        try:
            if provider == "anthropic":
                response = await client.post(
                    (settings.ai_base_url or ANTHROPIC_URL).rstrip("/") + "/v1/messages",
                    headers={
                        "x-api-key": settings.ai_api_key,
                        "anthropic-version": ANTHROPIC_VERSION,
                        "content-type": "application/json",
                    },
                    json={"model": model_name(), "max_tokens": max_tokens, "system": system, "messages": messages},
                )
                data = _json(response)
                return "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")

            if provider == "gemini":
                response = await client.post(
                    _gemini_base() + "/models/" + model_name() + ":generateContent",
                    headers={"x-goog-api-key": api_key(), "content-type": "application/json"},
                    json=gemini_body(messages, system, max_tokens),
                )
                return gemini_text(_json(response))

            if provider == "openai":
                headers = {"content-type": "application/json"}
                if api_key():
                    headers["authorization"] = f"Bearer {api_key()}"
                response = await client.post(
                    (settings.ai_base_url or "https://api.openai.com/v1").rstrip("/") + "/chat/completions",
                    headers=headers,
                    json={
                        "model": model_name(),
                        "max_tokens": max_tokens,
                        "messages": [{"role": "system", "content": system}] + messages,
                    },
                )
                data = _json(response)
                return data["choices"][0]["message"]["content"] or ""
        except httpx.HTTPError as exc:
            raise AIError(f"Couldn't reach the AI provider: {exc.__class__.__name__}") from exc
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("The AI provider sent back something unexpected") from exc
    raise AIError("AI isn't configured on this server")


def _gemini_base() -> str:
    return (settings.ai_base_url or GEMINI_URL).rstrip("/")


def gemini_body(messages: list[dict], system: str, max_tokens: int) -> dict:
    """Gemini's own request shape: a system instruction, and turns as "user" /
    "model" that alternate, starting with the user."""
    contents: list[dict] = []
    for m in messages:
        role = "model" if m["role"] == "assistant" else "user"
        if not contents and role == "model":
            continue  # a conversation has to open with the user
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"][0]["text"] += "\n\n" + m["content"]
        else:
            contents.append({"role": role, "parts": [{"text": m["content"]}]})
    body: dict = {"contents": contents, "generationConfig": {"maxOutputTokens": max(max_tokens, GEMINI_MIN_TOKENS)}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    return body


def gemini_text(data: dict) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        blocked = (data.get("promptFeedback") or {}).get("blockReason")
        raise AIError(f"Gemini didn't answer that one ({str(blocked).lower()})" if blocked else "Gemini sent back an empty reply")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    # keep only the answer, never the model's thinking
    text = "".join(p.get("text", "") for p in parts if isinstance(p.get("text"), str) and not p.get("thought"))
    if not text.strip() and candidates[0].get("finishReason") == "MAX_TOKENS":
        raise AIError("Gemini ran out of room before answering. Try a shorter question.")
    return text


async def check(transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """A self-check of the key and model, run once at startup: one tiny real
    reply (a few tokens), so it proves the same path the companion uses. The
    result is logged and kept in last_check; nothing secret goes into it."""
    if not configured():
        last_check.update(ok=None, detail="")
        return last_check
    if provider_name() != "gemini":
        last_check.update(ok=None, detail="not checked for this provider")
        return last_check
    try:
        async with httpx.AsyncClient(timeout=60, transport=transport) as client:
            response = await client.post(
                _gemini_base() + "/models/" + model_name() + ":generateContent",
                headers={"x-goog-api-key": api_key(), "content-type": "application/json"},
                json=gemini_body([{"role": "user", "content": "Reply with the single word: ok"}], "", 16),
            )
            gemini_text(_json(response))
        last_check.update(ok=True, detail=f"{model_name()} answers")
        log.warning("logbook: AI check ok (gemini, %s)", model_name())
    except (AIError, httpx.HTTPError) as exc:
        reason = str(exc) if isinstance(exc, AIError) else f"couldn't reach Google ({exc.__class__.__name__})"
        last_check.update(ok=False, detail=reason[:300])
        log.warning("logbook: AI check failed (gemini, %s): %s", model_name(), reason[:300])
    return last_check


def _json(response: httpx.Response) -> dict:
    if response.status_code >= 400:
        detail = ""
        try:
            body = response.json()
            if isinstance(body, list) and body:  # Google's endpoints sometimes wrap the error in a list
                body = body[0]
            error = body.get("error", "") if isinstance(body, dict) else ""
            detail = error.get("message", "") if isinstance(error, dict) else str(error)
        except ValueError:
            pass
        raise AIError(f"AI provider error {response.status_code}" + (f": {detail}" if detail else ""))
    return response.json()
