"""What the companion knows about someone's whole logbook, for one question.

Years of entries don't fit in every message, so for each question this pulls
together the parts that matter, the way you'd flip through an old diary:

  1. the whole history at a glance: one line per month since the first day
     (entries and moods, focus time, tasks done, the areas time went to)
  2. the last 14 days in detail
  3. this day in every earlier year (a few days either side)
  4. any period the question names: "last October", "in 2025", "a year ago",
     "last week", "March 3", "2025-10-12"...
  5. older entries and day notes that share words with the question
  6. their goals, and what the companion has learned about them (its notes)

Everything is read for one account only (every query filters on user_id).
With share_text=False only numbers go out: no entry text, task or goal names.
"""

from __future__ import annotations

import calendar
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (Activity, CompanionNotes, DayRecord, Entry, Goal, PomodoroDay, SleepLog, Task)

LIMIT = 24_000          # characters of context at most (about 6k tokens): enough history, quick replies
MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_abbr) if m})
STOP = set("""the and for that this with what when where which who how why was were are have has had did does you your
about from into over just like then than them they their there here been being some more most very much many also
only even ever still back again what's whats tell know remember recall think write wrote wrote logged entry entries
day days week weeks month months year years time today yesterday ago last first since before after during around
could would should can will shall may might must lol okay yeah please thanks thank yuki mochi""".split())


def clip(text: str | None, n: int) -> str:
    t = " ".join((text or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def _local_day(dt: datetime, tz: int) -> date:
    return (dt + timedelta(minutes=tz)).date() if dt else None


def _minutes(ms: int) -> str:
    m = round((ms or 0) / 60000)
    return f"{m // 60}h{m % 60:02d}" if m >= 60 else f"{m}m"


def periods(question: str, today: date) -> list[tuple[date, date, str]]:
    """Date ranges a question points at. Each is capped at about two months."""
    q = question.lower()
    out: list[tuple[date, date, str]] = []

    def add(a: date, b: date, label: str):
        if a > today:
            return
        b = min(b, today)
        if (b - a).days > 62:
            a = b - timedelta(days=62)
        out.append((a, b, label))

    def month_range(y: int, m: int):
        return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])

    for d in re.findall(r"\b(20\d\d)-(\d\d)-(\d\d)\b", q):
        try:
            day = date(int(d[0]), int(d[1]), int(d[2]))
            add(day - timedelta(days=1), day + timedelta(days=1), day.isoformat())
        except ValueError:
            pass
    if "yesterday" in q:
        y = today - timedelta(days=1)
        add(y, y, "yesterday")
    if "last week" in q:
        add(today - timedelta(days=today.weekday() + 7), today - timedelta(days=today.weekday() + 1), "last week")
    if "last month" in q:
        first = today.replace(day=1) - timedelta(days=1)
        add(*month_range(first.year, first.month), "last month")
    m = re.search(r"\b(a|one|\d+)\s+(day|week|month|year)s?\s+ago\b", q)
    if m:
        n = 1 if m.group(1) in ("a", "one") else int(m.group(1))
        unit = m.group(2)
        if unit == "day":
            c = today - timedelta(days=n); add(c, c, m.group(0))
        elif unit == "week":
            c = today - timedelta(weeks=n); add(c - timedelta(days=3), c + timedelta(days=3), m.group(0))
        elif unit == "month":
            y, mo = today.year, today.month - n
            while mo < 1:
                y, mo = y - 1, mo + 12
            add(*month_range(y, mo), m.group(0))
        else:
            try:
                c = today.replace(year=today.year - n)
            except ValueError:
                c = today.replace(year=today.year - n, day=28)
            add(c - timedelta(days=7), c + timedelta(days=7), m.group(0))
    # "march", "last october", "october 2025", "march 3", "3 march 2025"
    names = "|".join(sorted(MONTHS, key=len, reverse=True))
    for mm in re.finditer(rf"\b(last\s+|this\s+)?(\d{{1,2}}\s+)?({names})\b\.?(\s+\d{{1,2}}(?!\d))?(,?\s+(20\d\d))?", q):
        word = mm.group(3)
        if word in ("may", "mar") and not (mm.group(1) or mm.group(2) or mm.group(4) or mm.group(6)):
            continue        # "may" and "mar" are usually just words
        mo = MONTHS[word]
        if mm.group(6):
            y = int(mm.group(6))
        elif mm.group(1) and mm.group(1).strip() == "last":
            y = today.year - 1 if mo >= today.month else today.year
        else:
            y = today.year if mo <= today.month else today.year - 1
        day_s = (mm.group(2) or mm.group(4) or "").strip()
        if day_s:
            try:
                d = date(y, mo, int(day_s))
                add(d - timedelta(days=1), d + timedelta(days=1), d.isoformat())
                continue
            except ValueError:
                pass
        add(*month_range(y, mo), f"{calendar.month_name[mo]} {y}")
    if "last year" in q and not any("last year" in p[2] for p in out):
        add(date(today.year - 1, 1, 1), date(today.year - 1, 12, 31), "last year")
    for y in re.findall(r"\b(?:in|during|of)\s+(20\d\d)\b", q):
        y = int(y)
        if not any(p[0].year == y for p in out):
            add(date(y, 1, 1), date(y, 12, 31), str(y))
    # merge duplicates
    seen, uniq = set(), []
    for p in out:
        if (p[0], p[1]) not in seen:
            seen.add((p[0], p[1]))
            uniq.append(p)
    return uniq[:4]


