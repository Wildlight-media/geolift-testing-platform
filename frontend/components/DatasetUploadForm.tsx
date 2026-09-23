"use client";

import { useState } from "react";
import Papa from "papaparse";
import { apiUpload, ApiError } from "@/lib/api";

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

export type DatasetUploadDefaults = {
  location_col?: string;
  date_col?: string;
  y_col?: string;
  date_format?: string;
  covariate_cols?: string[];
  convert_zip_to_dma?: boolean;
  outcome_type?: string;
};

export default function DatasetUploadForm({
  uploadUrl,
  onUploaded,
  defaultName = "",
  showNameField = true,
  defaults,
}: {
  uploadUrl: string;
  onUploaded: () => void;
  defaultName?: string;
  showNameField?: boolean;
  defaults?: DatasetUploadDefaults;
}) {
  const [name, setName] = useState(defaultName);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [locationCol, setLocationCol] = useState("");
  const [dateCol, setDateCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [dateFormat, setDateFormat] = useState(defaults?.date_format ?? "yyyy-mm-dd");
  const [covariateCols, setCovariateCols] = useState<string[]>([]);
  const [convertZipToDma, setConvertZipToDma] = useState(defaults?.convert_zip_to_dma ?? false);
  const [outcomeType, setOutcomeType] = useState(defaults?.outcome_type ?? "revenue");
  const [error, setError] = useState<string | null>(null);
  const [zipMismatch, setZipMismatch] = useState<{ count: number; sample: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function pick(headerList: string[], preferred: string | undefined, keywords: string[]): string {
    if (preferred && headerList.includes(preferred)) return preferred;
    return guessColumn(headerList, keywords);
  }

  function onFileChange(selected: File | null) {
    setFile(selected);
    setHeaders([]);
    setHeaderError(null);
    setLocationCol("");
    setDateCol("");
    setYCol("");
    setCovariateCols([]);
    setZipMismatch(null);
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
        setLocationCol(pick(cleaned, defaults?.location_col, ["location", "dma", "market", "zip", "postal code", "postal"]));
        setDateCol(pick(cleaned, defaults?.date_col, ["date", "day", "week"]));
        setYCol(pick(cleaned, defaults?.y_col, ["y", "sales", "revenue", "conversions", "units", "orders"]));
        if (defaults?.covariate_cols) {
          setCovariateCols(defaults.covariate_cols.filter((c) => cleaned.includes(c)));
        }
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
      form.set("outcome_type", outcomeType);
      form.set("drop_unmapped_zips", String(dropUnmappedZips));
      form.set("file", file);
      await apiUpload(uploadUrl, form);
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
      <div className={showNameField ? "grid grid-cols-2 gap-4" : ""}>
        {showNameField && (
          <div>
            <label className="label">Dataset name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
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

          <div>
            <label className="label">Outcome variable type</label>
            <div className="flex gap-4 text-sm">
              {[
                { value: "revenue", label: "Revenue ($)" },
                { value: "conversions", label: "Conversions (#)" },
                { value: "other", label: "Other" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="outcome_type"
                    checked={outcomeType === opt.value}
                    onChange={() => setOutcomeType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">Controls whether results show a $ amount or a plain count.</p>
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
          <button type="button" className="btn-secondary" disabled={submitting} onClick={() => submitUpload(true)}>
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
