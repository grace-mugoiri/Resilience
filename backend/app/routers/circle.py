from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.circle import CircleMember
from app.models.identity import Identity
from app.schemas.circle import CircleMemberAddRequest, CircleMemberResponse
from app.security import get_current_identity

router = APIRouter(prefix="/api/circle", tags=["circle"])


def _to_response(db: Session, member: CircleMember) -> CircleMemberResponse:
    identity = db.get(Identity, member.member_identity_id)
    return CircleMemberResponse(
        id=member.id,
        member_identity_id=member.member_identity_id,
        pseudonym=identity.pseudonym if identity else "Unknown",
        label=member.label,
        added_at=member.added_at,
    )


@router.get("", response_model=list[CircleMemberResponse])
def list_circle(current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)):
    members = db.query(CircleMember).filter_by(owner_identity_id=current.id).all()
    return [_to_response(db, m) for m in members]


@router.post("", response_model=CircleMemberResponse, status_code=status.HTTP_201_CREATED)
def add_circle_member(
    payload: CircleMemberAddRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    if payload.member_identity_id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add yourself to your Circle")
    target = db.get(Identity, payload.member_identity_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Identity not found")

    existing = (
        db.query(CircleMember)
        .filter_by(owner_identity_id=current.id, member_identity_id=payload.member_identity_id)
        .one_or_none()
    )
    if existing is not None:
        return _to_response(db, existing)

    member = CircleMember(
        owner_identity_id=current.id, member_identity_id=payload.member_identity_id, label=payload.label
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return _to_response(db, member)


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_circle_member(
    member_id: str, current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)
):
    member = db.get(CircleMember, member_id)
    if member is None or member.owner_identity_id != current.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Circle member not found")
    db.delete(member)
    db.commit()
