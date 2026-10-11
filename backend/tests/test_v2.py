"""Login, habits, AI proxy, and upgrading a 1.x database."""
import json

import httpx
from sqlalchemy import inspect, text

from app import ai
from app.config import settings
from app.database import Base, engine, run_migrations
from tests.conftest import reset_database

import datetime as _dt
TODAY = _dt.date.today().isoformat()
YDAY = (_dt.date.today() - _dt.timedelta(days=1)).isoformat()


# ---------- login ----------

def test_open_when_no_password(client):
    assert client.get("/auth/status").json() == {"required": False, "authenticated": True, "accounts": False, "user": None}
    assert client.get("/entries/").status_code == 200


def test_password_protects_data_but_not_the_page(client):
    settings.password = "correct horse"
    assert client.get("/entries/").status_code == 401
    assert client.get("/").status_code == 200            # the app itself still loads
    health = client.get("/health").json()
    assert health["auth_required"] is True and "counts" not in health

    assert client.post("/auth/login", json={"password": "nope"}).status_code == 401
    token = client.post("/auth/login", json={"password": "correct horse"}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/entries/", headers=headers).status_code == 200
    assert "counts" in client.get("/health", headers=headers).json()
    assert client.get("/auth/status", headers=headers).json()["authenticated"] is True

    settings.password = "changed"                         # new password signs everyone out
    assert client.get("/entries/", headers=headers).status_code == 401


def test_login_locks_out_after_repeated_misses(client):
    settings.password = "pw"
    codes = [client.post("/auth/login", json={"password": "x"}).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429
    from app import auth
    auth._failures.clear()


def test_tampered_token_rejected(client):
    settings.password = "pw"
    token = client.post("/auth/login", json={"password": "pw"}).json()["token"]
    version, uid, tv, expires, sig = token.split(".")
    for forged in (f"{version}.{uid}.{tv}.{int(expires) + 999999}.{sig}",   # longer life
                   f"{version}.2.{tv}.{expires}.{sig}",                       # someone else
                   f"{version}.{uid}.{int(tv) + 1}.{expires}.{sig}"):
        assert client.get("/entries/", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


# ---------- habits ----------

def test_habits_check_and_uncheck(client):
    h = client.post("/habits/", json={"name": "pray", "icon": "🙏", "activity_category": "faith"}).json()
    assert h["sort"] == 0
    client.put(f"/habits/{h['id']}/days/{YDAY}")
    client.put(f"/habits/{h['id']}/days/{YDAY}")      # idempotent
    client.put(f"/habits/{h['id']}/days/{TODAY}")
    logs = client.get("/habits/logs", params={"start": YDAY, "end": TODAY}).json()
    assert [l["date"] for l in logs] == [YDAY, TODAY]
    assert client.delete(f"/habits/{h['id']}/days/{TODAY}").status_code == 204
    assert len(client.get("/habits/logs").json()) == 1


def test_archived_habits_hidden_and_delete_removes_logs(client):
    a = client.post("/habits/", json={"name": "read"}).json()
    b = client.post("/habits/", json={"name": "gym"}).json()
    client.put(f"/habits/{b['id']}/days/{YDAY}")
    client.patch(f"/habits/{a['id']}", json={"archived": True})
    assert [h["name"] for h in client.get("/habits/").json()] == ["gym"]
    assert len(client.get("/habits/", params={"include_archived": True}).json()) == 2
    client.delete(f"/habits/{b['id']}")
    assert client.get("/habits/logs").json() == []


def test_habits_survive_backup_into_another_database(client):
    h = client.post("/habits/", json={"name": "Pray"}).json()
    client.put(f"/habits/{h['id']}/days/{YDAY}")
    backup = client.get("/backup").json()
    reset_database()
    run_migrations()
    client.post("/habits/", json={"name": "gym"})          # ids won't line up with the file
    result = client.post("/backup/restore", json=backup).json()
    assert result["habits"]["added"] == 1 and result["habit_logs"]["added"] == 1
    pray = [x for x in client.get("/habits/").json() if x["name"] == "Pray"][0]
    assert client.get("/habits/logs").json() == [{"habit_id": pray["id"], "date": YDAY}]
    again = client.post("/backup/restore", json=backup).json()
    assert again["habits"]["added"] == 0 and again["habit_logs"]["added"] == 0


# ---------- AI ----------

def _fake_provider(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(ai.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), timeout=kw.get("timeout")))


def test_ai_off_by_default(client):
    assert client.get("/ai/status").json()["available"] is False
    assert client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 503


def test_ai_anthropic_request_shape(client, monkeypatch):
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"content": [{"type": "text", "text": "you seem focused this week."}]})

    _fake_provider(monkeypatch, handler)
    settings.ai_provider, settings.ai_api_key = "anthropic", "sk-test"
    status = client.get("/ai/status").json()
    assert status == {"available": True, "provider": "anthropic", "model": "claude-haiku-5-5"}
    r = client.post("/ai/chat", json={"system": "be brief", "messages": [{"role": "user", "content": "how am i doing?"}]})
    assert r.json()["text"] == "you seem focused this week."
    assert seen["url"] == "https://api.anthropic.com/v1/messages"
    assert seen["headers"]["x-api-key"] == "sk-test" and seen["headers"]["anthropic-version"] == "2023-06-01"
    assert seen["body"]["system"] == "be brief" and seen["body"]["model"] == "claude-haiku-5-5"
    assert seen["body"]["messages"] == [{"role": "user", "content": "how am i doing?"}]


