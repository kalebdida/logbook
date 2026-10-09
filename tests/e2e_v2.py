"""End-to-end test for the v2 features: device mode (no server), offline,
themes, habits, music, password login, and moving data from a device to a
server. Complements tests/e2e_browser.py (which covers the core app).

Starts two throwaway servers (your real data is never touched):
  - a static copy of the web app (dist/) on :8766, so it runs in device mode
  - a password-protected Logbook server on :8767

  pip install playwright && playwright install chromium
  python tests/e2e_v2.py
"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.error, urllib.request, wave, math
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
WORK = Path(tempfile.mkdtemp(prefix="logbook-e2e2-"))
STATIC_PORT, SERVER_PORT = 8766, 8767
STATIC = f"http://127.0.0.1:{STATIC_PORT}"
SERVER = f"http://127.0.0.1:{SERVER_PORT}"
PASSWORD = "correct horse"
results, errors, procs = [], [], []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"), flush=True)


def wait_for(url):
    for _ in range(80):
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except urllib.error.HTTPError:
            return
        except Exception:
            time.sleep(0.25)
    raise SystemExit("didn't start: " + url)


def api(path, token="", method="GET", body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(SERVER + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    raw = urllib.request.urlopen(req).read()
    return json.loads(raw) if raw else None


def status_of(path, token=""):
    try:
        api(path, token)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


# ---------- servers ----------
subprocess.run([sys.executable, str(ROOT / "scripts" / "build_web.py")], check=True, stdout=subprocess.DEVNULL)
procs.append(subprocess.Popen([sys.executable, "-m", "http.server", str(STATIC_PORT), "--bind", "127.0.0.1"],
                              cwd=ROOT / "dist", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
env = {k: v for k, v in os.environ.items() if not k.startswith("LOGBOOK_") and k != "DATABASE_URL"}
env.update(DATABASE_URL=f"sqlite:///{(WORK / 'server.db').as_posix()}", LOGBOOK_PASSWORD=PASSWORD, LOGBOOK_SECRET="e2e-secret")
procs.append(subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(SERVER_PORT)],
                              cwd=BACKEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
wait_for(STATIC + "/index.html")
wait_for(SERVER + "/health")

# a 2-second tone to use as "music"
song = WORK / "07 - Test Artist - Night Drive.wav"
w = wave.open(str(song), "wb")
w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
w.writeframes(b"".join(struct.pack("<h", int(6000 * math.sin(2 * math.pi * 330 * i / 8000))) for i in range(16000)))
w.close()
theme_file = WORK / "theme.json"
theme_file.write_text(json.dumps({"logbook_theme": 1, "theme": {"name": "imported sea", "mode": "dark", "colors": {
    "bg": "#03121a", "surface": "#08202b", "text": "#e0f7ff", "text2": "#b4dcea", "muted": "#7fa7b5",
    "accent": "#3fd0ff", "accent2": "#7cffd4", "warm": "#ffd27c", "danger": "#ff7b7b"},
    "font": "sans", "background": "stars", "scanlines": False, "glow": False, "roundness": "round"}}))


# stands in for Spotify's iframe API (this test never touches the internet)
FAKE_SPOTIFY = """
(function () {
  var api = { createController: function (el, opts, cb) {
    var listeners = {}, paused = true;
    var c = {
      addListener: function (n, f) { (listeners[n] = listeners[n] || []).push(f); },
      emit: function (n, d) { (listeners[n] || []).forEach(function (f) { f({ data: d }); }); },
      play: function () { paused = false; c.emit("playback_update", { isPaused: false }); },
      pause: function () { paused = true; c.emit("playback_update", { isPaused: true }); },
      togglePlay: function () { paused ? c.play() : c.pause(); },
      loadUri: function (u) { el.textContent = "FAKE PLAYER " + u; }
    };
    el.textContent = "FAKE PLAYER " + opts.uri;
    cb(c);
    setTimeout(function () { c.emit("ready", {}); }, 10);
  } };
  setTimeout(function () { window.onSpotifyIframeApiReady(api); }, 0);
})();
"""


def boot(page, url):
    page.goto(url)
    page.wait_for_selector("#todayConsole .console-clock", timeout=15000)
    page.keyboard.press("Escape")
    page.wait_for_function("document.body.classList.contains('is-booted') || document.getElementById('boot').hidden", timeout=8000)


def reload(page):
    page.reload()
    page.wait_for_function("window.__logbook !== undefined", timeout=15000)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def dev(page, path, method="GET", body=None):
    """call the app's own API router (device store or server) from the page"""
    return page.evaluate("""([path, method, body]) => window.__logbook.request(path, method === 'GET' ? {} :
        { method, headers: {'Content-Type': 'application/json'}, body: body == null ? undefined : JSON.stringify(body) })""", [path, method, body])


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = browser.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True, timezone_id="Africa/Addis_Ababa")
        ctx.route("https://open.spotify.com/embed/iframe-api/v1", lambda route: route.fulfill(content_type="text/javascript", body=FAKE_SPOTIFY))
        page = ctx.new_page()
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        # ---------- device mode ----------
        boot(page, STATIC + "/")
        check("static copy starts in device mode", page.evaluate("document.body.dataset.mode") == "device")
        check("status says data is on this device", "device" in page.text_content("#statusLabel"), page.text_content("#statusLabel"))

        page.keyboard.press("n")
        page.click('.mood-btn[data-mood="good"]')
        page.fill("#entryText", "written with no server at all")
        page.keyboard.press("Control+Enter")
        page.wait_for_timeout(400)
        entries = dev(page, "/entries/")
        check("entry saved in the browser", len(entries) == 1 and entries[0]["text"] == "written with no server at all", entries)

        page.evaluate("location.hash = '#dashboard'")
        page.click('[data-habit-suggest="1"]')
        page.wait_for_selector(".habit")
        page.click(".habit .habit-check")
        page.wait_for_timeout(300)
        check("habit added and checked today", page.text_content(".habits-count").strip().startswith("1/1"), page.text_content(".habits-count"))

        reload(page)
        page.wait_for_selector(".habit", timeout=15000)
        check("entries and habits survive a reload", len(dev(page, "/entries/")) == 1 and page.locator(".habit.is-done").count() == 1)

        # ---------- themes ----------
        page.evaluate("location.hash = '#settings'")
        page.click('[data-theme-id="paper"]')
        page.wait_for_timeout(200)
        check("picking a theme applies it", page.evaluate("document.documentElement.dataset.theme") == "paper")
        reload(page)
        bg = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg-rgb').trim()")
        check("theme is kept after reload", page.evaluate("document.documentElement.dataset.theme") == "paper" and bg == "244 239 228", bg)
        first_paint = page.evaluate("document.documentElement.getAttribute('style') || ''")
        check("saved theme is applied before the app starts (no flash)", "--bg-rgb" in first_paint)

        page.evaluate("location.hash = '#settings'")
        page.fill("#vibeText", "neon tokyo cyberpunk at night")
        page.click("#vibeForm button[type=submit]")
        page.wait_for_selector(".theme-preview-bar:not([hidden])")
        check("describing a vibe previews a new theme", page.evaluate("document.documentElement.dataset.background") == "rain"
              and page.evaluate("document.documentElement.dataset.glow") == "on")
        page.click('[data-preview="keep"]')
        page.wait_for_timeout(200)
        check("kept theme joins the gallery", page.locator(".theme-swatch").count() == 8 and page.evaluate("document.documentElement.dataset.theme").startswith("custom-"))

        page.set_input_files("#themeImportFile", str(theme_file))
        page.wait_for_selector(".theme-preview-bar:not([hidden])")
        check("a shared theme file imports as a preview", "imported sea" in page.text_content(".theme-preview-bar"))
        page.click('[data-preview="undo"]')
        page.click("#themeEditor summary")
        page.fill('.theme-editor-form [name="color-accent"]', "#ff3366")
        page.wait_for_timeout(250)
        check("fine-tuning a color changes the app live", page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim()") == "255 51 102")
        page.click('[data-te="save"]')
        page.click("#themeDefault")
        page.wait_for_timeout(200)
        check("one tap back to the terminal default", page.evaluate("document.documentElement.dataset.theme") == "terminal")

        # ---------- music ----------
        page.evaluate("location.hash = '#focus'")
        page.set_input_files("#musicFiles", str(song))
        page.wait_for_selector(".track", timeout=10000)
        check("audio file added to the library, name parsed", page.text_content(".track-name") == "Night Drive" and page.text_content(".track-artist") == "Test Artist",
              page.text_content(".track"))
        page.click("[data-play-track]")
        page.wait_for_selector("#miniPlayer:not([hidden])")
        page.wait_for_timeout(700)
        check("track plays and the mini player shows it", "Night Drive" in page.text_content("#miniPlayer") and page.evaluate("document.getElementById('miniPlayer').classList.contains('is-playing')"))
        page.click('[data-music-tab="ambient"]')
        page.click('[data-mix="3"]')
        page.wait_for_timeout(300)
        check("ambient mix plays and takes over from the track", "brown noise" in page.text_content("#miniPlayer") and page.text_content("#playerPlay") == "▶")
        page.check("#musicLinkFocus")
        page.click('[data-music="ambient-toggle"]')
        page.click("#pomodoroStart")
        page.wait_for_timeout(300)
        playing = page.evaluate("document.getElementById('miniPlayer').classList.contains('is-playing')")
        page.click("#pomodoroPause")
        page.wait_for_timeout(300)
        paused = not page.evaluate("document.getElementById('miniPlayer').classList.contains('is-playing')")
        check("music follows the focus timer (start plays, pause pauses)", playing and paused, (playing, paused))
        page.click('[data-music-tab="spotify"]')
        page.fill("#spotifyForm [name=link]", "https://example.com/not-spotify")
        page.click("#spotifyForm button[type=submit]")
        check("a non-Spotify link is refused with a hint", "Spotify link" in page.locator(".toast").last.text_content())
        page.fill("#spotifyForm [name=link]", "https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn?si=x")
        page.click("#spotifyForm button[type=submit]")
        player = page.frame_locator(".spotify-frame")
        player.locator("text=FAKE PLAYER spotify:playlist:37i9dQZF1DWWQRwui0ExPn").wait_for(timeout=8000)
        frame = next(f for f in page.frames if f.parent_frame == page.main_frame and f != page.main_frame and "FAKE PLAYER" in (f.content() or ""))
        isolated = frame.evaluate("(() => { try { return parent.document.title ? 'leak' : 'leak'; } catch (e) { return 'blocked'; } })()")
        storage = frame.evaluate("(() => { try { return localStorage.length >= 0 ? 'leak' : 'leak'; } catch (e) { return 'blocked'; } })()")
        check("Spotify's player runs sandboxed: no access to the app or its storage", isolated == "blocked" and storage == "blocked", (isolated, storage))
        page.wait_for_function("document.querySelector('#miniPlayer') && document.querySelector('#miniPlayer').classList.contains('is-playing')", timeout=5000)
        page.click("#pomodoroStart")
        page.wait_for_timeout(200)
        page.click("#pomodoroPause")
        page.wait_for_timeout(400)
        sp_paused = not page.evaluate("document.getElementById('miniPlayer').classList.contains('is-playing')")
        page.click("#pomodoroStart")
        page.wait_for_timeout(400)
        sp_playing = page.evaluate("document.getElementById('miniPlayer').classList.contains('is-playing')")
        page.click("#pomodoroPause")
        check("the focus timer starts and pauses Spotify through the bridge", sp_paused and sp_playing and "Spotify" in page.text_content("#miniPlayer"), (sp_paused, sp_playing))
        page.click('[data-music="close"]')

        # ---------- backup ----------
        page.evaluate("location.hash = '#settings'")
        with page.expect_download() as dl:
            page.click("#backupExport")
        backup = json.loads(Path(dl.value.path()).read_text())
        check("device backup includes entries and habits", len(backup["entries"]) == 1 and len(backup.get("habits", [])) == 1 and len(backup.get("habit_logs", [])) == 1,
              {k: len(v) for k, v in backup.items() if isinstance(v, list)})

        # ---------- offline ----------
        ready = page.evaluate("navigator.serviceWorker.ready.then(r => Boolean(r.active))")
        reload(page)  # let the worker control the page and cache everything it loads
        page.wait_for_timeout(800)
        ctx.set_offline(True)
        reload(page)
        offline_entries = dev(page, "/entries/")
        check("installed copy opens offline with its data", ready and len(offline_entries) == 1, (ready, len(offline_entries)))
        ctx.set_offline(False)

        # ---------- device → password-protected server ----------
        page.evaluate("location.hash = '#settings'")
        page.fill('#connectForm [name="url"]', SERVER)
        page.fill('#connectForm [name="password"]', PASSWORD)
        page.click('#connectForm button[type="submit"]')
        page.wait_for_function("window.__logbook && window.__logbook.mode === 'server'", timeout=20000)
        page.keyboard.press("Escape")
        token = api("/auth/login", method="POST", body={"password": PASSWORD})["token"]
        server_entries = api("/entries/", token)
        server_habits = api("/habits/", token)
        check("connecting copies this device's data to the server", len(server_entries) == 1 and len(server_habits) == 1,
              (len(server_entries), len(server_habits)))
        check("the server refuses requests without a login", status_of("/entries/") == 401)
        check("app now reads from the server", page.evaluate("document.body.dataset.mode") == "server" and len(dev(page, "/entries/")) == 1)

        # ---------- the server's own page: lock screen ----------
        page2 = browser.new_context(viewport={"width": 1366, "height": 900}).new_page()
        page2.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page2.goto(SERVER + "/")
        page2.wait_for_selector("#lockScreen", timeout=15000)
        check("password-protected server shows a lock screen", page2.is_visible("#lockScreen input[type=password]"))
        page2.fill("#lockScreen input[type=password]", "wrong")
        page2.click("#lockScreen button[type=submit]")
        page2.wait_for_function("document.querySelector('.lock-error').textContent.length > 0")
        check("wrong password is rejected", "wrong" in page2.text_content(".lock-error"))
        page2.fill("#lockScreen input[type=password]", PASSWORD)
        page2.click("#lockScreen button[type=submit]")
        page2.wait_for_selector("#lockScreen", state="detached", timeout=10000)
        page2.wait_for_selector("#todayConsole .console-clock")
        page2.keyboard.press("Escape")
        page2.wait_for_timeout(800)
        check("right password unlocks and loads the data", "written with no server" in page2.evaluate("document.body.innerText") or page2.evaluate("window.__logbook.request('/entries/').then(e => e.length)") == 1)
        page2.evaluate("location.hash = '#settings'")
        page2.click("#logoutBtn")
        page2.wait_for_selector("#lockScreen", timeout=10000)
        check("log out locks it again", page2.is_visible("#lockScreen"))

        # ---------- phone ----------
        m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
        m.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
        boot(m, STATIC + "/")
        widths = {}
        for pg in ["dashboard", "focus", "companion", "settings"]:
            m.evaluate(f"location.hash = '#{pg}'")
            m.wait_for_timeout(400)
            widths[pg] = m.evaluate("document.documentElement.scrollWidth")
        check("no sideways scrolling on a phone (dashboard, focus, companion, settings)", all(v <= 390 for v in widths.values()), widths)
        m.evaluate("location.hash = '#focus'")
        m.click('[data-music-tab="ambient"]')
        m.click('[data-mix="0"]')
        m.wait_for_selector("#miniPlayer:not([hidden])")
        mini = m.locator("#miniPlayer").bounding_box()
        bar = m.locator("#sidebarNav").bounding_box()
        check("mini player sits above the phone tab bar", mini["y"] + mini["height"] <= bar["y"] + 1, (mini, bar))

        browser.close()
finally:
    for proc in procs:
        proc.kill()

expected = ("404", "401", "Failed to load resource")
real = [e for e in errors if not any(x in e for x in expected)]
check("no javascript errors", not real, real)
passed = sum(1 for r in results if r[1])
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
