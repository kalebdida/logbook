"""Invite-only accounts, and the promise they exist for: nobody can see,
change or delete another account's data. Not even the admin."""
from datetime import datetime, timedelta, timezone

import pytest

from app import auth
from app.config import settings
from app.database import SessionLocal
from app.models.user import Invite

ADMIN_PW = "admin password 123"


@pytest.fixture()
def server(client):
    settings.password = ADMIN_PW
    settings.admin_username = "kal"
    settings.max_users = 10
    settings.ai_for_everyone = False
    auth._failures.clear()
    auth._all_failures.clear()
    yield client
    settings.password = ""
    settings.admin_username = "admin"
    auth._failures.clear()
    auth._all_failures.clear()


def h(token):
    return {"Authorization": f"Bearer {token}"}


def admin_token(c):
    res = c.post("/auth/login", json={"username": "kal", "password": ADMIN_PW})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def invite(c, admin, note=""):
    res = c.post("/auth/invites", json={"note": note}, headers=h(admin))
    assert res.status_code == 201, res.text
    return res.json()["code"]


def make_user(c, admin, name, pw="friend password 1"):
    res = c.post("/auth/signup", json={"invite": invite(c, admin), "username": name, "password": pw})
    assert res.status_code == 201, res.text
    return res.json()["token"]


def fill(c, token, tag):
    """One of everything, so every table has a row for this account."""
    H = h(token)
    entry = c.post("/entries/", json={"mood": "good", "text": f"{tag} secret entry", "id": "same-id"}, headers=H).json()
    c.put("/days/2026-10-01", json={"journal": f"{tag} secret journal"}, headers=H)
    task = c.post("/tasks/", json={"day_date": "2026-10-01", "title": f"{tag} task"}, headers=H).json()
    act = c.post("/activities/", json={"day_date": "2026-10-01", "title": f"{tag} act", "duration_minutes": 5}, headers=H).json()
    goal = c.post("/goals/", json={"title": f"{tag} goal"}, headers=H).json()
    c.post("/pomodoro/2026-10-01/sessions", json={"focus_ms": 60000}, headers=H)
    habit = c.post("/habits/", json={"name": f"{tag} habit"}, headers=H).json()
    c.put(f"/habits/{habit['id']}/days/2026-10-01", headers=H)
    return {"entry": entry, "task": task, "act": act, "goal": goal, "habit": habit}


# ---------- isolation ----------

def test_accounts_see_only_their_own_data(server):
    c = server
    admin = admin_token(c)
    amen, beti = make_user(c, admin, "amen"), make_user(c, admin, "beti")
    mine, a, b = fill(c, admin, "kal"), fill(c, amen, "amen"), fill(c, beti, "beti")

    for token, tag in ((admin, "kal"), (amen, "amen"), (beti, "beti")):
        H = h(token)
        everything = str([c.get(p, headers=H).json() for p in
                          ("/entries/", "/days/", "/tasks/", "/activities/", "/goals/", "/pomodoro/", "/habits/", "/habits/logs", "/backup")])
        for other in {"kal", "amen", "beti"} - {tag}:
            assert other not in everything, f"{tag} can see {other}'s data"
        assert f"{tag} secret entry" in everything and f"{tag} secret journal" in everything
        assert len(c.get("/entries/", headers=H).json()) == 1
        assert len(c.get("/habits/logs", headers=H).json()) == 1
        assert c.get("/pomodoro/2026-10-01", headers=H).json()["sessions"] == 1
        assert c.get("/health", headers=H).json()["counts"]["entries"] == 1

    # the same client-made entry id in three accounts: three separate entries
    assert c.get("/entries/same-id", headers=h(amen)).json()["text"] == "amen secret entry"
    assert c.get("/entries/same-id", headers=h(beti)).json()["text"] == "beti secret entry"
    assert mine["entry"]["id"] == a["entry"]["id"] == "same-id"


