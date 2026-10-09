# Hosting Logbook

There are three ways to run Logbook, and you can mix them.

| | where your data lives | needs |
|---|---|---|
| **on your computer** | `backend/logbook.db` | Python |
| **the web app on GitHub Pages** | inside each browser (device mode) | a GitHub repo, free |
| **your own server on Render + Neon** | a Postgres database, reachable from every device; invite friends, each gets a private logbook | Render and Neon accounts, both free |

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
   - `LOGBOOK_PASSWORD`: your password as the admin (make it long: 4+ random words)
   - `LOGBOOK_ADMIN_USERNAME`: your username, e.g. `kal`
   - `LOGBOOK_AI_API_KEY`: optional, an Anthropic API key so the AI works on every device without putting the key in each browser
4. Deploy. Your logbook is at `https://logbook-xxxx.onrender.com`.

`LOGBOOK_SECRET` is generated for you; it signs login tokens. Changing your
password there logs your devices out.

**Inviting friends**

1. Log in, open settings → account → "invite someone". Type who it's for (only
   you see that) and press "make invite".
2. Copy the message and send it to them. The code works once, for 7 days.
3. They open the address, tap **join**, enter the code, pick a username and
   password. Their logbook starts empty and is theirs alone.

What you can see as the admin: their username and when they joined. What you
can't: anything they write. The app has no screen or API for it, and the tests
check every route for it. You can make a one-time **reset code** if someone
forgets their password, and **remove** an account (that deletes everything in
it).

Be honest with them about what this does and doesn't protect:

- The app can't show you their data. But you control the database, and the
  rows aren't encrypted per person: someone with your Neon login could read
  them. Keep your Neon and Render accounts locked down (strong password +
  two-factor).
- A reset code lets whoever holds it set that person's password. You could
  use one yourself to get in. It can't be done quietly: their old password
  stops working, and their account card says when a reset code was last used.
- Numbered things (tasks, activities, habits) share one counter across the
  server, so someone watching their own task numbers could tell roughly how
  many others were made in between. Nothing about what they say.

Settings for this: `LOGBOOK_MAX_USERS` (default 10), and
`LOGBOOK_AI_FOR_EVERYONE=true` if you want friends to use your server's AI key
(you pay for their usage; without it they can add their own key in settings).

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

**Backups (do this, it's a journal)**

Neon only keeps a short restore window on the free plan, so the repo backs
the database up itself: `.github/workflows/backup.yml` runs every Sunday,
dumps everything, encrypts it with your passphrase (AES-256) and keeps it 90
days as a workflow artifact. The repo is public; only the encrypted file is
uploaded.

1. Repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `DATABASE_URL`: the same Neon string
   - `BACKUP_PASSPHRASE`: a long passphrase. Save it in your password manager:
     without it the backups can't be opened by anyone, including you.
2. **Actions → database backup → Run workflow** once to check it works.

To restore: download the artifact from a run, then

```bash
gpg -d logbook-2026-10-11.dump.gpg > logbook.dump       # asks for the passphrase
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" logbook.dump
```

The in-app export (settings → your data) is a second, readable copy. Download
one now and then too.

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
| `LOGBOOK_PASSWORD` | turns on accounts, and is the admin's password. Without it anyone who can reach the server can read everything |
| `LOGBOOK_ADMIN_USERNAME` | the admin's username. Default `admin` |
| `LOGBOOK_MAX_USERS` | how many accounts in total, the admin included. Default 10 |
| `LOGBOOK_AI_FOR_EVERYONE` | `true` lets invited accounts use the server's AI key. Default `false` |
| `LOGBOOK_TRUST_PROXY` | read the client address from `X-Forwarded-For` (for the login limits). Default: on when running on Render, off elsewhere. Only turn it on behind a proxy that sets that header |
| `LOGBOOK_SECRET` | signs login tokens. If unset, a random one is created in `backend/.logbook-secret` (or `LOGBOOK_SECRET_FILE`) |
| `LOGBOOK_TOKEN_DAYS` | how long a login lasts. Default 30 |
| `LOGBOOK_ENVIRONMENT` | `production` refuses to start without `LOGBOOK_PASSWORD` |
| `LOGBOOK_AI_PROVIDER` | `anthropic` (default when a key is set) or `openai` (any OpenAI-compatible API) |
| `LOGBOOK_AI_API_KEY` | the provider key (also read from `ANTHROPIC_API_KEY`) |
| `LOGBOOK_AI_MODEL` | defaults: `claude-haiku-5-5`, `gpt-4o-mini` |
| `LOGBOOK_AI_BASE_URL` | for OpenAI-compatible APIs: OpenRouter, Groq, a local Ollama (`http://localhost:11434/v1`) |

## What's protected

- With a password set, every API route needs a login token, and every query
  is limited to the logged-in account. Other accounts' rows answer "not found".
- Passwords are stored as scrypt hashes; invite and reset codes as SHA-256
  hashes, single use, expiring.
- Wrong passwords: one address gets 5 tries at a username (10 overall) per 5
  minutes. Once a username draws 20 misses, or the server 30, every address
  that has missed is refused, so spreading over many addresses gets a guesser
  about one try each. A guesser can only lock out their own address: the real
  person, from their own device, still gets in. Wrong invite or reset codes
  count against the sender only.
- Invite and reset codes are claimed atomically: two people racing with one
  code can't both use it.
- When a different person logs in on a browser, the page reloads clean, so
  nothing of the last person's (chat, a half-typed page) carries over.
- Logging out clears what the browser kept (the companion chat, unsaved
  drafts, an AI key saved in that browser), so a shared phone doesn't leak.
- Without a password, only pages on the same computer may call the API, so a
  website you happen to visit can't read your local journal.
- The server only serves the app's own files (`index.html`, `css/`, `js/`,
  `assets/`, `sw.js`, the manifest). The backend code and the database file are
  never downloadable.
- AI keys set on the server never reach the browser. Spotify's player runs in a
  sandboxed frame that can't see the app, your login, or your keys.
