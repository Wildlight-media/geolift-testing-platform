import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.experiments import get_owned_experiment
from app.core.config import settings
from app.db.session import get_db
from app.models.analysis import Analysis
from app.models.organization import Organization
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportOut, ShareLinkOut
from app.services import storage
from app.services.report_generator import build_report_pdf

router = APIRouter(prefix="/api/experiments/{experiment_id}/reports", tags=["reports"])


@router.post("", response_model=ReportOut)
def generate_report(
    experiment_id: uuid.UUID,
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Report:
    experiment = get_owned_experiment(experiment_id, db, user)
    analysis = db.get(Analysis, analysis_id)
    if not analysis or analysis.experiment_id != experiment.id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status != "succeeded":
        raise HTTPException(status_code=400, detail="Analysis has not completed successfully")

    org = db.get(Organization, user.org_id)

    pdf_bytes = build_report_pdf(
        org_name=org.name,
        logo_url=org.logo_url,
        primary_color=org.primary_color,
        experiment_name=experiment.name,
        analysis_result=analysis.result_json,
    )

    storage_path = storage.save_bytes(
        subdir=f"reports/{user.org_id}", filename=f"{experiment.name}.pdf", content=pdf_bytes
    )

    report = Report(
        experiment_id=experiment.id,
        analysis_id=analysis.id,
        pdf_storage_path=storage_path,
        generated_by_id=user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("", response_model=list[ReportOut])
def list_reports(
    experiment_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Report]:
    experiment = get_owned_experiment(experiment_id, db, user)
    return (
        db.query(Report)
        .filter(Report.experiment_id == experiment.id)
        .order_by(Report.created_at.desc())
        .all()
    )


@router.get("/{report_id}/download")
def download_report(
    experiment_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    experiment = get_owned_experiment(experiment_id, db, user)
    report = db.get(Report, report_id)
    if not report or report.experiment_id != experiment.id or not report.pdf_storage_path:
        raise HTTPException(status_code=404, detail="Report not found")

    content = storage.read_bytes(report.pdf_storage_path)
    return Response(content=content, media_type="application/pdf")


@router.post("/{report_id}/share", response_model=ShareLinkOut)
def create_share_link(
    experiment_id: uuid.UUID,
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ShareLinkOut:
    experiment = get_owned_experiment(experiment_id, db, user)
    report = db.get(Report, report_id)
    if not report or report.experiment_id != experiment.id:
        raise HTTPException(status_code=404, detail="Report not found")

    report.share_token = secrets.token_urlsafe(24)
    report.share_expires_at = datetime.utcnow() + timedelta(days=settings.SHARE_LINK_EXPIRE_DAYS)
    db.commit()

    return ShareLinkOut(url=f"{settings.FRONTEND_URL}/share/{report.share_token}", expires_at=report.share_expires_at)
