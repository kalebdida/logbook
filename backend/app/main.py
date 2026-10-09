"""FastAPI application entrypoint. Serves the API and the frontend."""

import logging
import mimetypes
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session

import app.models  # noqa: F401  registers every model with Base.metadata
from app import ai
from app.auth import auth_required, is_authenticated, require_auth
from app.config import settings
from app.database import get_db, run_migrations
from app.models import Activity, DayRecord, Entry, Goal, Habit, PomodoroDay, Task
from app.routers import api_router
from app.routers import auth as auth_router

log = logging.getLogger("logbook")


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    if settings.environment == "production" and not settings.password:
        raise RuntimeError(
            "logbook: LOGBOOK_ENVIRONMENT is production but LOGBOOK_PASSWORD is empty, so anyone who can reach "
            "this server could read your journal. set LOGBOOK_PASSWORD (or LOGBOOK_ENVIRONMENT=development "
            "for a server only you can reach)."
        )
    if os.environ.get("RENDER") and settings.is_sqlite:
        log.warning("logbook: using SQLite on Render. Render's disk is wiped on every restart, so set DATABASE_URL to a Postgres database (e.g. Neon) or your data will be lost.")
    yield


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

# With a password, logins use a bearer token (not cookies), so any origin may
# call the API: another site can't attach your token. That's what lets the
# Android app and the GitHub Pages copy talk to your server.
# Without a password, only pages on this computer may call it: otherwise any
# website you visit could read your journal from 127.0.0.1.
LOCAL_ORIGINS = r"^(https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|capacitor://localhost)$"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.password else [],
    allow_origin_regex=None if settings.password else LOCAL_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(api_router, dependencies=[Depends(require_auth)])


@app.get("/health", tags=["Health"])
def health(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    body = {
        "app": "logbook",
        "status": "online",
        "version": settings.app_version,
        "auth_required": auth_required(),
        "ai": ai.configured(),
    }
    if is_authenticated(authorization):
        body["database"] = "sqlite" if settings.is_sqlite else "postgresql"
        body["counts"] = {
            "entries": db.query(Entry).count(),
            "day_records": db.query(DayRecord).count(),
            "tasks": db.query(Task).count(),
            "activities": db.query(Activity).count(),
            "goals": db.query(Goal).count(),
            "pomodoro_days": db.query(PomodoroDay).count(),
            "habits": db.query(Habit).count(),
        }
    return body


# backend/app/main.py -> project root, where index.html lives.
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_FILES = {".", "index.html", "sw.js", "manifest.webmanifest"}
FRONTEND_DIRS = {"css", "js", "assets"}

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")


class FrontendFiles(StaticFiles):
    """Serves only the app's own files. The project root also holds the
    backend and its database, which must never be downloadable."""

    async def get_response(self, path: str, scope):
        clean = path.replace("\\", "/").strip("/") or "."
        if clean in FRONTEND_FILES or clean.split("/", 1)[0] in FRONTEND_DIRS:
            return await super().get_response(path, scope)
        raise StarletteHTTPException(status_code=404)


# Mounted last: API routes above match first, everything else (the page,
# css, js) falls through to the frontend. Skipped if the backend is
# deployed without the frontend next to it.
if (FRONTEND_DIR / "index.html").exists():
    app.mount("/", FrontendFiles(directory=FRONTEND_DIR, html=True), name="frontend")
