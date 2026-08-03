"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import type { Organization } from "@/lib/types";

export default function SettingsPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiGet<Organization>("/api/organization")
      .then((o) => {
        setOrg(o);
        setName(o.name);
        setLogoUrl(o.logo_url ?? "");
        setPrimaryColor(o.primary_color);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load organization"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiPatch<Organization>("/api/organization", {
        name,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
      });
      setOrg(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-semibold">Branding</h1>
        <p className="text-sm text-slate-500">Used on client-ready reports and shared result links.</p>
      </div>

      {error && !org ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <form onSubmit={onSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Organization name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input className="input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className="label">Primary color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-14 rounded" />
              <input className="input" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-emerald-600">Saved.</p>}
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving..." : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
