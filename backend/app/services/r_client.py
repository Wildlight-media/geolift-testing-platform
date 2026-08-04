"""Thin httpx wrapper around the r-service (plumber) API — the only place
that calls out to GeoLift. Every method mirrors one r-service endpoint.

`mapping` is always {date_id, location_id, Y_id, format, X} — the raw-column
mapping captured on the Dataset — since every endpoint re-runs GeoDataRead
itself on the raw records rather than trusting pre-processed data.
"""

import httpx

from app.core.config import settings

TIMEOUT = httpx.Timeout(connect=10.0, read=21600.0, write=300.0, pool=10.0)


class RServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _post(path: str, payload: dict) -> dict:
    try:
        response = httpx.post(f"{settings.R_SERVICE_URL}{path}", json=payload, timeout=TIMEOUT)
    except httpx.RequestError as exc:
        raise RServiceError(f"Could not reach r-service at {path}: {exc}") from exc

    if response.status_code >= 400:
        try:
            detail = response.json().get("error", response.text)
        except ValueError:
            detail = response.text
        raise RServiceError(f"r-service error at {path}: {detail}", status_code=response.status_code)

    return response.json()


def read_data(*, data: list[dict], mapping: dict) -> dict:
    return _post("/data/read", {"data": data, **mapping})


def run_market_selection(*, data: list[dict], mapping: dict, params: dict) -> dict:
    return _post("/market-selection/run", {"data": data, **mapping, **params})


def market_selection_detail(*, data: list[dict], mapping: dict, locations: list[str], duration: int, params: dict) -> dict:
    return _post(
        "/market-selection/detail",
        {"data": data, **mapping, "locations": locations, "duration": duration, **params},
    )


def run_power(*, data: list[dict], mapping: dict, params: dict) -> dict:
    return _post("/power/run", {"data": data, **mapping, **params})


def run_analyze(*, data: list[dict], mapping: dict, params: dict) -> dict:
    return _post("/analyze/run", {"data": data, **mapping, **params})


def health() -> dict:
    try:
        response = httpx.get(f"{settings.R_SERVICE_URL}/health", timeout=10.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        raise RServiceError(f"r-service health check failed: {exc}") from exc
