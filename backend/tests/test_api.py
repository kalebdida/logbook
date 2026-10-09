from sqlalchemy import inspect, text

from app.database import add_missing_columns, engine


def test_frontend_and_health_served(client):
    assert client.get("/").status_code == 200
    assert "text/html" in client.get("/").headers["content-type"]
    body = client.get("/health").json()
    assert body["status"] == "online"
    assert body["counts"]["entries"] == 0


def test_timestamps_are_marked_utc(client):
    created = client.post("/entries/", json={"mood": "good", "text": "hi"}).json()
    assert created["occurred_at"].endswith("Z")
    listed = client.get("/entries/").json()[0]
    assert listed["occurred_at"].endswith("Z")


def test_offset_timestamps_are_converted_to_utc(client):
    # 23:00 in Addis Ababa is 20:00 UTC
    e = client.post("/entries/", json={"mood": "okay", "text": "x", "occurred_at": "2026-10-08T23:00:00+03:00"}).json()
    assert e["occurred_at"].startswith("2026-10-08T20:00:00")


def test_entry_edit_and_delete(client):
    e = client.post("/entries/", json={"mood": "good", "text": "first"}).json()
    edited = client.patch(f"/entries/{e['id']}", json={"text": "edited", "mood": "rough"}).json()
    assert edited["text"] == "edited" and edited["mood"] == "rough"
    assert edited["occurred_at"] == e["occurred_at"]
    assert client.delete(f"/entries/{e['id']}").status_code == 204
    assert client.get(f"/entries/{e['id']}").status_code == 404


def test_day_record_partial_update_keeps_other_fields(client):
    client.put("/days/2026-10-08", json={"journal": "keep me"})
    day = client.put("/days/2026-10-08", json={"reflection_wins": "a win"}).json()
    assert day["journal"] == "keep me"
    assert day["reflection_wins"] == "a win"


def test_tasks_filter_and_move_to_today(client):
    client.post("/tasks/", json={"day_date": "2026-10-06", "title": "old open"})
    done = client.post("/tasks/", json={"day_date": "2026-10-06", "title": "old done"}).json()
    client.patch(f"/tasks/{done['id']}", json={"completed": True})
    client.post("/tasks/", json={"day_date": "2026-10-08", "title": "today"})

    carry = client.get("/tasks/", params={"before": "2026-10-08", "completed": False}).json()
    assert [t["title"] for t in carry] == ["old open"]

    moved = client.patch(f"/tasks/{carry[0]['id']}", json={"day_date": "2026-10-08"}).json()
    assert moved["day_date"] == "2026-10-08"
    assert len(client.get("/tasks/", params={"day_date": "2026-10-08"}).json()) == 2


def test_task_category_is_validated(client):
    bad = client.post("/tasks/", json={"day_date": "2026-10-08", "title": "t", "activity_category": "nonsense"})
    assert bad.status_code == 422
    ok = client.post("/tasks/", json={"day_date": "2026-10-08", "title": "t", "activity_category": "coding"})
    assert ok.status_code == 201


def test_goal_completion_and_life_area(client):
    g = client.post("/goals/", json={"title": "g", "progress": 40, "activity_category": "fitness"}).json()
    assert g["activity_category"] == "fitness" and not g["completed"]
    done = client.patch(f"/goals/{g['id']}", json={"progress": 100}).json()
    assert done["completed"] and done["completed_at"].endswith("Z")
    reopened = client.patch(f"/goals/{g['id']}", json={"progress": 90}).json()
    assert not reopened["completed"] and reopened["completed_at"] is None


def test_backup_round_trip_is_additive_and_idempotent(client):
    client.post("/entries/", json={"mood": "good", "text": "e1", "id": "e-1", "occurred_at": "2026-10-01T10:00:00Z"})
    client.put("/days/2026-10-01", json={"journal": "j"})
    client.post("/tasks/", json={"day_date": "2026-10-01", "title": "t1", "activity_category": "work"})
    client.post("/activities/", json={"day_date": "2026-10-01", "title": "run", "activity_category": "fitness", "duration_minutes": 30})
    client.post("/goals/", json={"title": "g1", "progress": 100})
    client.post("/pomodoro/2026-10-01/sessions", json={"focus_ms": 1500000})

    backup = client.get("/backup").json()
    for key in ["entries", "day_records", "tasks", "activities", "goals", "pomodoro_days"]:
        assert len(backup[key]) == 1, key
    for key in ["habits", "habit_logs"]:
        assert backup[key] == [], key

    # restoring into the same database adds nothing
    again = client.post("/backup/restore", json=backup).json()
    assert all(again[k]["added"] == 0 for k in again), again

    # restoring into an empty database brings everything back
    from tests.conftest import reset_database
    from app.database import run_migrations
    reset_database()
    run_migrations()
    restored = client.post("/backup/restore", json=backup).json()
    assert all(restored[k]["added"] == 1 for k in restored if not k.startswith("habit")), restored
    assert client.get("/entries/e-1").json()["occurred_at"] == "2026-10-01T10:00:00Z"
    assert client.get("/goals/").json()[0]["completed"] is True


def test_restore_fills_only_empty_day_fields(client):
    client.put("/days/2026-10-02", json={"journal": "mine"})
    res = client.post("/backup/restore", json={"day_records": [
        {"date": "2026-10-02", "journal": "theirs", "reflection_wins": "w"}
    ]}).json()
    assert res["day_records"]["merged"] == 1
    day = client.get("/days/2026-10-02").json()
    assert day["journal"] == "mine" and day["reflection_wins"] == "w"


def test_old_database_gets_new_columns(client):
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE goals DROP COLUMN activity_category"))
    assert "activity_category" not in {c["name"] for c in inspect(engine).get_columns("goals")}
    assert "goals.activity_category" in add_missing_columns()
    assert "activity_category" in {c["name"] for c in inspect(engine).get_columns("goals")}
