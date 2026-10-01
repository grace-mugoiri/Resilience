from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.auth.nip98 import NostrPubkey
from app.settings import Settings, get_settings


def require_admin(pubkey: NostrPubkey, settings: Annotated[Settings, Depends(get_settings)]) -> str:
    if pubkey not in settings.admin_pubkeys:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a platform admin")
    return pubkey


AdminPubkey = Annotated[str, Depends(require_admin)]
