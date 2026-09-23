"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = { time: number; cumulative_estimate: number; lower_bound: number | null; upper_bound: number | null };

export default function CumulativeEffectChart({
  data,
  treatmentStart,
  color = "#2563eb",
  bandColor = "#64748b",
}: {
  data: Row[];
  treatmentStart: number;
  color?: string;
  // Confidence band fill - defaults to a neutral gray (independent of the
  // line color) to match the standard convention for these charts: a
  // colored observed/estimate line over a gray uncertainty band.
  bandColor?: string;
}) {
  const hasBands = data.length > 0 && data.every((d) => d.lower_bound !== null && d.upper_bound !== null);
  const chartData = data.map((d) => ({
    ...d,
    periodsSinceStart: d.time - treatmentStart,
    range: [d.lower_bound, d.upper_bound] as [number | null, number | null],
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="periodsSinceStart"
          tick={{ fontSize: 12 }}
          label={{ value: "Periods since test start", position: "insideBottom", offset: -4, fontSize: 12 }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <ReferenceLine y={0} stroke="#94a3b8" />
        {hasBands && <Area dataKey="range" stroke="none" fill={bandColor} fillOpacity={0.25} isAnimationActive={false} />}
        <Line type="monotone" dataKey="cumulative_estimate" stroke={color} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
