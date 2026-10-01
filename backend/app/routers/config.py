"""GET /v1/config serves the client config (trusted relays, approved-orgs list address)
as a Nostr event signed by the platform key. The server only serves it; it cannot sign it,
because the platform secret key never lives on the server."""

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response

from app.nostr.events import verify_event
from app.settings import Settings, get_settings

router = APIRouter(prefix="/v1")


def load_signed_config(settings: Settings) -> dict:
    if not settings.platform_pubkey:
        raise HTTPException(503, "PLATFORM_PUBKEY is not configured")
    path = Path(settings.signed_config_path)
    if not path.is_file():
        raise HTTPException(503, "signed client config not found; run scripts/sign_config.py")
    event = json.loads(path.read_text())
    # Refuse to serve something the clients would reject anyway.
    if not verify_event(event) or event["pubkey"] != settings.platform_pubkey:
        raise HTTPException(500, "signed client config does not verify against PLATFORM_PUBKEY")
    return event


@router.get("/config")
def get_config(settings: Annotated[Settings, Depends(get_settings)], response: Response) -> dict:
    response.headers["Cache-Control"] = "public, max-age=300"
    return load_signed_config(settings)
