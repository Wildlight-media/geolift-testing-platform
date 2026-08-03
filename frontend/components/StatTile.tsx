export default function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}
