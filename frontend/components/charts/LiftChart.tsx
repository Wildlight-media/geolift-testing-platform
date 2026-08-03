"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { time: number; treatment_observed: number; synthetic_control: number };

export default function LiftChart({ data, color = "#2563eb" }: { data: Row[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} label={{ value: "Time period", position: "insideBottom", offset: -4, fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="treatment_observed" name="Observed" stroke={color} strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="synthetic_control"
          name="Synthetic control"
          stroke="#94a3b8"
          strokeDasharray="5 4"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
