# Logbook backend

FastAPI + SQLAlchemy 2, on SQLite or PostgreSQL. Serves the API and the
frontend from one process. See the root README for running the whole app and
[docs/HOSTING.md](../docs/HOSTING.md) for putting it online.

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://127.0.0.1:8000, docs at /docs
pip install -r requirements-dev.txt
python -m pytest -q                    # 27 API tests, throwaway database
TEST_DATABASE_URL=postgresql://user@host/db python -m pytest -q   # same tests on Postgres
```

## Endpoints

| resource | endpoints |
|---|---|
| auth | `GET /auth/status`, `POST /auth/login {password}` → `{token, expires_at}` |
| entries | `POST/GET /entries/`, `GET/PATCH/DELETE /entries/{id}` |
| day records | `PUT/GET/DELETE /days/{date}`, `GET /days/` (PUT is a partial update) |
| tasks | `POST/GET /tasks/` (filters: `day_date`, `before`, `completed`), `PATCH/DELETE /tasks/{id}` (PATCH can move `day_date`) |
| activities | `POST/GET /activities/`, `PATCH/DELETE /activities/{id}` |
| goals | `POST/GET /goals/`, `GET/PATCH/DELETE /goals/{id}` |
| habits | `POST/GET /habits/` (`include_archived`), `PATCH/DELETE /habits/{id}`, `GET /habits/logs?start&end`, `PUT/DELETE /habits/{id}/days/{date}` (check / uncheck, idempotent) |
| focus | `POST /pomodoro/{date}/sessions` (adds one block), `GET /pomodoro/{date}`, `GET /pomodoro/` |
| AI | `GET /ai/status`, `POST /ai/chat {messages, system, max_tokens}` (the key stays on the server) |
| backup | `GET /backup` (everything), `POST /backup/restore` (additive, safe to repeat) |
| health | `GET /health` (status, version, whether a login is needed; row counts once logged in) |

With `LOGBOOK_PASSWORD` set, everything except `/health` and `/auth/*` needs
`Authorization: Bearer <token>`. Tokens are HMAC-signed with a key derived
from the password and `LOGBOOK_SECRET`, so changing either logs everyone out.
Five wrong passwords in five minutes locks login for five minutes.

## Rules worth knowing

- Timestamps are stored in UTC and returned with a `Z` suffix. Dates (`YYYY-MM-DD`) are the user's local day.
- Goal `completed` is derived: `progress == 100`. `completed_at` is set on the way in and cleared on the way out.
- Tasks and activities have a foreign key to `day_records.date`. The routers create the day if it's missing.
- Life areas are validated against `ActivityCategory` in `app/schemas/common.py`.
- The schema is managed by Alembic (`migrations/`). On startup the app upgrades to the latest revision.
  A database made by an older version (tables, no `alembic_version`) gets its missing columns added and
  is stamped at the baseline. New schema changes: `alembic revision -m "..."` in this folder, then write
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
├── auth.py       password check, tokens, login throttling
├── ai.py         server-side calls to Anthropic or OpenAI-compatible APIs
├── database.py   engine, sessions, migrations on startup
├── models/       one file per table
├── schemas/      request/response shapes (common.py: UTC datetimes, categories, moods)
└── routers/      one file per resource, plus backup.py, auth.py, ai.py
migrations/       Alembic
tests/            pytest suite
```
