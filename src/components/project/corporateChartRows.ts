export type CorporateChartInput = {
  rows: Array<{ period: number; year: number; npvPerShare: number | null; navPerShare: number | null; dcfPerShare: number | null; sharesPf: number | null }>;
  projectMarkers: Array<{ projectId: string; projectName: string; productionStartYear: number | null }>;
};

export const valueRangeChartHeader = [
  'Index', 'Low', 'Band', 'Low boundary', 'High boundary',
  'Current', { role: 'annotation', type: 'string' },
  'Current Low', { role: 'annotation', type: 'string' },
  'Current High', { role: 'annotation', type: 'string' },
  'TP Low', { role: 'annotation', type: 'string' },
  'TP High', { role: 'annotation', type: 'string' },
] as const;

const label = (value: number) => value.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Builds the Project-chart row shape; TP columns are reused for every corporate project-start year. */
export function buildCorporateChartRows(
  input: CorporateChartInput,
  today: { low: number | null; high: number | null; price: number | null },
) {
  const markers = new Map<number, string[]>();
  for (const marker of input.projectMarkers) {
    if (typeof marker.productionStartYear === 'number') {
      markers.set(marker.productionStartYear, [...(markers.get(marker.productionStartYear) ?? []), marker.projectName]);
    }
  }

  return input.rows.map((row, index) => {
    const low = index === 0 && today.low !== null ? today.low : row.navPerShare;
    const high = index === 0 && today.high !== null ? today.high : row.dcfPerShare;
    const orderedLow = low !== null && high !== null ? Math.min(low, high) : low;
    const orderedHigh = low !== null && high !== null ? Math.max(low, high) : high;
    const isStart = markers.has(row.year);
    const names = markers.get(row.year)?.join(' / ') ?? null;
    return [
      row.year,
      orderedLow,
      orderedLow !== null && orderedHigh !== null ? orderedHigh - orderedLow : null,
      orderedLow,
      orderedHigh,
      index === 0 ? today.price : null,
      index === 0 && today.price !== null ? `      ${label(today.price)}` : null,
      index === 0 ? orderedLow : null,
      index === 0 && orderedLow !== null ? `      ${label(orderedLow)}` : null,
      index === 0 ? orderedHigh : null,
      index === 0 && orderedHigh !== null ? `      ${label(orderedHigh)}` : null,
      isStart ? orderedLow : null,
      isStart && orderedLow !== null ? `      ${label(orderedLow)}` : null,
      isStart ? orderedHigh : null,
      isStart && orderedHigh !== null ? `${names ?? ''}\n      ${label(orderedHigh)}` : null,
    ];
  });
}
