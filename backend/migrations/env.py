"""Alembic environment: uses the app's own engine and models."""

from alembic import context

import app.models  # noqa: F401  registers every model
from app.config import settings
from app.database import Base, engine

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=settings.database_url, target_metadata=target_metadata, literal_binds=True,
                      render_as_batch=settings.is_sqlite)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        # batch mode lets ALTER TABLE work on SQLite
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=settings.is_sqlite)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