def test_cannot_touch_another_accounts_rows_by_id(server):
    c = server
    admin = admin_token(c)
    amen, beti = make_user(c, admin, "amen"), make_user(c, admin, "beti")
    a = fill(c, amen, "amen")
    B = h(beti)

    assert c.get(f"/goals/{a['goal']['id']}", headers=B).status_code == 404
    for method, path, body in [
        ("patch", f"/tasks/{a['task']['id']}", {"title": "hacked"}),
        ("delete", f"/tasks/{a['task']['id']}", None),
        ("patch", f"/activities/{a['act']['id']}", {"title": "hacked"}),
        ("delete", f"/activities/{a['act']['id']}", None),
        ("patch", f"/goals/{a['goal']['id']}", {"title": "hacked"}),
        ("delete", f"/goals/{a['goal']['id']}", None),
        ("patch", f"/habits/{a['habit']['id']}", {"name": "hacked"}),
        ("delete", f"/habits/{a['habit']['id']}", None),
        ("put", f"/habits/{a['habit']['id']}/days/2026-10-02", None),
        ("delete", f"/habits/{a['habit']['id']}/days/2026-10-01", None),
    ]:
        kwargs = {"headers": B}
        if body is not None:
            kwargs["json"] = body
        res = getattr(c, method)(path, **kwargs)
        assert res.status_code == 404, (method, path, res.status_code)

    # beti writing "her" entry with amen's id makes her own, it doesn't overwrite his
    c.patch("/entries/same-id", json={"text": "beti edit"}, headers=B)
    assert c.get("/entries/same-id", headers=B).status_code == 404
    c.delete("/entries/same-id", headers=B)
    c.delete("/days/2026-10-01", headers=B)

    # amen's things are all still there, untouched
    A = h(amen)
    assert c.get("/entries/same-id", headers=A).json()["text"] == "amen secret entry"
    assert c.get("/days/2026-10-01", headers=A).json()["journal"] == "amen secret journal"
    assert c.get("/tasks/", headers=A).json()[0]["title"] == "amen task"
    assert c.get("/activities/", headers=A).json()[0]["title"] == "amen act"
    assert c.get("/goals/", headers=A).json()[0]["title"] == "amen goal"
    assert c.get("/habits/", headers=A).json()[0]["name"] == "amen habit"
    assert len(c.get("/habits/logs", headers=A).json()) == 1


def test_restore_goes_into_your_own_account(server):
    c = server
    admin = admin_token(c)
    amen, beti = make_user(c, admin, "amen"), make_user(c, admin, "beti")
    fill(c, amen, "amen")
    backup = c.get("/backup", headers=h(amen)).json()
    res = c.post("/backup/restore", json=backup, headers=h(beti)).json()  # beti imports a copy of amen's file
    assert res["entries"]["added"] == 1 and res["habits"]["added"] == 1
    assert len(c.get("/entries/", headers=h(amen)).json()) == 1             # amen unchanged
    assert c.get("/backup", headers=h(beti)).json()["entries"][0]["text"] == "amen secret entry"


def test_admin_has_no_way_to_read_other_accounts(server):
    c = server
    admin = admin_token(c)
    amen = make_user(c, admin, "amen")
    fill(c, amen, "amen")
    users = c.get("/auth/users", headers=h(admin)).json()
    assert [u["username"] for u in users] == ["kal", "amen"]
    assert set(users[1]) == {"id", "username", "is_admin", "created_at"}  # no counts, no content
    assert "amen" not in str(c.get("/backup", headers=h(admin)).json())
    paths = set(c.app.openapi()["paths"])
    # the only routes that take an account id are the admin's account tools
    assert {p for p in paths if "{user_id}" in p} == {"/auth/users/{user_id}", "/auth/users/{user_id}/reset-code"}


# ---------- invites and sign up ----------

def test_invites_are_single_use_and_expire(server):
    c = server
    admin = admin_token(c)
    code = invite(c, admin, "for amen")
    ok = c.post("/auth/signup", json={"invite": code.upper().replace("-", " "), "username": "Amen", "password": "long enough pw"})
    assert ok.status_code == 201 and ok.json()["user"] == {"username": "amen", "is_admin": False}
    again = c.post("/auth/signup", json={"invite": code, "username": "other", "password": "long enough pw"})
    assert again.status_code == 400

    old = invite(c, admin)
    with SessionLocal() as db:
        row = db.query(Invite).filter(Invite.used_at.is_(None)).first()
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert c.post("/auth/signup", json={"invite": old, "username": "late", "password": "long enough pw"}).status_code == 400

    listed = c.get("/auth/invites", headers=h(admin)).json()
    assert {i["status"] for i in listed} == {"used", "expired"}
    assert all("code" not in i and "code_hash" not in i for i in listed)


