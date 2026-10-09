"""
Database connection and session management.

SQLite (backend/logbook.db) by default, so it runs with zero setup.
For PostgreSQL set DATABASE_URL to a postgres:// or postgresql:// URL.
"""

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# SQLite only allows the thread that opened a connection to use it by
# default. FastAPI can service a request on a different thread than the
# one that opened the session, so this flag turns that check off.
connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

# pool_pre_ping: hosted Postgres (Neon) closes idle connections; this
# quietly replaces dead ones instead of failing the next request.
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=not settings.is_sqlite)

# SQLite ignores foreign key constraints unless a connection turns them on
# explicitly. Task/Activity rely on a real FK back to day_records, so this
# has to run on every new connection or that constraint is just decorative.
if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Every ORM model inherits from this."""

    pass


def get_db():
    """FastAPI dependency that hands a route a DB session and always closes it after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def add_missing_columns() -> list[str]:
    """Add columns that exist on a model but not yet in the database.

    create_all() creates missing tables but never alters existing ones, so
    a database made by an older version would lack newer columns (for
    example goals.activity_category). This handles that one safe case:
    new nullable columns. Renames, drops, and type changes need real
    migrations (Alembic) once the schema needs them.
    """
    added = []
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing or not column.nullable:
                    continue
                column_type = column.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}'))
                added.append(f"{table.name}.{column.name}")
    return added


def run_migrations() -> None:
    """Bring the database schema up to date. Called on startup.

    Fresh database: Alembic creates everything.
    Database from logbook 1.x (tables but no Alembic history): it matches
    the 0001 baseline closely enough, so it's recorded as 0001 and the later
    migrations run on it. 0002 rebuilds every data table and copies only
    the columns that exist, which covers anything 1.x lacked.
    """
    from alembic import command
    from alembic.config import Config

    from app.config import BACKEND_DIR

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    inspector = inspect(engine)
    if inspector.has_table("entries") and not inspector.has_table("alembic_version"):
        command.stamp(config, "0001")
    command.upgrade(config, "head")
