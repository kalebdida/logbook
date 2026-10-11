"""The monthly letter: what a month looked like, written by the cat.

month_stats() reads one account's month; write_letter() turns it into a
short letter, with the AI when the account may use it, otherwise from a
template. The router stores it so it's written once (app/routers/letters.py),
and the Telegram bot sends it on the morning of the 1st."""

import calendar
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import ai
from app.config import settings
from app.models import (Activity, DayRecord, Deadline, Entry, HabitLog, Letter, Photo, PomodoroDay, Prayer, Profile,
                        SleepLog, Task, User)

AREA_LABEL = {"coding": "coding", "learning": "learning", "fitness": "fitness", "faith": "faith", "social": "people",
              "work": "work", "rest": "rest", "creativity": "making things", "reflection": "reflection"}


def month_range(month: str) -> tuple[date, date]:
    y, m = int(month[:4]), int(month[5:7])
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def previous_month(today: date) -> str:
    first = today.replace(day=1) - timedelta(days=1)
    return first.strftime("%Y-%m")


def hm(minutes: int) -> str:
    h, m = divmod(int(minutes), 60)
    return f"{h}h {m:02d}m" if h else f"{m} min"


def month_stats(db: Session, uid: int, month: str, tz_minutes: int = 0) -> dict:
    start, end = month_range(month)
    shift = timedelta(minutes=tz_minutes)
    entries = [e for e in db.query(Entry).filter(Entry.user_id == uid).all()
               if start <= ((e.occurred_at if e.occurred_at.tzinfo else e.occurred_at.replace(tzinfo=timezone.utc)) + shift).date() <= end]
    days = sorted({((e.occurred_at if e.occurred_at.tzinfo else e.occurred_at.replace(tzinfo=timezone.utc)) + shift).date() for e in entries})
    run = best = 0
    for i, d in enumerate(days):
        run = run + 1 if i and (d - days[i - 1]).days == 1 else 1
        best = max(best, run)
    moods = {m: sum(1 for e in entries if e.mood == m) for m in ("good", "okay", "rough")}
    tasks = db.query(Task).filter(Task.user_id == uid, Task.day_date >= start, Task.day_date <= end).all()
    focus = sum(p.focus_ms for p in db.query(PomodoroDay).filter(PomodoroDay.user_id == uid, PomodoroDay.date >= start, PomodoroDay.date <= end)) // 60000
    habits = db.query(HabitLog).filter(HabitLog.user_id == uid, HabitLog.date >= start, HabitLog.date <= end).count()
    areas: dict[str, int] = {}
    for a in db.query(Activity).filter(Activity.user_id == uid, Activity.day_date >= start, Activity.day_date <= end):
        if a.activity_category:
            areas[a.activity_category] = areas.get(a.activity_category, 0) + (a.duration_minutes or 0)
    grateful = []
    for rec in db.query(DayRecord).filter(DayRecord.user_id == uid, DayRecord.date >= start, DayRecord.date <= end):
        grateful += [line.strip() for line in (rec.reflection_gratitude or "").splitlines() if line.strip()]
    answered = [p.text for p in db.query(Prayer).filter(Prayer.user_id == uid, Prayer.answered_at.is_not(None)).all()
                if start <= ((p.answered_at if p.answered_at.tzinfo else p.answered_at.replace(tzinfo=timezone.utc)) + shift).date() <= end]
    from app.routers.sleep import minutes_slept
    nights = [m for m in (minutes_slept(s) for s in db.query(SleepLog).filter(
        SleepLog.user_id == uid, SleepLog.date >= start, SleepLog.date <= end)) if m]
    met = db.query(Deadline).filter(Deadline.user_id == uid, Deadline.done.is_(True), Deadline.due_date >= start,
                                    Deadline.due_date <= end).count()
    photos = db.query(Photo.date).filter(Photo.user_id == uid, Photo.date >= start, Photo.date <= end).count()
    good = [e.text for e in sorted(entries, key=lambda e: e.occurred_at) if e.mood == "good"]
    return {
        "month": month, "month_name": start.strftime("%B"), "next_month": (end + timedelta(days=1)).strftime("%B"),
        "days_written": len(days), "entries": len(entries), "moods": moods, "best_run": best,
        "tasks_done": sum(1 for t in tasks if t.completed), "tasks": len(tasks), "focus_minutes": focus,
        "habit_checks": habits, "top_areas": sorted(areas.items(), key=lambda kv: -kv[1])[:2],
        "grateful": grateful, "answered": answered, "sleep_avg": round(sum(nights) / len(nights)) if nights else None,
        "deadlines_met": met, "photos": photos, "good_moments": good[-6:],
        "snippets": [f"({e.mood}) {e.text[:220]}" for e in sorted(entries, key=lambda e: e.occurred_at)][-10:],
    }


