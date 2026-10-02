from pydantic import BaseModel

from app.models.resource import ResourceCategory


class ResourceResponse(BaseModel):
    id: str
    title: str
    category: ResourceCategory
    summary: str
    region: str
    contact: str
    is_demo_data: bool

    model_config = {"from_attributes": True}
