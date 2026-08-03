"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Dataset, Experiment } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  market_selection_running: "bg-amber-100 text-amber-700",
  market_selection_done: "bg-blue-100 text-blue-700",
  test_running: "bg-amber-100 text-amber-700",
  analyzed: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-500",
};

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    Promise.all([apiGet<Experiment[]>("/api/experiments"), apiGet<Dataset[]>("/api/datasets")]).then(
      ([exps, ds]) => {
        setExperiments(exps);
        setDatasets(ds);
        setLoading(false);
      }
    );
  }

  useEffect(refresh, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Experiments</h1>
          <p className="text-sm text-slate-500">Design geo tests and analyze results.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)} disabled={datasets.length === 0}>
          {showForm ? "Cancel" : "New experiment"}
        </button>
      </div>

      {datasets.length === 0 && !loading && (
        <p className="text-sm text-slate-400">
          Upload a dataset first on the{" "}
          <Link href="/datasets" className="text-brand-600 font-medium">
            Datasets
          </Link>{" "}
          page.
        </p>
      )}

      {showForm && (
        <CreateForm
          datasets={datasets}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : experiments.length === 0 ? (
        <p className="text-sm text-slate-400">No experiments yet.</p>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Link
              key={exp.id}
              href={`/experiments/${exp.id}`}
              className="card p-4 flex items-center justify-between hover:border-brand-300 transition-colors"
            >
              <div>
                <div className="font-medium">{exp.name}</div>
                <div className="text-xs text-slate-400">Updated {new Date(exp.updated_at).toLocaleString()}</div>
              </div>
              <span className={`badge ${STATUS_STYLES[exp.status] ?? "bg-slate-100 text-slate-600"}`}>
                {exp.status.replaceAll("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm({ datasets, onCreated }: { datasets: Dataset[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiPost("/api/experiments", { name, dataset_id: datasetId });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create experiment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 flex items-end gap-4">
      <div className="flex-1">
        <label className="label">Experiment name</label>
        <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex-1">
        <label className="label">Dataset</label>
        <select className="input" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? "Creating..." : "Create"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
