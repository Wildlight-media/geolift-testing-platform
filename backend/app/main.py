from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analyze, auth, datasets, experiments, leads, market_selection, organizations, public, reports
from app.core.config import settings

app = FastAPI(title="Geo Lift Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(datasets.router)
app.include_router(experiments.router)
app.include_router(market_selection.router)
app.include_router(analyze.router)
app.include_router(reports.router)
app.include_router(public.router)
app.include_router(leads.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
