"""
Centralized application settings.

Values come from environment variables or backend/.env. This is the one
place that reads the environment; everything else imports `settings`.
"""

from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="LOGBOOK_", extra="ignore")

    app_name: str = "Logbook"
    app_version: str = "2.2.0"
    environment: str = "development"

    # DATABASE_URL is the name hosting providers (Render, Neon) use.
    database_url: str = Field(
        default=f"sqlite:///{(BACKEND_DIR / 'logbook.db').as_posix()}",
        validation_alias=AliasChoices("DATABASE_URL", "LOGBOOK_DATABASE_URL"),
    )

    # Login. Empty password = no login (fine on your own machine).
    # Set LOGBOOK_PASSWORD whenever the server is reachable from a network:
    # it turns on accounts, and it's the admin's password (admin_username).
    password: str = ""
    admin_username: str = "admin"
    max_users: int = 10           # accounts in total, the admin included
    invite_days: int = 7          # how long an invite or reset code works
    ai_for_everyone: bool = False  # let invited accounts use the server's AI key (you pay for it)
    # Read the client address from X-Forwarded-For. Only behind a proxy that
    # sets it (Render does); otherwise anyone could claim any address.
    # Unset: on when running on Render, off elsewhere.
    trust_proxy: bool | None = None
    secret: str = ""          # signs login tokens. unset: a random one is made and kept in secret_file
    secret_file: str = ""     # default: backend/.logbook-secret
    token_days: int = 30

    # AI companion. Empty provider = AI off.
    #   anthropic: LOGBOOK_AI_API_KEY (or ANTHROPIC_API_KEY), model defaults to claude-haiku-5-5
    #   openai:    any OpenAI-compatible API: OpenAI, OpenRouter, Groq, or a local
    #              Ollama / LM Studio via LOGBOOK_AI_BASE_URL=http://localhost:11434/v1
    ai_provider: str = ""
    ai_api_key: str = Field(default="", validation_alias=AliasChoices("LOGBOOK_AI_API_KEY", "ANTHROPIC_API_KEY"))
    ai_model: str = ""
    ai_base_url: str = ""

    @field_validator("database_url")
    @classmethod
    def _use_psycopg3(cls, value: str) -> str:
        # Neon/Render hand out postgres:// or postgresql:// URLs; SQLAlchemy
        # needs to be told to use the psycopg (v3) driver we ship.
        if value.startswith("postgres://"):
            value = "postgresql://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            value = "postgresql+psycopg://" + value[len("postgresql://"):]
        return value

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
