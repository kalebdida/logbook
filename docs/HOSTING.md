# Hosting Logbook

There are three ways to run Logbook, and you can mix them.

| | Where your data lives | Needs |
|---|---|---|
| **On your computer** | `backend/logbook.db` | Python |
| **The web app on GitHub Pages** | Inside each browser (device mode), or on your server | A GitHub repo, free |
| **Your own server on Render + Neon** | A Postgres database, reachable from every device. Invite friends, each gets a private logbook | Render and Neon accounts, both free |

## The recommended setup: Pages front door, Render API, Neon database

```
 you, on any device
        |
        v
 https://kalebdida.github.io/logbook/      GitHub Pages: the app itself (always awake, clean link)
        |  API calls (login token, no cookies)
        v
 https://logbook-xxxx.onrender.com         Render: the Logbook API (sleeps when idle)
        |
        v
 Neon                                      Postgres: your data (free, doesn't expire)
```

Why this way round: if you open the Render address directly and the server is
asleep, Render shows its own "waking up" page first. GitHub Pages never sleeps,
so the app opens at once, on a clean link, and its own loading screen covers
the minute Render takes to wake. Nothing you type is lost while it waits.

Set it up in this order.

### 1. Neon (the database)

Render's free instances have no persistent disk (the filesystem is wiped on
every restart), so the database has to live somewhere else. Neon's free plan
doesn't expire and needs no card. Render's own free Postgres is deleted after
30 days, so don't use that for a journal.

1. Sign up at neon.com and create a project. Pick the region closest to you;
   for Addis Ababa that's usually Frankfurt (`aws-eu-central-1`).
2. Copy the connection string (Dashboard → Connect). It looks like
   `postgresql://user:password@ep-something.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

### 2. Render (the API)

1. Sign up at render.com with GitHub.
2. **New → Blueprint**, pick this repo. Render reads `render.yaml`.
3. It asks for the values marked `sync: false`:
   - `DATABASE_URL`: the Neon string.
   - `LOGBOOK_PASSWORD`: your password as the admin. Make it long: 4 or more random words.
   - `LOGBOOK_ADMIN_USERNAME`: your username, e.g. `kal`.
   - `LOGBOOK_CORS_ORIGINS`: the Pages origin, e.g. `https://kalebdida.github.io`.
     Scheme and host only, no `/logbook/` path, no trailing slash. Add a custom
     domain here too if you set one up later, comma-separated.
   - `LOGBOOK_AI_API_KEY`: optional, your Gemini key (see step 5). Leave it
     empty for now if you don't have one yet.
4. Deploy. Copy the address Render gives you, e.g. `https://logbook-xxxx.onrender.com`.
   Check it answers: `https://logbook-xxxx.onrender.com/health` should show
   `"status": "online"`.

`LOGBOOK_SECRET` is generated for you; it signs login tokens. Changing your
password there logs your devices out.

About `LOGBOOK_CORS_ORIGINS`: with a password set, the server already accepts
calls from any site, because logins use a token the browser only sends from
the app itself (no cookies another site could ride on). Setting the Pages
origin anyway keeps the front door working if you ever run the server
without a password, and documents which site is yours.

### 3. GitHub Pages (the front door)

1. Repo **Settings → Secrets and variables → Actions → Variables → New
   repository variable**: name `LOGBOOK_API_URL`, value your Render address
   (`https://logbook-xxxx.onrender.com`, no trailing slash).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`, or run **Actions → web app (GitHub Pages) → Run workflow**.
   The site appears at `https://<your-username>.github.io/<repo>/`.
4. Open it. It finds your server by itself and shows the login screen. The
   first visit after a quiet spell shows the loading screen for up to a minute
   while Render wakes up.

How it works: the build writes your server address into `config.js`. A
browser's first visit uses it and remembers the choice. If a browser opened
the Pages copy before you set the variable, it remembered "this device"
instead: switch it in settings → where your data lives → connect to a server.

Without `LOGBOOK_API_URL`, the Pages copy runs in **device mode**: everything
is saved in that browser (IndexedDB), it works offline, and it can be
installed as an app. Back it up from settings now and then, because clearing
the browser's site data deletes it.

### 4. Optional: your own domain

