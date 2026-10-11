"""Keeps a free Render server from falling asleep.

Render's free plan stops a server after 15 minutes without a visitor, and
the next visitor waits up to a minute while it starts again. So while it's
up, the server visits its own public address every few minutes. Render sets
RENDER_EXTERNAL_URL itself; LOGBOOK_SELF_URL does the same anywhere else.
The visit goes to /ping, which never touches the database, so the database
can still rest (Neon's free plan counts its awake hours)."""

import asyncio
import logging
import os

import httpx

log = logging.getLogger("logbook")
EVERY_SECONDS = 8 * 60


def self_url() -> str:
    return (os.environ.get("LOGBOOK_SELF_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")


async def run(url: str, every: float = EVERY_SECONDS) -> None:
    misses = 0
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            await asyncio.sleep(every)
            try:
                res = await client.get(url + "/ping")
                if res.status_code != 200:
                    raise RuntimeError(f"status {res.status_code}")
                if misses:
                    log.warning("logbook: keep-awake ping works again")
                misses = 0
            except Exception as exc:  # never let a failed ping stop the loop
                misses += 1
                if misses in (1, 10):
                    log.warning("logbook: keep-awake ping failed (%s)", exc)


def start() -> "asyncio.Task | None":
    url = self_url()
    if not url:
        return None
    log.warning("logbook: keeping %s awake", url)
    return asyncio.create_task(run(url))
