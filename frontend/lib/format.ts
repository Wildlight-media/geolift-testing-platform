export function formatOutcome(value: number, outcomeType: string): string {
  const rounded = value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return outcomeType === "revenue" ? `$${rounded}` : rounded;
}
