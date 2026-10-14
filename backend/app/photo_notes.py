"""What each photo of the day shows, in words, so the companion can remember
it ("that sunset photo from last October"). The AI looks at a photo once and
a sentence or two is kept with it (photos.seen); the image itself is never
kept anywhere else. Only for accounts the server's AI is switched on for."""

import asyncio
import logging
from datetime import date

from app import ai
from app.config import settings
from app.database import SessionLocal
from app.models import Photo, User

log = logging.getLogger("logbook")
NOTHING = "-"          # the AI couldn't say anything: don't ask again
_busy: set[int] = set()


def _allowed(db, uid: int) -> bool:
    user = db.get(User, uid)
    return bool(user) and ai.configured() and (user.is_admin or settings.ai_for_everyone)


async def describe(uid: int, day: date) -> bool:
    with SessionLocal() as db:
        if not _allowed(db, uid):
            return False
        row = db.get(Photo, (uid, day))
        if row is None or row.seen:
            return False
        data, mime = row.data, row.mime
    try:
        text = await ai.describe_image(data, mime)
    except ai.AIError as exc:
        log.warning("logbook: couldn't describe a photo yet: %s", str(exc)[:120])
        return False
    with SessionLocal() as db:
        row = db.get(Photo, (uid, day))
        if row is not None and not row.seen:
            row.seen = (text or NOTHING)[:600]
            db.commit()
    return True


async def describe_missing(uid: int, limit: int = 4) -> int:
    """Older photos without a description get one, a few at a time, newest first."""
    if uid in _busy:
        return 0
    _busy.add(uid)
    try:
        with SessionLocal() as db:
            if not _allowed(db, uid):
                return 0
            days = [d for (d,) in db.query(Photo.date).filter(Photo.user_id == uid, Photo.seen == "")
                    .order_by(Photo.date.desc()).limit(limit).all()]
        done = 0
        for d in days:
            if await describe(uid, d):
                done += 1
            await asyncio.sleep(1)
        return done
    finally:
        _busy.discard(uid)


def later(coro) -> None:
    """Run in the background; never let it take a request down."""
    try:
        task = asyncio.get_running_loop().create_task(coro)
        task.add_done_callback(lambda t: t.exception() and log.warning("logbook: photo note failed: %s", t.exception()))
    except RuntimeError:
        pass