def test_ai_local_ollama_needs_no_key(client, monkeypatch):
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"choices": [{"message": {"content": "local reply"}}]})

    _fake_provider(monkeypatch, handler)
    settings.ai_provider, settings.ai_base_url, settings.ai_model = "openai", "http://localhost:11434/v1", "llama3.2"
    r = client.post("/ai/chat", json={"system": "s", "messages": [{"role": "user", "content": "q"}]})
    assert r.json()["text"] == "local reply"
    assert seen["url"] == "http://localhost:11434/v1/chat/completions" and seen["auth"] is None
    assert seen["body"]["messages"][0] == {"role": "system", "content": "s"} and seen["body"]["model"] == "llama3.2"


def test_ai_provider_errors_are_reported_plainly(client, monkeypatch):
    _fake_provider(monkeypatch, lambda req: httpx.Response(401, json={"error": {"message": "invalid x-api-key"}}))
    settings.ai_provider, settings.ai_api_key = "anthropic", "bad"
    r = client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 502 and "invalid x-api-key" in r.json()["detail"]


def _gemini_reply(text):
    return {"candidates": [{"content": {"role": "model", "parts": [{"text": "thinking...", "thought": True}, {"text": text}]}, "finishReason": "STOP"}]}


def test_ai_gemini_request_shape(client, monkeypatch):
    # Gemini goes through its own generateContent API with the key in
    # x-goog-api-key: the newer "AQ." keys from AI Studio work there
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("x-goog-api-key")
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=_gemini_reply("steady week."))

    _fake_provider(monkeypatch, handler)
    settings.ai_provider, settings.ai_api_key = "gemini", "AQ.test-key"
    assert client.get("/ai/status").json() == {"available": True, "provider": "gemini", "model": "gemini-3.5-flash-lite"}
    r = client.post("/ai/chat", json={"system": "be brief", "max_tokens": 20, "messages": [
        {"role": "user", "content": "how am i doing?"}, {"role": "assistant", "content": "well"},
        {"role": "user", "content": "more?"}, {"role": "user", "content": "and?"}]})
    assert r.status_code == 200 and r.json() == {"text": "steady week.", "model": "gemini-3.5-flash-lite"}  # thinking left out
    assert seen["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
    assert seen["key"] == "AQ.test-key" and seen["auth"] is None  # one credential only
    body = seen["body"]
    assert body["systemInstruction"] == {"parts": [{"text": "be brief"}]}
    assert body["generationConfig"]["maxOutputTokens"] >= 1024  # room for thinking, so a tiny cap can't come back empty
    assert [c["role"] for c in body["contents"]] == ["user", "model", "user"]  # turns alternate
    assert body["contents"][2]["parts"][0]["text"] == "more?\n\nand?"


def test_ai_gemini_key_alone_means_gemini(client, monkeypatch):
    seen = {}

    def handler(request):
        seen["key"] = request.headers.get("x-goog-api-key")
        seen["path"] = request.url.path
        return httpx.Response(200, json=_gemini_reply("hi"))

    _fake_provider(monkeypatch, handler)
    settings.gemini_api_key, settings.ai_model = "AQ.env", "gemini-3.8-flash"
    assert client.get("/ai/status").json() == {"available": True, "provider": "gemini", "model": "gemini-3.8-flash"}
    assert client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).json()["text"] == "hi"
    assert seen == {"key": "AQ.env", "path": "/v1beta/models/gemini-3.8-flash:generateContent"}
    # an explicit provider key still wins over the inference
    settings.ai_api_key = "sk-ant"
    assert client.get("/ai/status").json()["provider"] == "anthropic"


