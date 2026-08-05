"""Functions executed by the RQ worker process. Each opens its own DB
session since it runs outside any request context.
"""

import uuid
from datetime import datetime

from app.db.session import SessionLocal
from app.models.analysis import Analysis
from app.models.dataset import Dataset
from app.models.experiment import Experiment
from app.models.market_selection import CandidateSimulation, MarketSelectionResult, MarketSelectionRun
from app.models.test_config import TestConfig
from app.services import r_client
from app.services.dataset_loader import load_records, mapping_for
from app.services.r_client import RServiceError


def run_market_selection_job(run_id: str) -> None:
    db = SessionLocal()
    try:
        run = db.get(MarketSelectionRun, uuid.UUID(run_id))
        if run is None:
            return

        run.status = "running"
        db.commit()

        experiment = db.get(Experiment, run.experiment_id)
        dataset = db.get(Dataset, experiment.dataset_id)

        try:
            records = load_records(dataset)
            result = r_client.run_market_selection(
                data=records, mapping=mapping_for(dataset), params=run.params_json
            )
        except (RServiceError, Exception) as exc:  # noqa: BLE001 - surface any failure to the UI
            run.status = "failed"
            run.error = str(exc)
            run.finished_at = datetime.utcnow()
            db.commit()
            return

        db.add(
            MarketSelectionResult(
                run_id=run.id,
                best_markets_json=result["best_markets"],
                power_curves_json=result["power_curves"],
            )
        )
        run.status = "succeeded"
        run.finished_at = datetime.utcnow()
        experiment.status = "market_selection_done"
        db.commit()
    finally:
        db.close()


def run_candidate_simulation_job(simulation_id: str) -> None:
    db = SessionLocal()
    try:
        simulation = db.get(CandidateSimulation, uuid.UUID(simulation_id))
        if simulation is None:
            return

        simulation.status = "running"
        db.commit()

        run = db.get(MarketSelectionRun, simulation.market_selection_run_id)
        experiment = db.get(Experiment, run.experiment_id)
        dataset = db.get(Dataset, experiment.dataset_id)

        # Only the modeling params matter here (GeoLift() itself, not the
        # power/investment simulation) - cpic/side_of_test/lookback_window
        # from the parent run aren't used by this endpoint.
        params = {k: v for k, v in run.params_json.items() if k in {"alpha", "model", "fixed_effects"}}

        try:
            records = load_records(dataset)
            result = r_client.market_selection_simulate(
                data=records,
                mapping=mapping_for(dataset),
                locations=simulation.locations,
                duration=simulation.duration,
                effect_sizes=simulation.effect_sizes,
                params=params,
            )
        except (RServiceError, Exception) as exc:  # noqa: BLE001 - surface any failure to the UI
            simulation.status = "failed"
            simulation.error = str(exc)
            simulation.finished_at = datetime.utcnow()
            db.commit()
            return

        simulation.result_json = result
        simulation.status = "succeeded"
        simulation.finished_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def run_analysis_job(analysis_id: str) -> None:
    db = SessionLocal()
    try:
        analysis = db.get(Analysis, uuid.UUID(analysis_id))
        if analysis is None:
            return

        analysis.status = "running"
        db.commit()

        test_config = db.get(TestConfig, analysis.test_config_id)
        experiment = db.get(Experiment, analysis.experiment_id)
        dataset = db.get(Dataset, experiment.dataset_id)

        params = {
            "locations": test_config.locations,
            "treatment_start_time": test_config.treatment_start_time,
            "treatment_end_time": test_config.treatment_end_time,
            "model": test_config.model,
            "fixed_effects": test_config.fixed_effects,
            "alpha": test_config.alpha,
            "confidence_intervals": test_config.confidence_intervals,
            "stat_test": test_config.stat_test,
        }

        try:
            records = load_records(dataset)
            result = r_client.run_analyze(data=records, mapping=mapping_for(dataset), params=params)
        except (RServiceError, Exception) as exc:  # noqa: BLE001 - surface any failure to the UI
            analysis.status = "failed"
            analysis.error = str(exc)
            analysis.finished_at = datetime.utcnow()
            db.commit()
            return

        analysis.result_json = result
        analysis.status = "succeeded"
        analysis.finished_at = datetime.utcnow()
        experiment.status = "analyzed"
        db.commit()
    finally:
        db.close()
