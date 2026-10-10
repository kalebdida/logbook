"""Talks to an AI provider on the server, so the API key never reaches the browser.

Two protocols cover nearly everything:
  anthropic  Claude via the Messages API
  openai     any OpenAI-compatible chat API: OpenAI, OpenRouter, Groq, and
             local models through Ollama or LM Studio (free, fully private)
  gemini     Google's Gemini, through its OpenAI-compatible endpoint (a free
             key from Google AI Studio)
"""

import httpx

from app.config import settings

ANTHROPIC_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
DEFAULTS = {"anthropic": "claude-haiku-5-5", "openai": "gpt-4o-mini", "gemini": "gemini-3.5-flash-lite"}
# Gemini 3 models always think, and the thinking comes out of the same token
# budget as the reply. A tiny cap can leave nothing for the answer, so Gemini
# always gets at least this much room.
GEMINI_MIN_TOKENS = 1024


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

            if provider in ("openai", "gemini"):
                headers = {"content-type": "application/json"}
                if api_key():
                    headers["authorization"] = f"Bearer {api_key()}"
                default_url = GEMINI_URL if provider == "gemini" else "https://api.openai.com/v1"
                if provider == "gemini":
                    max_tokens = max(max_tokens, GEMINI_MIN_TOKENS)
                response = await client.post(
                    (settings.ai_base_url or default_url).rstrip("/") + "/chat/completions",
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
            raise AIError(f"couldn't reach the AI provider: {exc.__class__.__name__}") from exc
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("the AI provider sent back something unexpected") from exc
    raise AIError("AI isn't configured on this server")


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
