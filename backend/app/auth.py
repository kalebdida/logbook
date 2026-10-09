"""Optional single-user login.

No LOGBOOK_PASSWORD set: everything is open, which is right for a server
only you can reach (your own laptop). With a password set, every API call
needs a token from POST /auth/login, sent as `Authorization: Bearer ...`.

Tokens are signed, not stored: changing the password signs everyone out.
They're signed with LOGBOOK_SECRET, or, if that isn't set, a random secret
made on first use and kept in backend/.logbook-secret, so a token can't be
used to guess the password offline.
"""

import hashlib
import hmac
import logging
import os
import secrets
import time
from collections import defaultdict
from pathlib import Path

from fastapi import Header, HTTPException, Request, status

from app.config import BACKEND_DIR, settings

log = logging.getLogger("logbook")

_failures: dict[str, list[float]] = defaultdict(list)
_all_failures: list[float] = []
MAX_FAILURES = 5          # per client
MAX_ALL_FAILURES = 30     # across everyone, so rotating addresses doesn't help a guesser
WINDOW_SECONDS = 300
_generated_secret: str | None = None


def auth_required() -> bool:
    return bool(settings.password)


def _secret() -> str:
    global _generated_secret
    if settings.secret:
        return settings.secret
    if _generated_secret is None:
        path = Path(settings.secret_file) if settings.secret_file else BACKEND_DIR / ".logbook-secret"
        try:
            if path.exists():
                _generated_secret = path.read_text().strip()
            if not _generated_secret:
                _generated_secret = secrets.token_hex(32)
                path.write_text(_generated_secret)
                os.chmod(path, 0o600)
        except OSError:
            log.warning("logbook: couldn't save a token secret to %s. set LOGBOOK_SECRET.", path)
            _generated_secret = secrets.token_hex(32)  # this run only: logins reset on restart
    return _generated_secret


def _key() -> bytes:
    return hashlib.sha256(f"logbook-token:{_secret()}:{settings.password}".encode()).digest()


def make_token() -> tuple[str, int]:
    expires = int(time.time()) + settings.token_days * 86400
    payload = f"v1.{expires}"
    signature = hmac.new(_key(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}", expires


def token_valid(token: str | None) -> bool:
    if not token:
        return False
    try:
        version, expires, signature = token.split(".")
        expected = hmac.new(_key(), f"{version}.{expires}".encode(), hashlib.sha256).hexdigest()
        return version == "v1" and hmac.compare_digest(signature.encode(), expected.encode()) and int(expires) > time.time()
    except (ValueError, TypeError, UnicodeError):
        return False


def bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def is_authenticated(authorization: str | None) -> bool:
    return not auth_required() or token_valid(bearer(authorization))


def require_auth(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency for every data route."""
    if not is_authenticated(authorization):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="login required",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _client_key(request: Request) -> str:
    """Who is guessing. Behind a proxy (Render) the real address is the last
    X-Forwarded-For entry, the one the proxy added; earlier entries come from
    the client and can be anything."""
    peer = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for", "")
    last = forwarded.split(",")[-1].strip() if forwarded else ""
    return f"{peer}|{last}"


def check_password(request: Request, password: str) -> bool:
    """Constant-time compare, with a lockout after repeated misses: per client,
    and overall, so a guesser can't get around it by changing address."""
    global _all_failures
    client = _client_key(request)
    now = time.time()
    recent = [t for t in _failures.get(client, []) if now - t < WINDOW_SECONDS]
    _all_failures = [t for t in _all_failures if now - t < WINDOW_SECONDS]
    if len(recent) >= MAX_FAILURES or len(_all_failures) >= MAX_ALL_FAILURES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many wrong passwords. try again in a few minutes.",
        )
    if hmac.compare_digest(password.encode(), settings.password.encode()):
        _failures.pop(client, None)
        return True
    recent.append(now)
    _failures[client] = recent
    _all_failures.append(now)
    if len(_failures) > 2000:  # forget clients with nothing recent
        for key in [k for k, v in _failures.items() if not v or now - v[-1] >= WINDOW_SECONDS]:
            del _failures[key]
    return False
