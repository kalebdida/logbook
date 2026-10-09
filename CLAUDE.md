# Logbook: notes for Claude

Personal OS. Kal runs the server; a few friends get invite-only accounts, each fully private. Default look is the terminal/CRT theme: near-black,
phosphor green `#7ce8a0`, teal `#4dd0c4`, amber `#e8b95c`, red `#c96a6a`, monospace,
serif italic only for the verse and the companion's question. Moods are HTTP-style
statuses: good = 200 OK, okay = 102 PROCESSING, rough = 500 ERROR. Keep that voice
(lowercase, short, plain) in all UI text.

## Run and test

- `cd backend && uvicorn app.main:app --reload`, open http://127.0.0.1:8000 (the backend serves the frontend)
- API tests: `cd backend && python -m pytest -q` (add `TEST_DATABASE_URL=postgresql://...` for Postgres)
- Browser tests: `python tests/e2e_browser.py` (core), `python tests/e2e_v2.py` (device mode,
  offline, themes, habits, music, login, sync) and `python tests/e2e_accounts.py` (invites, privacy
  between accounts). Run all three after any frontend change.
- Static build (Pages / Android): `python3 scripts/build_web.py` → `dist/`

## Architecture

- Frontend: vanilla ES modules, no build step, no framework. `js/app.js` boots everything.
- Two data modes (`js/connection.js`): **server** (the FastAPI backend) and **device**
  (`js/deviceStore.js`, the same API on IndexedDB). A static copy with no server picks device mode.
- `js/api.js` is the only place that calls the data layer and the only place that maps
  snake_case API fields to camelCase. Add an endpoint in three places: backend router,
  `deviceStore.js` route, `api.js` wrapper.
- `js/bus.js`: `emitChange(kind)` after any write; views listen with `onChange`.
- `js/prefs.js`: per-browser settings. Journal data never goes in localStorage.
- Pages are `<section class="nav-page" data-nav-page="...">`; routing is the URL hash.
- Commands live in `js/palette.js` (`COMMANDS`). Any element with `data-command="id"` runs one.
- Life areas: `js/categories.js` and `ActivityCategory` in `backend/app/schemas/common.py`. Keep them identical.
- Show/hide with the `hidden` attribute (`[hidden]` is `display:none !important`). Don't add
  `display:none` defaults to elements that JS toggles.

## Themes

- Every color in the CSS is a token from `shell.css :root`. Colors with alpha use channel vars:
  `rgb(var(--accent-rgb) / 0.3)`. Never write a hex or rgba literal in CSS or inline styles;
  mood colors come from `STATUS` in `entries.js` (`s.color`, `s.tint(alpha)`).
- `js/themes.js` turns a small theme object into those vars; the terminal theme reproduces the
  CSS defaults exactly. `index.html` applies the saved vars inline before first paint.
- Theme switches show as attributes on `<html>`: `data-scanlines`, `data-glow`, `data-background`,
  `data-theme-mode`. `js/background.js` draws the animated layer from the theme's vars.

## CSS files

`style.css` components, `shell.css` tokens and layout, `features.css` mid-era pieces,
`extras.css` themes / lock / habits / music / chat, `animations.css`, `responsive.css`.

## Backend

- FastAPI + SQLAlchemy 2. SQLite at `backend/logbook.db` by default, Postgres via `DATABASE_URL`.
- Alembic owns the schema (`backend/migrations`); startup upgrades to head.
- Every datetime in or out uses `UTCDateTime` (schemas/common.py). Day keys are the browser's local date.
- Accounts only when `LOGBOOK_PASSWORD` is set (`app/auth.py`, `app/routers/auth.py`); user 1 is the admin.
  **Every data query filters on `user_id`**: new routes take `uid = Depends(current_user_id)`, and
  `tests/test_accounts.py` must cover them. The admin never gets an endpoint that reads others' data.
- AI keys on the server never reach the browser; invited accounts use it only with `LOGBOOK_AI_FOR_EVERYONE`.
- The static mount serves an allowlist only. Never serve the project root wholesale.

## Hosting and Android

- `docs/HOSTING.md`: GitHub Pages (device mode), Render + Neon, Docker.
- `docs/ANDROID.md`: Capacitor 8; `.github/workflows/android.yml` builds a debug APK.
