import uuid
from datetime import datetime

from pydantic import BaseModel


class ExperimentCreate(BaseModel):
    name: str
    dataset_id: uuid.UUID


class ExperimentOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    dataset_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
