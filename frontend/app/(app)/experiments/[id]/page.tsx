"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import type { Dataset, Experiment } from "@/lib/types";

export default function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  useEffect(() => {
    apiGet<Experiment>(`/api/experiments/${id}`).then((exp) => {
      setExperiment(exp);
      apiGet<Dataset>(`/api/datasets/${exp.dataset_id}`).then(setDataset);
    });
  }, [id]);

  if (!experiment) return <p className="text-sm text-slate-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{experiment.name}</h1>
        <p className="text-sm text-slate-500">
          Dataset: {dataset?.name ?? "..."} &middot; Status: {experiment.status.replaceAll("_", " ")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href={`/experiments/${id}/design`} className="card p-6 hover:border-brand-300 transition-colors">
          <div className="text-sm font-semibold text-brand-700">1. Design the test</div>
          <p className="text-sm text-slate-500 mt-1">
            Run market selection &amp; power analysis to find the best test/control markets before you spend a dollar.
          </p>
        </Link>
        <Link href={`/experiments/${id}/results`} className="card p-6 hover:border-brand-300 transition-colors">
          <div className="text-sm font-semibold text-brand-700">2. Analyze results</div>
          <p className="text-sm text-slate-500 mt-1">
            Once the real-world test has run, enter the actual test window and get client-ready lift results.
          </p>
        </Link>
      </div>
    </div>
  );
}
