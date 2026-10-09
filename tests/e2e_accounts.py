"""End-to-end test for invite-only accounts, in a real browser.

The admin logs in, makes an invite in settings; a friend joins with it on a
phone-sized screen; each writes something; neither can see the other's.
Then: log out clears what the browser kept, a reset code works, and the
admin removes the account.

Starts a throwaway server on :8768 (your real data is never touched).
  python tests/e2e_accounts.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(tempfile.mkdtemp(prefix="logbook-e2e-acct-"))
PORT = 8768
SERVER = f"http://127.0.0.1:{PORT}"
ADMIN_PW = "admin password 123"
FRIEND_PW = "amen password 1"
SHOTS = Path(os.environ.get("SHOTS_DIR", WORK))
results, errors = [], []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"), flush=True)


env = {k: v for k, v in os.environ.items() if not k.startswith("LOGBOOK_") and k != "DATABASE_URL"}
env.update(DATABASE_URL=f"sqlite:///{(WORK / 'server.db').as_posix()}", LOGBOOK_PASSWORD=ADMIN_PW,
           LOGBOOK_ADMIN_USERNAME="kal", LOGBOOK_SECRET="e2e-secret")
proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT)],
                        cwd=ROOT / "backend", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(80):
    try:
        urllib.request.urlopen(SERVER + "/health", timeout=1)
        break
    except Exception:
        time.sleep(0.25)


def dev(page, path, method="GET", body=None):
    return page.evaluate("""([path, method, body]) => window.__logbook.request(path, method === 'GET' ? {} :
        { method, headers: {'Content-Type': 'application/json'}, body: body == null ? undefined : JSON.stringify(body) })""",
                         [path, method, body])


def unlocked(page):
    # a different person logging in reloads the page clean, so wait for the
    # fresh page: no lock screen and the app's API handle back
    for _ in range(3):
        try:
            page.wait_for_load_state("load")
            page.wait_for_selector("#lockScreen", state="detached", timeout=10000)
            page.wait_for_function("window.__logbook !== undefined", timeout=15000)
            break
        except Exception:
            page.wait_for_timeout(500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)


def open_settings(page):
    page.evaluate("location.hash = '#settings'")
    page.wait_for_selector("#settingsAccount:not([hidden]) .storage-now", timeout=10000)


def no_sideways_scroll(page):
    return page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")


try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for_errors = lambda p, who: p.on("pageerror", lambda e: errors.append(f"{who}: {e}"))

        # ---------- the admin ----------
        ctx_a = browser.new_context(viewport={"width": 1280, "height": 860})
        a = ctx_a.new_page()
        for_errors(a, "admin")
        a.on("dialog", lambda d: d.accept())
        a.goto(SERVER)
        a.wait_for_selector("#lockScreen", timeout=15000)
        check("lock screen has log in / join / reset", a.locator(".lock-tab").count() == 3)
        a.fill('#lockScreen [name="username"]', "kal")
        a.fill('#lockScreen [name="password"]', "nope")
        a.click("#lockScreen button[type=submit]")
        a.wait_for_function("document.querySelector('.lock-error').textContent.length > 0")
        check("wrong admin password is refused", "wrong" in a.text_content(".lock-error"))
        a.fill('#lockScreen [name="password"]', ADMIN_PW)
        a.click("#lockScreen button[type=submit]")
        unlocked(a)
        dev(a, "/entries/", "POST", {"mood": "good", "text": "kal's private entry"})
        dev(a, "/days/2026-10-10", "PUT", {"journal": "kal's private journal"})

        open_settings(a)
        check("account card: logged in as kal, admin", "kal" in a.text_content("#settingsAccount .storage-now")
              and a.is_visible("#settingsAccount .people-badge"))
        a.fill('[data-invite-form] [name="note"]', "amen")
        a.click("[data-invite-form] button[type=submit]")
        a.wait_for_selector(".code-box-code")
        code = a.text_content(".code-box-code").strip()
        check("making an invite shows a one-time code", len(code) == 14 and code.count("-") == 2, code)
        message = a.get_attribute(".code-box", "data-message")
        check("the share message has the address and the code", SERVER in message and code in message, message)
        a.wait_for_function("document.querySelector('[data-invites]').textContent.includes('open until')")
        a.screenshot(path=str(SHOTS / "admin-settings.png"), full_page=False)
        a.locator("#settingsAccount").screenshot(path=str(SHOTS / "admin-account-card.png"))

        # ---------- the friend, on a phone ----------
        ctx_b = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        b = ctx_b.new_page()
        for_errors(b, "friend")
        b.on("dialog", lambda d: d.accept())
        b.goto(SERVER)
        b.wait_for_selector("#lockScreen", timeout=15000)
        b.click('.lock-tab[data-mode="join"]')
        check("join tab asks for invite, username, password twice",
              b.is_visible('[name="invite"]') and b.is_visible('[name="password2"]') and not b.is_visible('[name="code"]'))
        b.fill('[name="invite"]', code.upper())
        b.fill('#lockScreen [name="username"]', "Amen")
        b.fill('#lockScreen [name="password"]', FRIEND_PW)
        b.fill('[name="password2"]', "not the same")
        b.click("#lockScreen button[type=submit]")
        check("mismatched passwords are caught before sending", "match" in b.text_content(".lock-error"))
        b.fill('[name="password2"]', FRIEND_PW)
        b.screenshot(path=str(SHOTS / "phone-join.png"))
        b.click("#lockScreen button[type=submit]")
        unlocked(b)
        check("the friend's logbook starts empty: none of kal's data",
              dev(b, "/entries/") == [] and dev(b, "/days/") == [] and "kal's private" not in b.evaluate("document.body.innerText"))
        dev(b, "/entries/", "POST", {"mood": "rough", "text": "amen's private entry"})
        habit = dev(b, "/habits/", "POST", {"name": "amen habit"})
        b.evaluate("sessionStorage.setItem('logbook-companion-chat', '[\"amen secret chat\"]')")
        b.evaluate("localStorage.setItem('logbook-ai', JSON.stringify({provider: 'anthropic', apiKey: 'amen-key'}))")
        open_settings(b)
        check("friend sees their own name, no admin tools",
              "amen" in b.text_content("#settingsAccount .storage-now") and b.locator("[data-people]").count() == 0)
        check("settings fit a phone (no sideways scroll)", no_sideways_scroll(b))
        b.locator("#settingsAccount").screenshot(path=str(SHOTS / "phone-account-card.png"))

        # ---------- each sees only their own ----------
        a.reload()
        a.wait_for_function("window.__logbook !== undefined", timeout=15000)
        entries_a = dev(a, "/entries/")
        check("kal still sees only kal's entry", [e["text"] for e in entries_a] == ["kal's private entry"], entries_a)
        check("kal can't reach amen's habit by id",
              a.evaluate(f"window.__logbook.request('/habits/{habit['id']}', {{method: 'PATCH', headers: {{'Content-Type': 'application/json'}}, body: '{{\"name\": \"x\"}}'}}).then(() => 'changed', e => e.status)") == 404)
        open_settings(a)
        a.wait_for_function("document.querySelector('[data-users]').textContent.includes('amen')")
        people_text = a.text_content("[data-people]")
        check("admin's people list: names and dates only", "amen" in people_text and "private" not in people_text and "habit" not in people_text)
        check("the used invite says who joined", "joined as amen" in a.text_content("[data-invites]"))

        # ---------- log out clears what the browser kept ----------
        b.click("#settingsAccount [data-logout]")
        b.wait_for_selector("#lockScreen", timeout=10000)
        leftovers = b.evaluate("[sessionStorage.length, localStorage.getItem('logbook-ai')]")
        check("log out wipes the chat history and the browser AI key", leftovers == [0, None], leftovers)
        check("old one-browser data isn't offered to the next person",
              b.evaluate("localStorage.getItem('logbook-legacy-imported')") is not None)
        check("the next person on this phone sees no data behind the lock", "amen's private" not in b.evaluate("document.body.innerText"))

        # ---------- reset code ----------
        a.click('[data-user] [data-reset-user]')
        a.wait_for_selector(".code-box-code")
        reset = a.text_content(".code-box-code").strip()
        check("admin can make a reset code", "reset code for amen" in a.text_content(".code-box-label"))
        b.click('.lock-tab[data-mode="reset"]')
        b.fill('[name="code"]', reset)
        b.fill('#lockScreen [name="username"]', "amen")
        b.fill('#lockScreen [name="password"]', "a whole new password")
        b.fill('[name="password2"]', "a whole new password")
        b.click("#lockScreen button[type=submit]")
        unlocked(b)
        check("reset code sets a new password and logs in, data intact",
              [e["text"] for e in dev(b, "/entries/")] == ["amen's private entry"])
        open_settings(b)
        b.wait_for_function("document.querySelector('#settingsAccount').textContent.includes('reset code on')", timeout=10000)
        check("amen's account card says a reset code was used", True)
        try:
            urllib.request.urlopen(urllib.request.Request(SERVER + "/auth/login", method="POST",
                                   headers={"Content-Type": "application/json"},
                                   data=json.dumps({"username": "amen", "password": FRIEND_PW}).encode()))
            old_pw = 200
        except urllib.error.HTTPError as e:
            old_pw = e.code
        check("old password is refused after the reset", old_pw == 401, old_pw)

        # ---------- admin removes the account ----------
        a.click('[data-user] [data-remove-user]')
        a.fill('.people-confirm [name="password"]', ADMIN_PW)
        a.click('.people-confirm button[type=submit]')
        a.wait_for_function("!document.querySelector('[data-users]').textContent.includes('amen')", timeout=10000)
        check("admin removed amen", True)
        b.reload()
        b.wait_for_selector("#lockScreen", timeout=15000)
        check("amen's phone is locked out after removal", b.is_visible("#lockScreen"))

        check("no javascript errors", not errors, errors)
        browser.close()
finally:
    proc.terminate()

passed = sum(1 for r in results if r[1])
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
