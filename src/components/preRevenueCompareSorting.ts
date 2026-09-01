import type { CorporatePreRevenueMetrics } from '../lib/corporate/preRevenueMetrics.ts';

export type PreRevenueSortableMetricKey =
  | 'pNav'
  | 'evEbitdaPeak'
  | 'targetPrice'
  | 'annualReturn'
  | 'irr'
  | 'payback'
  | 'lom'
  | 'initialCapex'
  | 'capexAnnualAueq'
  | 'annualAueq'
  | 'aueq10y'
  | 'aueqLom'
  | 'aueqPerShare'
  | 'mcap10yAueq'
  | 'mcapLomAueq';

export type PreRevenueSortDirection = 'asc' | 'desc';

const DEFAULT_DIRECTION: Record<PreRevenueSortableMetricKey, PreRevenueSortDirection> = {
  pNav: 'asc',
  evEbitdaPeak: 'desc',
  targetPrice: 'desc',
  annualReturn: 'desc',
  irr: 'desc',
  payback: 'asc',
  lom: 'desc',
  initialCapex: 'asc',
  capexAnnualAueq: 'asc',
  annualAueq: 'desc',
  aueq10y: 'desc',
  aueqLom: 'desc',
  aueqPerShare: 'desc',
  mcap10yAueq: 'asc',
  mcapLomAueq: 'asc',
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isPreRevenueSortableMetricKey(key: string): key is PreRevenueSortableMetricKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_DIRECTION, key);
}

export function defaultPreRevenueSortDirection(key: PreRevenueSortableMetricKey): PreRevenueSortDirection {
  return DEFAULT_DIRECTION[key];
}

export function preRevenueMetricSortValue(
  metrics: CorporatePreRevenueMetrics | null,
  key: PreRevenueSortableMetricKey,
  referenceMetal: string,
): number | null {
  if (!metrics) return null;
  const eq = metrics.equivalentByMetal[referenceMetal];
  const reference = metrics.byReferenceMetal[referenceMetal];
  switch (key) {
    case 'pNav': return finite(metrics.pNavPostFinancing) ? metrics.pNavPostFinancing : null;
    case 'evEbitdaPeak': return finite(metrics.peak6xOverCurrentPrice) ? metrics.peak6xOverCurrentPrice : null;
    case 'targetPrice': return finite(metrics.targetOverCurrentPrice) ? metrics.targetOverCurrentPrice : null;
    case 'annualReturn': return finite(metrics.annualizedReturnToTarget) ? metrics.annualizedReturnToTarget : null;
    case 'irr': return finite(metrics.irr) ? metrics.irr : null;
    case 'payback': return finite(metrics.paybackYears) ? metrics.paybackYears : null;
    case 'lom': return finite(metrics.lomYears) ? metrics.lomYears : null;
    case 'initialCapex': return finite(metrics.initialCapexUSD) ? metrics.initialCapexUSD : null;
    case 'capexAnnualAueq': return finite(reference?.capexPerAnnualEqUSD) ? reference.capexPerAnnualEqUSD : null;
    case 'annualAueq': return eq?.status === 'OK' && finite(eq.annualEq) ? eq.annualEq : null;
    case 'aueq10y': return eq?.status === 'OK' && finite(eq.tenYearEq) ? eq.tenYearEq : null;
    case 'aueqLom': return eq?.status === 'OK' && finite(eq.lomEq) ? eq.lomEq : null;
    case 'aueqPerShare': return finite(reference?.tenYearEqPerShare) ? reference.tenYearEqPerShare : null;
    case 'mcap10yAueq': return finite(reference?.marketCapPerTenYearEqUSD) ? reference.marketCapPerTenYearEqUSD : null;
    case 'mcapLomAueq': return finite(reference?.marketCapPerLomEqUSD) ? reference.marketCapPerLomEqUSD : null;
  }
}

export function comparePreRevenueMetricValues(
  left: CorporatePreRevenueMetrics | null,
  right: CorporatePreRevenueMetrics | null,
  key: PreRevenueSortableMetricKey,
  referenceMetal: string,
  direction: PreRevenueSortDirection,
): number {
  const a = preRevenueMetricSortValue(left, key, referenceMetal);
  const b = preRevenueMetricSortValue(right, key, referenceMetal);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}