def test_signup_rules(server):
    c = server
    admin = admin_token(c)
    code = invite(c, admin)
    bad = [("kal", "long enough pw"), ("admin", "long enough pw"), ("ab", "long enough pw"),
           ("has space", "long enough pw"), ("fine_name", "short")]
    for name, pw in bad:
        assert c.post("/auth/signup", json={"invite": code, "username": name, "password": pw}).status_code == 400, name
    assert c.post("/auth/signup", json={"invite": code, "username": "fine_name", "password": "long enough pw"}).status_code == 201
    dup = c.post("/auth/signup", json={"invite": invite(c, admin), "username": "FINE_NAME", "password": "long enough pw"})
    assert dup.status_code == 400 and "taken" in dup.json()["detail"]


def test_server_limit(server):
    c = server
    settings.max_users = 2
    try:
        admin = admin_token(c)
        make_user(c, admin, "amen")
        assert c.post("/auth/invites", json={}, headers=h(admin)).status_code == 400
    finally:
        settings.max_users = 10


def test_only_admin_manages_accounts(server):
    c = server
    admin = admin_token(c)
    amen = make_user(c, admin, "amen")
    A = h(amen)
    assert c.post("/auth/invites", json={}, headers=A).status_code == 403
    assert c.get("/auth/invites", headers=A).status_code == 403
    assert c.get("/auth/users", headers=A).status_code == 403
    assert c.post("/auth/users/2/reset-code", headers=A).status_code == 403
    assert c.request("DELETE", "/auth/users/1", json={"password": "x"}, headers=A).status_code == 403
    assert c.post("/auth/signup", json={"invite": "aaaa-bbbb-cccc", "username": "x", "password": "y"}).status_code == 400


def test_signup_needs_accounts_mode(client):
    assert client.post("/auth/signup", json={"invite": "x", "username": "amen", "password": "long enough pw"}).status_code == 400


# ---------- login, passwords, sessions ----------

def test_login_with_username(server):
    c = server
    admin = admin_token(c)
    make_user(c, admin, "amen", "amen password")
    assert c.post("/auth/login", json={"username": "AMEN ", "password": "amen password"}).status_code == 200
    assert c.post("/auth/login", json={"username": "amen", "password": ADMIN_PW}).status_code == 401
    assert c.post("/auth/login", json={"username": "kal", "password": "amen password"}).status_code == 401
    assert c.post("/auth/login", json={"username": "nobody", "password": "amen password"}).status_code == 401
    # older apps send only a password: that means the admin
    assert c.post("/auth/login", json={"password": ADMIN_PW}).json()["user"] == {"username": "kal", "is_admin": True}
    me = c.get("/auth/me", headers=h(admin)).json()
    assert me["username"] == "kal" and me["is_admin"] is True


def ip(n):
    return {"X-Forwarded-For": f"10.0.{n // 250}.{n % 250}"}


@pytest.fixture()
def proxied(server):
    settings.trust_proxy = True   # as on Render: the proxy's X-Forwarded-For is the client
    yield server
    settings.trust_proxy = None


def test_guesser_is_stopped_but_cant_lock_the_owner_out(proxied):
    c = proxied
    admin = admin_token(c)
    make_user(c, admin, "amen", "amen password")
    login = lambda pw, n: c.post("/auth/login", json={"username": "amen", "password": pw}, headers=ip(n)).status_code
    # one address: 5 tries at amen, then it's stopped, even with the right password
    assert [login("wrong", 1) for _ in range(6)] == [401] * 5 + [429]
    assert login("amen password", 1) == 429
    # amen, from their own phone, gets straight in
    assert login("amen password", 2) == 200
    # a guesser spreading over many addresses: once amen is "hot", every address
    # that has missed is refused, so each address gets about one try
    for n in range(10, 40):
        login("wrong", n)
    assert login("wrong", 10) == 429
    assert login("amen password", 99) == 200          # a fresh address (the owner) still works


