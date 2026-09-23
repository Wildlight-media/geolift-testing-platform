import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class LeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    brand: str = Field(min_length=1, max_length=300)
    monthly_revenue: str = Field(min_length=1, max_length=50)
    orders_per_day: str = Field(min_length=1, max_length=50)
    channel: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=5000)
    # Honeypot: hidden from people, filled in by bots. Non-empty submissions are dropped silently.
    website: str = Field(default="", max_length=500)


class LeadOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    name: str
    email: str
    brand: str
    monthly_revenue: str
    orders_per_day: str
    channel: str
    notes: str

    model_config = {"from_attributes": True}
