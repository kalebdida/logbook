"""The Telegram bot, against a fake Telegram."""
import asyncio
import json
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest

from app import telegram as bot
from app.config import settings
from tests.test_accounts import admin_token, h, make_user, server  # noqa: F401  (server is a fixture)

TOKEN = "123456789:" + "A" * 35


class FakeTelegram:
    def __init__(self):
        self.calls = []

    def __call__(self, request: httpx.Request):
        method = request.url.path.rsplit("/", 1)[-1]
        body = json.loads(request.content or b"{}")
        self.calls.append((method, body))
        if method == "getMe":
            if TOKEN not in str(request.url):
                return httpx.Response(401, json={"ok": False, "description": "Unauthorized"})
            return httpx.Response(200, json={"ok": True, "result": {"id": 1, "username": "kal_logbook_bot"}})
        if method == "sendMessage":
            return httpx.Response(200, json={"ok": True, "result": {"message_id": len(self.calls)}})
        return httpx.Response(200, json={"ok": True, "result": True})

    def sent(self):
        return [b for m, b in self.calls if m in ("sendMessage", "editMessageText")]

    def last_text(self):
        return self.sent()[-1]["text"]


@pytest.fixture()
def tg(monkeypatch):
    fake = FakeTelegram()
    monkeypatch.setattr(bot, "transport", httpx.MockTransport(fake))
    return fake


def message(chat, text):
    return {"message": {"chat": {"id": chat, "type": "private"}, "text": text}}


def tap(chat, data, message_id=5):
    return {"callback_query": {"id": "cb1", "data": data, "message": {"message_id": message_id, "chat": {"id": chat}}}}


def run(update):
    asyncio.run(bot.process(update))


def connect(c, headers, chat, tz=180):
    url = c.post("/telegram/link", json={"tz_minutes": tz}, headers=headers).json()["url"]
    run(message(chat, "/start " + url.split("start=")[1]))


# ---------- reading what was typed ----------

def test_parse_log_reads_time_area_and_words():
    assert bot.parse_log("45m #coding fixed the login bug") == ("fixed the login bug", "coding", 45)
    assert bot.parse_log("#study 1h30 SAT reading") == ("SAT reading", "learning", 90)
    assert bot.parse_log("1.5h #gym legs") == ("legs", "fitness", 90)
    assert bot.parse_log("read 20 pages #reading") == ("read 20 pages", "learning", None)
    assert bot.parse_log("worked on #logbook stuff 2 hours") == ("worked on logbook stuff", None, 120)
    assert bot.parse_log("#church") == ("", "faith", None)


def test_parse_date_understands_people():
    today = date(2026, 10, 11)   # a Sunday
    assert bot.parse_date("nov 1 Early decision", today) == (date(2026, 11, 1), "Early decision")
    assert bot.parse_date("Early decision 1 Nov", today) == (date(2026, 11, 1), "Early decision")
    assert bot.parse_date("2026-12-05 SAT", today) == (date(2026, 12, 5), "SAT")
    assert bot.parse_date("in 3 weeks finals", today) == (date(2026, 11, 1), "finals")
    assert bot.parse_date("tomorrow essay", today) == (date(2026, 10, 12), "essay")
    assert bot.parse_date("friday retreat", today) == (date(2026, 10, 16), "retreat")
    assert bot.parse_date("jan 5 results", today) == (date(2027, 1, 5), "results")
    assert bot.parse_date("no date here", today)[0] is None


# ---------- setting it up ----------

def test_only_the_admin_sets_up_the_bot_and_the_token_never_comes_back(server, tg):
    c = server
    admin = admin_token(c)
    friend = make_user(c, admin, "amen")
    assert c.post("/telegram/setup", json={"token": TOKEN}, headers=h(friend)).status_code == 403
    assert c.post("/telegram/setup", json={"token": "nope-not-a-token"}, headers=h(admin)).status_code == 400
    assert c.post("/telegram/setup", json={"token": "123456789:" + "B" * 35}, headers=h(admin)).status_code == 400  # Telegram says no
    res = c.post("/telegram/setup", json={"token": TOKEN}, headers=h(admin))
    assert res.status_code == 200 and res.json()["bot"] == "kal_logbook_bot"
    webhook = [b for m, b in tg.calls if m == "setWebhook"]
    assert not webhook  # no public address in tests: it polls instead
    for token in (admin, friend):
        status = c.get("/telegram/status", headers=h(token)).json()
        assert status["configured"] and TOKEN not in json.dumps(status)


def test_webhook_on_a_public_server(server, tg, monkeypatch):
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://logbook.example.com")
    c = server
    admin = admin_token(c)
    c.post("/telegram/setup", json={"token": TOKEN}, headers=h(admin))
    hook = [b for m, b in tg.calls if m == "setWebhook"][0]
    assert hook["url"].startswith("https://logbook.example.com/telegram/webhook/")
    secret = hook["secret_token"]
    assert c.post("/telegram/webhook/wrong", json={}).status_code == 404
    assert c.post(f"/telegram/webhook/{secret}", json={}).status_code == 404   # no secret header
    ok = c.post(f"/telegram/webhook/{secret}", json=message(1, "/help"), headers={"X-Telegram-Bot-Api-Secret-Token": secret})
    assert ok.status_code == 200


# ---------- using it ----------

