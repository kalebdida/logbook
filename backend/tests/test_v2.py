"""Login, habits, AI proxy, and upgrading a 1.x database."""
import json

import httpx
from sqlalchemy import inspect, text

from app import ai
from app.config import settings
from app.database import Base, engine, run_migrations
from tests.conftest import reset_database


# ---------- login ----------

def test_open_when_no_password(client):
    assert client.get("/auth/status").json() == {"required": False, "authenticated": True}
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
    version, expires, sig = token.split(".")
    forged = f"{version}.{int(expires) + 999999}.{sig}"
    assert client.get("/entries/", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


# ---------- habits ----------

def test_habits_check_and_uncheck(client):
    h = client.post("/habits/", json={"name": "pray", "icon": "🙏", "activity_category": "faith"}).json()
    assert h["sort"] == 0
    client.put(f"/habits/{h['id']}/days/2026-10-08")
    client.put(f"/habits/{h['id']}/days/2026-10-08")      # idempotent
    client.put(f"/habits/{h['id']}/days/2026-10-09")
    logs = client.get("/habits/logs", params={"start": "2026-10-01", "end": "2026-10-31"}).json()
    assert [l["date"] for l in logs] == ["2026-10-08", "2026-10-09"]
    assert client.delete(f"/habits/{h['id']}/days/2026-10-09").status_code == 204
    assert len(client.get("/habits/logs").json()) == 1


def test_archived_habits_hidden_and_delete_removes_logs(client):
    a = client.post("/habits/", json={"name": "read"}).json()
    b = client.post("/habits/", json={"name": "gym"}).json()
    client.put(f"/habits/{b['id']}/days/2026-10-08")
    client.patch(f"/habits/{a['id']}", json={"archived": True})
    assert [h["name"] for h in client.get("/habits/").json()] == ["gym"]
    assert len(client.get("/habits/", params={"include_archived": True}).json()) == 2
    client.delete(f"/habits/{b['id']}")
    assert client.get("/habits/logs").json() == []


def test_habits_survive_backup_into_another_database(client):
    h = client.post("/habits/", json={"name": "Pray"}).json()
    client.put(f"/habits/{h['id']}/days/2026-10-08")
    backup = client.get("/backup").json()
    reset_database()
    run_migrations()
    client.post("/habits/", json={"name": "gym"})          # ids won't line up with the file
    result = client.post("/backup/restore", json=backup).json()
    assert result["habits"]["added"] == 1 and result["habit_logs"]["added"] == 1
    pray = [x for x in client.get("/habits/").json() if x["name"] == "Pray"][0]
    assert client.get("/habits/logs").json() == [{"habit_id": pray["id"], "date": "2026-10-08"}]
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


def test_ai_requires_login_when_password_set(client):
    settings.password = "pw"
    settings.ai_provider, settings.ai_api_key = "anthropic", "sk"
    assert client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401


# ---------- upgrading a 1.x database ----------

def test_v1_database_upgrades_in_place(client):
    client.post("/entries/", json={"mood": "good", "text": "from v1", "id": "keep-me"})
    # simulate a 1.x database: no habits tables, no Alembic history
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE habit_logs"))
        conn.execute(text("DROP TABLE habits"))
        conn.execute(text("DROP TABLE alembic_version"))
    run_migrations()
    insp = inspect(engine)
    assert insp.has_table("habits") and insp.has_table("habit_logs") and insp.has_table("alembic_version")
    assert client.get("/entries/keep-me").json()["text"] == "from v1"
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
        codes = list(pool.map(lambda _: client.put(f"/habits/{habit['id']}/days/2026-10-01").status_code, range(8)))
    assert set(codes) == {200}
    assert len(client.get("/habits/logs").json()) == 1
