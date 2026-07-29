import { buildValueRangeChartRow, findFirstHighPeak, formatPeakTooltip } from './valueRangeCurve.ts';

export type CorporateChartInput = {
  valuationYear?: number;
  rows: Array<{ period: number; year: number; npvPerShare: number | null; navPerShare: number | null; dcfPerShare: number | null; dcfExCapexPerShare?: number | null; sharesPf: number | null }>;
  projectMarkers: Array<{ projectId: string; projectName: string; productionStartYear: number | null; navPerShare?: number | null; dcfPerShare?: number | null }>;
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
  { label: 'Index', type: 'number' },
  { label: 'Low', type: 'number' },
  { label: 'Band', type: 'number' },
  { label: 'Low boundary', type: 'number' },
  { label: 'High boundary', type: 'number' },
  { label: 'Current', type: 'number' }, { role: 'annotation', type: 'string' },
  { label: 'Current Low', type: 'number' }, { role: 'annotation', type: 'string' },
  { label: 'Current High', type: 'number' }, { role: 'annotation', type: 'string' },
  { label: 'TP Low', type: 'number' }, { role: 'annotation', type: 'string' }, { role: 'tooltip', type: 'string' },
  { label: 'TP High', type: 'number' }, { role: 'annotation', type: 'string' }, { role: 'tooltip', type: 'string' },
  { label: 'Peak Low', type: 'number' }, { role: 'annotation', type: 'string' }, { role: 'tooltip', type: 'string' },
  { label: 'Peak High', type: 'number' }, { role: 'annotation', type: 'string' }, { role: 'tooltip', type: 'string' },
] as const;

const label = (value: number) => value.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function productionStartTooltip(args: { year: number; projectNames: string[]; high: number | null; low: number | null; isPeak: boolean; currencyCode?: string }): string {
  const unit = args.currencyCode ? ` ${args.currencyCode}` : '';
  const value = (number: number | null) => number === null ? 'n/a' : `${label(number)}${unit}`;
  const projects = args.projectNames.length === 1
    ? args.projectNames[0]
    : args.projectNames.map((name) => `• ${name}`).join('\n');
  return [
    `År: ${args.year}`,
    ...(args.isPeak ? ['Peak High'] : []),
    `Produktionsstart: ${projects}`,
    `High: ${value(args.high)}`,
    `Low: ${value(args.low)}`,
  ].join('\n');
}

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
  const rows = input.rows.filter((row) => (
    (typeof input.valuationYear !== 'number' || row.year >= input.valuationYear)
    && (effectiveChartEndYear === null || row.year <= effectiveChartEndYear)
  ));
  const clipped = rows.length !== input.rows.length;
  return {
    input: clipped ? { ...input, rows } : input,
    lastProductionStartYear,
    lastAvailableCorporateYear,
    chartEndYear,
    effectiveChartEndYear,
  };
}

/** Builds the ordinary curve first, then adds project starts in dedicated presentation columns. */
export function buildCorporateChartRows(
  input: CorporateChartInput,
  today: { low: number | null; high: number | null; price: number | null; tpLow?: number | null; tpHigh?: number | null },
  _discountRate = 0.1,
  currencyCode?: string,
) {
  const productionStartYears = new Set<number>();
  for (const marker of input.projectMarkers) {
    if (typeof marker.productionStartYear === 'number') {
      productionStartYears.add(marker.productionStartYear);
    }
  }

  const valuationYear = finite(input.valuationYear) ? input.valuationYear : input.rows[0]?.year;
  const rollingValues = input.rows.map((row) => ({ year: row.year, low: row.navPerShare, high: row.dcfExCapexPerShare ?? null }));
  const peak = findFirstHighPeak(rollingValues);
  return rollingValues.map(({ year, low, high }, index) => {
    const markerLow = low;
    const markerHigh = high;
    const isCurrent = typeof input.valuationYear === 'number' ? year === input.valuationYear : index === 0;
    const isFutureProductionStart = productionStartYears.has(year) && finite(valuationYear) && year > valuationYear;
    return buildValueRangeChartRow({
      ...(isFutureProductionStart ? (() => {
        const projectNames = input.projectMarkers
          .filter((marker) => marker.productionStartYear === year)
          .map((marker) => marker.projectName);
        return {
          productionStartTooltip: productionStartTooltip({ year, projectNames, high: markerHigh ?? high, low: markerLow ?? low, isPeak: index === peak?.index, currencyCode }),
        };
      })() : {}),
      year, low, high, currentPrice: today.price,
      annotateCurrent: isCurrent,
      annotateProductionStart: isFutureProductionStart, format: label,
      currentLowValue: low,
      currentHighValue: high,
      productionStartLowValue: markerLow,
      productionStartHighValue: markerHigh,
      highlightPeak: index === peak?.index && !isCurrent && !isFutureProductionStart,
      peakTooltip: peak ? formatPeakTooltip(peak, label, currencyCode) : null,
    });
  });
}

/** Explicit formatted ticks prevent Google Charts from localizing years as e.g. 2,029. */
export function buildCorporateYearTicks(input: CorporateChartInput, peakYear?: number): CorporateYearTick[] {
  const years = input.rows.map((row) => row.year);
  const required = new Set<number>([
    years[0],
    years[years.length - 1],
    ...input.projectMarkers.map((marker) => marker.productionStartYear).filter((year): year is number => typeof year === 'number'),
    ...(typeof peakYear === 'number' ? [peakYear] : []),
  ]);
  return years.filter((year) => required.has(year)).map((year) => ({ v: year, f: String(year) }));
}
