from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PAYPAL_CLIENT_ID: str = "mock_client_id"
    PAYPAL_CLIENT_SECRET: str = "mock_client_secret"
    PAYPAL_BASE_URL: str = "https://api-m.sandbox.paypal.com"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.1-flash-lite"

    MANDATE_SIGNING_SECRET: str = "mandate-guard-signing-secret-key-32chars-min"

    FRONTEND_URL: str = "http://localhost:5173"
    DATABASE_URL: str = "sqlite:///./mandate_guard.db"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

