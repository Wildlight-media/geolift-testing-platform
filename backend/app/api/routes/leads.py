"""Fit-check submissions from the public homepage. POST is unauthenticated (the homepage form);
listing requires a logged-in user. Caddy routes /api/leads on the marketing domain here, so
the form is same-origin and needs no CORS entry."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.lead import Lead
from app.models.user import User
from app.schemas.lead import LeadCreate, LeadOut

router = APIRouter(prefix="/api/leads", tags=["leads"])

_MAX_PER_IP_PER_HOUR = 5


@router.post("", status_code=201)
def create_lead(payload: LeadCreate, request: Request, db: Session = Depends(get_db)) -> dict:
    if payload.website:
        return {"ok": True}  # honeypot tripped: pretend success, store nothing
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    recent = (
        db.query(Lead)
        .filter(Lead.source_ip == ip, Lead.created_at > datetime.utcnow() - timedelta(hours=1))
        .count()
    )
    if ip and recent >= _MAX_PER_IP_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many submissions, try again later")
    lead = Lead(**payload.model_dump(exclude={"website"}), source_ip=ip[:64])
    db.add(lead)
    db.commit()
    return {"ok": True}


@router.get("", response_model=list[LeadOut])
def list_leads(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Lead]:
    return db.query(Lead).order_by(Lead.created_at.desc()).limit(500).all()
