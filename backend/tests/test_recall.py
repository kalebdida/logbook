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
