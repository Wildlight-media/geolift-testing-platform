"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Analysis, AnalysisResult, Dataset, Experiment, Report, TestConfig } from "@/lib/types";
import StatTile from "@/components/StatTile";
import LiftChart from "@/components/charts/LiftChart";
import AttChart from "@/components/charts/AttChart";

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiGet<Experiment>(`/api/experiments/${id}`).then((exp) => {
      apiGet<Dataset>(`/api/datasets/${exp.dataset_id}`).then(setDataset);
    });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analyze results</h1>
        <p className="text-sm text-slate-500">Run the real post-test inference and build a client-ready report.</p>
      </div>

      <TestConfigForm
        experimentId={id}
        locations={dataset?.locations ?? []}
        onAnalysisStarted={(a) => {
          setAnalyses((list) => [a, ...list]);
          setReport(null);
          setShareUrl(null);
          watchAnalysis(a.id);
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
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Percent lift" value={result.summary.percent_lift !== null ? `${result.summary.percent_lift.toFixed(1)}%` : "—"} accent="#2563eb" />
            <StatTile label="Incremental outcome" value={result.summary.incremental !== null ? result.summary.incremental.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"} />
            <StatTile label="P-value" value={result.summary.pvalue !== null ? result.summary.pvalue.toFixed(3) : "—"} />
            <StatTile label="Average ATT" value={result.summary.att !== null ? result.summary.att.toFixed(2) : "—"} />
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
            <button className="btn-primary" onClick={generateReport}>
              {report ? "Regenerate report" : "Generate client report (PDF)"}
            </button>
            {report && (
              <a
                className="btn-secondary"
                href={`${process.env.NEXT_PUBLIC_API_URL}/api/experiments/${id}/reports/${report.id}/download`}
                target="_blank"
                rel="noreferrer"
              >
                Download PDF
              </a>
            )}
            {report && (
              <button className="btn-secondary" onClick={createShareLink}>
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
      )}
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
  locations,
  onAnalysisStarted,
}: {
  experimentId: string;
  locations: string[];
  onAnalysisStarted: (a: Analysis) => void;
}) {
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [treatmentStart, setTreatmentStart] = useState(90);
  const [treatmentEnd, setTreatmentEnd] = useState(105);
  const [model, setModel] = useState("none");
  const [fixedEffects, setFixedEffects] = useState(true);
  const [alpha, setAlpha] = useState(0.1);
  const [confidenceIntervals, setConfidenceIntervals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggle(loc: string) {
    setSelectedLocations((s) => (s.includes(loc) ? s.filter((l) => l !== loc) : [...s, loc]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const testConfig = await apiPost<TestConfig>(`/api/experiments/${experimentId}/test-configs`, {
        locations: selectedLocations,
        treatment_start_time: treatmentStart,
        treatment_end_time: treatmentEnd,
        model,
        fixed_effects: fixedEffects,
        alpha,
        confidence_intervals: confidenceIntervals,
      });
      const analysis = await apiPost<Analysis>(`/api/experiments/${experimentId}/test-configs/${testConfig.id}/analyze`);
      onAnalysisStarted(analysis);
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
        <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto p-2 grid grid-cols-2 md:grid-cols-3 gap-1">
          {locations.map((loc) => (
            <label key={loc} className="flex items-center gap-2 text-sm px-1 py-0.5 hover:bg-slate-50 rounded">
              <input type="checkbox" checked={selectedLocations.includes(loc)} onChange={() => toggle(loc)} />
              {loc}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <label className="label">Treatment start (time period)</label>
          <input className="input" type="number" value={treatmentStart} onChange={(e) => setTreatmentStart(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Treatment end (time period)</label>
          <input className="input" type="number" value={treatmentEnd} onChange={(e) => setTreatmentEnd(Number(e.target.value))} />
        </div>
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

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting || selectedLocations.length === 0} className="btn-primary">
        {submitting ? "Running..." : "Run analysis"}
      </button>
    </form>
  );
}
