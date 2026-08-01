import type { CorporateSnapshot } from '../../lib/corporate/snapshot/types.ts';
import type { ValuationTimeline } from '../../lib/valuation/canonicalValuationTimeline.ts';
import { withManualExtraShares } from '../../lib/valuation/canonicalValuationTimeline.ts';
import type { CorporateQualityMultipleOutput } from '../../lib/corporate/multipleContrast/types.ts';
import { buildCombinedTargetSeries, buildQualityMultipleContrastSeries, buildStaticMultipleContrastSeries } from './multipleContrastPresentation.ts';
import type { CorporateSensitivityColumn, CorporateSensitivityMetric } from './CorporateMetalPriceSensitivity.tsx';
import type { CorporateMetalPriceMultiplier } from '../../lib/corporate/sensitivity.ts';

export const CORPORATE_SENSITIVITY_METRICS: CorporateSensitivityMetric[] = [
  { id: 'navPerShare', label: 'NAV/aktie vid Corporate-referensår', focus: 'nav' },
  { id: 'dcfPerShare', label: 'DCF/aktie idag', focus: 'nav' },
  { id: 'forwardAverageEbitda', label: 'Forward-average EBITDA', focus: 'context' },
  { id: 'ebitdaMargin', label: 'EBITDA-margin', focus: 'context' },
  { id: 'natural6x', label: 'Naturligt 6x-värde/aktie', focus: 'natural' },
  { id: 'qualityMultiple', label: 'Kvalitetsmultipel midpoint', focus: 'quality' },
  { id: 'qualityValue', label: 'Kvalitetsjusterat EV/EBITDA-värde/aktie', focus: 'quality' },
  { id: 'combined', label: 'Combined 70/30', focus: 'combined' },
  { id: 'shares', label: 'Canonical fully diluted shares', focus: 'context' },
  { id: 'status', label: 'Scenario status', focus: 'context' },
];

