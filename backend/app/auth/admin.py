from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.auth.nip98 import NostrPubkey
from app.settings import Settings, get_settings


def require_admin(pubkey: NostrPubkey, settings: Annotated[Settings, Depends(get_settings)]) -> str:
    if pubkey not in settings.admin_pubkeys:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a platform admin")
    return pubkey


AdminPubkey = Annotated[str, Depends(require_admin)]


def require_sensitive_admin(scope: str):
    from app.auth.scoped import require_scoped_authorization

    scoped = require_scoped_authorization(scope)

    def dependency(
        pubkey: AdminPubkey,
        authorized: Annotated[str, Depends(scoped)],
    ) -> str:
        if pubkey != authorized:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "authorization principal mismatch")
        return pubkey

    return dependency
