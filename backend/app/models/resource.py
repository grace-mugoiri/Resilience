import enum
import uuid

from sqlalchemy import Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ResourceCategory(str, enum.Enum):
    LEGAL = "legal"
    MEDICAL = "medical"
    SHELTER = "shelter"
    EDUCATIONAL = "educational"


def _uuid() -> str:
    return uuid.uuid4().hex


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String)
    category: Mapped[ResourceCategory] = mapped_column(Enum(ResourceCategory))
    summary: Mapped[str] = mapped_column(Text, default="")
    region: Mapped[str] = mapped_column(String, default="")
    contact: Mapped[str] = mapped_column(String, default="")
    is_demo_data: Mapped[bool] = mapped_column(default=True)
