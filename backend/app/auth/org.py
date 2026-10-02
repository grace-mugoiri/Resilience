"""Authorization for online organization keys with narrowly delegated scopes."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.scoped import require_scoped_authorization
from app.db.models import Organization, OrganizationOperationalKey
from app.db.session import get_db

Db = Annotated[Session, Depends(get_db)]


def require_org_operation(key_scope: str, authorization_scope: str) -> Callable:
    scoped_dependency = require_scoped_authorization(authorization_scope)

    async def dependency(
        request: Request,
        pubkey: Annotated[str, Depends(scoped_dependency)],
        db: Db,
    ) -> str:
        org_id = uuid.UUID(request.path_params["org_id"])
        org = db.get(Organization, org_id)
        if org is None or org.status != "approved":
            raise HTTPException(404, "organisation not found")
        key = db.get(OrganizationOperationalKey, (org_id, pubkey))
        now = datetime.now(UTC)
        if (
            key is None
            or key_scope not in key.scopes
            or key.valid_from > now
            or key.expires_at <= now
            or key.revoked_at is not None
        ):
            raise HTTPException(403, f"active organization key with {key_scope!r} scope required")
        return pubkey

    return dependency
