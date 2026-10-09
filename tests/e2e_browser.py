"""End-to-end browser test for Logbook.

Starts its own backend on port 8765 with a throwaway database (your real
logbook.db is never touched), drives every feature in headless Chromium,
and checks the results through the API.

  pip install playwright && playwright install chromium
  python tests/e2e_browser.py

Runs the browser in Africa/Addis_Ababa time on purpose, so timezone bugs
show up even on a machine set to UTC.
"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

TZ = ZoneInfo("Africa/Addis_Ababa")
PORT = int(os.environ.get("LOGBOOK_TEST_PORT", "8765"))
BASE = f"http://127.0.0.1:{PORT}"
BACKEND = Path(__file__).resolve().parent.parent / "backend"
WORK = Path(tempfile.mkdtemp(prefix="logbook-e2e-"))
OUT = WORK
ENV = dict(os.environ, DATABASE_URL=f"sqlite:///{(WORK / 'test.db').as_posix()}")
results, errors = [], []
server = None


def start_server():
    global server
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT)],
                              cwd=BACKEND, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/health", timeout=1)
            return
        except Exception:
            time.sleep(0.25)
    raise SystemExit("backend didn't start")


def stop_server():
    if server and server.poll() is None:
        server.kill()
        server.wait()


start_server()

def api(path, method="GET", body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    raw = urllib.request.urlopen(req).read()
    return json.loads(raw) if raw else None


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"), flush=True)


today = datetime.now(TZ).date()  # the browser's local date, not the container's
yesterday = today - timedelta(days=1)

# seed: an unfinished task from yesterday and yesterday's plan
api("/tasks/", "POST", {"day_date": str(yesterday), "title": "old unfinished"})
api(f"/days/{yesterday}", "PUT", {"reflection_tomorrow_plan": "be patient"})
api("/entries/", "POST", {"mood": "good", "text": "a week ago entry", "occurred_at": f"{today - timedelta(days=7)}T10:00:00Z"})

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True, timezone_id="Africa/Addis_Ababa")
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    page.goto(BASE + "/")
    page.keyboard.press("Space")  # skip boot
    page.wait_for_selector("#todayConsole .console-clock")
    page.wait_for_function("document.body.classList.contains('is-booted')")
    page.wait_for_timeout(600)
    check("boot can be skipped", page.evaluate("document.getElementById('boot').hidden || getComputedStyle(document.getElementById('boot')).opacity === '0'"))
    page.wait_for_selector("#dailyTasks .inline-form")
    clock = page.text_content("#consoleClock")
    now_local = datetime.now(TZ)
    check("console clock shows Addis Ababa time", clock in (now_local.strftime("%H:%M"), (now_local - timedelta(minutes=1)).strftime("%H:%M")), clock)
    check("backend status shows online", "online" in page.text_content("#statusLabel"))
    check("'on this day' replay shows a week-old entry", page.is_visible("#weekAgoSection") and "7 days ago" in page.text_content("#weekAgoSection"))

    # ---------- morning: yesterday's plan carries in ----------
    page.click("#usePlanBtn")
    check("yesterday's plan fills today's intention", page.input_value("#morningIntention") == "be patient")
    page.fill("#mainFocus", "ship logbook")
    page.dispatch_event("#mainFocus", "input")
    page.wait_for_function("document.getElementById('dailySaveStatus').textContent.startsWith('saved')", timeout=5000)
    day = api(f"/days/{today}")
    check("autosave writes intention + focus to the backend", day["morning_intention"] == "be patient" and day["morning_main_focus"] == "ship logbook", day)

    # ---------- tasks ----------
    page.fill('#dailyTasks input[name="title"]', "write tests")
    page.select_option('#dailyTasks select[name="category"]', "coding")
    page.press('#dailyTasks input[name="title"]', "Enter")
    page.wait_for_selector("#dailyTasks .task-row")
    page.click('#dailyTasks [data-task-action="carry"]')
    page.wait_for_function("document.querySelectorAll('#dailyTasks .task-row').length === 2")
    tasks_today = api(f"/tasks/?day_date={today}")
    check("task added with life area, and unfinished task carried to today",
          sorted(t["title"] for t in tasks_today) == ["old unfinished", "write tests"] and any(t["activity_category"] == "coding" for t in tasks_today), tasks_today)
    page.check('#dailyTasks .task-row:has-text("write tests") input[type=checkbox]')
    page.wait_for_timeout(400)
    check("checking a task completes it in the backend", any(t["completed"] for t in api(f"/tasks/?day_date={today}") if t["title"] == "write tests"))
    page.click('#dailyTasks .task-row:has-text("old unfinished") [data-task-action="delete"]')
    page.wait_for_selector(".toast-action")
    page.click(".toast-action")
    page.wait_for_function("document.querySelectorAll('#dailyTasks .task-row').length === 2")
    check("task delete can be undone", len(api(f"/tasks/?day_date={today}")) == 2)

    # ---------- activities ----------
    page.click('#dailyActivities [data-area="fitness"]')
    page.fill('#dailyActivities input[name="title"]', "evening run")
    page.fill('#dailyActivities input[name="minutes"]', "40")
    page.click('#dailyActivities button[type="submit"]')
    page.wait_for_selector("#dailyActivities .activity-row")
    acts = api(f"/activities/?day_date={today}")
    check("activity logged with area + minutes", acts and acts[0]["activity_category"] == "fitness" and acts[0]["duration_minutes"] == 40, acts)

    # ---------- journal via keyboard ----------
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.keyboard.press("n")
    page.wait_for_function("location.hash === '#journal'")
    page.wait_for_function("document.activeElement && document.activeElement.id === 'entryText'", timeout=3000)
    check("'n' opens the journal composer", page.evaluate("document.activeElement.id") == "entryText")
    page.click('.form-box [data-mood="okay"]')
    page.fill("#entryText", "hello from the e2e test #learning")
    page.press("#entryText", "Control+Enter")
    page.wait_for_function("document.querySelectorAll('#entriesList .entry-card').length === 2")
    entries = api("/entries/")
    newest = max(entries, key=lambda e: e["occurred_at"])
    check("ctrl+enter commits an entry", newest["text"].startswith("hello from the e2e") and newest["mood"] == "okay")
    check("entry time stored in UTC and shown as local time",
          newest["occurred_at"].endswith("Z") and page.text_content("#entriesList .entry-card .entry-date").strip() ==
          datetime.fromisoformat(newest["occurred_at"].replace("Z", "+00:00")).astimezone(TZ).strftime("%-I:%M %p").lower(),
          (newest["occurred_at"], page.text_content("#entriesList .entry-card .entry-date")))

    page.click(f'.entry-card[data-id="{newest["id"]}"]')
    page.click(f'.entry-card[data-id="{newest["id"]}"] [data-entry-action="edit"]')
    page.fill(f'.entry-card[data-id="{newest["id"]}"] textarea', "edited in place")
    page.click(f'.entry-card[data-id="{newest["id"]}"] [data-edit-mood="good"]')
    page.click(f'.entry-card[data-id="{newest["id"]}"] button[type="submit"]')
    page.wait_for_timeout(400)
    edited = api(f"/entries/{newest['id']}")
    check("entry edit saves text and status", edited["text"] == "edited in place" and edited["mood"] == "good", edited)

    page.fill("#searchInput", "edited")
    check("search filters and highlights", page.locator("#entriesList .entry-card").count() == 1 and page.locator("#entriesList mark").count() >= 1)
    page.fill("#searchInput", "")
    if not page.locator(f'.entry-card.is-open[data-id="{newest["id"]}"]').count():
        page.click(f'.entry-card[data-id="{newest["id"]}"]')
    page.click(f'.entry-card[data-id="{newest["id"]}"] [data-entry-action="delete"]')
    page.wait_for_selector(".toast-action")
    check("entry deleted", len(api("/entries/")) == 1)
    page.locator(".toast-action").last.click()
    page.wait_for_timeout(500)
    restored = [e for e in api("/entries/") if e["id"] == newest["id"]]
    check("entry delete can be undone with the same id and time", restored and restored[0]["occurred_at"] == edited["occurred_at"])

    # ---------- goals ----------
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.keyboard.press("g")
    page.wait_for_selector("#goalEditor")
    page.fill('#goalEditor input[name="title"]', "run 5k")
    page.select_option('#goalEditor select[name="activityCategory"]', "fitness")
    page.click("#goalEditor .goals-save-button")
    page.wait_for_selector('.goal-card:has-text("run 5k")')
    page.click('.goal-card:has-text("run 5k") [data-goal-action="complete"]')
    page.wait_for_timeout(500)
    goal = [g for g in api("/goals/") if g["title"] == "run 5k"][0]
    check("goal created with life area and completed", goal["completed"] and goal["activity_category"] == "fitness", goal)

    # ---------- command palette ----------
    page.keyboard.press("Control+k")
    page.wait_for_selector("#palette:not([hidden])")
    page.keyboard.type("calendar")
    page.keyboard.press("Enter")
    page.wait_for_function("location.hash === '#calendar'")
    check("palette runs commands", True)
    page.keyboard.press("Control+k")
    page.keyboard.type("week ago")
    page.wait_for_selector(".palette-entry")
    page.keyboard.press("ArrowDown")
    for _ in range(10):
        if page.locator(".palette-item.is-active.palette-entry").count():
            break
        page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.wait_for_function("location.hash === '#journal'")
    page.wait_for_selector(".entry-card.is-open")
    page.wait_for_timeout(600)  # let the decrypt animation finish
    check("palette finds and opens an entry", "a week ago entry" in page.text_content(".entry-card.is-open"))

    # ---------- day viewer ----------
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.keyboard.press("d")
    page.wait_for_selector("#dayViewer .viewer-date")
    viewer = page.text_content("#dayViewer")
    check("day viewer shows today's tasks, activity, entries", "write tests" in viewer and "evening run" in viewer and "be patient" in viewer, viewer[:300])
    page.keyboard.press("ArrowLeft")
    page.wait_for_function(f"document.querySelector('#dayViewer .viewer-date') && document.querySelector('#dayViewer .viewer-date').textContent.includes('{yesterday.day}')")
    check("arrow keys move between days", True)
    page.keyboard.press("Escape")
    check("escape closes the day viewer", page.evaluate("document.getElementById('dayViewer').hidden"))

    # ---------- focus timer ----------
    page.goto(BASE + "/#settings")
    page.wait_for_selector("#prefFocus")
    page.fill("#prefFocus", "1")
    page.dispatch_event("#prefFocus", "change")
    page.goto(BASE + "/#focus")
    page.keyboard.press("Space")
    page.wait_for_selector("#pomodoroTime")
    check("timer length follows settings", page.text_content("#pomodoroTime") == "01:00", page.text_content("#pomodoroTime"))
    page.click("#pomodoroStart")
    page.wait_for_timeout(1300)
    check("tab title counts down while focusing", page.title().startswith("00:5"), page.title())
    page.goto(BASE + "/health")  # leave the app so it saves the running timer
    page.evaluate("""() => {
        const s = JSON.parse(localStorage.getItem('logbook-pomodoro'));
        s.timer.endsAt = Date.now() + 1500; localStorage.setItem('logbook-pomodoro', JSON.stringify(s));
    }""")
    page.goto(BASE + "/#focus")
    page.keyboard.press("Space")
    page.wait_for_timeout(3500)
    pomo = api(f"/pomodoro/{today}")
    check("finished focus block reaches the backend", pomo["sessions"] >= 1 and pomo["focus_ms"] >= 60000, pomo)

    # ---------- companion ----------
    page.goto(BASE + "/#companion")
    page.keyboard.press("Space")
    page.wait_for_selector(".brief-line")
    brief = page.text_content("#companionSection")
    check("companion brief reflects today's data", "1 of 2 tasks done" in brief or "2 tasks" in brief or "tasks done" in brief, brief[:400])
    page.click('[data-command="write-prompt"]')
    page.wait_for_function("location.hash === '#journal'")
    page.wait_for_function("document.getElementById('entryText').value.startsWith('> ')", timeout=3000)
    check("reflection question pre-fills the journal", page.input_value("#entryText").startswith("> "))

    # ---------- settings: backup + legacy import ----------
    page.goto(BASE + "/#settings")
    page.keyboard.press("Space")
    page.wait_for_selector("#dbStatus.is-online")
    with page.expect_download() as dl:
        page.click("#backupExport")
    backup = json.loads(Path(dl.value.path()).read_text())
    check("full backup downloads every table", all(k in backup for k in ["entries", "day_records", "tasks", "activities", "goals", "pomodoro_days"]) and len(backup["entries"]) == 2)

    legacy = {
        "logbook-entries": json.dumps([{"id": "1700000000000", "date": "2026-09-01T08:00:00.000Z", "mood": "rough", "text": "old local entry"}]),
        "logbook-days": json.dumps({"2026-09-01": {"morning": {"intention": "old intention", "mainFocus": ""}, "journal": "old journal",
                                                    "nightReflection": {"wins": "w"}, "tasks": [{"title": "old task", "completed": True}]}}),
        "logbook-goals": json.dumps([{"id": "goal-old", "title": "old goal", "progress": 30, "category": "weekly", "priority": "high"}]),
        "logbook-pomodoro": json.dumps({"days": {"2026-09-01": {"sessions": 2, "focusMs": 3000000}}})
    }
    legacy_file = OUT / "legacy.json"
    legacy_file.write_text(json.dumps(legacy))
    page.set_input_files("#backupFile", str(legacy_file))
    page.wait_for_selector(".toast:has-text('imported')")
    imported_day = api("/days/2026-09-01")
    check("old-version data imports (entries, days, tasks, goals, focus)",
          any(e["text"] == "old local entry" for e in api("/entries/")) and imported_day["morning_intention"] == "old intention"
          and any(g["id"] == "goal-old" for g in api("/goals/")) and api("/pomodoro/2026-09-01")["sessions"] == 2
          and api("/tasks/?day_date=2026-09-01")[0]["completed"] is True)
    page.set_input_files("#backupFile", str(legacy_file))
    page.wait_for_selector(".toast:has-text('nothing new')")
    check("importing the same file twice adds nothing", True)

    # same thing straight from this browser's old localStorage
    page.evaluate("""(d) => { for (const k in d) localStorage.setItem(k, d[k]); }""", legacy)
    page.reload()
    page.keyboard.press("Space")
    page.wait_for_selector("#legacyImport")
    check("settings finds old-version data in this browser", True)
    page.goto(BASE + "/health")
    page.evaluate("""() => localStorage.setItem('logbook-pomodoro', JSON.stringify({days: {'2026-09-01': {sessions: 2, focusMs: 'x'}}, timer: {mode: 'nonsense'}}))""")
    page.goto(BASE + "/#focus")
    page.keyboard.press("Space")
    page.wait_for_timeout(1500)
    check("app survives malformed saved timer data", "online" in page.text_content("#statusLabel") and page.text_content("#pomodoroTime") == "01:00",
          page.text_content("#pomodoroTime"))
    page.goto(BASE + "/#settings")
    page.keyboard.press("Space")
    page.wait_for_selector("#legacyImport")
    page.click("#legacyImport")
    page.wait_for_selector(".legacy-box:has-text('imported')")
    page.reload()
    page.keyboard.press("Space")
    page.wait_for_selector("#dbStatus.is-online")
    check("old-data prompt disappears once imported", page.locator("#legacyImport").count() == 0)

    # ---------- persistence + navigation ----------
    page.goto(BASE + "/#goals")
    page.keyboard.press("Space")
    page.wait_for_selector(".goal-card")
    check("refresh keeps the current page", page.text_content("#pageTitle") == "goals")
    page.go_back()
    page.wait_for_timeout(300)
    check("back button changes page", page.text_content("#pageTitle") != "goals")

    # ---------- backend outage ----------
    stop_server()
    time.sleep(1)
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    page.wait_for_selector("#storageWarning:not([hidden])", timeout=5000)
    check("clear warning when the backend is down", "can't reach" in page.text_content("#storageWarning"))
    start_server()
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    page.wait_for_selector("#storageWarning[hidden]", state="attached", timeout=8000)
    check("recovers on its own when the backend returns", "online" in page.text_content("#statusLabel"))

    # ---------- mobile ----------
    m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, timezone_id="Africa/Addis_Ababa").new_page()
    m.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    m.goto(BASE + "/")
    m.wait_for_timeout(2500)
    nav_box = m.locator("#sidebarNav").bounding_box()
    check("mobile nav is a bottom bar", nav_box["y"] > 700 and nav_box["height"] < 100, nav_box)
    m.tap('[data-nav-target="journal"]')
    m.wait_for_timeout(300)
    check("mobile tab bar navigates", m.text_content("#pageTitle") == "journal")
    no_scroll = m.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    check("no horizontal scroll on mobile", no_scroll)
    m.screenshot(path=str(OUT / "mobile-journal.png"))

    page.goto(BASE + "/")
    page.keyboard.press("Space")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / "desktop-dashboard.png"), full_page=True)
    browser.close()

real_errors = [e for e in errors if "Failed to load resource" not in e]
check("no javascript errors in the console", not real_errors, real_errors)
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
stop_server()
sys.exit(1 if failed else 0)
