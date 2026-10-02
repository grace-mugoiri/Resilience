from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.health import HealthRecord, HealthShare
from app.models.identity import Identity
from app.schemas.health import (
    ActiveShare,
    HealthRecordCreateRequest,
    HealthRecordResponse,
    HealthShareCreateRequest,
    HealthShareResponse,
)
from app.security import get_current_identity

router = APIRouter(prefix="/api/health", tags=["health"])


def _to_response(db: Session, record: HealthRecord) -> HealthRecordResponse:
    active_shares = (
        db.query(HealthShare).filter_by(record_id=record.id, revoked_at=None).all()
    )
    shared_with = []
    for share in active_shares:
        identity = db.get(Identity, share.shared_with_identity_id)
        shared_with.append(
            ActiveShare(
                share_id=share.id,
                counselor_identity_id=share.shared_with_identity_id,
                pseudonym=identity.pseudonym if identity else share.shared_with_identity_id,
            )
        )
    return HealthRecordResponse(
        id=record.id, record_type=record.record_type, title=record.title, body=record.body,
        created_at=record.created_at, shared_with=shared_with,
    )


@router.get("/records", response_model=list[HealthRecordResponse])
def list_records(current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)):
    records = db.query(HealthRecord).filter_by(owner_identity_id=current.id).all()
    return [_to_response(db, r) for r in records]


@router.post("/records", response_model=HealthRecordResponse, status_code=status.HTTP_201_CREATED)
def create_record(
    payload: HealthRecordCreateRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    record = HealthRecord(
        owner_identity_id=current.id,
        record_type=payload.record_type,
        title=payload.title,
        body=payload.body,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_response(db, record)


@router.post("/share", response_model=HealthShareResponse, status_code=status.HTTP_201_CREATED)
def share_record(
    payload: HealthShareCreateRequest,
    current: Identity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    record = db.get(HealthRecord, payload.record_id)
    if record is None or record.owner_identity_id != current.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Record not found")

    share = HealthShare(record_id=record.id, shared_with_identity_id=payload.counselor_identity_id)
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


@router.delete("/share/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(share_id: str, current: Identity = Depends(get_current_identity), db: Session = Depends(get_db)):
    share = db.get(HealthShare, share_id)
    if share is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    record = db.get(HealthRecord, share.record_id)
    if record is None or record.owner_identity_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your record to revoke")
    share.revoked_at = datetime.utcnow()
    db.commit()
