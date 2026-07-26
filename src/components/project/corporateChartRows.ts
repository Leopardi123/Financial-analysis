import { buildValueRangeChartRow, buildValueRangeCurve } from './valueRangeCurve.ts';

export type CorporateChartInput = {
  rows: Array<{ period: number; year: number; npvPerShare: number | null; navPerShare: number | null; dcfPerShare: number | null; sharesPf: number | null }>;
  projectMarkers: Array<{ projectId: string; projectName: string; productionStartYear: number | null }>;
};

export type CorporateYearTick = { v: number; f: string };

export type CorporateChartWindow = {
  input: CorporateChartInput;
  lastProductionStartYear: number | null;
  lastAvailableCorporateYear: number | null;
  chartEndYear: number | null;
  effectiveChartEndYear: number | null;
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

/** Clips presentation rows by calendar year; the complete snapshot time series remains untouched. */
export function clipCorporateChartInput(input: CorporateChartInput): CorporateChartWindow {
  const productionStartYears = input.projectMarkers
    .map((marker) => marker.productionStartYear)
    .filter((year): year is number => typeof year === 'number' && Number.isFinite(year));
  const lastProductionStartYear = productionStartYears.length ? Math.max(...productionStartYears) : null;
  const availableYears = input.rows.map((row) => row.year).filter(Number.isFinite);
  const lastAvailableCorporateYear = availableYears.length ? Math.max(...availableYears) : null;
  const chartEndYear = lastProductionStartYear === null ? null : lastProductionStartYear + 5;
  const effectiveChartEndYear = chartEndYear === null || lastAvailableCorporateYear === null
    ? lastAvailableCorporateYear
    : Math.min(chartEndYear, lastAvailableCorporateYear);
  return {
    input: chartEndYear === null || effectiveChartEndYear === null || effectiveChartEndYear === lastAvailableCorporateYear
      ? input
      : { ...input, rows: input.rows.filter((row) => row.year <= effectiveChartEndYear) },
    lastProductionStartYear,
    lastAvailableCorporateYear,
    chartEndYear,
    effectiveChartEndYear,
  };
}

/** Builds the Project-chart row shape; TP columns are reused for every corporate project-start year. */
export function buildCorporateChartRows(
  input: CorporateChartInput,
  today: { low: number | null; high: number | null; price: number | null; tpLow?: number | null; tpHigh?: number | null },
) {
  const productionStartYears = new Set<number>();
  for (const marker of input.projectMarkers) {
    if (typeof marker.productionStartYear === 'number') {
      productionStartYears.add(marker.productionStartYear);
    }
  }

  const firstStartIndex = input.rows.findIndex((row) => productionStartYears.has(row.year));
  const tpOffset = firstStartIndex > 0 ? firstStartIndex : 0;
  const curve = buildValueRangeCurve({
    totalLen: input.rows.length,
    tpOffset,
    lowToday: today.low,
    highToday: today.high,
    lowTp: today.tpLow ?? input.rows[tpOffset]?.navPerShare ?? null,
    highTp: today.tpHigh ?? input.rows[tpOffset]?.dcfPerShare ?? null,
    navSeriesRaw: input.rows.slice(tpOffset).map((row) => row.navPerShare),
    dcfPresentSeriesRaw: input.rows.slice(tpOffset).map((row) => row.dcfPerShare),
  });

  return input.rows.map((row, index) => {
    const low = curve.low[index];
    const high = curve.high[index];
    return buildValueRangeChartRow({ year: row.year, low, high, currentPrice: today.price, annotateCurrent: index === 0, annotateProductionStart: productionStartYears.has(row.year), format: label });
  });
}

/** Explicit formatted ticks prevent Google Charts from localizing years as e.g. 2,029. */
export function buildCorporateYearTicks(input: CorporateChartInput): CorporateYearTick[] {
  const years = input.rows.map((row) => row.year);
  const required = new Set<number>([
    years[0],
    years[years.length - 1],
    ...input.projectMarkers.map((marker) => marker.productionStartYear).filter((year): year is number => typeof year === 'number'),
  ]);
  return years.filter((year) => required.has(year)).map((year) => ({ v: year, f: String(year) }));
}
