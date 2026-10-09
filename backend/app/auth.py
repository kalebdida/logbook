"""Accounts and login.

No LOGBOOK_PASSWORD: no login at all, every request is user 1. Right for a
server only you can reach (your own laptop); CORS keeps other sites out.

With LOGBOOK_PASSWORD: accounts are on.
- user 1 is the admin. Username LOGBOOK_ADMIN_USERNAME, password
  LOGBOOK_PASSWORD (change it in the host's settings, not in the app).
- everyone else signs up with a one-time invite code from the admin, and
  their password is stored as a scrypt hash.
- every API call needs `Authorization: Bearer <token>` from POST /auth/login.
  The token names the account; every data query filters on that account.

Tokens are signed, not stored. Each one is signed with a key mixed from the
server secret and that account's password (hash), so changing a password
signs that account out everywhere; `token_version` does the same on demand.
"""

import hashlib
import hmac
import logging
import os
import re
import secrets
import time
from collections import defaultdict
from pathlib import Path

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import BACKEND_DIR, settings
from app.database import get_db
from app.models.user import OWNER_ID, User

log = logging.getLogger("logbook")

MAX_FAILURES = 5          # one address against one username
MAX_ALL_FAILURES = 30     # everyone together (see guessing limits below)
WINDOW_SECONDS = 300
MIN_PASSWORD = 10
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,31}$")
RESERVED_NAMES = {"owner", "admin", "root", "logbook", "system"}

_failures: dict[str, list[float]] = defaultdict(list)
_all_failures: list[float] = []
_generated_secret: str | None = None


def auth_required() -> bool:
    return bool(settings.password)


# ---------- secrets and passwords ----------

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


SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        kind, n, r, p, salt, digest = stored.split("$")
        if kind != "scrypt":
            return False
        test = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                              dklen=len(digest) // 2)
        return hmac.compare_digest(test.hex(), digest)
    except (ValueError, TypeError):
        return False


def _dummy_verify(password: str) -> None:
    """Same work as a real check, so timing doesn't reveal which usernames exist."""
    verify_password(password, _DUMMY_HASH)


_DUMMY_HASH = hash_password(secrets.token_hex(8))


def password_problem(password: str) -> str | None:
    if len(password) < MIN_PASSWORD:
        return f"password needs at least {MIN_PASSWORD} characters."
    if len(password) > 200:
        return "password is too long."
    return None


def normalize_username(name: str) -> str:
    return (name or "").strip().lower()


def username_problem(name: str) -> str | None:
    if not USERNAME_RE.match(name):
        return "username: 3 to 32 characters, letters, numbers, . _ or -, starting with a letter or number."
    if name in RESERVED_NAMES or name == normalize_username(settings.admin_username):
        return "that username is taken."
    return None


def display_name(user: User) -> str:
    return normalize_username(settings.admin_username) if user.id == OWNER_ID else user.username


# ---------- tokens ----------

def _key(user: User) -> bytes:
    credential = settings.password if user.id == OWNER_ID else user.password_hash
    return hashlib.sha256(f"logbook-token:{_secret()}:{user.id}:{credential}".encode()).digest()


def make_token(user: User) -> tuple[str, int]:
    expires = int(time.time()) + settings.token_days * 86400
    payload = f"v2.{user.id}.{user.token_version}.{expires}"
    signature = hmac.new(_key(user), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}", expires


