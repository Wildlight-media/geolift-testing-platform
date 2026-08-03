"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { Time: number; Estimate: number; lower_bound: number | null; upper_bound: number | null };

export default function AttChart({ data, color = "#2563eb" }: { data: Row[]; color?: string }) {
  const hasBands = data.every((d) => d.lower_bound !== null && d.upper_bound !== null);
  const chartData = data.map((d) => ({ ...d, range: [d.lower_bound, d.upper_bound] as [number | null, number | null] }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="Time" tick={{ fontSize: 12 }} label={{ value: "Time period", position: "insideBottom", offset: -4, fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <ReferenceLine y={0} stroke="#94a3b8" />
        {hasBands && <Area dataKey="range" stroke="none" fill={color} fillOpacity={0.12} isAnimationActive={false} />}
        <Line type="monotone" dataKey="Estimate" stroke={color} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
