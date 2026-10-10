# Logbook: notes for Claude

Personal OS. Kal runs the server; a few friends get invite-only accounts, each fully private.
Default look is the "night" theme: Fuji under the stars, a quiet town, a lit corner shop.
Deep navy `#0a1430`, glass cards, window gold `#f4c56c` for actions and what's active,
street-lamp blue `#8ec8ff` for focus, links and selection, lantern `#f5ad7a`, soft red `#ec8f95`.
Type: Zen Maru Gothic for UI, Shippori Mincho for headings, the clock, the verse and the
companion's question (both self-hosted in `assets/fonts`, OFL). Moods are weather:
good = sun, okay = cloud-sun, rough = cloud-rain (`STATUS` in `entries.js`).
Voice: lowercase, short, plain, warm. No terminal jargon in the default look (no "> ",
".exe", "commit", status codes); the terminal theme keeps those touches in `themes.css`.
Icons, never emoji: `icon("name")` from `js/icons.js` (Lucide paths; add new names there),
or `<span data-icon="name">` in static HTML.

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

- Every color in the CSS is a token from `base.css :root`. Colors with alpha use channel vars:
  `rgb(var(--accent-rgb) / 0.3)`. Never write a hex or rgba literal in CSS or inline styles;
  mood colors come from `STATUS` in `entries.js` (`s.color`, `s.tint(alpha)`).
- `js/themes.js` turns a small theme object into those vars; the night theme reproduces the
  CSS defaults exactly. `index.html` applies the saved vars inline before first paint.
  Scene colors (`scene.css`) are mixed from the tokens with `color-mix()`.
- The dashboard window and the lock screen draw `js/scene.js` (SVG); `js/background.js` draws the
  moving sky (night stars, rain on the window, falling code, snow, fireflies).
- Theme switches show as attributes on `<html>`: `data-scanlines`, `data-glow`, `data-background`,
  `data-theme-mode`. `js/background.js` draws the animated layer from the theme's vars.

## CSS files

`base.css` fonts, tokens, type, buttons, fields, cards; `layout.css` sidebar / tab bar, page
grids, overlays; `scene.css` the night (page sky, dashboard window, lock screen); `components.css`
every feature, in page order; `themes.css` per-theme touches; `motion.css` all keyframes.
Buttons: `.primary-btn` (lit, one per area), `.tool-btn`, `.icon-btn`, `.chip`, `.seg-btn` in a
`.segmented`. Motion answers the user (press, check, open); the only ambient motion is the sky.

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
