from datetime import date, datetime, timedelta, timezone

from app import recall
from app.database import SessionLocal
from app.models import CompanionNotes, DayRecord, Entry, PomodoroDay

TODAY = date(2026, 10, 13)


def test_periods_understand_how_people_ask():
    p = lambda q: [(a.isoformat(), b.isoformat()) for a, b, _ in recall.periods(q, TODAY)]
    assert p("what was I doing last October?") == [("2025-10-01", "2025-10-31")]
    assert p("what did I write in march") == [("2026-03-01", "2026-03-31")]
    assert p("how was december") == [("2025-12-01", "2025-12-31")]
    assert p("what happened a year ago") == [("2025-10-06", "2025-10-20")]
    assert p("2 months ago") == [("2026-08-01", "2026-08-31")]
    assert p("on 2025-10-12?") == [("2025-10-11", "2025-10-13")]
    assert p("march 3 2025") == [("2025-03-02", "2025-03-04")]
    assert p("yesterday") == [("2026-10-12", "2026-10-12")]
    assert p("I may go out") == []                       # "may" as a word, not the month
    assert p("what did I do in 2025")[0][0] >= "2025-10-30"   # a year is capped to its last two months


def test_keywords_skip_filler():
    assert recall.keywords("what did I write about robotics and my sister last year?") == ["robotics", "sister"]


def test_build_reaches_back_to_the_first_day(client):
    with SessionLocal() as db:
        def entry(day, mood, text):
            db.add(Entry(user_id=1, id=f"e{day}{text[:4]}", occurred_at=datetime(day.year, day.month, day.day, 9, tzinfo=timezone.utc),
                         mood=mood, text=text))
        entry(date(2024, 5, 2), "okay", "first day with the app, testing it out")
        entry(date(2025, 10, 12), "good", "went hiking at Entoto with friends")
        entry(date(2025, 3, 10), "rough", "failed the physics quiz, need to fix my study plan")
        entry(TODAY - timedelta(days=2), "good", "drafted my common app essay")
        db.add(DayRecord(user_id=1, date=date(2025, 10, 13), morning_main_focus="SAT reading practice"))
        db.add(PomodoroDay(user_id=1, date=date(2025, 10, 12), sessions=2, focus_ms=50 * 60000))
        db.add(CompanionNotes(user_id=1, notes="2026-10-12: applying to MIT"))
        db.commit()

        ctx = recall.build(db, 1, TODAY, 180, "what was I doing last october? also anything about physics")
        assert "started using Logbook on 2024-05-02" in ctx
        assert "2024-05:" in ctx and "2025-10:" in ctx                # month by month since the start
        assert "drafted my common app essay" in ctx                   # the last 14 days
        assert "THIS TIME IN EARLIER YEARS" in ctx and "hiking at Entoto" in ctx and "SAT reading practice" in ctx
        assert "WHAT THEY ASKED ABOUT (October 2025" in ctx
        assert "failed the physics quiz" in ctx                       # found by its words
        assert "applying to MIT" in ctx

        numbers_only = recall.build(db, 1, TODAY, 180, "physics last october", share_text=False)
        assert "hiking" not in numbers_only and "physics quiz" not in numbers_only and "MIT" not in numbers_only
        assert "2025-10:" in numbers_only

        assert "applying to MIT" not in recall.build(db, 1, TODAY, 180, "hi", notes=False)
        assert recall.build(db, 2, TODAY, 180, "anything") == "They haven't logged anything yet."


def test_fit_trims_the_least_useful_first():
    sections = [(0, "intro"), (5, "MONTHS\n" + "m line\n" * 3000), (4, "LAST 14\n" + "d line\n" * 3000),
                (1, "ASKED\n" + "asked line\n" * 400), (6, "YEARS\n" + "y line\n" * 3000)]
    text = recall.fit(sections)
    assert len(text) <= recall.LIMIT + 4000
    assert text.count("asked line") == 400            # what they asked about stays whole
    assert "intro" in text and "MONTHS" in text and "YEARS" in text


def test_photos_are_remembered_by_what_they_show(client):
    from app.models import Photo
    with SessionLocal() as db:
        db.add(Photo(user_id=1, date=date(2025, 10, 11), mime="image/jpeg", data=b"x", thumb=b"x", caption="",
                     seen="Sunset over the hills at Entoto, friends laughing by a car."))
        db.add(Photo(user_id=1, date=date(2025, 6, 2), mime="image/jpeg", data=b"x", thumb=b"x", caption="graduation day", seen=""))
        db.commit()
        ctx = recall.build(db, 1, TODAY, 180, "what was that sunset photo?")
        assert "Sunset over the hills at Entoto" in ctx                 # this time last year, and found by its words
        assert "2025-10:" in ctx and "1 photo" in ctx
        ctx = recall.build(db, 1, TODAY, 180, "my graduation")
        assert 'their caption "graduation day"' in ctx
        assert "graduation day" not in recall.build(db, 1, TODAY, 180, "graduation", share_text=False)


def test_describe_image_asks_the_model_to_look(monkeypatch):
    import asyncio
    import json
    import httpx
    from app import ai
    from app.config import settings
    seen = {}

    def gemini(request):
        body = json.loads(request.content)
        seen["parts"] = body["contents"][0]["parts"]
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "A cat asleep on a desk."}]}}]})
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setattr(settings, "ai_api_key", "k")
    out = asyncio.run(ai.describe_image(b"\xff\xd8jpeg", "image/jpeg", httpx.MockTransport(gemini)))
    assert out == "A cat asleep on a desk."
    assert seen["parts"][0]["inline_data"]["mime_type"] == "image/jpeg" and "photo" in seen["parts"][1]["text"]


def test_photos_get_described_once(client, monkeypatch):
    import asyncio
    from app import ai, photo_notes
    from app.config import settings
    from app.models import Photo
    calls = []

    async def fake(data, mime, transport=None):
        calls.append(mime)
        return "Two friends at a cafe."
    monkeypatch.setattr(ai, "describe_image", fake)
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setattr(settings, "ai_api_key", "k")
    with SessionLocal() as db:
        for d in (date(2025, 1, 1), date(2025, 1, 2)):
            db.add(Photo(user_id=1, date=d, mime="image/jpeg", data=b"x", thumb=b"x", caption="", seen=""))
        db.commit()
    real_sleep = asyncio.sleep
    monkeypatch.setattr(photo_notes.asyncio, "sleep", lambda s: real_sleep(0))
    assert asyncio.run(photo_notes.describe_missing(1)) == 2
    assert asyncio.run(photo_notes.describe_missing(1)) == 0 and len(calls) == 2
    with SessionLocal() as db:
        assert db.get(Photo, (1, date(2025, 1, 2))).seen == "Two friends at a cafe."