type ScenarioSnapshot = CorporateSnapshot & {
  canonicalValuationTimeline?: ValuationTimeline;
  corporateValuationTimeSeries?: { valuationYear?: number; rows: Array<any>; projectMarkers: Array<any> };
  corporateQualityMultipleTimeSeries?: CorporateQualityMultipleOutput;
  metalPriceSensitivityAudit?: { projects?: Array<{ projectId: string; resolvedPriceByMetal: Record<string, number | null>; priceUnitByMetal: Record<string, string> }> };
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const format = (value: number | null, suffix = '') => finite(value) ? `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}${suffix}` : 'Ej beräkningsbart';

export function buildCorporateSensitivityScenarioModel(args: {
  snapshot: ScenarioSnapshot;
  multiplier: CorporateMetalPriceMultiplier;
  diagnostics: string[];
  extraShares: number;
}): { column: CorporateSensitivityColumn; timeline: ValuationTimeline | null; timeSeries: ScenarioSnapshot['corporateValuationTimeSeries']; quality: CorporateQualityMultipleOutput | null } {
  const originalTimeline = args.snapshot.canonicalValuationTimeline ?? null;
  const timeline = originalTimeline ? withManualExtraShares(originalTimeline, args.extraShares) : null;
  const originalShares = originalTimeline?.periods.find((row) => finite(row.canonicalSharesForPerShare))?.canonicalSharesForPerShare ?? null;
  const canonicalShares = timeline?.periods.find((row) => finite(row.canonicalSharesForPerShare))?.canonicalSharesForPerShare ?? null;
  const scale = finite(originalShares) && finite(canonicalShares) && canonicalShares > 0 ? originalShares / canonicalShares : 1;
  const sourceTimeSeries = args.snapshot.corporateValuationTimeSeries;
  const timeSeries = sourceTimeSeries ? { ...sourceTimeSeries, rows: sourceTimeSeries.rows.map((row) => ({
    ...row, sharesPf: canonicalShares ?? row.sharesPf,
    npvPerShare: finite(row.npvPerShare) ? row.npvPerShare * scale : null,
    navPerShare: finite(row.navPerShare) ? row.navPerShare * scale : null,
    dcfPerShare: finite(row.dcfPerShare) ? row.dcfPerShare * scale : null,
    dcfExCapexPerShare: finite(row.dcfExCapexPerShare) ? row.dcfExCapexPerShare * scale : null,
    evEbitda5xPerShare: finite(row.evEbitda5xPerShare) ? row.evEbitda5xPerShare * scale : null,
    evEbitda6xPerShare: finite(row.evEbitda6xPerShare) ? row.evEbitda6xPerShare * scale : null,
    evEbitda7xPerShare: finite(row.evEbitda7xPerShare) ? row.evEbitda7xPerShare * scale : null,
  })) } : undefined;
  const reference = timeline?.periods[timeline.todayPeriod] ?? timeline?.periods[0] ?? null;
  const quality = args.snapshot.corporateQualityMultipleTimeSeries ?? null;
  const qualityRow = quality?.rows.find((row) => row.qualityStatus === 'COMPUTABLE' && finite(row.annualEbitdaUSD) && row.annualEbitdaUSD > 0)
    ?? quality?.rows.find((row) => row.calendarYear === reference?.calendarYear) ?? quality?.rows[0] ?? null;
  const staticSeries = buildStaticMultipleContrastSeries({ basis: 'annual', staticRows: timeSeries?.rows ?? [], qualityRows: quality?.rows ?? [], bridgeRows: timeline?.periods.map((row) => ({ year: row.calendarYear, netCashTarget: row.netCashTarget, sharesPostFinancing: row.canonicalSharesForPerShare })) ?? [], fxUSDToTarget: args.snapshot.fx_USD_to_TargetCurrency ?? null });
  const qualitySeries = buildQualityMultipleContrastSeries({ basis: 'annual', qualityRows: quality?.rows ?? [], canonicalSharesForPerShareByYear: new Map(timeline?.periods.map((row) => [row.calendarYear, row.canonicalSharesForPerShare]) ?? []) });
  const year = qualityRow?.calendarYear ?? reference?.calendarYear ?? timeSeries?.rows[0]?.year;
  const combinedNav = timeline?.periods.find((row) => row.calendarYear === year)?.navPerShareTarget ?? null;
  const natural = staticSeries.find((row) => row.year === year) ?? null;
  const qualityPoint = qualitySeries.find((row) => row.year === year) ?? null;
  const combined = buildCombinedTargetSeries({ years: year === undefined ? [] : [year], navPerShareByYear: new Map(year === undefined ? [] : [[year, combinedNav]]), staticSeries, qualitySeries, visibility: { showStaticMultipleBand: true, showQualityMultipleBand: true, showCombinedTarget: true } })[0] ?? null;
  const mandatory = [reference?.navPerShareTarget, reference?.dcfPresentValueTodayPerShareTarget, natural?.mid, canonicalShares];
  const hasCore = timeline !== null && timeSeries !== null && mandatory.some(finite);
  const missingCore = mandatory.some((value) => !finite(value));
  const status = !hasCore ? 'NOT_COMPUTABLE' : missingCore || qualityRow?.qualityStatus !== 'COMPUTABLE' || args.diagnostics.some((item) => /missing resolved spot|null mandatory|invalid (corporate )?shares|unsupported unit|incomplete project|strict-null/i.test(item)) ? 'PARTIAL' : 'COMPUTABLE';
  const values = {
    navPerShare: format(reference?.navPerShareTarget ?? null), dcfPerShare: format(reference?.dcfPresentValueTodayPerShareTarget ?? null),
    forwardAverageEbitda: format(qualityRow?.forwardAverageEbitdaUSD ?? null, ' USD'), ebitdaMargin: format(finite(qualityRow?.ebitdaMargin5Y) ? qualityRow.ebitdaMargin5Y * 100 : null, ' %'),
    natural6x: format(natural?.mid ?? null), qualityMultiple: format(qualityRow?.qualityMidMultiple ?? null, 'x'), qualityValue: format(qualityPoint?.mid ?? null), combined: format(combined?.value ?? null), shares: format(canonicalShares), status,
  };
  const prices = (args.snapshot.metalPriceSensitivityAudit?.projects ?? []).flatMap((project) => Object.entries(project.resolvedPriceByMetal).filter((entry): entry is [string, number] => finite(entry[1])).map(([metal, value]) => ({ project: project.projectId, metal, value, unit: project.priceUnitByMetal[metal] ?? 'unknown' })));
  return { column: { multiplier: args.multiplier, status, values, diagnostics: [...args.diagnostics, ...(qualityRow?.qualityDiagnostics ?? [])], prices }, timeline, timeSeries, quality };
}
