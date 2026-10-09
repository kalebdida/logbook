# Logbook backend

FastAPI + SQLAlchemy 2, on SQLite or PostgreSQL. Serves the API and the
frontend from one process. See the root README for running the whole app and
[docs/HOSTING.md](../docs/HOSTING.md) for putting it online.

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://127.0.0.1:8000, docs at /docs
pip install -r requirements-dev.txt
python -m pytest -q                    # 51 API tests, throwaway database
TEST_DATABASE_URL=postgresql://user@host/db python -m pytest -q   # same tests on Postgres
```

## Endpoints

| resource | endpoints |
|---|---|
| auth | `GET /auth/status`, `POST /auth/login {username, password}` → `{token, expires_at, user}`, `POST /auth/signup {invite, username, password}`, `POST /auth/reset {username, code, password}`, `GET /auth/me`, `POST /auth/password {current, new}`, `POST /auth/logout-everywhere`, `POST /auth/delete-account {password}` |
| admin | `POST/GET /auth/invites`, `DELETE /auth/invites/{id}`, `GET /auth/users` (names and dates only), `POST /auth/users/{id}/reset-code`, `DELETE /auth/users/{id} {password}` |
| entries | `POST/GET /entries/`, `GET/PATCH/DELETE /entries/{id}` |
| day records | `PUT/GET/DELETE /days/{date}`, `GET /days/` (PUT is a partial update) |
| tasks | `POST/GET /tasks/` (filters: `day_date`, `before`, `completed`), `PATCH/DELETE /tasks/{id}` (PATCH can move `day_date`) |
| activities | `POST/GET /activities/`, `PATCH/DELETE /activities/{id}` |
| goals | `POST/GET /goals/`, `GET/PATCH/DELETE /goals/{id}` |
| habits | `POST/GET /habits/` (`include_archived`), `PATCH/DELETE /habits/{id}`, `GET /habits/logs?start&end`, `PUT/DELETE /habits/{id}/days/{date}` (check / uncheck, idempotent) |
| focus | `POST /pomodoro/{date}/sessions` (adds one block), `GET /pomodoro/{date}`, `GET /pomodoro/` |
| AI | `GET /ai/status`, `POST /ai/chat {messages, system, max_tokens}` (the key stays on the server) |
| backup | `GET /backup` (everything), `POST /backup/restore` (additive, safe to repeat) |
| health | `GET /health` (status, version, whether a login is needed; your own row counts once logged in) |

## Accounts

No `LOGBOOK_PASSWORD`: no login, every request is user 1. Only for a server
only you can reach (CORS then allows localhost only).

With `LOGBOOK_PASSWORD`: invite-only accounts.

- User 1 is the admin: `LOGBOOK_ADMIN_USERNAME` (default `admin`) + `LOGBOOK_PASSWORD`.
  Changed in the host's settings, not in the app. An empty username at login means the admin.
- Others join with a one-time invite code (`POST /auth/invites`, 7 days, single use, only its
  SHA-256 is stored). Passwords: 10+ characters, stored as scrypt hashes.
- **Every data table has `user_id`, and every query filters on the logged-in account.**
  Rows from other accounts answer 404. `tests/test_accounts.py` checks every route.
  The admin endpoints show names and join dates, never content.
- Everything except `/health` and `/auth/*` needs `Authorization: Bearer <token>`.
  Tokens are `v2.<user>.<version>.<expiry>.<hmac>`, signed with a key mixed from
  `LOGBOOK_SECRET` and that account's password (hash), so a password change signs that
  account out everywhere; `token_version` does it on demand.
- Login limits (`check_not_locked`): 5 misses per address+username, 10 per address, in 5 minutes. Past 20 misses
  on a username or 30 server-wide, any address that has missed is refused; fresh addresses still get in, so
  nobody can lock someone else out. Bad invite/reset codes count against the address only.
  `X-Forwarded-For` is read only with `LOGBOOK_TRUST_PROXY` (default: on under Render).
- Invite and reset codes are claimed with `UPDATE ... WHERE used_at IS NULL` in the same transaction as the
  account change: one winner per code.
- `GET /auth/me` returns `last_reset_at`, shown to the person, so an admin-made reset can't go unnoticed.
- The server's AI key is the admin's: other accounts use it only with `LOGBOOK_AI_FOR_EVERYONE=true`.
- `LOGBOOK_MAX_USERS` (default 10) caps accounts.

What this doesn't do:
- encrypt each account's rows. Whoever controls the database (the Neon dashboard, a `pg_dump`) can read them.
- stop the admin using a reset code on someone. It's visible: their old password stops working and
  `last_reset_at` shows on their account card.
- hide how busy the server is: tasks, activities and habits share one id counter across accounts.

## Rules worth knowing

- Timestamps are stored in UTC and returned with a `Z` suffix. Dates (`YYYY-MM-DD`) are the user's local day.
- Goal `completed` is derived: `progress == 100`. `completed_at` is set on the way in and cleared on the way out.
- Tasks and activities have a foreign key to `day_records (user_id, date)`. The routers create the day if it's missing.
- New data routes: take `uid: int = Depends(current_user_id)`, filter every query on `user_id == uid`,
  set `user_id=uid` on every insert, and add the route to `tests/test_accounts.py`.
- Life areas are validated against `ActivityCategory` in `app/schemas/common.py`.
- The schema is managed by Alembic (`migrations/`). On startup the app upgrades to the latest revision.
  A database made by an older version (tables, no `alembic_version`) is stamped at the baseline and
  upgraded; `0002_accounts` rebuilds every data table, copying what exists into user 1. New schema changes: `alembic revision -m "..."` in this folder, then write
  the upgrade.
- `../js/deviceStore.js` implements this same API in the browser for device mode. Keep the two in step
  (validation, field names, status codes).
- Only the app's own files are served (`index.html`, `sw.js`, the manifest, `css/`, `js/`, `assets/`). Never
  widen that to the whole project folder: it holds this backend and the database.

## Layout

```
app/
├── main.py       app, CORS, /health, serves the frontend (allowlisted files only)
├── config.py     settings from env / backend/.env
├── auth.py       accounts: password hashing, tokens, who-is-this-request, lockout
├── ai.py         server-side calls to Anthropic or OpenAI-compatible APIs
├── database.py   engine, sessions, migrations on startup
├── models/       one file per table
├── schemas/      request/response shapes (common.py: UTC datetimes, categories, moods)
└── routers/      one file per resource, plus backup.py, auth.py, ai.py
migrations/       Alembic
tests/            pytest suite
```
