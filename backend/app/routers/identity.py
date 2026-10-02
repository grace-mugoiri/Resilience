import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.identity import Identity, IdentityRole
from app.schemas.identity import (
    ChangePinRequest,
    IdentityAuthResponse,
    IdentityCreateRequest,
    IdentityCreateResponse,
    IdentityLoginRequest,
    IdentityResponse,
    IdentityRestoreRequest,
)
from app.security import create_session, generate_recovery_phrase, get_current_identity, hash_secret
from app.services.nostr_service import get_nostr_service

router = APIRouter(prefix="/api/identity", tags=["identity"])

_ADJECTIVES = ["Quiet", "Steady", "Rising", "Gentle", "Brave", "Calm", "Bright", "Resilient"]
_NOUNS = ["River", "Ember", "Harbor", "Sparrow", "Baobab", "Horizon", "Lantern", "Meadow"]


def _generate_pseudonym() -> str:
    return f"{random.choice(_ADJECTIVES)}{random.choice(_NOUNS)}{random.randint(10, 99)}"


@router.post("", response_model=IdentityCreateResponse, status_code=status.HTTP_201_CREATED)
def create_identity(payload: IdentityCreateRequest, db: Session = Depends(get_db)):
    if payload.pseudonym:
        pseudonym = payload.pseudonym
        if db.query(Identity).filter_by(pseudonym=pseudonym).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "Pseudonym already taken, choose another")
    else:
        # Auto-generated pseudonyms retry on collision instead of failing the request.
        for _ in range(10):
            pseudonym = _generate_pseudonym()
            if not db.query(Identity).filter_by(pseudonym=pseudonym).first():
                break
        else:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not generate a unique pseudonym")

    nostr = get_nostr_service()
    keypair = nostr.generate_keypair(pseudonym)
    recovery_phrase = generate_recovery_phrase()

    identity = Identity(
        pseudonym=pseudonym,
        role=payload.role,
        npub=keypair.npub,
        avatar_seed=pseudonym.lower(),
        pin_hash=hash_secret(payload.pin),
        recovery_phrase_hash=hash_secret(recovery_phrase),
    )
    db.add(identity)
    db.commit()
    db.refresh(identity)

    return IdentityCreateResponse(
        identity=IdentityResponse.model_validate(identity),
        recovery_phrase=recovery_phrase,
        token=create_session(identity.id),
    )


@router.post("/restore", response_model=IdentityAuthResponse)
def restore_identity(payload: IdentityRestoreRequest, db: Session = Depends(get_db)):
    phrase_hash = hash_secret(payload.recovery_phrase.strip())
    identity = db.query(Identity).filter_by(recovery_phrase_hash=phrase_hash).one_or_none()
    if identity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recovery phrase not recognized")
    identity.pin_hash = hash_secret(payload.pin)
    db.commit()
    db.refresh(identity)
    return IdentityAuthResponse(identity=IdentityResponse.model_validate(identity), token=create_session(identity.id))


@router.post("/login", response_model=IdentityAuthResponse)
def login(payload: IdentityLoginRequest, db: Session = Depends(get_db)):
    identity = db.get(Identity, payload.identity_id)
    if identity is None or identity.pin_hash != hash_secret(payload.pin):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid identity or PIN")
    token = create_session(identity.id)
    return IdentityAuthResponse(identity=IdentityResponse.model_validate(identity), token=token)


@router.get("/me", response_model=IdentityResponse)
def get_me(current: Identity = Depends(get_current_identity)):
    return current


@router.post("/change-pin", response_model=IdentityResponse)
def change_pin(
    payload: ChangePinRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    if current.pin_hash != hash_secret(payload.current_pin):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current PIN is incorrect")
    current.pin_hash = hash_secret(payload.new_pin)
    db.commit()
    db.refresh(current)
    return current
