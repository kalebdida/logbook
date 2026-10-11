"""The verse of the day, the same one the app shows (js/verse.js): a list of
references in assets/verse-refs.json, the words from bible-api.com. Used by
the Telegram bot. Words fetched once are kept in memory."""

import json
from datetime import date
from pathlib import Path

import httpx

REFS_FILE = Path(__file__).resolve().parent.parent.parent / "assets" / "verse-refs.json"
API = "https://bible-api.com/"
TRANSLATIONS = {"kjv", "web", "bbe", "asv"}
_refs: list[str] | None = None
_words: dict[str, str] = {}


def refs() -> list[str]:
    global _refs
    if _refs is None:
        try:
            _refs = json.loads(REFS_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _refs = ["Joshua 1:9", "Philippians 4:13", "Isaiah 41:10", "Psalm 46:1", "Proverbs 3:5-6"]
    return _refs


def day_number(day: date) -> int:
    return (day - date(2020, 1, 1)).days


def ref_for(day: date, shift: int = 0) -> str:
    items = refs()
    return items[(day_number(day) + shift * 41) % len(items)]


def clean(text: str) -> str:
    import re
    text = re.sub(r"\s+", " ", text or "")
    return re.sub(r"\s+([,.;:!?])", r"\1", text).strip()


async def words(ref: str, translation: str = "kjv") -> str | None:
    translation = translation if translation in TRANSLATIONS else "kjv"
    key = translation + " " + ref
    if key in _words:
        return _words[key]
    query = ref.replace("Psalm ", "Psalms ", 1) if ref.startswith("Psalm ") else ref
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            res = await client.get(API + query, params={"translation": translation})
        if res.status_code != 200:
            return None
        text = clean(res.json().get("text", ""))
    except (httpx.HTTPError, ValueError):
        return None
    if text:
        if len(_words) > 500:
            _words.clear()
        _words[key] = text
    return text or None
