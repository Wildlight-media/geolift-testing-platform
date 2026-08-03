"use client";

import { useEffect, useState } from "react";
import { apiGet, apiUpload, ApiError } from "@/lib/api";
import type { Dataset } from "@/lib/types";

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    apiGet<Dataset[]>("/api/datasets")
      .then(setDatasets)
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Datasets</h1>
          <p className="text-sm text-slate-500">Historical location-level data used to design and analyze geo tests.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Upload dataset"}
        </button>
      </div>

      {showForm && (
        <UploadForm
          onUploaded={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : datasets.length === 0 ? (
        <p className="text-sm text-slate-400">No datasets yet. Upload a CSV to get started.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {datasets.map((d) => (
            <div key={d.id} className="card p-5">
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-slate-400 mb-3">{d.filename}</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">Locations</div>
                  <div className="font-semibold">{d.location_count ?? "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Time periods</div>
                  <div className="font-semibold">{d.time_period_count ?? "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Rows</div>
                  <div className="font-semibold">{d.row_count ?? "—"}</div>
                </div>
              </div>
              {d.converted_from_zip && (
                <span className="badge bg-blue-100 text-blue-700 mt-3">Converted from zip → DMA</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [locationCol, setLocationCol] = useState("location");
  const [dateCol, setDateCol] = useState("date");
  const [yCol, setYCol] = useState("Y");
  const [dateFormat, setDateFormat] = useState("yyyy-mm-dd");
  const [covariateCols, setCovariateCols] = useState("");
  const [convertZipToDma, setConvertZipToDma] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("location_col", locationCol);
      form.set("date_col", dateCol);
      form.set("y_col", yCol);
      form.set("date_format", dateFormat);
      form.set("covariate_cols", covariateCols);
      form.set("convert_zip_to_dma", String(convertZipToDma));
      form.set("file", file);
      await apiUpload("/api/datasets", form);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Dataset name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">CSV file</label>
          <input
            className="input"
            type="file"
            accept=".csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <label className="label">Location column{convertZipToDma ? " (zip codes)" : ""}</label>
          <input className="input" value={locationCol} onChange={(e) => setLocationCol(e.target.value)} />
        </div>
        <div>
          <label className="label">Date column</label>
          <input className="input" value={dateCol} onChange={(e) => setDateCol(e.target.value)} />
        </div>
        <div>
          <label className="label">Y (outcome) column</label>
          <input className="input" value={yCol} onChange={(e) => setYCol(e.target.value)} />
        </div>
        <div>
          <label className="label">Date format</label>
          <input className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} />
        </div>
        <div>
          <label className="label">Covariate columns</label>
          <input
            className="input"
            placeholder="comma-separated"
            value={covariateCols}
            onChange={(e) => setCovariateCols(e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={convertZipToDma}
          onChange={(e) => setConvertZipToDma(e.target.checked)}
        />
        <span>
          Convert zip codes to DMA (Nielsen market areas)
          <span className="block text-xs text-slate-400">
            Location column must contain 5-digit US zip codes. Rows are aggregated (summed) to the DMA level before
            validation — the stored dataset becomes DMA-level, matching how media is actually bought.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? "Uploading & validating..." : "Upload"}
      </button>
    </form>
  );
}