def test_ai_gemini_blocked_or_empty_replies_say_so(client, monkeypatch):
    replies = iter([{"promptFeedback": {"blockReason": "SAFETY"}},
                    {"candidates": [{"content": {"parts": [{"text": "", "thought": True}]}, "finishReason": "MAX_TOKENS"}]}])
    _fake_provider(monkeypatch, lambda req: httpx.Response(200, json=next(replies)))
    settings.ai_provider, settings.ai_api_key = "gemini", "AQ.k"
    first = client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert first.status_code == 502 and "safety" in first.json()["detail"]
    second = client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert second.status_code == 502 and "ran out of room" in second.json()["detail"]


def test_ai_startup_check_reports_a_bad_key(client, monkeypatch):
    import asyncio
    seen = {}

    def handler(request):
        seen["path"] = request.url.path
        return httpx.Response(400, json={"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}})

    _fake_provider(monkeypatch, handler)
    settings.ai_provider, settings.ai_api_key = "gemini", "AQ.bad"
    result = asyncio.run(ai.check())
    assert seen["path"] == "/v1beta/models/gemini-3.5-flash-lite:generateContent"  # the same path the companion uses
    assert result["ok"] is False and "API key not valid" in result["detail"] and "AQ.bad" not in result["detail"]
    assert client.get("/health").json()["ai_ok"] is False
    assert client.get("/ai/status").json()["check"]["ok"] is False

    monkeypatch.undo()  # back to the real client before faking a good answer
    _fake_provider(monkeypatch, lambda req: httpx.Response(200, json=_gemini_reply("ok")))
    assert asyncio.run(ai.check())["ok"] is True
    assert client.get("/health").json()["ai_ok"] is True


def test_ai_gemini_needs_a_key(client):
    settings.ai_provider = "gemini"
    assert client.get("/ai/status").json()["available"] is False


def test_ai_gemini_errors_are_reported_plainly(client, monkeypatch):
    # Google's endpoints can wrap their error in a list
    _fake_provider(monkeypatch, lambda req: httpx.Response(400, json=[{"error": {"code": 400, "message": "API key not valid", "status": "INVALID_ARGUMENT"}}]))
    settings.ai_provider, settings.ai_api_key = "gemini", "bad"
    r = client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 502 and "API key not valid" in r.json()["detail"]


def test_gemini_key_read_from_its_own_variable():
    from app.config import Settings
    assert Settings(_env_file=None, GEMINI_API_KEY="AIza-x").gemini_api_key == "AIza-x"


def test_ai_requires_login_when_password_set(client):
    settings.password = "pw"
    settings.ai_provider, settings.ai_api_key = "anthropic", "sk"
    assert client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401


# ---------- upgrading a 1.x database ----------

def test_v1_database_upgrades_in_place(client):
    # build a real 1.x database: the 0001 schema minus what 1.x didn't have
    from alembic import command
    from alembic.config import Config
    from app.config import BACKEND_DIR
    reset_database()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(config, "0001")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO entries (id, occurred_at, mood, text) VALUES ('keep-me', '2026-05-01 10:00:00', 'good', 'from v1')"))
        conn.execute(text("INSERT INTO day_records (date, morning_intention, morning_main_focus, journal, reflection_what_happened, "
                          "reflection_wins, reflection_lessons, reflection_tomorrow_plan, reflection_gratitude, brain_dump) "
                          "VALUES ('2026-05-01', '', '', 'old journal', '', '', '', '', '', '')"))
        conn.execute(text("INSERT INTO tasks (id, day_date, completed, title) VALUES (7, '2026-05-01', false, 'old task')"))
        conn.execute(text("DROP TABLE habit_logs"))
        conn.execute(text("DROP TABLE habits"))
        conn.execute(text("ALTER TABLE goals DROP COLUMN activity_category"))
        conn.execute(text("DROP TABLE alembic_version"))
    run_migrations()
    insp = inspect(engine)
    assert insp.has_table("habits") and insp.has_table("users") and insp.has_table("alembic_version")
    assert client.get("/entries/keep-me").json()["text"] == "from v1"          # now user 1's
    assert client.get("/days/2026-05-01").json()["journal"] == "old journal"
    assert client.get("/tasks/").json()[0]["title"] == "old task"
    new_task = client.post("/tasks/", json={"day_date": "2026-05-02", "title": "new"}).json()
    assert new_task["id"] > 7                                                   # ids carry on after the copied ones
    run_migrations()  # second start is a no-op


def test_postgres_style_urls_get_the_right_driver():
    from app.config import Settings
    assert Settings(DATABASE_URL="postgres://u:p@h/db").database_url == "postgresql+psycopg://u:p@h/db"
    assert Settings(DATABASE_URL="postgresql://u:p@h/db?sslmode=require").database_url == "postgresql+psycopg://u:p@h/db?sslmode=require"


def test_only_frontend_files_are_served(client):
    """The project root holds the backend and the database: never serve them."""
    assert client.get("/").status_code == 200
    assert client.get("/js/app.js").status_code == 200
    assert client.get("/sw.js").status_code == 200
    assert client.get("/manifest.webmanifest").headers["content-type"].startswith("application/manifest+json")
    for path in ["/backend/logbook.db", "/backend/app/config.py", "/backend/requirements.txt", "/CLAUDE.md", "/scripts/build_web.py", "/.github/workflows/pages.yml"]:
        assert client.get(path).status_code == 404, path


def _preflight(options, origin):
    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.middleware.cors import CORSMiddleware
    from starlette.testclient import TestClient as StarletteClient
    tiny = Starlette(middleware=[Middleware(CORSMiddleware, **options)])
    with StarletteClient(tiny) as c:
        r = c.options("/health", headers={"Origin": origin, "Access-Control-Request-Method": "GET",
                                          "Access-Control-Request-Headers": "authorization"})
        return r.headers.get("access-control-allow-origin")


def test_cors_extra_origins_from_settings():
    from app.config import Settings
    from app.main import cors_options
    pages = "https://kalebdida.github.io"
    open_server = Settings(_env_file=None, password="", cors_origins=pages + "/ , https://logbook.example.me")
    assert open_server.cors_origin_list == [pages, "https://logbook.example.me"]
    opts = cors_options(open_server)
    assert _preflight(opts, pages) == pages
    assert _preflight(opts, "https://logbook.example.me") == "https://logbook.example.me"
    assert _preflight(opts, "http://localhost:5173") == "http://localhost:5173"   # still allowed
    assert _preflight(opts, "https://evil.example") is None                       # still refused
    assert _preflight(cors_options(Settings(_env_file=None, password="")), pages) is None
    # with a password every origin may call (bearer tokens, no cookies): the list changes nothing
    locked = cors_options(Settings(_env_file=None, password="pw", cors_origins=pages))
    assert _preflight(locked, "https://anything.example") == "*"
    assert locked["allow_credentials"] is False


def test_config_js_is_served(client):
    r = client.get("/config.js")
    assert r.status_code == 200 and "LOGBOOK_CONFIG" in r.text


def test_ai_key_alone_means_anthropic(client):
    from app.config import settings
    settings.ai_api_key = "sk-test"
    try:
        body = client.get("/ai/status").json()
        assert body == {"available": True, "provider": "anthropic", "model": "claude-haiku-5-5"}
    finally:
        settings.ai_api_key = ""


def test_lockout_cannot_be_dodged_with_forwarded_for(client):
    from app import auth
    from app.config import settings
    settings.password = "right"
    auth._failures.clear()
    auth._all_failures.clear()
    try:
        codes = [client.post("/auth/login", json={"password": "wrong"}, headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code
                 for i in range(40)]
        assert codes.count(401) <= auth.MAX_ALL_FAILURES
        assert codes[-1] == 429
    finally:
        settings.password = ""
        auth._failures.clear()
        auth._all_failures.clear()


def test_weird_tokens_are_rejected_not_crashed(client):
    from app.config import settings
    settings.password = "right"
    try:
        for token in ["v1.9999999999.éé", "v1.abc.def", "garbage", "a.b.c.d"]:
            assert client.get("/entries/", headers={"Authorization": ("Bearer " + token).encode("utf-8")}).status_code == 401
    finally:
        settings.password = ""


def test_concurrent_check_ins_dont_fail(client):
    habit = client.post("/habits/", json={"name": "read"}).json()
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(4) as pool:
        codes = list(pool.map(lambda _: client.put(f"/habits/{habit['id']}/days/{YDAY}").status_code, range(8)))
    assert set(codes) == {200}
    assert len(client.get("/habits/logs").json()) == 1


def test_ping_is_public_and_cheap(client, monkeypatch):
    settings.password = "pw-for-ping-test-1"
    try:
        assert client.get("/ping").json() == {"ok": True}
    finally:
        settings.password = ""


def test_keep_awake_pings_its_own_address(monkeypatch):
    import asyncio
    from app import keepawake

    monkeypatch.delenv("LOGBOOK_SELF_URL", raising=False)
    monkeypatch.delenv("RENDER_EXTERNAL_URL", raising=False)
    assert keepawake.self_url() == ""
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://example.onrender.com/")
    assert keepawake.self_url() == "https://example.onrender.com"

    seen = []

    class FakeClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url):
            seen.append(url)
            if len(seen) == 1:
                raise httpx.ConnectError("asleep")     # a failure never stops it
            return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(keepawake.httpx, "AsyncClient", FakeClient)

    async def go():
        task = asyncio.create_task(keepawake.run("https://example.onrender.com", every=0.01))
        while len(seen) < 3:
            await asyncio.sleep(0.01)
        task.cancel()

    asyncio.run(go())
    assert seen[:3] == ["https://example.onrender.com/ping"] * 3


def test_verse_list_covers_a_year_without_repeats():
    from datetime import date, timedelta
    from app import verses

    items = verses.refs()
    assert len(items) >= 366 and len(set(items)) == len(items)
    start = date(2026, 1, 1)
    year = [verses.ref_for(start + timedelta(days=i)) for i in range(366)]
    assert len(set(year)) == 366
    assert verses.clean("In the\n beginning ,  God") == "In the beginning, God"


def test_deadlines_count_down_and_filter(client):
    a = client.post("/deadlines/", json={"title": "Early decision", "due_date": "2026-11-01", "kind": "deadline"}).json()
    client.post("/deadlines/", json={"title": "SAT", "due_date": "2026-12-05", "kind": "exam"})
    assert [d["title"] for d in client.get("/deadlines/").json()] == ["Early decision", "SAT"]
    assert [d["title"] for d in client.get("/deadlines/?start=2026-12-01").json()] == ["SAT"]
    done = client.patch(f"/deadlines/{a['id']}", json={"done": True, "title": None}).json()
    assert done["done"] is True and done["title"] == "Early decision"
    assert len(client.get("/deadlines/?done=false").json()) == 1
    assert client.post("/deadlines/", json={"title": "x", "due_date": "2026-11-01", "kind": "party"}).status_code == 422
    assert client.delete(f"/deadlines/{a['id']}").status_code == 204


def test_prayers_answered_and_back(client):
    p = client.post("/prayers/", json={"text": "  Wisdom for the applications  "}).json()
    assert p["text"] == "Wisdom for the applications" and p["answered_at"] is None
    assert client.patch(f"/prayers/{p['id']}", json={"answer": "too early"}).json()["answer"] == ""
    got = client.patch(f"/prayers/{p['id']}", json={"answered": True, "answer": "Got in."}).json()
    assert got["answered_at"] and got["answer"] == "Got in."
    assert len(client.get("/prayers/?answered=true").json()) == 1
    back = client.patch(f"/prayers/{p['id']}", json={"answered": False}).json()
    assert back["answered_at"] is None and back["answer"] == ""


def test_backup_carries_deadlines_and_prayers(client):
    client.post("/deadlines/", json={"title": "Essay", "due_date": "2026-11-15"})
    client.post("/prayers/", json={"text": "Peace"})
    dump = client.get("/backup").json()
    assert dump["deadlines"][0]["title"] == "Essay" and dump["prayers"][0]["text"] == "Peace"
    res = client.post("/backup/restore", json=dump).json()
    assert res["deadlines"] == {"added": 0, "merged": 0, "skipped": 1}
    assert res["prayers"]["skipped"] == 1


def test_profile_and_deadline_times(client):
    assert client.get("/profile").json() == {"birthday": None, "pet_name": ""}
    got = client.put("/profile", json={"birthday": "2008-03-04", "pet_name": "  Yuki "}).json()
    assert got == {"birthday": "2008-03-04", "pet_name": "Yuki"}
    assert client.put("/profile", json={"pet_name": "x" * 25}).status_code == 422
    assert client.put("/profile", json={"birthday": None}).json() == {"birthday": None, "pet_name": "Yuki"}

    d = client.post("/deadlines/", json={"title": "Essay", "due_date": "2026-11-01", "due_time": "23:59"}).json()
    assert d["due_time"] == "23:59"
    assert client.post("/deadlines/", json={"title": "x", "due_date": "2026-11-01", "due_time": "25:00"}).status_code == 422
    assert client.patch(f"/deadlines/{d['id']}", json={"due_time": None}).json()["due_time"] is None
    bday = client.post("/deadlines/", json={"title": "Sara", "due_date": "2009-06-02", "kind": "birthday"}).json()
    assert bday["kind"] == "birthday"
    dump = client.get("/backup").json()
    assert dump["profile"]["pet_name"] == "Yuki"


PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


def test_sleep_photos_and_entry_source(client):
    ok = client.put("/sleep/2026-10-11", json={"bed_at": "2026-10-10T20:30:00Z", "wake_at": "2026-10-11T04:00:00Z"}).json()
    assert ok["date"] == "2026-10-11" and ok["wake_at"].startswith("2026-10-11T04:00")
    assert client.put("/sleep/2026-10-12", json={"bed_at": "2026-10-12T05:00:00Z", "wake_at": "2026-10-12T04:00:00Z"}).status_code == 422
    client.put("/sleep/2026-10-12", json={"bed_at": "2026-10-11T21:00:00Z"})           # going to bed now, awake later
    assert client.put("/sleep/2026-10-12", json={"wake_at": "2026-10-12T04:30:00Z"}).json()["bed_at"].startswith("2026-10-11T21")
    assert [s["date"] for s in client.get("/sleep/?start=2026-10-12").json()] == ["2026-10-12"]

    assert client.put("/photos/2026-10-11", json={"image": "bm90IGFuIGltYWdl", "thumb": PNG_1PX}).status_code == 422
    client.put("/photos/2026-10-11", json={"image": "data:image/png;base64," + PNG_1PX, "thumb": PNG_1PX, "mime": "image/png", "caption": "sunset"})
    assert client.get("/photos/").json()[0]["caption"] == "sunset"
    res = client.get("/photos/2026-10-11?size=thumb")
    assert res.status_code == 200 and res.headers["content-type"] == "image/jpeg" and res.content.startswith(b"\x89PNG")
    assert client.delete("/photos/2026-10-11").status_code == 204

    e = client.post("/entries/", json={"mood": "rough", "text": "let it go", "source": "lantern"}).json()
    assert e["source"] == "lantern"
    assert client.post("/entries/", json={"mood": "okay", "text": "x", "source": "fax"}).status_code == 422
    dump = client.get("/backup").json()
    assert dump["sleep"] and dump["entries"][-1]["source"] == "lantern"


def test_monthly_letter_is_written_once_and_only_for_past_months(client):
    client.post("/entries/", json={"mood": "good", "text": "Great run today", "occurred_at": "2026-09-10T08:00:00Z"})
    client.post("/entries/", json={"mood": "good", "text": "Studied well", "occurred_at": "2026-09-11T08:00:00Z"})
    client.put("/days/2026-09-11", json={"reflection_gratitude": "Family dinner"})
    client.put("/profile", json={"pet_name": "Yuki"})
    letter = client.post("/letters/2026-09").json()
    assert letter["text"].startswith("Dear ") and "— Yuki" in letter["text"] and "2 days" in letter["text"]
    assert "family dinner" in letter["text"]
    assert client.post("/letters/2026-09").json()["created_at"] == letter["created_at"]      # written once
    assert client.post("/letters/2999-01").status_code == 409
    assert client.post("/letters/nope").status_code == 422
    assert [x["month"] for x in client.get("/letters/").json()] == ["2026-09"]


def test_habits_only_today_or_yesterday(client):
    h = client.post("/habits/", json={"name": "read"}).json()
    old = (_dt.date.today() - _dt.timedelta(days=6)).isoformat()
    later = (_dt.date.today() + _dt.timedelta(days=5)).isoformat()
    assert client.put(f"/habits/{h['id']}/days/{old}").status_code == 400
    assert client.put(f"/habits/{h['id']}/days/{later}").status_code == 400
    assert client.put(f"/habits/{h['id']}/days/{TODAY}").status_code == 200
