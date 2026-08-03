"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { BestMarketRow, Dataset, Experiment, MarketSelectionParams, MarketSelectionResult, MarketSelectionRun } from "@/lib/types";
import PowerCurveChart from "@/components/charts/PowerCurveChart";

const DEFAULT_PARAMS: MarketSelectionParams = {
  treatment_periods: [15],
  N: [2, 3, 4],
  effect_size: [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2],
  lookback_window: 1,
  include_markets: [],
  exclude_markets: [],
  holdout: [],
  cpic: 1,
  budget: null,
  alpha: 0.1,
  normalize: false,
  model: "none",
  fixed_effects: true,
  dtw: 0,
  correlations: false,
  side_of_test: "two_sided",
  run_stochastic_process: false,
};

function parseNumberList(input: string): number[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

export default function DesignPage() {
  const { id } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [runs, setRuns] = useState<MarketSelectionRun[]>([]);
  const [activeRun, setActiveRun] = useState<MarketSelectionRun | null>(null);
  const [result, setResult] = useState<MarketSelectionResult | null>(null);
  const [selected, setSelected] = useState<BestMarketRow | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiGet<Experiment>(`/api/experiments/${id}`).then((exp) => {
      apiGet<Dataset>(`/api/datasets/${exp.dataset_id}`).then(setDataset);
    });
    refreshRuns();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

  function refreshRuns() {
    apiGet<MarketSelectionRun[]>(`/api/experiments/${id}/market-selection`).then((list) => {
      setRuns(list);
      if (list[0]) watchRun(list[0].id);
    });
  }

  function watchRun(runId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const poll = () => {
      apiGet<MarketSelectionRun>(`/api/experiments/${id}/market-selection/${runId}`).then((run) => {
        setActiveRun(run);
        if (run.status === "succeeded") {
          if (pollRef.current) clearInterval(pollRef.current);
          apiGet<MarketSelectionResult>(`/api/experiments/${id}/market-selection/${runId}/result`).then(setResult);
        } else if (run.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      });
    };
    poll();
    pollRef.current = setInterval(poll, 4000);
  }

  async function onSelectCandidate(row: BestMarketRow) {
    if (!activeRun) return;
    setSelected(row);
    setDetail(null);
    const locations = row.location.split(",").map((s) => s.trim());
    try {
      const res = await apiPost<Record<string, unknown>>(`/api/experiments/${id}/market-selection/${activeRun.id}/detail`, {
        locations,
        duration: row.duration,
      });
      setDetail(res);
    } catch {
      setDetail(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Design the test</h1>
        <p className="text-sm text-slate-500">
          Full control over GeoLift&apos;s market selection &amp; power analysis parameters.
          {dataset && ` Dataset has ${dataset.location_count} locations available.`}
        </p>
      </div>

      <ParamsForm
        experimentId={id}
        locations={dataset?.locations ?? []}
        onStarted={(run) => {
          setRuns((r) => [run, ...r]);
          setResult(null);
          setSelected(null);
          watchRun(run.id);
        }}
      />

      {activeRun && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Run status: <StatusBadge status={activeRun.status} />
            </span>
            {activeRun.status === "running" && <span className="text-xs text-slate-400">Simulating candidate markets — this can take a few minutes...</span>}
          </div>
          {activeRun.error && <p className="text-sm text-red-600 mt-2">{activeRun.error}</p>}
        </div>
      )}

      {result && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-medium text-sm">Ranked candidate markets</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Rank</th>
                  <th className="text-left px-4 py-2">Markets</th>
                  <th className="text-left px-4 py-2">Duration</th>
                  <th className="text-left px-4 py-2">Effect size</th>
                  <th className="text-left px-4 py-2">Power</th>
                  <th className="text-left px-4 py-2">Investment</th>
                  <th className="text-left px-4 py-2">MDE</th>
                  <th className="text-left px-4 py-2">Holdout</th>
                </tr>
              </thead>
              <tbody>
                {result.best_markets_json.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => onSelectCandidate(row)}
                    className={`border-t border-slate-100 cursor-pointer hover:bg-brand-50 ${
                      selected === row ? "bg-brand-50" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-medium">{row.rank}</td>
                    <td className="px-4 py-2">{row.location}</td>
                    <td className="px-4 py-2">{row.duration}</td>
                    <td className="px-4 py-2">{(row.EffectSize * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2">{(row.Power * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2">{row.Investment?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2">{row.Average_MDE?.toFixed(2)}</td>
                    <td className="px-4 py-2">{(row.Holdout * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="card p-6">
          <div className="font-medium text-sm mb-4">Candidate detail: {selected.location}</div>
          {detail ? (
            <PowerCurveChart data={(detail.power_curve as Record<string, unknown>[]) ?? []} xKey="EffectSize" yKey="power" />
          ) : (
            <p className="text-sm text-slate-400">Loading detail...</p>
          )}
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

function ParamsForm({
  experimentId,
  locations,
  onStarted,
}: {
  experimentId: string;
  locations: string[];
  onStarted: (run: MarketSelectionRun) => void;
}) {
  const [params, setParams] = useState<MarketSelectionParams>(DEFAULT_PARAMS);
  const [treatmentPeriodsText, setTreatmentPeriodsText] = useState("15");
  const [nText, setNText] = useState("2, 3, 4");
  const [effectSizeText, setEffectSizeText] = useState(DEFAULT_PARAMS.effect_size.join(", "));
  const [holdoutText, setHoldoutText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function update<K extends keyof MarketSelectionParams>(key: K, value: MarketSelectionParams[K]) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  function toggleMarket(list: "include_markets" | "exclude_markets", location: string) {
    setParams((p) => {
      const current = p[list];
      const next = current.includes(location) ? current.filter((l) => l !== location) : [...current, location];
      return { ...p, [list]: next };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const finalParams: MarketSelectionParams = {
        ...params,
        treatment_periods: parseNumberList(treatmentPeriodsText),
        N: parseNumberList(nText),
        effect_size: parseNumberList(effectSizeText),
        holdout: parseNumberList(holdoutText),
      };
      const run = await apiPost<MarketSelectionRun>(`/api/experiments/${experimentId}/market-selection`, {
        params: finalParams,
      });
      onStarted(run);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start market selection");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Treatment periods (durations)</label>
          <input className="input" value={treatmentPeriodsText} onChange={(e) => setTreatmentPeriodsText(e.target.value)} placeholder="e.g. 10, 15" />
        </div>
        <div>
          <label className="label">N (test market counts)</label>
          <input className="input" value={nText} onChange={(e) => setNText(e.target.value)} placeholder="e.g. 2, 3, 4" />
        </div>
        <div>
          <label className="label">Effect sizes to simulate</label>
          <input className="input" value={effectSizeText} onChange={(e) => setEffectSizeText(e.target.value)} />
        </div>
        <div>
          <label className="label">Cost per incremental conversion (cpic)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={params.cpic}
            onChange={(e) => update("cpic", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Alpha (significance level)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={params.alpha}
            onChange={(e) => update("alpha", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Budget (optional cap)</label>
          <input
            className="input"
            type="number"
            value={params.budget ?? ""}
            onChange={(e) => update("budget", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
      </div>

      <button type="button" className="text-sm text-brand-600 font-medium" onClick={() => setExpanded((s) => !s)}>
        {expanded ? "Hide advanced parameters" : "Show advanced parameters"}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label">Lookback window</label>
              <input
                className="input"
                type="number"
                value={params.lookback_window}
                onChange={(e) => update("lookback_window", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Holdout range [min, max]</label>
              <input className="input" placeholder="e.g. 0.4, 0.7" value={holdoutText} onChange={(e) => setHoldoutText(e.target.value)} />
            </div>
            <div>
              <label className="label">Side of test</label>
              <select className="input" value={params.side_of_test} onChange={(e) => update("side_of_test", e.target.value)}>
                <option value="two_sided">Two-sided</option>
                <option value="one_sided">One-sided</option>
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <select className="input" value={params.model} onChange={(e) => update("model", e.target.value)}>
                <option value="none">None</option>
                <option value="ridge">Ridge</option>
                <option value="gsyn">GSYN</option>
              </select>
            </div>
            <div>
              <label className="label">DTW penalty</label>
              <input className="input" type="number" step="0.1" value={params.dtw} onChange={(e) => update("dtw", Number(e.target.value))} />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            {(
              [
                ["fixed_effects", "Fixed effects"],
                ["normalize", "Normalize"],
                ["correlations", "Compute correlations"],
                ["run_stochastic_process", "Stochastic process p-values"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={params[key]} onChange={(e) => update(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>

          {locations.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Include markets (force into test group)</label>
                <MarketPicker locations={locations} selected={params.include_markets} onToggle={(l) => toggleMarket("include_markets", l)} />
              </div>
              <div>
                <label className="label">Exclude markets</label>
                <MarketPicker locations={locations} selected={params.exclude_markets} onToggle={(l) => toggleMarket("exclude_markets", l)} />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? "Starting..." : "Run market selection"}
      </button>
    </form>
  );
}

function MarketPicker({ locations, selected, onToggle }: { locations: string[]; selected: string[]; onToggle: (l: string) => void }) {
  return (
    <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
      {locations.map((loc) => (
        <label key={loc} className="flex items-center gap-2 text-sm px-1 py-0.5 hover:bg-slate-50 rounded">
          <input type="checkbox" checked={selected.includes(loc)} onChange={() => onToggle(loc)} />
          {loc}
        </label>
      ))}
    </div>
  );
}
