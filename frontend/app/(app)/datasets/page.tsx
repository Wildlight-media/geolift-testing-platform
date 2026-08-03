"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { Dataset } from "@/lib/types";
import DatasetUploadForm from "@/components/DatasetUploadForm";

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  function refresh() {
    apiGet<Dataset[]>("/api/datasets")
      .then(setDatasets)
      .finally(() => setLoading(false));
  }

  async function refreshMetadata(datasetId: string) {
    setRefreshingId(datasetId);
    try {
      await apiPost(`/api/datasets/${datasetId}/refresh`);
      refresh();
    } finally {
      setRefreshingId(null);
    }
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
        <DatasetUploadForm
          uploadUrl="/api/datasets"
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
                <span className="badge bg-amber-100 text-amber-700 mt-3 mr-2">
                  {d.dropped_zip_row_count} row(s) dropped (unmapped zip)
                </span>
              )}
              {d.filled_missing_row_count > 0 && (
                <span className="badge bg-slate-100 text-slate-600 mt-3" title="Missing location/date combinations filled with 0 so no location got dropped as incomplete.">
                  {d.filled_missing_row_count} gap(s) filled with 0
                </span>
              )}
              {d.period_dates.length === 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-amber-600 mb-2">
                    Uploaded before date pickers existed — refresh to enable them on the Analyze page.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary py-1 text-xs"
                    disabled={refreshingId === d.id}
                    onClick={() => refreshMetadata(d.id)}
                  >
                    {refreshingId === d.id ? "Refreshing..." : "Refresh metadata"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
