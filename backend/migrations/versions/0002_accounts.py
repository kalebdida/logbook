"""accounts: users, invites, and an owner (user_id) on every row

Everything that already exists becomes user 1's (the owner / admin).

Tables whose primary key changes (day_records, pomodoro_days, entries, goals
become per-user) can't be altered in place portably, so every data table is
rebuilt the same way: create <name>__new, copy the rows across, drop the old
table, rename. Only columns present in the old table are copied, so this
also upgrades a 1.x database that predates some columns or tables.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

OWNER = 1


def _owner_fk():
    return sa.ForeignKey("users.id", ondelete="CASCADE")


def _timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _activity_fields():
    return [
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("activity_category", sa.String(50), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
    ]


# name -> (columns + constraints, indexes [(name, columns)])
def _tables(suffix):
    day = "day_records" + suffix
    habits = "habits" + suffix
    return {
        "day_records": ([
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            *[sa.Column(n, sa.Text(), nullable=False, server_default="") for n in (
                "morning_intention", "morning_main_focus", "journal", "reflection_what_happened",
                "reflection_wins", "reflection_lessons", "reflection_tomorrow_plan",
                "reflection_gratitude", "brain_dump")],
            *_timestamps(),
            sa.PrimaryKeyConstraint("user_id", "date"),
        ], [("ix_day_records_created_at", ["created_at"])]),
        "entries": ([
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.Column("id", sa.String(64), nullable=False),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("mood", sa.String(20), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.PrimaryKeyConstraint("user_id", "id"),
        ], [("ix_entries_occurred_at", ["occurred_at"])]),
        "goals": ([
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.Column("id", sa.String(64), nullable=False),
            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("category", sa.String(20), nullable=False, server_default="daily"),
            sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
            sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("target_date", sa.Date(), nullable=True),
            sa.Column("activity_category", sa.String(50), nullable=True),
            sa.PrimaryKeyConstraint("user_id", "id"),
        ], []),
        "habits": ([
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.Column("name", sa.String(80), nullable=False),
            sa.Column("icon", sa.String(16), nullable=False, server_default=""),
            sa.Column("activity_category", sa.String(50), nullable=True),
            sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
            *_timestamps(),
            sa.PrimaryKeyConstraint("id"),
        ], [("ix_habits_created_at", ["created_at"]), ("ix_habits_user_id", ["user_id"])]),
        "pomodoro_days": ([
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("sessions", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("focus_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.PrimaryKeyConstraint("user_id", "date"),
        ], []),
        "activities": ([
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.Column("day_date", sa.Date(), nullable=False),
            *_activity_fields(),
            *_timestamps(),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id", "day_date"], [day + ".user_id", day + ".date"]),
        ], [("ix_activities_created_at", ["created_at"]), ("ix_activities_day_date", ["day_date"]),
            ("ix_activities_user_id", ["user_id"])]),
        "tasks": ([
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.Column("day_date", sa.Date(), nullable=False),
            sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
            *_activity_fields(),
            *_timestamps(),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id", "day_date"], [day + ".user_id", day + ".date"]),
        ], [("ix_tasks_created_at", ["created_at"]), ("ix_tasks_day_date", ["day_date"]),
            ("ix_tasks_user_id", ["user_id"])]),
        "habit_logs": ([
            sa.Column("habit_id", sa.Integer(), sa.ForeignKey(habits + ".id", ondelete="CASCADE"), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("user_id", sa.Integer(), _owner_fk(), nullable=False),
            sa.PrimaryKeyConstraint("habit_id", "date"),
        ], [("ix_habit_logs_date", ["date"]), ("ix_habit_logs_user_id", ["user_id"])]),
    }


# parents before children
ORDER = ["day_records", "entries", "goals", "habits", "pomodoro_days", "activities", "tasks", "habit_logs"]
SERIAL = ["habits", "activities", "tasks"]


def upgrade() -> None:
    bind = op.get_bind()
    postgres = bind.dialect.name == "postgresql"
    inspector = sa.inspect(bind)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(40), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False, server_default=""),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_table(
        "invites",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("kind", sa.String(10), nullable=False, server_default="signup"),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("note", sa.String(60), nullable=False, server_default=""),
        sa.Column("for_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash", name="uq_invites_code_hash"),
    )
    bind.execute(sa.text("INSERT INTO users (id, username, password_hash, is_admin, token_version) "
                         "VALUES (:id, 'owner', '', :yes, 0)"), {"id": OWNER, "yes": True})

    new = _tables("__new")
    old_columns = {}
    for name in ORDER:
        if inspector.has_table(name):
            old_columns[name] = {c["name"] for c in inspector.get_columns(name)}
            # index names are global in Postgres: free them for the new tables
            for index in inspector.get_indexes(name):
                if index.get("name"):
                    op.drop_index(index["name"], table_name=name)
        op.create_table(name + "__new", *new[name][0])

    for name in ORDER:
        if name not in old_columns:
            continue
        target = [c.name for c in new[name][0] if isinstance(c, sa.Column)]
        copied = [c for c in target if c in old_columns[name] and c != "user_id"]
        cols = ", ".join(f'"{c}"' for c in copied)
        bind.execute(sa.text(
            f'INSERT INTO "{name}__new" ("user_id", {cols}) SELECT {OWNER}, {cols} FROM "{name}"'
        ))

    for name in reversed(ORDER):
        if name in old_columns:
            op.drop_table(name)
    for name in ORDER:
        op.rename_table(name + "__new", name)
        for index_name, columns in new[name][1]:
            op.create_index(index_name, name, columns)

    if postgres:
        for name in ["users", *SERIAL]:
            bind.execute(sa.text(
                f"SELECT setval(pg_get_serial_sequence('{name}', 'id'), "
                f"GREATEST((SELECT COALESCE(MAX(id), 0) FROM \"{name}\"), 1))"
            ))


def downgrade() -> None:
    raise NotImplementedError("logbook doesn't go back to single-user. restore a backup into 1.x instead.")
