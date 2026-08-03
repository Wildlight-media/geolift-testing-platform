import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ReportOut(BaseModel):
    id: uuid.UUID
    experiment_id: uuid.UUID
    analysis_id: uuid.UUID | None
    pdf_storage_path: str | None
    share_token: str | None
    share_expires_at: datetime | None
    generated_at: datetime = Field(validation_alias="created_at")

    model_config = {"from_attributes": True}


class ShareLinkOut(BaseModel):
    url: str
    expires_at: datetime