def test_without_a_proxy_the_forwarded_header_is_ignored(server):
    c = server
    settings.trust_proxy = False
    try:
        codes = [c.post("/auth/login", json={"username": "kal", "password": "x"}, headers=ip(n)).status_code for n in range(8)]
        assert codes[5] == 429                          # rotating the header didn't help
    finally:
        settings.trust_proxy = None


def test_junk_codes_lock_only_the_sender(proxied):
    c = proxied
    admin = admin_token(c)
    make_user(c, admin, "amen", "amen password")
    for n in range(40):
        c.post("/auth/signup", json={"invite": "aaaa-aaaa-aaaa", "username": "zz", "password": "p" * 10}, headers=ip(1))
        c.post("/auth/reset", json={"username": "amen", "code": "aaaa-aaaa-aaaa", "password": "p" * 10}, headers=ip(2))
    assert c.post("/auth/signup", json={"invite": "x", "username": "zz", "password": "p" * 10}, headers=ip(1)).status_code == 429
    # nobody else is affected: amen logs in, the admin's invite works
    assert c.post("/auth/login", json={"username": "amen", "password": "amen password"}, headers=ip(3)).status_code == 200
    good = c.post("/auth/signup", json={"invite": invite(c, admin), "username": "beti", "password": "beti password"}, headers=ip(4))
    assert good.status_code == 201


def test_one_invite_cannot_make_two_accounts_at_once(server):
    import threading
    from app.routers import auth as auth_router
    c = server
    admin = admin_token(c)
    code = invite(c, admin)
    real = auth_router._usable_code
    gate = threading.Barrier(2)

    def both_see_it_unused(db, code, kind):   # hold both requests until each has checked the code
        found = real(db, code, kind)
        try:
            gate.wait(timeout=3)
        except threading.BrokenBarrierError:
            pass
        return found

    auth_router._usable_code = both_see_it_unused
    codes = []
    try:
        threads = [threading.Thread(target=lambda n=n: codes.append(c.post("/auth/signup", json={
            "invite": code, "username": n, "password": "long enough pw"}).status_code)) for n in ("racer1", "racer2")]
        [t.start() for t in threads]
        [t.join() for t in threads]
    finally:
        auth_router._usable_code = real
    assert sorted(codes) == [201, 400]
    assert len(c.get("/auth/users", headers=h(admin)).json()) == 2


def test_change_password_signs_out_other_devices(server):
    c = server
    admin = admin_token(c)
    phone = make_user(c, admin, "amen", "first password")
    laptop = c.post("/auth/login", json={"username": "amen", "password": "first password"}).json()["token"]
    assert c.post("/auth/password", json={"current": "wrong one!!", "new": "second password"}, headers=h(phone)).status_code == 401
    res = c.post("/auth/password", json={"current": "first password", "new": "second password"}, headers=h(phone))
    assert res.status_code == 200
    assert c.get("/entries/", headers=h(res.json()["token"])).status_code == 200   # this device: new token
    assert c.get("/entries/", headers=h(laptop)).status_code == 401                 # the other one is out
    assert c.post("/auth/login", json={"username": "amen", "password": "second password"}).status_code == 200
    # the admin's password lives in the server settings
    assert c.post("/auth/password", json={"current": ADMIN_PW, "new": "whatever123"}, headers=h(admin)).status_code == 400


def test_logout_everywhere(server):
    c = server
    admin = admin_token(c)
    amen = make_user(c, admin, "amen")
    assert c.post("/auth/logout-everywhere", headers=h(amen)).status_code == 200
    assert c.get("/entries/", headers=h(amen)).status_code == 401
    assert c.get("/entries/", headers=h(admin)).status_code == 200


