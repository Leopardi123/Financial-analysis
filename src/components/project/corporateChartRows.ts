export type CorporateChartInput = {
  rows: Array<{ period: number; year: number; npvPerShare: number | null; navPerShare: number | null; dcfPerShare: number | null; sharesPf: number | null }>;
  projectMarkers: Array<{ projectId: string; projectName: string; productionStartYear: number | null }>;
};

export function buildCorporateChartRows(input: CorporateChartInput, today: { npv: number | null; nav: number | null; dcf: number | null }) {
  const markers = new Map<number, string[]>();
  for (const marker of input.projectMarkers) if (typeof marker.productionStartYear === 'number') markers.set(marker.productionStartYear, [...(markers.get(marker.productionStartYear) ?? []), marker.projectName]);
  return input.rows.map((row, index) => {
    const npv = index === 0 && today.npv !== null ? today.npv : row.npvPerShare;
    const nav = index === 0 && today.nav !== null ? today.nav : row.navPerShare;
    const dcf = index === 0 && today.dcf !== null ? today.dcf : row.dcfPerShare;
    const values = [npv, nav, dcf].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const low = values.length ? Math.min(...values) : null;
    const high = values.length ? Math.max(...values) : null;
    const annotate = index === 0 || index === input.rows.length - 1 || markers.has(row.year);
    return [row.year, low, low !== null && high !== null ? high - low : null, npv, annotate && npv !== null ? `NPV ${npv.toFixed(1)}` : null, nav, annotate && nav !== null ? `NAV ${nav.toFixed(1)}` : null, dcf, annotate && dcf !== null ? `DCF ${dcf.toFixed(1)}` : null, markers.has(row.year) ? high : null, markers.get(row.year)?.join(' / ') ?? null];
  });
}
