"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatOutcome } from "@/lib/format";

export default function ControlLiftTestBars({
  control,
  lift,
  test,
  outcomeType,
}: {
  control: number;
  lift: number;
  test: number;
  outcomeType: string;
}) {
  const data = [
    { name: "Control (modeled)", value: control, fill: "#cbd5e1" },
    { name: "Lift", value: lift, fill: lift >= 0 ? "#86c5a3" : "#f3a6a6" },
    { name: "Test", value: test, fill: "#2563eb" },
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatOutcome(v, outcomeType)} />
        <Bar dataKey="value" isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
          <LabelList dataKey="value" position="top" formatter={(v: number) => formatOutcome(v, outcomeType)} style={{ fontSize: 12, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