def test_reset_code_flow(server):
    c = server
    admin = admin_token(c)
    old = make_user(c, admin, "amen", "forgotten pw!")
    beti = make_user(c, admin, "beti")
    users = c.get("/auth/users", headers=h(admin)).json()
    amen_id = next(u["id"] for u in users if u["username"] == "amen")
    code = c.post(f"/auth/users/{amen_id}/reset-code", headers=h(admin)).json()["code"]
    # the code only works for amen, and isn't a sign-up invite
    assert c.post("/auth/reset", json={"username": "beti", "code": code, "password": "taken over!!"}).status_code == 400
    assert c.post("/auth/signup", json={"invite": code, "username": "sneaky", "password": "long enough pw"}).status_code == 400
    assert c.get("/auth/me", headers=h(old)).json()["last_reset_at"] is None
    res = c.post("/auth/reset", json={"username": "amen", "code": code, "password": "brand new pw"})
    assert res.status_code == 200
    # amen is told: a reset they didn't ask for (the admin using the code) can't go unnoticed
    assert c.get("/auth/me", headers=h(res.json()["token"])).json()["last_reset_at"] is not None
    assert c.get("/entries/", headers=h(old)).status_code == 401
    assert c.post("/auth/login", json={"username": "amen", "password": "brand new pw"}).status_code == 200
    assert c.post("/auth/reset", json={"username": "amen", "code": code, "password": "again again"}).status_code == 400
    assert c.get("/entries/", headers=h(beti)).status_code == 200


def test_delete_own_account_removes_everything(server):
    c = server
    admin = admin_token(c)
    amen, beti = make_user(c, admin, "amen"), make_user(c, admin, "beti")
    fill(c, amen, "amen")
    fill(c, beti, "beti")
    assert c.post("/auth/delete-account", json={"password": "nope"}, headers=h(amen)).status_code == 401
    assert c.post("/auth/delete-account", json={"password": "friend password 1"}, headers=h(amen)).status_code == 204
    assert c.get("/entries/", headers=h(amen)).status_code == 401
    from app.models import Entry, HabitLog, Task
    with SessionLocal() as db:
        assert db.query(Entry).count() == 1 and db.query(Task).count() == 1 and db.query(HabitLog).count() == 1
    assert c.get("/entries/", headers=h(beti)).json()[0]["text"] == "beti secret entry"
    assert c.post("/auth/delete-account", json={"password": ADMIN_PW}, headers=h(admin)).status_code == 400


def test_admin_removes_an_account(server):
    c = server
    admin = admin_token(c)
    amen = make_user(c, admin, "amen")
    fill(c, amen, "amen")
    amen_id = c.get("/auth/users", headers=h(admin)).json()[1]["id"]
    assert c.request("DELETE", f"/auth/users/{amen_id}", json={"password": "wrong"}, headers=h(admin)).status_code == 401
    assert c.request("DELETE", f"/auth/users/{amen_id}", json={"password": ADMIN_PW}, headers=h(admin)).status_code == 204
    assert c.request("DELETE", "/auth/users/1", json={"password": ADMIN_PW}, headers=h(admin)).status_code == 404
    assert [u["username"] for u in c.get("/auth/users", headers=h(admin)).json()] == ["kal"]
    # the name is free again
    make_user(c, admin, "amen")


def test_server_ai_key_is_admin_only_by_default(server):
    c = server
    settings.ai_api_key = "sk-test"
    try:
        admin = admin_token(c)
        amen = make_user(c, admin, "amen")
        assert c.get("/ai/status", headers=h(admin)).json()["available"] is True
        assert c.get("/ai/status", headers=h(amen)).json()["available"] is False
        msg = {"messages": [{"role": "user", "content": "hi"}]}
        assert c.post("/ai/chat", json=msg, headers=h(amen)).status_code == 503
        settings.ai_for_everyone = True
        assert c.get("/ai/status", headers=h(amen)).json()["available"] is True
    finally:
        settings.ai_api_key = ""
        settings.ai_for_everyone = False


def test_password_hashes(server):
    stored = auth.hash_password("correct horse battery")
    assert stored.startswith("scrypt$") and "correct" not in stored
    assert auth.verify_password("correct horse battery", stored)
    assert not auth.verify_password("correct horse batterY", stored)
    assert not auth.verify_password("x", "garbage")
    assert auth.hash_password("same") != auth.hash_password("same")  # salted
