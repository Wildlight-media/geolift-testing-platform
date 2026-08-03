from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import OrganizationOut, OrganizationUpdate

router = APIRouter(prefix="/api/organization", tags=["organization"])


@router.get("", response_model=OrganizationOut)
def get_organization(db: Session = Depends(get_db), user: User = Depends(require_admin)) -> Organization:
    org = db.get(Organization, user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("", response_model=OrganizationOut)
def update_organization(
    payload: OrganizationUpdate, db: Session = Depends(get_db), user: User = Depends(require_admin)
) -> Organization:
    org = db.get(Organization, user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)

    db.commit()
    db.refresh(org)
    return org
