export type ValuationMetricMap = Record<string, { value: number | null; reason?: string | null }>;

export type ValuationSeriesId = 'npv' | 'nav' | 'dcf' | 'cf_lom';
export type ValuationChartPoint = {
  id: string;
  series: ValuationSeriesId;
  metric: string;
  label: string;
  stage: 'now' | 'production_start';
  value: number;
  x: number;
  y: number;
  labelY: number;
};
export type ValuationChartSeries = { id: ValuationSeriesId; label: string; color: string; points: ValuationChartPoint[] };

const X_NOW = 82;
const X_PRODUCTION_START = 250;
const Y_TOP = 24;
const Y_BOTTOM = 154;
const MIN_LABEL_SPACING = 13;

const DEFINITIONS: Array<{ id: ValuationSeriesId; label: string; color: string; points: Array<{ metric: string; label: string; stage: 'now' | 'production_start' }> }> = [
  { id: 'npv', label: 'NPV', color: '#2563eb', points: [{ metric: 'NPV_perShare', label: 'NPV/aktie', stage: 'now' }, { metric: 'NPV_prodStart_perShare', label: 'NPV prod start/aktie', stage: 'production_start' }] },
  { id: 'nav', label: 'NAV', color: '#059669', points: [{ metric: 'NAV_perShare', label: 'NAV/aktie', stage: 'now' }, { metric: 'NAV_prodStart_perShare', label: 'NAV prod start/aktie', stage: 'production_start' }] },
  { id: 'dcf', label: 'DCF', color: '#7c3aed', points: [{ metric: 'DCF_Target_discounted_perShare', label: 'DCF prod start nuvärde/aktie', stage: 'now' }, { metric: 'DCF_perShare', label: 'DCF prod start/aktie', stage: 'production_start' }] },
  { id: 'cf_lom', label: 'CF LOM', color: '#d97706', points: [{ metric: 'CF_LOM_Target_perShare', label: 'CF LOM/aktie', stage: 'now' }] },
];

function spreadLabels(points: ValuationChartPoint[]): void {
  const ordered = [...points].sort((a, b) => a.y - b.y);
  for (let i = 0; i < ordered.length; i += 1) ordered[i].labelY = i === 0 ? Math.max(Y_TOP, ordered[i].y) : Math.max(ordered[i].y, ordered[i - 1].labelY + MIN_LABEL_SPACING);
  const overflow = ordered.length ? ordered[ordered.length - 1].labelY - Y_BOTTOM : 0;
  if (overflow > 0) for (const point of ordered) point.labelY -= overflow;
}

/** Builds a categorical chart directly from the exact List 2 table object. */
export function buildValuationChartModel(metrics: ValuationMetricMap | undefined) {
  const raw = DEFINITIONS.flatMap((series) => series.points.map((point) => ({ ...point, series: series.id, value: metrics?.[point.metric]?.value ?? null })));
  const finiteValues = raw.map((point) => point.value).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!finiteValues.length) return { series: [] as ValuationChartSeries[], points: [] as ValuationChartPoint[], domain: null };
  const min = Math.min(...finiteValues), max = Math.max(...finiteValues), span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * .08, .5) : span * .12;
  const domain = { min: min - pad, max: max + pad };
  const toY = (value: number) => Y_BOTTOM - ((value - domain.min) / (domain.max - domain.min)) * (Y_BOTTOM - Y_TOP);
  const points: ValuationChartPoint[] = raw.filter((point): point is typeof point & { value: number } => typeof point.value === 'number' && Number.isFinite(point.value)).map((point) => ({ id: `${point.series}:${point.stage}`, series: point.series, metric: point.metric, label: point.label, stage: point.stage, value: point.value, x: point.stage === 'now' ? X_NOW : X_PRODUCTION_START, y: toY(point.value), labelY: toY(point.value) }));
  spreadLabels(points.filter((point) => point.stage === 'now'));
  spreadLabels(points.filter((point) => point.stage === 'production_start'));
  const series = DEFINITIONS.map((definition) => ({ id: definition.id, label: definition.label, color: definition.color, points: points.filter((point) => point.series === definition.id) })).filter((item) => item.points.length > 0);
  return { series, points, domain };
}
