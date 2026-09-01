"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type {
  BestMarketRow,
  CandidateSimulation,
  Dataset,
  Experiment,
  MarketSelectionParams,
  MarketSelectionResult,
  MarketSelectionRun,
} from "@/lib/types";
import PowerCurveChart from "@/components/charts/PowerCurveChart";
import ControlLiftTestBars from "@/components/charts/ControlLiftTestBars";
import CumulativeEffectChart from "@/components/charts/CumulativeEffectChart";
import SearchableLocationPicker from "@/components/SearchableLocationPicker";
import RangeSlider from "@/components/RangeSlider";
import { formatOutcome } from "@/lib/format";

const DEFAULT_PARAMS: MarketSelectionParams = {
  treatment_periods: [15],
  N: [2, 3, 4],
  effect_size: [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2],
  // 1 (GeoLift's own default) only evaluates a single historical window,
  // collapsing Power to a binary 0%/100% instead of a real probability.
  lookback_window: 3,
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

// Spreads N (test market count) evenly across the chosen [min, max] range
// rather than making the user type out specific counts - similar in spirit
// to GeoLift's own default (deciles across all locations) but scoped to
// whatever range the slider is set to.
function generateNValues(min: number, max: number, count = 5): number[] {
  if (min >= max) return [min];
  const step = (max - min) / (count - 1);
  const values = Array.from({ length: count }, (_, i) => Math.round(min + i * step));
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

type PlanTier = { investment: number; liftPct: number; liftDollars: number };

// Reads two points straight off the same power curve GeoLiftPower already
// returns for a candidate - the smallest effect size that clears each power
// bar. No new computation: Investment and EffectSize are already in the
// data, this just picks the rows that matter for a plain-English summary.
function pickPlanTier(powerCurve: Record<string, unknown>[], minPower: number): PlanTier | null {
  const candidates = powerCurve
    .map((row) => ({
      effectSize: Number(row.EffectSize),
      power: Number(row.power),
      investment: Number(row.Investment),
      cpic: Number(row.cpic),
    }))
    .filter((r) => !Number.isNaN(r.effectSize) && !Number.isNaN(r.power) && r.power >= minPower && r.effectSize > 0)
    .sort((a, b) => a.effectSize - b.effectSize);

  const best = candidates[0];
  if (!best) return null;
  // Investment is defined as cpic * incremental_revenue, so the expected
  // revenue itself is just Investment / cpic - no separate computation.
  const liftDollars = best.cpic > 0 ? best.investment / best.cpic : best.investment;
  return { investment: best.investment, liftPct: best.effectSize * 100, liftDollars };
}

export default function DesignPage() {
  const { id } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [runs, setRuns] = useState<MarketSelectionRun[]>([]);
  const [activeRun, setActiveRun] = useState<MarketSelectionRun | null>(null);
  const [result, setResult] = useState<MarketSelectionResult | null>(null);
  const [selected, setSelected] = useState<BestMarketRow | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [simulation, setSimulation] = useState<CandidateSimulation | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiGet<Experiment>(`/api/experiments/${id}`).then((exp) => {
      apiGet<Dataset>(`/api/datasets/${exp.dataset_id}`).then(setDataset);
    });
    refreshRuns();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (simPollRef.current) clearInterval(simPollRef.current);
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

  async function cancelRun(runId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const run = await apiPost<MarketSelectionRun>(`/api/experiments/${id}/market-selection/${runId}/cancel`, {});
    setActiveRun(run);
  }

  async function onSelectCandidate(row: BestMarketRow) {
    if (!activeRun) return;
    setSelected(row);
    setDetail(null);
    if (simPollRef.current) clearInterval(simPollRef.current);
    setSimulation(null);
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

  async function startSimulation() {
    if (!activeRun || !selected || !detail) return;
    const powerCurve = (detail.power_curve as Record<string, unknown>[]) ?? [];
    const recommended = pickPlanTier(powerCurve, 0.8);
    const effectSizes = recommended ? [0, recommended.liftPct / 100] : [0];
    const locations = selected.location.split(",").map((s) => s.trim());
    const sim = await apiPost<CandidateSimulation>(`/api/experiments/${id}/market-selection/${activeRun.id}/simulate`, {
      locations,
      duration: selected.duration,
      effect_sizes: effectSizes,
    });
    setSimulation(sim);
    watchSimulation(sim.id);
  }

  function watchSimulation(simulationId: string) {
    if (simPollRef.current) clearInterval(simPollRef.current);
    if (!activeRun) return;
    const poll = () => {
      apiGet<CandidateSimulation>(`/api/experiments/${id}/market-selection/${activeRun.id}/simulate/${simulationId}`).then((sim) => {
        setSimulation(sim);
        if (sim.status === "succeeded" || sim.status === "failed") {
          if (simPollRef.current) clearInterval(simPollRef.current);
        }
      });
    };
    poll();
    simPollRef.current = setInterval(poll, 5000);
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
            <div className="flex items-center gap-3">
              {activeRun.status === "running" && <span className="text-xs text-slate-400">Simulating candidate markets — this can take a few minutes...</span>}
              {(activeRun.status === "queued" || activeRun.status === "running") && (
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => cancelRun(activeRun.id)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          {activeRun.status === "running" && (
            <p className="text-xs text-slate-400 mt-1">
              Cancelling a run already in progress stops it from blocking new runs, but the in-flight computation
              may keep using resources briefly in the background.
            </p>
          )}
          {activeRun.error && <p className="text-sm text-red-600 mt-2">{activeRun.error}</p>}
        </div>
      )}

      {result && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-medium text-sm flex items-center justify-between">
            <span>Ranked candidate markets</span>
            {result.best_markets_json.length > 25 && (
              <span className="text-xs text-slate-400 font-normal">
                Showing top 25 of {result.best_markets_json.length}
              </span>
            )}
          </div>
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
                {result.best_markets_json.slice(0, 25).map((row, i) => (
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
        <div className="space-y-6">
          {detail ? (
            <TestingPlanCard
              selected={selected}
              powerCurve={(detail.power_curve as Record<string, unknown>[]) ?? []}
              outcomeType={dataset?.outcome_type ?? "revenue"}
            />
          ) : null}

          <div className="card p-6">
            <div className="font-medium text-sm mb-4">Candidate detail: {selected.location}</div>
            {detail ? (
              <PowerCurveChart data={(detail.power_curve as Record<string, unknown>[]) ?? []} xKey="EffectSize" yKey="power" />
            ) : (
              <p className="text-sm text-slate-400">Loading detail...</p>
            )}
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium text-sm">Simulated example</div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Runs the real GeoLift inference against this candidate&apos;s own historical data with a hypothetical
                  effect injected, so you can see what the test would plausibly look like before it runs. On large
                  datasets this can take a long time (same as a real analysis) - feel free to navigate away, it&apos;ll
                  still be here when you come back.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary shrink-0"
                disabled={!detail || simulation?.status === "queued" || simulation?.status === "running"}
                onClick={startSimulation}
              >
                {simulation?.status === "queued" || simulation?.status === "running" ? "Simulating..." : "Simulate this test"}
              </button>
            </div>
            {simulation && (
              <SimulationPanels simulation={simulation} outcomeType={dataset?.outcome_type ?? "revenue"} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SimulationPanels({ simulation, outcomeType }: { simulation: CandidateSimulation; outcomeType: string }) {
  if (simulation.status === "failed") {
    return <p className="text-sm text-red-600 mt-3">{simulation.error ?? "Simulation failed"}</p>;
  }
  if (simulation.status !== "succeeded" || !("scenarios" in simulation.result_json)) {
    return <p className="text-sm text-slate-400 mt-3">Running simulation - this may take a while...</p>;
  }

  const scenarios = simulation.result_json.scenarios;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
      {scenarios.map(({ effect_size, result }) => {
        const summary = result.summary;
        const treatmentWindow =
          summary.treatment_start !== null && summary.treatment_end !== null
            ? result.lift_series.filter((r) => r.time >= summary.treatment_start! && r.time <= summary.treatment_end!)
            : [];
        const testValue = treatmentWindow.reduce((sum, r) => sum + r.treatment_observed, 0);
        const controlValue = treatmentWindow.reduce((sum, r) => sum + r.synthetic_control, 0);
        const liftValue = summary.incremental ?? testValue - controlValue;

        return (
          <div key={effect_size} className="border border-slate-100 rounded-lg p-4">
            <div className="text-sm text-slate-600 mb-2">
              {effect_size === 0 ? (
                <>Simulated results with no effect: {formatOutcome(liftValue, outcomeType)}</>
              ) : (
                <>
                  Simulated results with {(effect_size * 100).toFixed(1)}% increase in test: {formatOutcome(liftValue, outcomeType)}
                </>
              )}
              {summary.lower_conf_int !== null && summary.upper_conf_int !== null && (
                <span className="text-slate-400">
                  {" "}
                  ({formatOutcome(summary.lower_conf_int, outcomeType)}, {formatOutcome(summary.upper_conf_int, outcomeType)})
                </span>
              )}
            </div>
            <ControlLiftTestBars control={controlValue} lift={liftValue} test={testValue} outcomeType={outcomeType} />
            {result.cumulative_effect_series?.length > 0 && (
              <div className="mt-4">
                <CumulativeEffectChart data={result.cumulative_effect_series} treatmentStart={summary.treatment_start ?? 0} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TestingPlanCard({
  selected,
  powerCurve,
  outcomeType,
}: {
  selected: BestMarketRow;
  powerCurve: Record<string, unknown>[];
  outcomeType: string;
}) {
  const locationCount = selected.location.split(",").filter((s) => s.trim()).length;
  const baseline = pickPlanTier(powerCurve, 0.8);
  const high = pickPlanTier(powerCurve, 0.95);
  // Only worth showing as two separate tiers if they actually land on
  // different effect sizes - a loose alpha or a lookback window of 1 (a
  // single simulated trial) often makes every tested effect size clear
  // both power bars identically, which just reads as a confusing duplicate.
  const showBothTiers = !!(baseline && high && Math.abs(baseline.liftPct - high.liftPct) > 0.01);

  if (!baseline && !high) return null;
  const single = baseline ?? high;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="p-4 border-b border-slate-100 font-medium text-sm">Testing plan recommendations</div>
      <div className="p-6">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="rounded-lg bg-brand-700 text-white flex items-center justify-center py-8 text-2xl font-semibold">
            {selected.duration} days
          </div>
          <div className="rounded-lg bg-brand-100 text-brand-900 flex items-center justify-center py-8 text-2xl font-semibold">
            {locationCount} location{locationCount === 1 ? "" : "s"}
          </div>
        </div>
        {showBothTiers ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PlanTierBlock label="High Confidence Plan" tier={high!} note="Detectable at 95% power" outcomeType={outcomeType} />
            <PlanTierBlock label="Baseline Confidence Plan" tier={baseline!} note="Detectable at 80% power (this is the MDE)" outcomeType={outcomeType} />
          </div>
        ) : (
          single && <PlanTierBlock label="Recommended Plan" tier={single} note="Detectable at 80% power (this is the MDE)" outcomeType={outcomeType} />
        )}
      </div>
    </div>
  );
}

function PlanTierBlock({
  label,
  tier,
  note,
  outcomeType,
}: {
  label: string;
  tier: PlanTier;
  note: string;
  outcomeType: string;
}) {
  return (
    <div>
      <div className="font-semibold text-sm mb-1">{label}</div>
      <p className="text-sm text-slate-600">{formatOutcome(tier.investment, "revenue")} additional investment in test geos</p>
      <p className="text-sm text-slate-600">
        {tier.liftPct.toFixed(1)}% additional {outcomeType === "revenue" ? "revenue" : "outcome"} expected in test geos (
        {formatOutcome(tier.liftDollars, outcomeType)})
      </p>
      <p className="text-xs text-slate-400 mt-1">{note}</p>
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
  const [nMin, setNMin] = useState(2);
  const [nMax, setNMax] = useState(4);
  const nValues = generateNValues(nMin, nMax);
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
        N: nValues,
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
          <div className="input h-auto py-3">
            <RangeSlider
              min={2}
              max={Math.min(Math.max(locations.length, 2), 50)}
              valueMin={nMin}
              valueMax={nMax}
              onChange={(lo, hi) => {
                setNMin(lo);
                setNMax(hi);
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Testing N = {nValues.join(", ")}</p>
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
                <SearchableLocationPicker
                  locations={locations}
                  selected={params.include_markets}
                  onToggle={(l) => toggleMarket("include_markets", l)}
                />
              </div>
              <div>
                <label className="label">Exclude markets</label>
                <SearchableLocationPicker
                  locations={locations}
                  selected={params.exclude_markets}
                  onToggle={(l) => toggleMarket("exclude_markets", l)}
                />
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
