"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = Record<string, unknown>;

export default function PowerCurveChart({
  data,
  xKey,
  yKey,
  color = "#2563eb",
}: {
  data: Row[];
  xKey: string;
  yKey: string;
  color?: string;
}) {
  const sorted = [...data].sort((a, b) => Number(a[xKey]) - Number(b[xKey]));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={sorted} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} label={{ value: "Effect size", position: "insideBottom", offset: -4, fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} domain={[0, 1]} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey={yKey} name="Power" stroke={color} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
