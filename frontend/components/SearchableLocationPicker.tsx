"use client";

import { useState } from "react";

export default function SearchableLocationPicker({
  locations,
  selected,
  onToggle,
  maxHeightClass = "max-h-40",
}: {
  locations: string[];
  selected: string[];
  onToggle: (location: string) => void;
  maxHeightClass?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? locations.filter((l) => l.toLowerCase().includes(query.trim().toLowerCase()))
    : locations;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <input
        className="w-full px-2 py-1.5 text-sm border-b border-slate-200 focus:outline-none"
        placeholder={`Search ${locations.length} location(s)...`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={`${maxHeightClass} overflow-y-auto p-2 grid grid-cols-2 md:grid-cols-3 gap-1`}>
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 col-span-full py-2 text-center">No matches</p>
        ) : (
          filtered.map((loc) => (
            <label key={loc} className="flex items-center gap-2 text-sm px-1 py-0.5 hover:bg-slate-50 rounded">
              <input type="checkbox" checked={selected.includes(loc)} onChange={() => onToggle(loc)} />
              {loc}
            </label>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <div className="px-2 py-1 border-t border-slate-100 text-xs text-slate-500">{selected.length} selected</div>
      )}
    </div>
  );
}
