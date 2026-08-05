"use client";

export default function RangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  onChange,
  step = 1,
  tickCount = 8,
}: {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
  step?: number;
  tickCount?: number;
}) {
  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100;

  function onMinChange(v: number) {
    onChange(Math.min(v, valueMax), valueMax);
  }
  function onMaxChange(v: number) {
    onChange(valueMin, Math.max(v, valueMin));
  }

  const ticks = Array.from({ length: tickCount }, (_, i) => Math.round(min + ((max - min) * i) / (tickCount - 1)));

  return (
    <div>
      <div className="relative h-9">
        <div className="absolute left-0 -top-1 text-xs text-slate-400">{min}</div>
        <div className="absolute right-0 -top-1 text-xs text-slate-400">{max}</div>
        <div
          className="absolute px-1.5 py-0.5 rounded text-xs font-semibold text-white bg-brand-600 -translate-x-1/2"
          style={{ left: `${pct(valueMin)}%`, top: 0 }}
        >
          {valueMin}
        </div>
        <div
          className="absolute px-1.5 py-0.5 rounded text-xs font-semibold text-white bg-brand-600 -translate-x-1/2"
          style={{ left: `${pct(valueMax)}%`, top: 0 }}
        >
          {valueMax}
        </div>
        <div className="range-slider-track">
          <div className="range-slider-fill" style={{ left: `${pct(valueMin)}%`, right: `${100 - pct(valueMax)}%` }} />
        </div>
        <input
          type="range"
          className="range-slider-input"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(e) => onMinChange(Number(e.target.value))}
        />
        <input
          type="range"
          className="range-slider-input"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(e) => onMaxChange(Number(e.target.value))}
        />
      </div>
      <div className="relative flex justify-between text-[10px] text-slate-400 px-0.5">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}
