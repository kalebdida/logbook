import os
import sys
import tempfile
from pathlib import Path

import pytest

# Throwaway database: SQLite by default, or set TEST_DATABASE_URL to run the
# whole suite against PostgreSQL. Never your real logbook.db.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
for var in ("LOGBOOK_PASSWORD", "LOGBOOK_AI_PROVIDER", "LOGBOOK_AI_API_KEY", "ANTHROPIC_API_KEY", "LOGBOOK_AI_BASE_URL"):
    os.environ.pop(var, None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


def reset_database():
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))


@pytest.fixture()
def client():
    reset_database()
    settings.password = ""
    settings.ai_provider = ""
    settings.ai_api_key = ""
    settings.ai_base_url = ""
    settings.ai_model = ""
    with TestClient(app) as c:  # runs the lifespan: migrations
        yield c
    settings.password = ""