def test_commands_write_to_the_linked_account_only(server, tg):
    c = server
    admin = admin_token(c)
    amen = make_user(c, admin, "amen")
    c.post("/telegram/setup", json={"token": TOKEN}, headers=h(admin))
    connect(c, h(amen), chat=555)
    assert "Connected to <b>amen</b>" in tg.last_text()
    assert c.get("/telegram/status", headers=h(amen)).json()["linked"] is True
    assert c.get("/telegram/status", headers=h(admin)).json()["linked"] is False

    run(message(555, "/log 45m #coding fixed the login bug"))
    assert "45 min of coding" in tg.last_text()
    acts = c.get("/activities/", headers=h(amen)).json()
    assert acts[0]["title"] == "fixed the login bug" and acts[0]["duration_minutes"] == 45 and acts[0]["activity_category"] == "coding"
    assert c.get("/activities/", headers=h(admin)).json() == []

    run(message(555, "/log called grandma"))     # no area: buttons to pick one
    act_id = c.get("/activities/", headers=h(amen)).json()[-1]["id"]
    run(tap(555, f"a:{act_id}:social"))
    assert [a["activity_category"] for a in c.get("/activities/", headers=h(amen)).json()] == ["coding", "social"]

    run(message(555, "/task call the bank"))
    task = c.get("/tasks/", headers=h(amen)).json()[0]
    run(tap(555, f"t:{task['id']}"))
    assert c.get("/tasks/", headers=h(amen)).json()[0]["completed"] is True
    assert "All done" in [b for m, b in tg.calls if m == "answerCallbackQuery"][-1]["text"]

    run(message(555, "/j long day but good"))
    entry = c.get("/entries/", headers=h(amen)).json()[0]
    run(tap(555, f"m:{entry['id']}:good"))
    assert c.get("/entries/", headers=h(amen)).json()[0]["mood"] == "good"

    run(message(555, "/pray wisdom"))
    prayer = c.get("/prayers/", headers=h(amen)).json()[0]
    run(tap(555, f"p:{prayer['id']}"))
    assert c.get("/prayers/", headers=h(amen)).json()[0]["answered_at"]

    run(message(555, "/due in 10 days Early decision"))
    assert c.get("/deadlines/", headers=h(amen)).json()[0]["title"] == "Early decision"
    run(message(555, "/dump buy notebook"))
    run(message(555, "/today"))
    assert "Tasks: 1 of 1 done" in tg.last_text() and "Early decision" in tg.last_text()

    # the admin's account saw none of it
    for path in ("/tasks/", "/entries/", "/prayers/", "/deadlines/"):
        assert c.get(path, headers=h(admin)).json() == []


def test_tapping_someone_elses_button_does_nothing(server, tg):
    c = server
    admin = admin_token(c)
    amen, beti = make_user(c, admin, "amen"), make_user(c, admin, "beti")
    c.post("/telegram/setup", json={"token": TOKEN}, headers=h(admin))
    connect(c, h(amen), chat=1)
    connect(c, h(beti), chat=2)
    task = c.post("/tasks/", json={"day_date": date.today().isoformat(), "title": "amen's"}, headers=h(amen)).json()
    run(tap(2, f"t:{task['id']}"))
    assert c.get("/tasks/", headers=h(amen)).json()[0]["completed"] is False


def test_strangers_and_old_links_are_refused(server, tg):
    c = server
    admin = admin_token(c)
    c.post("/telegram/setup", json={"token": TOKEN}, headers=h(admin))
    run(message(999, "/log 1h #coding sneaky"))
    assert "private Logbook bot" in tg.last_text()
    run(message(999, "/start not-a-real-code"))
    assert "expired" in tg.last_text()
    assert c.get("/activities/", headers=h(admin)).json() == []


def test_morning_message_goes_out_once_at_the_hour(server, tg, monkeypatch):
    async def no_verse(ref, translation="kjv"):
        return "Be still, and know that I am God."
    monkeypatch.setattr(bot.verses, "words", no_verse)
    c = server
    admin = admin_token(c)
    c.post("/telegram/setup", json={"token": TOKEN}, headers=h(admin))
    connect(c, h(admin), chat=7, tz=180)
    seven_local = datetime.now(timezone.utc).replace(hour=4, minute=0, second=0, microsecond=0)   # 07:00 at UTC+3
    assert asyncio.run(bot.morning_tick(seven_local - timedelta(hours=1))) == 0
    assert asyncio.run(bot.morning_tick(seven_local)) == 1
    assert "Good morning" in tg.last_text() and "Be still" in tg.last_text()
    assert asyncio.run(bot.morning_tick(seven_local + timedelta(minutes=5))) == 0
    c.patch("/telegram/link", json={"morning_off": True}, headers=h(admin))
    assert asyncio.run(bot.morning_tick(seven_local + timedelta(days=1))) == 0


def test_plain_words_go_to_the_companion(server, tg, monkeypatch):
    seen = {}

    async def fake_chat(messages, system, max_tokens, transport=None):
        seen["messages"], seen["system"] = messages, system
        return "You've got this. One thing at a time."
    c = server
    admin = admin_token(c)
    c.post("/telegram/setup", json={"token": TOKEN}, headers=h(admin))
    connect(c, h(admin), chat=8)
    run(message(8, "should I study or rest?"))
    assert "AI turned on" in tg.last_text()      # no AI on this server
    settings.ai_provider, settings.ai_api_key = "anthropic", "test-key"
    monkeypatch.setattr(bot.ai, "chat", fake_chat)
    try:
        c.post("/tasks/", json={"day_date": bot.local_today(180).isoformat(), "title": "SAT practice"}, headers=h(admin))
        run(message(8, "should I study or rest?"))
        assert tg.last_text() == "You've got this. One thing at a time."
        assert "SAT practice" in seen["system"] and seen["messages"][-1]["content"] == "should I study or rest?"
    finally:
        settings.ai_provider, settings.ai_api_key = "", ""
