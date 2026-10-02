"""GET /v1/config serves the client config (trusted relays, approved-orgs list address)
as a Nostr event signed by the platform key. The server only serves it; it cannot sign it,
because the platform secret key never lives on the server."""

import json
import time
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, ValidationError

from app.nostr.events import first_tag, verify_event
from app.settings import Settings, get_settings

router = APIRouter(prefix="/v1")
CONFIG_KIND = 30078
CONFIG_D_TAG = "resilience/client-config"
CONFIG_SCHEMA_VERSION = 1


class ClientConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int
    relays: list[str]
    approved_orgs_list: str | None = None


def _validate_relay_url(value: str, production: bool) -> None:
    parsed = urlsplit(value)
    if parsed.scheme not in ({"wss"} if production else {"ws", "wss"}):
        raise ValueError("relay URLs must use wss (ws is allowed only outside production)")
    if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("relay URL must be an absolute websocket URL without credentials or query")


def load_signed_config(settings: Settings) -> dict:
    if not settings.platform_pubkey:
        raise HTTPException(503, "PLATFORM_PUBKEY is not configured")
    path = Path(settings.signed_config_path)
    if not path.is_file():
        raise HTTPException(503, "signed client config not found; run scripts/sign_config.py")
    event = json.loads(path.read_text())
    if not verify_event(event) or event["pubkey"] != settings.platform_pubkey:
        raise HTTPException(500, "signed client config does not verify against PLATFORM_PUBKEY")
    if event["kind"] != CONFIG_KIND or first_tag(event, "d") != CONFIG_D_TAG:
        raise HTTPException(500, "signed client config has invalid coordinates")
    expiration = first_tag(event, "expiration")
    now = int(time.time())
    if expiration is None or not expiration.isdigit() or int(expiration) <= now:
        raise HTTPException(500, "signed client config is expired or missing expiration")
    if event["created_at"] > now + 600:
        raise HTTPException(500, "signed client config is dated in the future")
    try:
        content = ClientConfig.model_validate_json(event["content"])
        if content.schema_version != CONFIG_SCHEMA_VERSION:
            raise ValueError("unsupported client config schema version")
        if len(content.relays) < 2 or len(set(content.relays)) != len(content.relays):
            raise ValueError("client config needs at least two distinct relays")
        for relay in content.relays:
            _validate_relay_url(relay, settings.app_env == "prod")
    except (ValidationError, ValueError) as exc:
        raise HTTPException(500, f"signed client config schema is invalid: {exc}") from exc
    return event


@router.get("/config")
def get_config(settings: Annotated[Settings, Depends(get_settings)], response: Response) -> dict:
    response.headers["Cache-Control"] = "public, max-age=300"
    return load_signed_config(settings)
