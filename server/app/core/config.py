"""Application settings, loaded from the environment (and a local .env file)."""

from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    DATABASE_URL: str
    TEST_DATABASE_URL: str

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"

    ADMIN_TOKEN_TTL_HOURS: int = 12
    ACCESS_CODE_TTL_HOURS: int = 24

    # Shared key both clients send on every request. Empty disables the gate, which
    # is what keeps the test suite and local development from needing the header.
    APP_SECRET: str = ""

    # NoDecode keeps pydantic-settings from trying to JSON-decode the raw env
    # value, so a plain comma-separated list works: CORS_ORIGINS=a,b
    CORS_ORIGINS: Annotated[list[str], NoDecode] = []

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
