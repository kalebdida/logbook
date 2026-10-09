# Hosting Logbook

There are three ways to run Logbook, and you can mix them.

| | where your data lives | needs |
|---|---|---|
| **on your computer** | `backend/logbook.db` | Python |
| **the web app on GitHub Pages** | inside each browser (device mode) | a GitHub repo, free |
| **your own server on Render + Neon** | a Postgres database, reachable from every device | Render and Neon accounts, both free |

The usual setup: put the server on Render + Neon so every device shares one
logbook, and keep the GitHub Pages copy as a fast, offline-first front door
that connects to it.

## 1. The web app on GitHub Pages (device mode)

Every push to `main` publishes the app (`.github/workflows/pages.yml`).

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push (or run the "web app (GitHub Pages)" workflow by hand). The site appears at
   `https://<your-username>.github.io/<repo>/`.

With no server next to it, the app runs in **device mode**: everything is
saved in that browser (IndexedDB), it works offline, and it can be installed as
an app. Back it up from settings now and then: clearing the browser's site
data deletes it. Settings → "where your data lives" connects it to a server
later and copies what's there.

## 2. Your own server: Render (app) + Neon (database)

Render's free web service runs the app; Neon's free Postgres holds the data.
Render's free instances have no persistent disk (the filesystem is wiped on
every restart), so the database has to live somewhere else. Neon's free plan
doesn't expire and needs no card. Render's own free Postgres is deleted after
30 days, so don't use that for a journal.

**Neon**

1. Sign up at neon.com, create a project (pick the region closest to you; for
   Addis Ababa that's usually Frankfurt, `aws-eu-central-1`).
2. Copy the connection string (Dashboard → Connect). It looks like
   `postgresql://user:password@ep-something.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

**Render**

1. Sign up at render.com with GitHub.
2. **New → Blueprint**, pick this repo. Render reads `render.yaml`.
3. It asks for the values marked `sync: false`:
   - `DATABASE_URL`: the Neon string
   - `LOGBOOK_PASSWORD`: the password you'll log in with (make it long)
   - `LOGBOOK_AI_API_KEY`: optional, an Anthropic API key so the AI works on every device without putting the key in each browser
4. Deploy. Your logbook is at `https://logbook-xxxx.onrender.com`.

`LOGBOOK_SECRET` is generated for you; it signs login tokens. Changing the
password logs every device out.

**Free-tier behavior to expect**

- Render puts the service to sleep after 15 minutes without traffic and takes
  about a minute to wake it. The app waits for it; the first load after a quiet
  spell is just slow.
- Neon suspends the database after 5 minutes idle and resumes on the next
  query in about a second.
- Render gives 750 free instance hours a month, enough for one service running
  all month.

**Moving your existing data up**

Open the new server in your browser, log in, then settings → your data →
import a file, and pick a backup downloaded from your local copy. Or, from a
device-mode copy: settings → where your data lives → connect to a server
(with "copy what's here" on).

## 3. Any other host (Docker)

`Dockerfile` builds one image with the API and the app. Data goes in `/data`
(SQLite) unless you set `DATABASE_URL`.

```bash
docker build -t logbook .
docker run -p 8000:8000 -e LOGBOOK_PASSWORD='long password' -v logbook-data:/data logbook
```

Works on Fly.io, Railway, a VPS, or a Raspberry Pi. Put it behind HTTPS.

## Settings reference

| variable | what it does |
|---|---|
| `DATABASE_URL` | `postgresql://...` or `sqlite:///path`. Default: `backend/logbook.db` |
| `LOGBOOK_PASSWORD` | turns on the lock screen. Without it anyone who can reach the server can read everything |
| `LOGBOOK_SECRET` | signs login tokens. If unset, a random one is created in `backend/.logbook-secret` (or `LOGBOOK_SECRET_FILE`) |
| `LOGBOOK_TOKEN_DAYS` | how long a login lasts. Default 30 |
| `LOGBOOK_ENVIRONMENT` | `production` refuses to start without `LOGBOOK_PASSWORD` |
| `LOGBOOK_AI_PROVIDER` | `anthropic` (default when a key is set) or `openai` (any OpenAI-compatible API) |
| `LOGBOOK_AI_API_KEY` | the provider key (also read from `ANTHROPIC_API_KEY`) |
| `LOGBOOK_AI_MODEL` | defaults: `claude-haiku-5-5`, `gpt-4o-mini` |
| `LOGBOOK_AI_BASE_URL` | for OpenAI-compatible APIs: OpenRouter, Groq, a local Ollama (`http://localhost:11434/v1`) |

## What's protected

- With a password set, every API route needs a login token. Wrong passwords
  lock the login for 5 minutes: after 5 tries from one address, or 30 from
  everyone together, so changing addresses doesn't help a guesser.
- Without a password, only pages on the same computer may call the API, so a
  website you happen to visit can't read your local journal.
- The server only serves the app's own files (`index.html`, `css/`, `js/`,
  `assets/`, `sw.js`, the manifest). The backend code and the database file are
  never downloadable.
- AI keys set on the server never reach the browser. Spotify's player runs in a
  sandboxed frame that can't see the app, your login, or your keys.
