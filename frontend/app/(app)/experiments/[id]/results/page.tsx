"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Analysis, AnalysisResult, Dataset, Experiment, Report, TestConfig } from "@/lib/types";
import { addDays, dateToPeriod } from "@/lib/periodDates";
import { formatOutcome } from "@/lib/format";
import StatTile from "@/components/StatTile";
import LiftChart from "@/components/charts/LiftChart";
import AttChart from "@/components/charts/AttChart";
import CumulativeEffectChart from "@/components/charts/CumulativeEffectChart";
import SearchableLocationPicker from "@/components/SearchableLocationPicker";
import DatasetUploadForm from "@/components/DatasetUploadForm";

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [testConfigs, setTestConfigs] = useState<TestConfig[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadDataset(exp: Experiment) {
    setExperiment(exp);
    apiGet<Dataset>(`/api/datasets/${exp.dataset_id}`).then(setDataset);
  }

  useEffect(() => {
    apiGet<Experiment>(`/api/experiments/${id}`).then(loadDataset);
    apiGet<TestConfig[]>(`/api/experiments/${id}/test-configs`).then(setTestConfigs);
    apiGet<Analysis[]>(`/api/experiments/${id}/analyses`).then((list) => {
      setAnalyses(list);
      if (list[0]) watchAnalysis(list[0].id);
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  function watchAnalysis(analysisId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const poll = () => {
      apiGet<Analysis>(`/api/experiments/${id}/analyses/${analysisId}`).then((a) => {
        setActiveAnalysis(a);
        if (a.status === "succeeded" || a.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      });
    };
    poll();
    pollRef.current = setInterval(poll, 4000);
  }

  async function generateReport() {
    if (!activeAnalysis) return;
    const r = await apiPost<Report>(`/api/experiments/${id}/reports?analysis_id=${activeAnalysis.id}`);
    setReport(r);
    setShareUrl(null);
  }

  async function createShareLink() {
    if (!report) return;
    const res = await apiPost<{ url: string }>(`/api/experiments/${id}/reports/${report.id}/share`);
    setShareUrl(res.url);
  }

  const result = activeAnalysis?.status === "succeeded" ? (activeAnalysis.result_json as AnalysisResult) : null;
  const activeTestConfig = testConfigs.find((tc) => tc.id === activeAnalysis?.test_config_id) ?? null;
  const outcomeType = dataset?.outcome_type ?? "revenue";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analyze results</h1>
        <p className="text-sm text-slate-500">Run the real post-test inference and build a client-ready report.</p>
      </div>

      {dataset && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Dataset: {dataset.name}</div>
              <p className="text-xs text-slate-500">
                Uploading a fresh pull keeps this same experiment and its history — locations, model, and other
                settings below carry forward automatically.
              </p>
            </div>
            <button className="btn-secondary" onClick={() => setShowUploadForm((s) => !s)}>
              {showUploadForm ? "Cancel" : "Upload updated data"}
            </button>
          </div>
          {showUploadForm && (
            <div className="mt-4">
              <DatasetUploadForm
                uploadUrl={`/api/experiments/${id}/dataset`}
                showNameField
                defaultName={dataset.name}
                defaults={{
                  location_col: dataset.location_col,
                  date_col: dataset.date_col,
                  y_col: dataset.y_col,
                  date_format: dataset.date_format,
                  covariate_cols: dataset.covariate_cols,
                  convert_zip_to_dma: dataset.converted_from_zip,
                  outcome_type: dataset.outcome_type,
                }}
                onUploaded={() => {
                  setShowUploadForm(false);
                  if (experiment) loadDataset(experiment);
                }}
              />
            </div>
          )}
        </div>
      )}

      <TestConfigForm
        experimentId={id}
        dataset={dataset}
        lastTestConfig={testConfigs[0] ?? null}
        onAnalysisStarted={(testConfig, analysis) => {
          setTestConfigs((list) => [testConfig, ...list]);
          setAnalyses((list) => [analysis, ...list]);
          setReport(null);
          setShareUrl(null);
          watchAnalysis(analysis.id);
        }}
      />

      {activeAnalysis && (
        <div className="card p-4">
          <span className="text-sm font-medium">
            Analysis status: <StatusBadge status={activeAnalysis.status} />
          </span>
          {activeAnalysis.error && <p className="text-sm text-red-600 mt-2">{activeAnalysis.error}</p>}
        </div>
      )}

      {result && (
        <ResultsView
          result={result}
          outcomeType={outcomeType}
          spend={activeTestConfig?.spend ?? null}
          report={report}
          shareUrl={shareUrl}
          experimentId={id}
          onGenerateReport={generateReport}
          onCreateShareLink={createShareLink}
        />
      )}
    </div>
  );
}

function ResultsView({
  result,
  outcomeType,
  spend,
  report,
  shareUrl,
  experimentId,
  onGenerateReport,
  onCreateShareLink,
}: {
  result: AnalysisResult;
  outcomeType: string;
  spend: number | null;
  report: Report | null;
  shareUrl: string | null;
  experimentId: string;
  onGenerateReport: () => void;
  onCreateShareLink: () => void;
}) {
  const { summary } = result;
  const outcomeLabel = outcomeType === "revenue" ? "Revenue" : outcomeType === "conversions" ? "Conversions" : "Outcome";

  const nPeriods =
    summary.treatment_start !== null && summary.treatment_end !== null
      ? summary.treatment_end - summary.treatment_start + 1
      : null;
  const totalLiftLower = nPeriods !== null && summary.lower_conf_int !== null ? summary.lower_conf_int * nPeriods : null;
  const totalLiftUpper = nPeriods !== null && summary.upper_conf_int !== null ? summary.upper_conf_int * nPeriods : null;
  const significant =
    totalLiftLower !== null && totalLiftUpper !== null && (totalLiftLower > 0 || totalLiftUpper < 0);
  const significanceBadge =
    totalLiftLower !== null && totalLiftUpper !== null
      ? { label: significant ? "Significant" : "Not significant", tone: significant ? ("positive" as const) : ("neutral" as const) }
      : undefined;
  const liftCiNote =
    totalLiftLower !== null && totalLiftUpper !== null
      ? `90% CI: (${formatOutcome(totalLiftLower, outcomeType)}, ${formatOutcome(totalLiftUpper, outcomeType)})`
      : undefined;

  const treatmentWindow =
    summary.treatment_start !== null && summary.treatment_end !== null
      ? result.lift_series.filter((r) => r.time >= summary.treatment_start! && r.time <= summary.treatment_end!)
      : [];
  const testRevenue = treatmentWindow.reduce((sum, r) => sum + r.treatment_observed, 0);
  const controlRevenue = treatmentWindow.reduce((sum, r) => sum + r.synthetic_control, 0);

  const hasSpend = spend !== null && spend > 0;
  const roi = hasSpend && summary.incremental !== null ? summary.incremental / spend! : null;
  const roiLower = hasSpend && totalLiftLower !== null ? totalLiftLower / spend! : null;
  const roiUpper = hasSpend && totalLiftUpper !== null ? totalLiftUpper / spend! : null;
  const roiCiNote =
    roiLower !== null && roiUpper !== null ? `90% CI: (${roiLower.toFixed(2)}x, ${roiUpper.toFixed(2)}x)` : undefined;
  const confidencePositiveText =
    hasSpend && summary.prob_positive_effect !== null
      ? `${(summary.prob_positive_effect * 100).toFixed(1)}% confidence that iROAS > 0`
      : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile label={`Test ${outcomeLabel}`} value={formatOutcome(testRevenue, outcomeType)} />
        <StatTile label={`Control (Modeled) ${outcomeLabel}`} value={formatOutcome(controlRevenue, outcomeType)} />
        <StatTile
          label="Lift in test geographies"
          value={summary.incremental !== null ? formatOutcome(summary.incremental, outcomeType) : "—"}
          accent="#2563eb"
          sublabel={
            summary.percent_lift !== null
              ? `${Math.abs(summary.percent_lift).toFixed(1)}% ${summary.percent_lift >= 0 ? "increase" : "decrease"}`
              : undefined
          }
          badge={significanceBadge}
          note={liftCiNote}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile
          label={`Change in ${outcomeLabel}`}
          value={summary.incremental !== null ? formatOutcome(summary.incremental, outcomeType) : "—"}
        />
        <StatTile label="Spend added in test" value={hasSpend ? formatOutcome(spend!, "revenue") : "Enter spend above"} />
        <StatTile
          label="ROI"
          value={roi !== null ? `${roi.toFixed(2)}x` : hasSpend ? "—" : "Enter spend above"}
          badge={hasSpend ? significanceBadge : undefined}
          note={hasSpend ? roiCiNote : undefined}
        />
      </div>
      {confidencePositiveText && (
        <p className="text-sm text-slate-600 -mt-2">
          <span className="font-semibold text-brand-600">{confidencePositiveText}</span>
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Percent lift" value={summary.percent_lift !== null ? `${summary.percent_lift.toFixed(1)}%` : "—"} />
        <StatTile label="Incremental outcome" value={summary.incremental !== null ? formatOutcome(summary.incremental, outcomeType) : "—"} />
        <StatTile label="P-value" value={summary.pvalue !== null ? summary.pvalue.toFixed(3) : "—"} />
        <StatTile label="Average ATT" value={summary.att !== null ? summary.att.toFixed(2) : "—"} />
      </div>

      {result.lift_series?.length > 0 && (
        <div className="card p-6">
          <div className="font-medium text-sm mb-2">Observed vs. synthetic control</div>
          <LiftChart data={result.lift_series} />
        </div>
      )}

      {result.att_series?.length > 0 && (
        <div className="card p-6">
          <div className="font-medium text-sm mb-2">Average treatment effect over time</div>
          <AttChart data={result.att_series} />
        </div>
      )}

      {result.cumulative_effect_series?.length > 0 && (
        <div className="card p-6">
          <div className="font-medium text-sm mb-2">Cumulative incremental effect</div>
          <CumulativeEffectChart data={result.cumulative_effect_series} treatmentStart={summary.treatment_start ?? 0} />
        </div>
      )}

      {result.weights?.length > 0 && (
        <div className="card p-6">
          <div className="font-medium text-sm mb-2">Synthetic control weights</div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Location</th>
                <th className="text-left py-1">Weight</th>
              </tr>
            </thead>
            <tbody>
              {result.weights.map((w) => (
                <tr key={w.location} className="border-t border-slate-100">
                  <td className="py-1">{w.location}</td>
                  <td className="py-1">{w.weight.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-6 flex items-center gap-4">
        <button className="btn-primary" onClick={onGenerateReport}>
          {report ? "Regenerate report" : "Generate client report (PDF)"}
        </button>
        {report && (
          <a
            className="btn-secondary"
            href={`${process.env.NEXT_PUBLIC_API_URL}/api/experiments/${experimentId}/reports/${report.id}/download`}
            target="_blank"
            rel="noreferrer"
          >
            Download PDF
          </a>
        )}
        {report && (
          <button className="btn-secondary" onClick={onCreateShareLink}>
            Create client share link
          </button>
        )}
        {shareUrl && (
          <a href={shareUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-600 underline">
            {shareUrl}
          </a>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-slate-100 text-slate-600",
    running: "bg-amber-100 text-amber-700",
    succeeded: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
  };
  return <span className={`badge ${styles[status] ?? ""}`}>{status}</span>;
}

function TestConfigForm({
  experimentId,
  dataset,
  lastTestConfig,
  onAnalysisStarted,
}: {
  experimentId: string;
  dataset: Dataset | null;
  lastTestConfig: TestConfig | null;
  onAnalysisStarted: (testConfig: TestConfig, analysis: Analysis) => void;
}) {
  const periodDates = dataset?.period_dates ?? [];
  const minDate = periodDates[0]?.date;
  const maxDate = periodDates[periodDates.length - 1]?.date;

  const [selectedLocations, setSelectedLocations] = useState<string[]>(lastTestConfig?.locations ?? []);
  const [campaignStart, setCampaignStart] = useState("");
  const [campaignEnd, setCampaignEnd] = useState("");
  const [cooldownDays, setCooldownDays] = useState(0);
  const [model, setModel] = useState(lastTestConfig?.model ?? "none");
  const [fixedEffects, setFixedEffects] = useState(lastTestConfig?.fixed_effects ?? true);
  const [alpha, setAlpha] = useState(lastTestConfig?.alpha ?? 0.1);
  const [confidenceIntervals, setConfidenceIntervals] = useState(lastTestConfig?.confidence_intervals ?? false);
  const [spend, setSpend] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // lastTestConfig arrives asynchronously (after dataset's initial fetch), so
  // seed these once it lands rather than only at first render. Spend and
  // campaign dates are specific to each test period, so they are not
  // pre-filled here - only carried-forward settings are.
  useEffect(() => {
    if (!lastTestConfig) return;
    setModel(lastTestConfig.model);
    setFixedEffects(lastTestConfig.fixed_effects);
    setAlpha(lastTestConfig.alpha);
    setConfidenceIntervals(lastTestConfig.confidence_intervals);
  }, [lastTestConfig]);

  // Re-derive selected locations whenever the prior config or the (possibly
  // refreshed) dataset changes, dropping any location that no longer exists
  // in the current dataset rather than silently submitting a stale one.
  useEffect(() => {
    if (!lastTestConfig || !dataset) return;
    const valid = new Set(dataset.locations);
    setSelectedLocations(lastTestConfig.locations.filter((l) => valid.has(l)));
  }, [lastTestConfig, dataset]);

  function toggle(loc: string) {
    setSelectedLocations((s) => (s.includes(loc) ? s.filter((l) => l !== loc) : [...s, loc]));
  }

  const treatmentStartTime = campaignStart ? dateToPeriod(periodDates, campaignStart) : null;
  const analysisEndDate = campaignEnd ? addDays(campaignEnd, cooldownDays) : "";
  const treatmentEndTime = analysisEndDate ? dateToPeriod(periodDates, analysisEndDate) : null;

  const missingFields = [
    selectedLocations.length === 0 && "select at least one test location",
    !campaignStart && "pick a campaign start date",
    !campaignEnd && "pick a campaign end date",
    campaignStart && treatmentStartTime === null && "campaign start date is outside this dataset's range",
    campaignEnd && treatmentEndTime === null && "campaign end date (+ cooldown) is outside this dataset's range",
  ].filter((v): v is string => Boolean(v));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (treatmentStartTime === null || treatmentEndTime === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const testConfig = await apiPost<TestConfig>(`/api/experiments/${experimentId}/test-configs`, {
        locations: selectedLocations,
        treatment_start_time: treatmentStartTime,
        treatment_end_time: treatmentEndTime,
        model,
        fixed_effects: fixedEffects,
        alpha,
        confidence_intervals: confidenceIntervals,
        spend: spend.trim() ? Number(spend) : null,
      });
      const analysis = await apiPost<Analysis>(`/api/experiments/${experimentId}/test-configs/${testConfig.id}/analyze`);
      onAnalysisStarted(testConfig, analysis);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start analysis");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      <div>
        <label className="label">Test locations (the markets that actually ran the campaign)</label>
        <SearchableLocationPicker locations={dataset?.locations ?? []} selected={selectedLocations} onToggle={toggle} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="label">Campaign start date</label>
          <input
            className="input"
            type="date"
            min={minDate}
            max={maxDate}
            value={campaignStart}
            onChange={(e) => setCampaignStart(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Campaign end date (spend stops)</label>
          <input
            className="input"
            type="date"
            min={minDate}
            max={maxDate}
            value={campaignEnd}
            onChange={(e) => setCampaignEnd(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Cooldown period (days)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={cooldownDays}
            onChange={(e) => setCooldownDays(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Analysis window</label>
          <div className="input bg-slate-50 text-slate-500 flex items-center">
            {treatmentStartTime !== null && treatmentEndTime !== null
              ? `Periods ${treatmentStartTime}–${treatmentEndTime}`
              : "Pick both dates"}
          </div>
        </div>
      </div>
      {cooldownDays > 0 && campaignEnd && (
        <p className="text-xs text-slate-400 -mt-2">
          Analyzing through {analysisEndDate} ({cooldownDays} day cooldown after spend stopped on {campaignEnd}) to
          capture latent conversions.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="label">Model</label>
          <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="none">None</option>
            <option value="ridge">Ridge</option>
            <option value="gsyn">GSYN</option>
            <option value="best">Best (auto)</option>
          </select>
        </div>
        <div>
          <label className="label">Alpha</label>
          <input className="input" type="number" step="0.01" value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Spend during test period ($, optional)</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 60000"
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 justify-end pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fixedEffects} onChange={(e) => setFixedEffects(e.target.checked)} />
            Fixed effects
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confidenceIntervals} onChange={(e) => setConfidenceIntervals(e.target.checked)} />
            Confidence intervals
          </label>
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Enter total media spend for this test window to see ROI/iROAS in the results below.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!submitting && missingFields.length > 0 && (
        <p className="text-xs text-amber-600">Before you can run this: {missingFields.join(", ")}.</p>
      )}
      <button
        type="submit"
        disabled={submitting || missingFields.length > 0}
        className="btn-primary"
      >
        {submitting ? "Running..." : "Run analysis"}
      </button>
    </form>
  );
}
