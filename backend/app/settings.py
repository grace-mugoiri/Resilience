from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    database_url: str = "postgresql+psycopg://resilience:resilience@localhost:5432/resilience"
    # The URL clients sign in NIP-98. Behind a TLS proxy FastAPI sees an internal URL,
    # so the expected URL is always built from this, never from request.url.
    public_api_base: str = "http://localhost:8000"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    platform_pubkey: str | None = None
    signed_config_path: str = "config/client-config.signed.json"
    nip98_window_seconds: int = 60
    # Hex pubkeys allowed to approve and suspend organisations (comma separated).
    admin_pubkeys: Annotated[list[str], NoDecode] = []
    nip05_timeout_seconds: float = 5.0
    # Dev and test only: fetch nostr.json from this base URL instead of https://<domain>.
    # Ignored unless APP_ENV is "dev" or "test".
    nip05_dev_base_url: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            v = [o.strip() for o in v.split(",") if o.strip()]
        if isinstance(v, list) and "*" in v:
            raise ValueError("CORS_ORIGINS must list exact origins, never '*'")
        return v

    @field_validator("admin_pubkeys", mode="before")
    @classmethod
    def split_admins(cls, v: object) -> object:
        if isinstance(v, str):
            v = [k.strip().lower() for k in v.split(",") if k.strip()]
        for key in v if isinstance(v, list) else []:
            if len(key) != 64 or not set(key) <= set("0123456789abcdef"):
                raise ValueError("ADMIN_PUBKEYS must be 64-character hex pubkeys (not npub)")
        return v

    @field_validator("public_api_base")
    @classmethod
    def strip_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @field_validator("platform_pubkey", "nip05_dev_base_url", mode="before")
    @classmethod
    def empty_is_none(cls, v: object) -> object:
        return v or None


@lru_cache
def get_settings() -> Settings:
    return Settings()
