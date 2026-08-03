from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.analysis import Analysis
from app.models.experiment import Experiment
from app.models.organization import Organization
from app.models.report import Report
from app.services import storage

router = APIRouter(prefix="/api/public", tags=["public"])


def _get_valid_report(share_token: str, db: Session) -> Report:
    report = db.query(Report).filter(Report.share_token == share_token).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    if report.share_expires_at and report.share_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This link has expired")
    return report


@router.get("/share/{share_token}")
def get_shared_report(share_token: str, db: Session = Depends(get_db)) -> dict:
    report = _get_valid_report(share_token, db)
    experiment = db.get(Experiment, report.experiment_id)
    org = db.get(Organization, experiment.org_id)
    analysis = db.get(Analysis, report.analysis_id) if report.analysis_id else None

    return {
        "experiment_name": experiment.name,
        "organization": {"name": org.name, "logo_url": org.logo_url, "primary_color": org.primary_color},
        "result": analysis.result_json if analysis else None,
        "generated_at": report.created_at,
    }


@router.get("/share/{share_token}/pdf")
def get_shared_report_pdf(share_token: str, db: Session = Depends(get_db)) -> Response:
    report = _get_valid_report(share_token, db)
    if not report.pdf_storage_path:
        raise HTTPException(status_code=404, detail="No PDF generated for this report")
    content = storage.read_bytes(report.pdf_storage_path)
    return Response(content=content, media_type="application/pdf")
