from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (and `backend/.env` in dev)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "intervia"
    mongodb_timeout_ms: int = 5000

    # Login (BE-9). Off: every request is the default user and /auth/me says auth_enabled=false.
    auth_enabled: bool = False
    auth_session_days: int = 30
    auth_cookie_name: str = "intervia_session"
    # Browsers keep Secure cookies on http://localhost except Safari; set false for dev if needed.
    auth_cookie_secure: bool = True
    login_max_failures: int = 5  # per email and window; then 429 too_many_attempts
    login_max_failures_per_ip: int = 20
    login_lock_minutes: int = 15
    signup_max_per_ip_hour: int = 10

    # Comma-separated origins allowed by CORS in dev (Vite dev server).
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