def user_from_token(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    try:
        version, uid, token_version, expires, signature = token.split(".")
        if version != "v2" or int(expires) <= time.time():
            return None
        user = db.get(User, int(uid))
        if user is None or int(token_version) != user.token_version:
            return None
        if user.id != OWNER_ID and not user.password_hash:
            return None
        expected = hmac.new(_key(user), f"{version}.{uid}.{token_version}.{expires}".encode(), hashlib.sha256).hexdigest()
        return user if hmac.compare_digest(signature.encode(), expected.encode()) else None
    except (ValueError, TypeError, UnicodeError, OverflowError):
        return None


def bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def owner(db: Session) -> User:
    user = db.get(User, OWNER_ID)
    if user is None:  # only if someone deleted it by hand
        user = User(id=OWNER_ID, username="owner", password_hash="", is_admin=True)
        db.add(user)
        db.commit()
    return user


def optional_user(authorization: str | None, db: Session) -> User | None:
    if not auth_required():
        return owner(db)
    return user_from_token(bearer(authorization), db)


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: the account this request acts as, or 401."""
    user = optional_user(authorization, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="login required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def current_user_id(user: User = Depends(current_user)) -> int:
    return user.id


def require_admin(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only the admin can do that")
    return user


# ---------- guessing limits ----------
#
# Built so a guesser gets few tries, but can't lock anyone else out:
# - one address: 10 misses in 5 minutes, or 5 against one username, then 429
#   for that address only. The real owner, from their own phone, still gets in.
# - one username across all addresses (20), or everyone together (30): from
#   then on, any address that has missed recently is refused. A guesser with
#   many addresses gets about one try per address; fresh addresses (the real
#   owner) still go through.
# Sign-up and reset codes count against the address only, so junk codes can't
# lock anyone's login.

MAX_PER_CLIENT = 10
MAX_PER_USER = 20


def _trust_proxy() -> bool:
    if settings.trust_proxy is not None:
        return settings.trust_proxy
    return bool(os.environ.get("RENDER"))


def _client_key(request: Request) -> str:
    """Who is guessing. Behind a trusted proxy (Render) the real address is
    the last X-Forwarded-For entry, the one the proxy added; earlier entries
    come from the client and can be anything. Without a proxy the header is
    ignored: the client could put anything in it."""
    peer = request.client.host if request.client else "unknown"
    if _trust_proxy():
        forwarded = request.headers.get("x-forwarded-for", "")
        last = forwarded.split(",")[-1].strip() if forwarded else ""
        return last or peer
    return peer


def _recent(key: str, now: float) -> int:
    kept = [t for t in _failures.get(key, []) if now - t < WINDOW_SECONDS]
    if kept:
        _failures[key] = kept
    else:
        _failures.pop(key, None)
    return len(kept)


def check_not_locked(request: Request, username: str = "") -> None:
    global _all_failures
    now = time.time()
    _all_failures = [t for t in _all_failures if now - t < WINDOW_SECONDS]
    client = _client_key(request)
    mine = _recent(f"c:{client}", now)
    locked = mine >= MAX_PER_CLIENT
    if username:
        locked = locked or _recent(f"p:{client}:{username}", now) >= MAX_FAILURES
        hot = _recent(f"u:{username}", now) >= MAX_PER_USER or len(_all_failures) >= MAX_ALL_FAILURES
        locked = locked or (hot and mine > 0)
    if locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many wrong tries. wait a few minutes.",
        )


def record_failure(request: Request, username: str = "", login: bool = True) -> None:
    """login=False (wrong reset or sign-up code): counts against this address
    only, never against the username or everyone, so it can't lock anyone out."""
    now = time.time()
    client = _client_key(request)
    _failures[f"c:{client}"].append(now)
    if username:
        _failures[f"p:{client}:{username}"].append(now)
        if login:
            _failures[f"u:{username}"].append(now)
    if login:
        _all_failures.append(now)
    if len(_failures) > 5000:  # forget keys with nothing recent
        for key in [k for k, v in _failures.items() if not v or now - v[-1] >= WINDOW_SECONDS]:
            del _failures[key]


def clear_failures(request: Request, username: str = "") -> None:
    client = _client_key(request)
    _failures.pop(f"c:{client}", None)
    if username:
        _failures.pop(f"p:{client}:{username}", None)


def authenticate(request: Request, db: Session, username: str, password: str) -> User | None:
    """The account for these credentials, or None. Counts misses toward the
    lockout. An empty username means the admin (older apps sent only a password)."""
    name = normalize_username(username) or normalize_username(settings.admin_username)
    check_not_locked(request, name)
    user = None
    if name == normalize_username(settings.admin_username):
        if hmac.compare_digest(password.encode(), settings.password.encode()):
            user = owner(db)
        else:
            _dummy_verify(password)
    else:
        candidate = db.query(User).filter(User.username == name).first()
        if candidate is not None and candidate.id != OWNER_ID and candidate.password_hash:
            if verify_password(password, candidate.password_hash):
                user = candidate
        else:
            _dummy_verify(password)
    if user is None:
        record_failure(request, name)
        return None
    clear_failures(request, name)
    return user


def sync_admin(db: Session) -> None:
    """Startup: keep user 1's stored name in line with LOGBOOK_ADMIN_USERNAME
    (when no invited account already uses it)."""
    user = owner(db)
    name = normalize_username(settings.admin_username) or "admin"
    if user.username != name and not db.query(User).filter(User.username == name, User.id != OWNER_ID).first():
        user.username = name
    user.is_admin = True
    db.commit()
