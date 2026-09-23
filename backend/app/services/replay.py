"""Seasonal replay for pre-test design.

GeoLift's power/market-selection simulations always place the hypothetical
test at the *end* of the data it is given: "the last N days". For a brand
with real seasonality that is usually the wrong window - a swimwear brand
planning a January test should not have its design calibrated on August.

Given a planned start date, this module finds the most recent full
occurrence of that same calendar window inside the dataset (this year if it
already happened, otherwise last year, and so on) and truncates the panel at
its end, so every downstream GeoLift call simulates the test on the right
season with a correspondingly shorter pre-period - exactly what the real
test will have.
"""

from datetime import date, datetime, timedelta

# GeoLift-style format strings (what datasets store) -> strptime.
_GEOLIFT_FORMATS = {
    "yyyy-mm-dd": "%Y-%m-%d",
    "mm/dd/yyyy": "%m/%d/%Y",
    "dd/mm/yyyy": "%d/%m/%Y",
    "mm-dd-yyyy": "%m-%d-%Y",
    "yyyy/mm/dd": "%Y/%m/%d",
}


def strptime_format(geolift_format: str) -> str:
    if geolift_format in _GEOLIFT_FORMATS:
        return _GEOLIFT_FORMATS[geolift_format]
    # Generic token substitution for anything else GeoLift accepts.
    return geolift_format.replace("yyyy", "%Y").replace("mm", "%m").replace("dd", "%d")


def _shift_back_one_year(d: date) -> date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # Feb 29 -> Feb 28
        return d.replace(year=d.year - 1, day=28)


def resolve_replay_window(planned_start: date, duration: int, min_date: date, max_date: date) -> tuple[date, date]:
    """Most recent [start, start + duration - 1] window with the same
    calendar start that fits entirely inside [min_date, max_date]."""
    if duration < 1:
        raise ValueError("duration must be at least 1 day")
    start = planned_start
    while start + timedelta(days=duration - 1) > max_date:
        start = _shift_back_one_year(start)
    if start < min_date:
        raise ValueError(
            f"No full {duration}-day window starting on {planned_start.strftime('%b %d')} exists in the data "
            f"({min_date.isoformat()} to {max_date.isoformat()})"
        )
    return start, start + timedelta(days=duration - 1)


def apply_planned_start(
    records: list[dict], *, date_col: str, date_format: str, planned_start: str | date | None, duration: int
) -> tuple[list[dict], dict | None]:
    """Truncates `records` so the last `duration` days are the replay window
    for `planned_start`. Returns (records, window) where window is
    {"start", "end"} in ISO form, or (records, None) when no planned start.
    """
    if not planned_start:
        return records, None
    if isinstance(planned_start, str):
        planned_start = date.fromisoformat(planned_start)

    fmt = strptime_format(date_format)
    parsed = [datetime.strptime(str(r[date_col]), fmt).date() for r in records]
    start, end = resolve_replay_window(planned_start, duration, min(parsed), max(parsed))
    kept = [r for r, d in zip(records, parsed) if d <= end]
    return kept, {"start": start.isoformat(), "end": end.isoformat()}
