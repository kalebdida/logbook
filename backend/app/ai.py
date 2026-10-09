"""Talks to an AI provider on the server, so the API key never reaches the browser.

Two protocols cover nearly everything:
  anthropic  Claude via the Messages API
  openai     any OpenAI-compatible chat API: OpenAI, OpenRouter, Groq, and
             local models through Ollama or LM Studio (free, fully private)
"""

import httpx

from app.config import settings

ANTHROPIC_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULTS = {"anthropic": "claude-haiku-5-5", "openai": "gpt-4o-mini"}


class AIError(Exception):
    pass


def provider_name() -> str:
    """The provider in use. A key with no provider set means Anthropic."""
    return settings.ai_provider.lower() or ("anthropic" if settings.ai_api_key else "")


def configured() -> bool:
    provider = provider_name()
    if provider == "anthropic":
        return bool(settings.ai_api_key)
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

            if provider == "openai":
                headers = {"content-type": "application/json"}
                if settings.ai_api_key:
                    headers["authorization"] = f"Bearer {settings.ai_api_key}"
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
            raise AIError(f"couldn't reach the AI provider: {exc.__class__.__name__}") from exc
        except (KeyError, IndexError, TypeError) as exc:
            raise AIError("the AI provider sent back something unexpected") from exc
    raise AIError("AI isn't configured on this server")


def _json(response: httpx.Response) -> dict:
    if response.status_code >= 400:
        detail = ""
        try:
            body = response.json()
            detail = (body.get("error") or {}).get("message", "") if isinstance(body.get("error"), dict) else str(body.get("error", ""))
        except ValueError:
            pass
        raise AIError(f"AI provider error {response.status_code}" + (f": {detail}" if detail else ""))
    return response.json()
