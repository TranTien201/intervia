from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, model_validator
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

    # CV / JD extraction (BE-4.4). `fake` needs no key: every CV gives the same sample profile.
    extractor_provider: Literal["llamacloud", "fake"] = "fake"
    llama_cloud_api_key: SecretStr | None = None
    # LlamaExtract plan per quality (docs/design/extraction.md section 8); parse uses the same.
    llama_tier_economy: str = "cost_effective"
    llama_tier_high: str = "agentic"
    extract_max_pages: int = 6  # caps the cost of an unexpectedly long file
    extract_timeout_s: int = 180  # per attempt; an attempt is retried up to twice

    @model_validator(mode="after")
    def _check_extractor_key(self) -> "Settings":
        if self.extractor_provider == "llamacloud" and not self.llama_cloud_api_key:
            raise ValueError("EXTRACTOR_PROVIDER=llamacloud needs LLAMA_CLOUD_API_KEY")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
