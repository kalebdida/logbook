# logbook

A personal OS in a terminal skin: journal, daily pages, tasks, habits, activity
log, focus timer with a soundtrack, goals, calendar, a life-balance density map,
analytics, and a companion that briefs you on your day and (if you connect an
AI) talks with you about it. Restyle all of it with themes, including ones made
from a sentence or a picture.

Runs three ways: on your computer, as a web app that keeps everything in the
browser, or on your own server that every device shares. The Android app is
the same code.

## Run it

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open **http://127.0.0.1:8000**. The backend serves the page itself.

- API docs: http://127.0.0.1:8000/docs
- Your data: `backend/logbook.db`. Back it up from settings, or copy the file.
- To put it online (GitHub Pages, Render + Neon, Docker): [docs/HOSTING.md](docs/HOSTING.md)
- To get the Android app: [docs/ANDROID.md](docs/ANDROID.md)

## What's in it

| page | what it does |
|---|---|
| dashboard | live clock and today's readout, habits (check today, last 7 days, streaks), the daily page (intention, main focus, tasks, activity log, night reflection, brain dump), verse of the day, "on this day", density map, analytics |
| journal | entries with a status (200 / 102 / 500), grouped by day, search with highlighting, edit, delete with undo, import and export |
| calendar | month and year views, click any day for its full record (habits included) |
| focus | pomodoro timer with progress ring, plus the soundtrack: your own music files, generated ambient sound (rain, waves, wind, fireplace, noise, a focus tone), or Spotify. It can start with each focus block and pause on breaks |
| goals | categories, priorities, target dates, progress, and a life area so finished goals count on the density map |
| companion | a daily brief built from your own data (local rules, nothing sent), a question to reflect on, and "ask your logbook": an AI chat for weekly reviews, planning tomorrow, and patterns |
| settings | themes, where your data lives (this device or a server), AI, reminders, installing the app, timer, effects, backup and import |

### Themes

- seven built in: terminal (the default), amber crt, paper, glacier, dusk, forest, high contrast
- **describe a vibe** ("cozy coffee shop at night", "ethiopian highlands", "neon tokyo"): it builds a theme offline from your words, or with AI if you've connected one
- **from a picture**: colors picked from a photo or wallpaper, optionally as a faint backdrop
- **fine-tune**: every color, font, background effect (rain with 4 glyph sets, stars, snow, fireflies, none), scanlines, glow, corner roundness, plus custom CSS
- readability is checked and fixable in one click; themes export to a file you can share

### Music

- your files (mp3, m4a, ogg, opus, wav, flac) are kept in the browser and play offline, with shuffle, repeat, seek, and phone lock-screen controls
- ambient sound is generated live, so it needs no downloads; mix several, and it remembers your mix
- Spotify: paste any playlist, album, track, or podcast link. Full songs if you're logged in to Spotify in that browser, 30-second previews if not
- a mini player follows you to every page; `m` plays or pauses from anywhere

### AI (optional, off by default)

Connect Claude or any OpenAI-compatible model (OpenAI, OpenRouter, Groq, or a free
local model with Ollama) in settings, or set a key on your server so every device
can use it without seeing the key. With "let AI read entry text" off, it only sees
numbers. Nothing is sent until you ask something.

Small things worth knowing:

- unfinished tasks from earlier days can be pulled into today in one click
- last night's "tomorrow's plan" is offered as this morning's intention
- the daily page autosaves, and unsaved typing survives a reload
- morning and evening reminders, only if that part of the day is still empty
- installable as an app (it works offline); a new version announces itself

## Keyboard

| key | does |
|---|---|
| `ctrl k` | command prompt: run any command (themes, music, pages) or search entries |
| `n` / `t` / `g` | new entry / new task / new goal |
| `f` | start or pause focus |
| `m` | play or pause music |
| `d` | open today's full record (`←` `→` move between days) |
| `/` | search entries |
| `1`–`7` | jump to a page |
| `ctrl enter` | commit the entry you're writing |
| `?` | all shortcuts |
| `esc` | close whatever is open |

## Where data lives

| data | stored in |
|---|---|
| entries, daily pages, tasks, activities, goals, habits | the server's database, or this browser in device mode |
| focus history | the same, plus this browser (the larger number wins) |
| your music files | this browser only (not in backups) |
| themes, settings, AI key, the live timer | this browser only |
| analytics, density map, companion brief | computed fresh, never stored |

## Moving data from the old version

The old version saved everything inside the browser, so it has to be brought over once.

- **Same browser and address:** settings shows "found data from the old version". Click import.
- **Different address:** settings, "moving data from an old copy at a different address" has a
  one-line snippet for the browser console on the old copy. It downloads
  `logbook-old-data.json`. Import that file in settings.
- **Old journal exports** import the same way.

Import is additive: it never deletes or overwrites anything, so importing a file twice is safe.

## Tests

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest -q   # API: 27 tests
TEST_DATABASE_URL=postgresql://user@host/db python -m pytest -q            # the same, on Postgres
pip install playwright && playwright install chromium
python tests/e2e_browser.py     # core app in a real browser: 42 checks
python tests/e2e_v2.py          # device mode, offline, themes, habits, music, login, sync: 30 checks
```

Both browser tests start their own throwaway servers. Your real data is never touched.
GitHub runs the API tests on SQLite and Postgres on every push.

## Layout

```
logbook/
├── index.html, sw.js, manifest.webmanifest
├── assets/        icons
├── css/           style, shell (tokens + layout), features, extras (newer pieces), animations, responsive
├── js/
│   ├── app.js         startup and wiring
│   ├── api.js         the only file that talks to the data (server, or deviceStore.js)
│   ├── deviceStore.js the whole API, in the browser (IndexedDB), for device mode
│   ├── themes.js      the theme engine; themeSettings.js is its settings card
│   ├── music.js       soundtrack and mini player
│   └── ...            one module per feature
├── backend/       FastAPI app with Alembic migrations, plus tests/
├── scripts/       build_web.py (static build into dist/), make_icons.py
├── docs/          HOSTING.md, ANDROID.md
├── tests/         end-to-end browser tests
├── render.yaml, Dockerfile           hosting
├── capacitor.config.json, package.json, resources/   the Android app
└── .github/workflows/                Pages deploy, APK build, tests
```
