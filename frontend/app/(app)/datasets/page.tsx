"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiGet, apiUpload, ApiError } from "@/lib/api";
import type { Dataset } from "@/lib/types";

const DATE_FORMATS = ["yyyy-mm-dd", "mm/dd/yyyy", "dd/mm/yyyy", "mm-dd-yyyy", "yyyy/mm/dd"];

function guessColumn(headers: string[], keywords: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h === kw);
    if (idx !== -1) return headers[idx];
  }
  // substring matching on very short keywords (e.g. "y") is too broad -
  // it'd match "day" or "year" - so only exact matches apply below length 4.
  for (const kw of keywords.filter((k) => k.length >= 4)) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return "";
}

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
                <span className="badge bg-blue-100 text-blue-700 mt-3 mr-2">Converted from zip → DMA</span>
              )}
              {d.dropped_zip_row_count > 0 && (
                <span className="badge bg-amber-100 text-amber-700 mt-3">
                  {d.dropped_zip_row_count} row(s) dropped (unmapped zip)
                </span>
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
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [locationCol, setLocationCol] = useState("");
  const [dateCol, setDateCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [dateFormat, setDateFormat] = useState("yyyy-mm-dd");
  const [covariateCols, setCovariateCols] = useState<string[]>([]);
  const [convertZipToDma, setConvertZipToDma] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipMismatch, setZipMismatch] = useState<{ count: number; sample: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onFileChange(selected: File | null) {
    setFile(selected);
    setHeaders([]);
    setHeaderError(null);
    setLocationCol("");
    setDateCol("");
    setYCol("");
    setCovariateCols([]);
    if (!selected) return;

    Papa.parse(selected, {
      preview: 1,
      complete: (results) => {
        const row = (results.data[0] as string[] | undefined) ?? [];
        const cleaned = row.map((h) => h.trim()).filter(Boolean);
        if (cleaned.length === 0) {
          setHeaderError("Could not find a header row in this file.");
          return;
        }
        setHeaders(cleaned);
        setLocationCol(guessColumn(cleaned, ["location", "dma", "market", "zip", "postal code", "postal"]));
        setDateCol(guessColumn(cleaned, ["date", "day", "week"]));
        setYCol(guessColumn(cleaned, ["y", "sales", "revenue", "conversions", "units", "orders"]));
      },
      error: (err) => setHeaderError(`Could not read file: ${err.message}`),
    });
  }

  function toggleCovariate(col: string) {
    setCovariateCols((cur) => (cur.includes(col) ? cur.filter((c) => c !== col) : [...cur, col]));
  }

  async function submitUpload(dropUnmappedZips: boolean) {
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
      form.set("covariate_cols", covariateCols.join(","));
      form.set("convert_zip_to_dma", String(convertZipToDma));
      form.set("drop_unmapped_zips", String(dropUnmappedZips));
      form.set("file", file);
      await apiUpload("/api/datasets", form);
      setZipMismatch(null);
      onUploaded();
    } catch (err) {
      if (err instanceof ApiError && (err.detail as { error?: string })?.error === "zip_mismatch") {
        const detail = err.detail as { unmapped_count: number; sample: string[] };
        setZipMismatch({ count: detail.unmapped_count, sample: detail.sample });
      } else {
        setZipMismatch(null);
      }
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitUpload(false);
  }

  const covariateOptions = headers.filter((h) => h !== locationCol && h !== dateCol && h !== yCol);
  const ready = headers.length > 0;

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
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {headerError && <p className="text-sm text-red-600">{headerError}</p>}

      {!ready && !headerError && (
        <p className="text-sm text-slate-400">Choose a CSV file above to map its columns.</p>
      )}

      {ready && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label">Location column{convertZipToDma ? " (zip codes)" : ""}</label>
              <select className="input" required value={locationCol} onChange={(e) => setLocationCol(e.target.value)}>
                <option value="" disabled>
                  Select column
                </option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date column</label>
              <select className="input" required value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                <option value="" disabled>
                  Select column
                </option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Y (outcome) column</label>
              <select className="input" required value={yCol} onChange={(e) => setYCol(e.target.value)}>
                <option value="" disabled>
                  Select column
                </option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date format</label>
              <select className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {covariateOptions.length > 0 && (
            <div>
              <label className="label">Covariate columns (optional)</label>
              <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-2 grid grid-cols-2 md:grid-cols-3 gap-1">
                {covariateOptions.map((h) => (
                  <label key={h} className="flex items-center gap-2 text-sm px-1 py-0.5 hover:bg-slate-50 rounded">
                    <input type="checkbox" checked={covariateCols.includes(h)} onChange={() => toggleCovariate(h)} />
                    {h}
                  </label>
                ))}
              </div>
            </div>
          )}

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
                Location column must contain 5-digit US zip codes. Rows are aggregated (summed) to the DMA level
                before validation — the stored dataset becomes DMA-level, matching how media is actually bought.
              </span>
            </span>
          </label>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {zipMismatch && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm space-y-2">
          <p className="text-amber-800">
            Sample unmapped values: {zipMismatch.sample.join(", ")}
            {zipMismatch.count > zipMismatch.sample.length ? ` (+${zipMismatch.count - zipMismatch.sample.length} more)` : ""}.
            These are often blank postal codes that got filled with placeholder numbers, or non-US zips.
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() => submitUpload(true)}
          >
            Drop these {zipMismatch.count} row(s) and upload anyway
          </button>
        </div>
      )}

      <button type="submit" disabled={submitting || !ready} className="btn-primary">
        {submitting ? "Uploading & validating..." : "Upload"}
      </button>
    </form>
  );
}
