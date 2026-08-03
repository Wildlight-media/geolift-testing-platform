"""Renders a branded, client-ready PDF from an analysis result. Charts are
static images (matplotlib) embedded into a Jinja2 HTML template, converted
to PDF with WeasyPrint — no headless browser needed since the report is a
static document, not an interactive page.
"""

import base64
import io
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from jinja2 import Environment, FileSystemLoader, select_autoescape  # noqa: E402
from weasyprint import HTML  # noqa: E402

TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape())


def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


def _lift_chart(lift_series: list[dict], primary_color: str) -> str:
    fig, ax = plt.subplots(figsize=(7, 3.3))
    times = [row["time"] for row in lift_series]
    ax.plot(times, [row["treatment_observed"] for row in lift_series], label="Observed", color=primary_color, linewidth=2)
    ax.plot(
        times,
        [row["synthetic_control"] for row in lift_series],
        label="Synthetic control",
        color="#94a3b8",
        linestyle="--",
        linewidth=2,
    )
    ax.set_xlabel("Time period")
    ax.set_ylabel("Outcome")
    ax.legend(frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    return _fig_to_base64(fig)


def _att_chart(att_series: list[dict], primary_color: str) -> str:
    fig, ax = plt.subplots(figsize=(7, 3))
    times = [row.get("Time") for row in att_series]
    estimate = [row.get("Estimate") for row in att_series]
    lower = [row.get("lower_bound") for row in att_series]
    upper = [row.get("upper_bound") for row in att_series]
    ax.plot(times, estimate, color=primary_color, linewidth=2)
    if all(v is not None for v in lower) and all(v is not None for v in upper):
        ax.fill_between(times, lower, upper, color=primary_color, alpha=0.15)
    ax.axhline(0, color="#94a3b8", linewidth=1)
    ax.set_xlabel("Time period")
    ax.set_ylabel("Average treatment effect")
    ax.spines[["top", "right"]].set_visible(False)
    return _fig_to_base64(fig)


def build_report_pdf(
    *,
    org_name: str,
    logo_url: str | None,
    primary_color: str,
    experiment_name: str,
    analysis_result: dict,
) -> bytes:
    summary = analysis_result.get("summary", {})
    charts: dict[str, str] = {}

    if analysis_result.get("lift_series"):
        charts["lift"] = _lift_chart(analysis_result["lift_series"], primary_color)
    if analysis_result.get("att_series"):
        charts["att"] = _att_chart(analysis_result["att_series"], primary_color)

    # Pre-formatted for the template - Jinja's `format` filter is Python's old
    # `%`-style formatting, not str.format()/f-string syntax, so this is done
    # here rather than risking a template syntax mismatch.
    def fmt(value, spec: str) -> str:
        return format(value, spec) if value is not None else "—"

    # GeoLift's Perc.Lift is already a percentage value (-0.7 means "-0.7%"),
    # not a 0-1 fraction, so this appends "%" directly rather than using a
    # "%"-format spec (which would incorrectly multiply by 100 again).
    percent_lift = summary.get("percent_lift")
    stats = {
        "percent_lift": f"{percent_lift:.1f}%" if percent_lift is not None else "—",
        "incremental": fmt(summary.get("incremental"), ",.0f"),
        "pvalue": fmt(summary.get("pvalue"), ".3f"),
        "att": fmt(summary.get("att"), ".2f"),
        "test_market_count": len(summary.get("test_locations") or []),
        "treatment_window": f"{summary.get('treatment_start', '—')}–{summary.get('treatment_end', '—')}",
    }

    template = _env.get_template("report.html")
    html_str = template.render(
        org_name=org_name,
        logo_url=logo_url,
        primary_color=primary_color,
        experiment_name=experiment_name,
        stats=stats,
        weights=analysis_result.get("weights", []),
        charts=charts,
        generated_at=datetime.utcnow().strftime("%B %d, %Y"),
    )
    return HTML(string=html_str).write_pdf()
