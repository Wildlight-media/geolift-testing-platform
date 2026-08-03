export type PeriodDate = { period: number; date: string };

// Finds the time-period number for a calendar date, snapping forward to the
// nearest available period if the exact date isn't in the dataset (e.g. it
// falls on a gap that got filled, or just outside the range).
export function dateToPeriod(periodDates: PeriodDate[], dateStr: string): number | null {
  if (!dateStr || periodDates.length === 0) return null;
  const sorted = [...periodDates].sort((a, b) => a.date.localeCompare(b.date));
  const match = sorted.find((pd) => pd.date >= dateStr);
  return match ? match.period : (sorted[sorted.length - 1]?.period ?? null);
}

export function periodToDate(periodDates: PeriodDate[], period: number): string | null {
  return periodDates.find((pd) => pd.period === period)?.date ?? null;
}

// Adds `days` calendar days to a "YYYY-MM-DD" string (UTC, so it's not
// affected by the browser's local timezone/DST).
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
