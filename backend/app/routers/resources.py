from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.resource import Resource, ResourceCategory
from app.schemas.resource import ResourceResponse

router = APIRouter(prefix="/api/resources", tags=["resources"])


@router.get("", response_model=list[ResourceResponse])
def list_resources(category: ResourceCategory | None = None, db: Session = Depends(get_db)):
    query = db.query(Resource)
    if category is not None:
        query = query.filter_by(category=category)
    return query.all()
