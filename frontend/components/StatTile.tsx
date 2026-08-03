export default function StatTile({
  label,
  value,
  accent,
  sublabel,
  badge,
  note,
}: {
  label: string;
  value: string;
  accent?: string;
  sublabel?: string;
  badge?: { label: string; tone: "positive" | "neutral" };
  note?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sublabel && <div className="text-xs text-emerald-600 mt-1">{sublabel}</div>}
      {badge && (
        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              badge.tone === "positive" ? "bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {badge.label}
        </div>
      )}
      {note && <div className="text-xs text-slate-400 mt-0.5">{note}</div>}
    </div>
  );
}
