"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, ApiError, API_URL } from "@/lib/api";
import type { AnalysisResult } from "@/lib/types";
import StatTile from "@/components/StatTile";
import LiftChart from "@/components/charts/LiftChart";
import AttChart from "@/components/charts/AttChart";

type SharedReport = {
  experiment_name: string;
  organization: { name: string; logo_url: string | null; primary_color: string };
  result: AnalysisResult | null;
  generated_at: string;
};

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SharedReport>(`/api/public/share/${token}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "This link is not available"));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  const { organization, result } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white" style={{ borderColor: organization.primary_color }}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          {organization.logo_url ? (
            <img src={organization.logo_url} alt={organization.name} className="h-8" />
          ) : (
            <span className="font-semibold" style={{ color: organization.primary_color }}>
              {organization.name}
            </span>
          )}
          <a
            href={`${API_URL}/api/public/share/${token}/pdf`}
            className="btn-secondary"
            style={{ borderColor: organization.primary_color, color: organization.primary_color }}
          >
            Download PDF
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{data.experiment_name}</h1>
          <p className="text-sm text-slate-500">Geo lift results &middot; generated {new Date(data.generated_at).toLocaleDateString()}</p>
        </div>

        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatTile
                label="Percent lift"
                value={result.summary.percent_lift !== null ? `${result.summary.percent_lift.toFixed(1)}%` : "—"}
                accent={organization.primary_color}
              />
              <StatTile
                label="Incremental outcome"
                value={result.summary.incremental !== null ? result.summary.incremental.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
              />
              <StatTile label="P-value" value={result.summary.pvalue !== null ? result.summary.pvalue.toFixed(3) : "—"} />
              <StatTile label="Average ATT" value={result.summary.att !== null ? result.summary.att.toFixed(2) : "—"} />
            </div>

            {result.lift_series?.length > 0 && (
              <div className="card p-6">
                <div className="font-medium text-sm mb-2">Observed vs. synthetic control</div>
                <LiftChart data={result.lift_series} color={organization.primary_color} />
              </div>
            )}

            {result.att_series?.length > 0 && (
              <div className="card p-6">
                <div className="font-medium text-sm mb-2">Average treatment effect over time</div>
                <AttChart data={result.att_series} color={organization.primary_color} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