The GitHub Student Developer Pack includes a free domain for a year (a `.me`
from Namecheap, or a `.tech` from get.tech). After the first year it renews at
the normal price, so note the date.

1. Claim the domain through the Student Pack offer page.
2. Repo **Settings → Pages → Custom domain**: enter e.g. `logbook.kalebdida.me`
   and save.
3. At your domain's DNS settings (Namecheap: Domain List → Manage → Advanced
   DNS), add a record:
   - Type `CNAME`, host `logbook`, value `kalebdida.github.io` (your GitHub
     username, then `.github.io`).
   For the bare domain (`kalebdida.me` with no `logbook.` in front), GitHub
   wants A records instead; their "Managing a custom domain" page lists the
   addresses.
4. Wait for the DNS check to pass (minutes, sometimes an hour), then tick
   **Enforce HTTPS**.
5. On Render, add the new origin to `LOGBOOK_CORS_ORIGINS`:
   `https://kalebdida.github.io,https://logbook.kalebdida.me`.

The workflow deploys with GitHub Actions, so you don't need a `CNAME` file in
the repo; the setting is enough.

### 5. The AI companion with Gemini (free)

1. Go to Google AI Studio (aistudio.google.com/apikey), sign in, press
   **Get API key → Create API key**, and copy it.
2. On Render, set `LOGBOOK_AI_API_KEY` to that key. `LOGBOOK_AI_PROVIDER` is
   already `gemini` in `render.yaml`. Save; Render redeploys.
3. Settings → AI companion should now say it's on, through your server.

The default model is `gemini-3.5-flash-lite`. For stronger answers set
`LOGBOOK_AI_MODEL=gemini-3.8-flash` (also on the free tier, with lower daily
limits). The key stays on the server and never reaches the browser.

Be clear about the free tier: it has daily limits, and Google's terms for
unpaid use allow it to use what you send to improve its products, which can
include human review. The companion only sends entry text when "let AI read
entry text" is on in settings; leave it off if that bothers you.

A device-mode copy (no server) can use Gemini too: settings → AI companion →
Gemini, and paste the key. It's saved in that browser only.

### 6. Optional: keep the server awake

`.github/workflows/keepwarm.yml` pings `LOGBOOK_API_URL/health` every 14
minutes so Render doesn't put the server to sleep. It uses the same repo
variable and does nothing when it's unset.

It helps, but it isn't a guarantee. GitHub's scheduled runs are best effort:
they often start several minutes late and some get dropped when GitHub is
busy, so the server will still nap now and then (the loading screen covers
it). GitHub also switches scheduled workflows off in a public repo after 60
days without commits; turn it back on from the Actions tab. Keeping one
service awake all month uses about 730 of Render's 750 free instance hours, so
it's fine for one service but not two. To stop it, disable the workflow in the
Actions tab.

## Inviting friends

1. Log in, open settings → account → "invite someone". Type who it's for (only
   you see that) and press "make invite".
2. Copy the message and send it to them, with the Pages address (or your
   custom domain). The code works once, for 7 days.
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
- If you share your server's AI with them (`LOGBOOK_AI_FOR_EVERYONE=true`),
  what they send the companion goes to your AI provider under your key and
  its terms (see the Gemini note above).

Settings for this: `LOGBOOK_MAX_USERS` (default 10), and
`LOGBOOK_AI_FOR_EVERYONE=true` if you want friends to use your server's AI key.
Without it they can add their own key in settings.

## Free-tier behavior to expect

- Render puts the service to sleep after 15 minutes without traffic and takes
  about a minute to wake it. The app keeps trying for up to 90 seconds and
  shows its loading screen meanwhile. If the server still isn't up, it says so
  plainly and keeps checking in the background.
- Neon suspends the database after 5 minutes idle and resumes on the next
  query in about a second.
- Render gives 750 free instance hours a month, enough for one service running
  all month.

## Moving your existing data up

Open the app, log in, then settings → your data → import a file, and pick a
backup downloaded from your local copy. Or, from a device-mode copy: settings
→ where your data lives → connect to a server (with "copy what's here" on).

## Backups (do this, it's a journal)

Neon only keeps a short restore window on the free plan, so the repo backs
the database up itself: `.github/workflows/backup.yml` runs every Sunday,
dumps everything, encrypts it with your passphrase (AES-256) and keeps it 90
days as a workflow artifact. The repo is public; only the encrypted file is
uploaded.

1. Repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `DATABASE_URL`: the same Neon string.
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

## Other ways to run it

**Render alone.** You can skip Pages and open the Render address directly; the
server serves the app too. You'll see Render's waking page after quiet spells.

**Any other host (Docker).** `Dockerfile` builds one image with the API and the
app. Data goes in `/data` (SQLite) unless you set `DATABASE_URL`.

```bash
docker build -t logbook .
docker run -p 8000:8000 -e LOGBOOK_PASSWORD='long password' -v logbook-data:/data logbook
```

Works on Fly.io, Railway, a VPS, or a Raspberry Pi. Put it behind HTTPS.

**A static build by hand.** `python3 scripts/build_web.py` builds `dist/` for
any static host. `LOGBOOK_API_URL=https://... python3 scripts/build_web.py`
points it at your server.

## Settings reference

Server (environment variables on Render, or `backend/.env`):

| Variable | What it does |
|---|---|
| `DATABASE_URL` | `postgresql://...` or `sqlite:///path`. Default: `backend/logbook.db` |
| `LOGBOOK_PASSWORD` | Turns on accounts, and is the admin's password. Without it anyone who can reach the server can read everything |
| `LOGBOOK_ADMIN_USERNAME` | The admin's username. Default `admin` |
| `LOGBOOK_MAX_USERS` | How many accounts in total, the admin included. Default 10 |
| `LOGBOOK_CORS_ORIGINS` | Sites allowed to call the API from a browser, comma-separated, e.g. `https://kalebdida.github.io`. Added to the defaults: any site when a password is set, only this computer when not |
| `LOGBOOK_AI_FOR_EVERYONE` | `true` lets invited accounts use the server's AI key. Default `false` |
| `LOGBOOK_TRUST_PROXY` | Read the client address from `X-Forwarded-For` (for the login limits). Default: on when running on Render, off elsewhere. Only turn it on behind a proxy that sets that header |
| `LOGBOOK_SECRET` | Signs login tokens. If unset, a random one is created in `backend/.logbook-secret` (or `LOGBOOK_SECRET_FILE`) |
| `LOGBOOK_TOKEN_DAYS` | How long a login lasts. Default 30 |
| `LOGBOOK_ENVIRONMENT` | `production` refuses to start without `LOGBOOK_PASSWORD` |
| `LOGBOOK_AI_PROVIDER` | `gemini`, `anthropic` or `openai` (any OpenAI-compatible API). Unset: a `LOGBOOK_AI_API_KEY` means `anthropic`, a `GEMINI_API_KEY` alone means `gemini` |
| `LOGBOOK_AI_API_KEY` | The provider key (also read from `ANTHROPIC_API_KEY`, and for Gemini from `GEMINI_API_KEY`) |
| `LOGBOOK_AI_MODEL` | Defaults: `gemini-3.5-flash-lite`, `claude-haiku-5-5`, `gpt-4o-mini` |
| `LOGBOOK_AI_BASE_URL` | For OpenAI-compatible APIs: OpenRouter, Groq, a local Ollama (`http://localhost:11434/v1`) |

GitHub repo (Settings → Secrets and variables → Actions):

| Name | Kind | What it does |
|---|---|---|
| `LOGBOOK_API_URL` | Variable | Your server's address. The Pages build points the app at it, and the keep-awake workflow pings it |
| `DATABASE_URL` | Secret | The Neon string, for the weekly backup |
| `BACKUP_PASSPHRASE` | Secret | Encrypts the weekly backup |

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
- Logins use a token, not cookies, so another website can't make your browser
  act on your logbook. That's why the API can accept calls from the Pages
  front door (and the Android app) safely.
- Without a password, only pages on the same computer (plus any sites in
  `LOGBOOK_CORS_ORIGINS`) may call the API, so a website you happen to visit
  can't read your local journal.
- The server only serves the app's own files (`index.html`, `config.js`,
  `css/`, `js/`, `assets/`, `sw.js`, the manifest). The backend code and the
  database file are never downloadable.
- AI keys set on the server never reach the browser. Spotify's player runs in a
  sandboxed frame that can't see the app, your login, or your keys.