def keywords(question: str) -> list[str]:
    words = re.findall(r"[a-zA-Z\u0080-￿']{4,}", question.lower())
    return [w for w in dict.fromkeys(words) if w not in STOP and w not in MONTHS][:8]


def build(db: Session, uid: int, today: date, tz: int, question: str = "", share_text: bool = True, notes: bool = True) -> str:
    entries = db.query(Entry).filter(Entry.user_id == uid).order_by(Entry.occurred_at).all()
    days = {r.date: r for r in db.query(DayRecord).filter(DayRecord.user_id == uid).all()}
    focus = {p.date: p for p in db.query(PomodoroDay).filter(PomodoroDay.user_id == uid).all()}
    tasks = db.query(Task).filter(Task.user_id == uid).all()
    acts = db.query(Activity).filter(Activity.user_id == uid).all()
    sleeps = {s.date: s for s in db.query(SleepLog).filter(SleepLog.user_id == uid).all()}
    goals = db.query(Goal).filter(Goal.user_id == uid).all()

    by_day: dict[date, list[Entry]] = defaultdict(list)
    for e in entries:
        by_day[_local_day(e.occurred_at, tz)].append(e)
    tasks_by_day: dict[date, list[Task]] = defaultdict(list)
    for t in tasks:
        tasks_by_day[t.day_date].append(t)
    acts_by_day: dict[date, list[Activity]] = defaultdict(list)
    for a in acts:
        acts_by_day[a.day_date].append(a)

    all_days = set(by_day) | {d for d, r in days.items()} | set(focus) | set(tasks_by_day) | set(acts_by_day)
    all_days = {d for d in all_days if d and d <= today}
    if not all_days:
        return "They haven't logged anything yet."
    first = min(all_days)

    def day_text(d: date) -> str:
        """One day, in full (as far as sharing allows)."""
        bits = []
        es = by_day.get(d, [])
        if es:
            moods = Counter(e.mood for e in es)
            bits.append("moods " + ", ".join(f"{k} {v}" for k, v in moods.items()))
        if focus.get(d) and focus[d].focus_ms:
            bits.append("focus " + _minutes(focus[d].focus_ms))
        ts = tasks_by_day.get(d, [])
        if ts:
            bits.append(f"tasks {sum(t.completed for t in ts)}/{len(ts)} done")
        ac = acts_by_day.get(d, [])
        if ac:
            mins = sum(a.duration_minutes or 0 for a in ac)
            bits.append(f"{len(ac)} activities" + (f" ({mins}m)" if mins else ""))
        s = sleeps.get(d)
        if s and s.bed_at and s.wake_at:
            bits.append("slept " + _minutes(int((s.wake_at - s.bed_at).total_seconds() * 1000)))
        line = f"{d.isoformat()} ({d.strftime('%a')}): " + ("; ".join(bits) or "page only")
        if not share_text:
            return line
        more = []
        r = days.get(d)
        if r:
            for label, val in (("main focus", r.morning_main_focus), ("intention", r.morning_intention), ("journal", r.journal),
                               ("what happened", r.reflection_what_happened), ("win", r.reflection_wins),
                               ("lesson", r.reflection_lessons), ("grateful for", r.reflection_gratitude)):
                if val and val.strip():
                    more.append(f"  {label}: {clip(val, 300)}")
        if ts:
            more.append("  tasks: " + "; ".join(("[x] " if t.completed else "[ ] ") + clip(t.title, 60) for t in ts[:10]))
        if ac:
            more.append("  activities: " + "; ".join(clip(a.title, 50) + (f" ({a.duration_minutes}m)" if a.duration_minutes else "")
                                                     + (f" #{a.activity_category}" if a.activity_category else "") for a in ac[:10]))
        for e in es[:6]:
            more.append(f"  entry ({e.mood}): {clip(e.text, 420)}")
        return line + ("\n" + "\n".join(more) if more else "")

    # sections keep their order on the page; when it's too long, the least
    # useful for this question are shortened first (lower number = kept whole)
    out: list[tuple[int, str]] = []

    def add(keep: int, section: str):
        out.append((keep, section))
    span = (today - first).days
    add(0, f"They started using Logbook on {first.isoformat()} ({span} days ago). "
               f"In all: {len(entries)} journal entries, {sum(t.completed for t in tasks)} tasks done, "
               f"{_minutes(sum(p.focus_ms or 0 for p in focus.values()))} of focus.")

    # 1. month by month since the start
    months: dict[str, dict] = defaultdict(lambda: {"e": Counter(), "f": 0, "td": 0, "tt": 0, "areas": Counter()})
    for d, es in by_day.items():
        for e in es:
            months[d.strftime("%Y-%m")]["e"][e.mood] += 1
    for d, p in focus.items():
        months[d.strftime("%Y-%m")]["f"] += p.focus_ms or 0
    for t in tasks:
        m = months[t.day_date.strftime("%Y-%m")]
        m["tt"] += 1
        m["td"] += bool(t.completed)
    for a in acts:
        if a.activity_category:
            months[a.day_date.strftime("%Y-%m")]["areas"][a.activity_category] += a.duration_minutes or 1
    lines = []
    for key in sorted(months):
        m = months[key]
        n = sum(m["e"].values())
        parts = [f"{n} entries" + (" (" + ", ".join(f"{k} {v}" for k, v in m["e"].most_common()) + ")" if n else "")]
        if m["f"]:
            parts.append("focus " + _minutes(m["f"]))
        if m["tt"]:
            parts.append(f"tasks {m['td']}/{m['tt']}")
        if m["areas"]:
            parts.append("time went to " + ", ".join(k for k, _ in m["areas"].most_common(3)))
        lines.append(f"{key}: " + "; ".join(parts))
    add(5, "MONTH BY MONTH SINCE THE START:\n" + "\n".join(lines))

    # 2. the last 14 days
    recent = [today - timedelta(days=i) for i in range(13, -1, -1)]
    add(4, "THE LAST 14 DAYS:\n" + "\n".join(day_text(d) for d in recent if d in all_days or d == today))

    # 3. this day in earlier years
    back = []
    for years in range(1, today.year - first.year + 1):
        try:
            same = today.replace(year=today.year - years)
        except ValueError:
            same = today.replace(year=today.year - years, day=28)
        near = [same + timedelta(days=k) for k in range(-3, 4)]
        found = [d for d in near if d in all_days]
        if found:
            back.append(f"-- around {same.isoformat()} ({years} year{'s' if years > 1 else ''} ago) --\n" + "\n".join(day_text(d) for d in found))
    if back:
        add(6, "THIS TIME IN EARLIER YEARS:\n" + "\n".join(back))

    # 4. what the question points at
    shown = set(recent)
    for a, b, label in periods(question, today):
        ds = [a + timedelta(days=i) for i in range((b - a).days + 1)]
        found = [d for d in ds if d in all_days and d not in shown]
        shown.update(found)
        if found:
            add(1, f"WHAT THEY ASKED ABOUT ({label}, {a.isoformat()} to {b.isoformat()}):\n" + "\n".join(day_text(d) for d in found[:40]))
        else:
            add(1, f"WHAT THEY ASKED ABOUT ({label}, {a.isoformat()} to {b.isoformat()}): nothing logged in that period.")

    # 5. older days that share words with the question
    if share_text:
        words = keywords(question)
        if words:
            scored = []
            for d in all_days - shown:
                hay = " ".join(e.text for e in by_day.get(d, []))
                r = days.get(d)
                if r:
                    hay += " " + " ".join(filter(None, (r.journal, r.morning_main_focus, r.reflection_what_happened,
                                                         r.reflection_wins, r.reflection_lessons, r.reflection_gratitude)))
                hay += " " + " ".join(t.title for t in tasks_by_day.get(d, [])) + " " + " ".join(a.title for a in acts_by_day.get(d, []))
                hay = hay.lower()
                score = sum(hay.count(w) for w in words)
                if score:
                    scored.append((score, d))
            scored.sort(key=lambda x: (-x[0], x[1]))
            if scored:
                add(2, f"OLDER DAYS THAT MENTION {', '.join(words).upper()}:\n" + "\n".join(day_text(d) for _, d in scored[:10]))

    # 6. goals and what the companion has learned
    if goals:
        if share_text:
            add(3, "GOALS:\n" + "\n".join(f"- {clip(g.title, 80)} ({g.category}, {'done' if g.completed else str(g.progress) + '%'}"
                                                + (f", target {g.target_date.isoformat()}" if g.target_date else "") + ")" for g in goals[:20]))
        else:
            add(3, f"GOALS: {len(goals)} ({sum(g.completed for g in goals)} done)")
    learned = db.get(CompanionNotes, uid) if notes else None
    if learned and learned.notes.strip() and share_text:
        add(1, "WHAT THE COMPANION HAS LEARNED ABOUT THEM (from chats):\n" + learned.notes.strip())

    return fit(out)


def fit(sections: list[tuple[int, str]]) -> str:
    """Join the sections, shortening the least important first until it fits."""
    texts = [t for _, t in sections]
    total = lambda: sum(len(t) for t in texts) + 2 * len(texts)
    for keep in sorted({k for k, _ in sections}, reverse=True):
        if total() <= LIMIT or keep <= 1:
            break
        for i, (k, _) in enumerate(sections):
            over = total() - LIMIT
            if k == keep and over > 0:
                room = max(200, len(texts[i]) - over)
                if room < len(texts[i]):
                    texts[i] = texts[i][:room].rsplit("\n", 1)[0] + "\n…(more not shown)"
    text = "\n\n".join(texts)
    return text if len(text) <= LIMIT + 4000 else text[:LIMIT + 4000] + "\n…(cut for length)"
