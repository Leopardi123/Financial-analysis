import type { CorporateSnapshot } from '../../lib/corporate/snapshot/types.ts';
import type { CashWaterfallRow } from '../../lib/corporate/financing/cashWaterfall.ts';

export type SurvivabilityScenarioId = 'base' | 'spot20' | 'spot30' | 'spot50' | 'opex25' | 'sustaining50' | 'combined';
export type SurvivabilityFinancingMode = 'dynamic' | 'fixed';
export type SurvivabilityStatus = 'ROBUST' | 'PRESSURED' | 'FUNDING_REQUIRED' | 'CRITICAL' | 'NOT_COMPUTABLE';

export const SURVIVABILITY_SCENARIOS: Array<{ id: SurvivabilityScenarioId; label: string }> = [
  { id: 'base', label: 'Base' }, { id: 'spot20', label: 'Spot −20 %' },
  { id: 'spot30', label: 'Spot −30 %' }, { id: 'spot50', label: 'Spot −50 %' },
  { id: 'opex25', label: 'OPEX +25 %' }, { id: 'sustaining50', label: 'Sustaining +50 %' },
  { id: 'combined', label: 'Combined' },
];

export type SurvivabilityRow = CashWaterfallRow & { fcff: number | null };
export type SurvivabilityValuationRow = { year: number; npvAbsolute: number | null; navAbsolute: number | null };
export type SurvivabilityModel = {
  scenarioId: SurvivabilityScenarioId; label: string; financingMode: SurvivabilityFinancingMode;
  status: SurvivabilityStatus; rows: SurvivabilityRow[]; criticalYear: number | null;
  metrics: Record<string, number | string | null>; diagnostics: string[]; analysisStartYear: number | null;
  valuationRows: SurvivabilityValuationRow[]; targetCurrency: string;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function fixedRows(scenarioRows: CashWaterfallRow[], baseRows: CashWaterfallRow[], fcff: Array<number | null>): SurvivabilityRow[] {
  let opening = scenarioRows[0]?.openingCash ?? 0;
  return scenarioRows.map((source, index) => {
    const base = baseRows[index];
    if (!base || !finite(source.operatingCashGenerated) || !finite(source.constructionCapex)) return { ...source, fcff: fcff[index] ?? null, status: 'NOT_COMPUTABLE', diagnostics: [...source.diagnostics, 'Fast financing requires aligned computable base financing.'] };
    const debt = base.debtAdded ?? 0; const equity = base.equityRaised ?? 0;
    const preFinancingCash = opening + source.operatingCashGenerated - source.constructionCapex;
    const closingCash = preFinancingCash + debt + equity;
    const unfundedGap = Math.max(0, source.minimumCashReserve - closingCash);
    const row: SurvivabilityRow = {
      ...source, openingCash: opening, preFinancingCash,
      debtAdded: base.operationalDebtAdded ?? 0, equityRaised: base.operationalEquityRaised ?? 0,
      totalExternalFundingNeed: unfundedGap, remainingExternalFundingNeed: unfundedGap,
      operationalFundingNeed: unfundedGap, unfundedGap, closingCash,
      newShares: base.operationalNewShares ?? 0, cumulativeNewShares: base.cumulativeNewShares,
      cumulativeCanonicalShares: base.cumulativeCanonicalShares,
      debtAddedByProject: base.debtAddedByProject, equityRaisedByProject: base.equityRaisedByProject,
      newSharesByProject: base.newSharesByProject, status: source.status, diagnostics: source.diagnostics,
      fcff: fcff[index] ?? null,
    };
    opening = closingCash;
    return row;
  });
}

export function buildCorporateSurvivabilityModel(args: {
  scenarioId: SurvivabilityScenarioId; snapshot: CorporateSnapshot; baseSnapshot: CorporateSnapshot;
  financingMode: SurvivabilityFinancingMode; diagnostics?: string[];
}): SurvivabilityModel {
  const label = SURVIVABILITY_SCENARIOS.find((item) => item.id === args.scenarioId)?.label ?? args.scenarioId;
  const dynamicRows = args.snapshot.financing.corporate_cash_waterfall?.rows ?? [];
  const baseRows = args.baseSnapshot.financing.corporate_cash_waterfall?.rows ?? [];
  const fcff = args.snapshot.series?.fcffUSD ?? [];
  const allRows: SurvivabilityRow[] = args.financingMode === 'fixed'
    ? fixedRows(dynamicRows, baseRows, fcff)
    : dynamicRows.map((row, index) => ({ ...row, totalExternalFundingNeed: row.operationalFundingNeed,
      remainingExternalFundingNeed: row.operationalFundingNeed, debtAdded: row.operationalDebtAdded,
      equityRaised: row.operationalEquityRaised, newShares: row.operationalNewShares, fcff: fcff[index] ?? null }));
  const timeline = (args.snapshot as CorporateSnapshot & { corporateValuationTimeSeries?: { valuationYear?: number; rows?: Array<{ year?: number; npvAbsolute?: number | null; navAbsolute?: number | null }>; projectMarkers?: Array<{ productionStartYear?: number | null; productionStartPeriod?: number | null }> } }).corporateValuationTimeSeries;
  const valuationYear = finite(timeline?.valuationYear) ? timeline.valuationYear : null;
  const markers = timeline?.projectMarkers ?? [];
  const hasAlreadyProducingProject = markers.some((marker) => marker.productionStartYear === null && marker.productionStartPeriod === null);
  const futureProductionYears = markers.map((marker) => marker.productionStartYear).filter(finite);
  const analysisStartYear = valuationYear === null ? null : hasAlreadyProducingProject || futureProductionYears.length === 0
    ? valuationYear : Math.max(valuationYear, Math.min(...futureProductionYears));
  const rows = analysisStartYear === null ? [] : allRows.filter((row) => finite(row.year) && row.year >= analysisStartYear);
  const valuationRows: SurvivabilityValuationRow[] = analysisStartYear === null ? [] : (timeline?.rows ?? [])
    .filter((row) => finite(row.year) && row.year >= analysisStartYear)
    .map((row) => ({
      year: row.year as number,
      npvAbsolute: finite(row.npvAbsolute) ? row.npvAbsolute : null,
      navAbsolute: finite(row.navAbsolute) ? row.navAbsolute : null,
    }));
  const diagnostics = [...(args.diagnostics ?? []), ...rows.flatMap((row) => row.diagnostics ?? [])];
  const computable = rows.length > 0 && rows.every((row) => row.status === 'COMPUTABLE' && finite(row.closingCash) && finite(row.fcff));
  const minimumHeadroom = computable ? Math.min(...rows.map((row) => (row.closingCash as number) - row.minimumCashReserve)) : null;
  const critical = minimumHeadroom === null ? null : rows
    .filter((row) => finite(row.closingCash) && row.closingCash - row.minimumCashReserve === minimumHeadroom)
    .sort((left, right) => (right.totalExternalFundingNeed ?? 0) - (left.totalExternalFundingNeed ?? 0))[0] ?? null;
  const negativeRows = rows.filter((row) => finite(row.fcff) && row.fcff < 0);
  const fundingRows = rows.filter((row) => finite(row.totalExternalFundingNeed) && row.totalExternalFundingNeed > 0);
  const reserveBreach = rows.find((row) => finite(row.closingCash) && row.closingCash < row.minimumCashReserve) ?? null;
  const hasGap = rows.some((row) => finite(row.unfundedGap) && row.unfundedGap > 0);
  const status: SurvivabilityStatus = !computable ? 'NOT_COMPUTABLE' : hasGap || reserveBreach ? 'CRITICAL'
    : fundingRows.length > 0 ? 'FUNDING_REQUIRED' : (minimumHeadroom ?? 0) <= 0 || negativeRows.length > 1 ? 'PRESSURED' : 'ROBUST';
  const firstShares = args.snapshot.market?.shares_current ?? null;
  const sum = (key: 'debtAdded' | 'equityRaised' | 'newShares') => rows.every((row) => finite(row[key])) ? rows.reduce((total, row) => total + (row[key] as number), 0) : null;
  return {
    scenarioId: args.scenarioId, label, financingMode: args.financingMode, status, rows, analysisStartYear,
    valuationRows, targetCurrency: args.snapshot.targetCurrency,
    criticalYear: critical?.year ?? null, diagnostics,
    metrics: {
      status, minimumCashHeadroom: minimumHeadroom, minimumHeadroomYear: critical?.year ?? null,
      firstNegativeFcffYear: negativeRows[0]?.year ?? null, negativeFcffYears: negativeRows.length,
      firstReserveBreach: reserveBreach?.year ?? null, firstFinancingYear: fundingRows[0]?.year ?? null,
      largestAnnualFundingNeed: fundingRows.length ? Math.max(...fundingRows.map((row) => row.totalExternalFundingNeed as number)) : 0,
      cumulativeDebt: sum('debtAdded'), cumulativeEquity: sum('equityRaised'), newShares: sum('newShares'),
      cumulativeDilution: finite(firstShares) && firstShares > 0 && finite(sum('newShares')) ? (sum('newShares') as number) / firstShares : null, stressNpv: args.snapshot.NPV_today_TargetCurrency,
      stressNav: args.snapshot.NAV_today_TargetCurrency,
    },
  };
}
