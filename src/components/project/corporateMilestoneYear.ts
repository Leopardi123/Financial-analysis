export function resolveCorporateMilestoneYear(
  marker: { yearLabelUsed?: string | null; corporateTpIndexUsed?: number | null; tp: number },
  valuationYears: number[],
): string {
  const explicitYear = Number(marker.yearLabelUsed);
  if (Number.isInteger(explicitYear)) return String(explicitYear);

  const index = typeof marker.corporateTpIndexUsed === 'number' ? marker.corporateTpIndexUsed : marker.tp;
  const valuationYear = valuationYears[index];
  return Number.isFinite(valuationYear) ? String(valuationYear) : '—';
}