def template_letter(s: dict, name: str, pet: str) -> str:
    rnd = random.Random(s["month"])
    lines = [f"Dear {name},", ""]
    if not s["entries"] and not s["tasks"]:
        lines.append(f"{s['month_name']} was a quiet one here. That's okay. Quiet months happen, and the page is still yours whenever you want it.")
    else:
        mood = s["moods"]
        feel = ""
        if s["entries"]:
            feel = f", and {mood['good']} of your entries felt good" if mood["good"] else ""
            if mood["rough"] and mood["rough"] >= mood["good"]:
                feel = f". Some of it was heavy: {mood['rough']} rough entries. You still kept writing, and that counts"
        lines.append(f"{s['month_name']} is done. You wrote on {s['days_written']} days{feel}.")
        bits = []
        if s["best_run"] > 1:
            bits.append(f"your longest run was {s['best_run']} days in a row")
        if s["tasks_done"]:
            bits.append(f"you finished {s['tasks_done']} task{'s' if s['tasks_done'] != 1 else ''}")
        if s["focus_minutes"]:
            bits.append(f"you spent {hm(s['focus_minutes'])} in focus")
        if bits:
            lines += ["", (bits[0][0].upper() + bits[0][1:]) + (", " + ", ".join(bits[1:-1]) if len(bits) > 2 else "") +
                      (" and " + bits[-1] if len(bits) > 1 else "") + "."]
        if s["top_areas"]:
            names = " and ".join(AREA_LABEL.get(a, a) for a, _ in s["top_areas"])
            lines.append(f"Most of your logged time went to {names}.")
        if s["sleep_avg"]:
            lines.append(f"You slept {hm(s['sleep_avg'])} a night on average.")
        if s["grateful"]:
            picks = rnd.sample(s["grateful"], min(2, len(s["grateful"])))
            lines += ["", "You were grateful for " + " and ".join(p.rstrip(".").lower() if p[:1].isupper() and not p[1:2].isupper() else p.rstrip(".") for p in picks) + "."]
        if s["answered"]:
            lines.append(f"{len(s['answered'])} prayer{'s were' if len(s['answered']) != 1 else ' was'} answered: {s['answered'][0].rstrip('.')}.")
        if s["good_moments"]:
            lines += ["", f"A moment worth keeping: “{rnd.choice(s['good_moments'])[:200]}”"]
    lines += ["", f"See you in {s['next_month']}.", f"— {pet}"]
    return "\n".join(lines)


async def write_letter(db: Session, user: User, month: str, tz_minutes: int = 0) -> str:
    prof = db.get(Profile, user.id)
    pet = (prof.pet_name if prof and prof.pet_name else "") or "Mochi"
    s = month_stats(db, user.id, month, tz_minutes)
    fallback = template_letter(s, user.username, pet)
    if not (ai.configured() and (user.is_admin or settings.ai_for_everyone)) or (not s["entries"] and not s["tasks"]):
        return fallback
    facts = {k: v for k, v in s.items() if k not in ("snippets", "good_moments")}
    system = (
        f"You are {pet}, the small cat who keeps {user.username} company in Logbook, their private journal. "
        f"Write them a short letter (120 to 200 words) about their {s['month_name']}: warm, honest, specific, plain words. "
        "Notice one or two real patterns in the numbers and entries; name a hard part kindly if there was one; end with one "
        "small, concrete hope for next month. Never invent events. If their own entries or prayers speak about faith, you "
        "may too; otherwise don't. No headings, no lists, no emojis. Start with 'Dear "
        f"{user.username},' and sign off with '— {pet}'."
    )
    prompt = f"Their month in numbers: {facts}\n\nTheir entries this month (oldest first):\n" + "\n".join(s["snippets"])
    try:
        text = await ai.chat([{"role": "user", "content": prompt}], system, 900)
    except ai.AIError:
        return fallback
    return text.strip() or fallback


async def letter_for(db: Session, user: User, month: str, tz_minutes: int = 0) -> Letter:
    row = db.get(Letter, (user.id, month))
    if row is None:
        now = datetime.now(timezone.utc)
        row = Letter(user_id=user.id, month=month, text=await write_letter(db, user, month, tz_minutes), created_at=now, updated_at=now)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row
