import { validateSnapshotRequest } from '../api/validateSnapshotRequest.ts';
import { loadProjectsForSymbol } from '../api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../project/jsonv1/parse.ts';
import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../project/jsonv1/resolvePrices.ts';
import { aggregateProjectsCorporateV1 } from '../corporate/aggregateProjects.ts';
import { computeCorporateFinancing } from '../corporate/financing/compute.ts';
import { deriveBuildFundingNeedUSD } from '../corporate/financing/deriveBuildFundingNeed.ts';
import { buildCorporateSnapshot } from '../corporate/snapshot/buildCorporateSnapshot.ts';
import { resolveFxUSDToTarget } from '../prices/fx/resolveFx.ts';
import { getTodayUtcDateString } from '../prices/fx/date.ts';
import { fxKeyUSDTo } from '../prices/fx/keys.ts';
import { computeLista2CfDcfMetrics, makeNullLista2CfDcfMetrics } from './lista2CfDcf.ts';
import { computeLista3aProjectEfficiencyMetrics } from './lista3aProjectEfficiency.ts';
import { computeLista4TenYearMetrics } from './lista4TenYear.ts';
import { buildCorporateModeledValuationTimeline } from './corporateModeledValuationTimeline.ts';
import { aggregateProjectsToCorporateTotals } from './aggregateProjectsToCorporateTotals.ts';
import type { CorporateSnapshotSeries } from '../corporate/snapshot/types.ts';
import { canonicalUnitForMetal } from '../units/metalUnits.ts';
import { convertPriceToCanonical, convertQuantityToCanonical } from '../units/conversion.ts';

const CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS = 10;

function dedupeMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

function finalizeDiagnostics(diagnostics: SnapshotDiagnostics): SnapshotDiagnostics {
  diagnostics.warnings = dedupeMessages(diagnostics.warnings);
  diagnostics.errors = dedupeMessages(diagnostics.errors);
  return diagnostics;
}

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function sanitizeSeries(series: Array<number | null>): Array<number | null> {
  return series.map((value) => toFiniteOrNull(value));
}

function deriveTotalCapexSeries(
  capexUSD: Array<number | null>,
  sustainingCapexUSD: Array<number | null>,
): Array<number | null> {
  return capexUSD.map((capex, t) => {
    const capexAtT = toFiniteOrNull(capex);
    const sustainingAtT = toFiniteOrNull(sustainingCapexUSD[t]);
    if (capexAtT === null || sustainingAtT === null) {
      return null;
    }
    return capexAtT + sustainingAtT;
  });
}

function materiallyDifferentSeries(
  left: Array<number | null>,
  right: Array<number | null>,
  epsilon = 0.01,
): boolean {
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const l = toFiniteOrNull(left[i] ?? null);
    const r = toFiniteOrNull(right[i] ?? null);
    if (l === null && r === null) continue;
    if (l === null || r === null) return true;
    if (Math.abs(l - r) > epsilon) return true;
  }
  return false;
}

function assertSeriesLength(
  series: Array<number | null>,
  expectedLength: number,
  label: string,
): void {
  if (series.length !== expectedLength) {
    throw new Error(`${label} length must equal masterN+1 (${expectedLength})`);
  }
}


function sumComponentsAtIndex(components: Array<number | null>): number | null {
  let sum = 0;
  let hasAny = false;
  for (const value of components) {
    const finite = toFiniteOrNull(value);
    if (finite !== null) {
      sum += finite;
      hasAny = true;
    }
  }
  return hasAny ? sum : null;
}

function sumStrictAlignedSeries(args: {
  corporateDates: string[];
  projectDateSeries: Array<{ projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> }>;
  label: string;
}): Array<number | null> {
  const sums = new Array<number>(args.corporateDates.length).fill(0);
  const hasContributor = new Array<boolean>(args.corporateDates.length).fill(false);
  const nullAtDate = new Array<boolean>(args.corporateDates.length).fill(false);

  for (const projectSeries of args.projectDateSeries) {
    assertSeriesLength(
      projectSeries.series,
      projectSeries.periodEndDatesUtc.length,
      `${args.label} project=${projectSeries.projectId}`,
    );

    const dateToIndex = new Map<string, number>(
      projectSeries.periodEndDatesUtc.map((date, idx) => [date, idx]),
    );

    for (let t = 0; t < args.corporateDates.length; t += 1) {
      if (nullAtDate[t]) {
        continue;
      }
      const projectIndex = dateToIndex.get(args.corporateDates[t]);
      if (projectIndex === undefined) {
        continue;
      }

      hasContributor[t] = true;
      const value = toFiniteOrNull(projectSeries.series[projectIndex]);
      if (value === null) {
        nullAtDate[t] = true;
        continue;
      }
      sums[t] += value;
    }
  }

  return sums.map((value, t) => (nullAtDate[t] || !hasContributor[t] ? null : value));
}


type EconomicsBreakdownSeries = {
  cogs?: {
    miningUSD?: Array<number | null>;
    millingUSD?: Array<number | null>;
    utilitiesUSD?: Array<number | null>;
    maintenanceUSD?: Array<number | null>;
    campUSD?: Array<number | null>;
    siteGandA_USD?: Array<number | null>;
  };
  selling?: {
    treatmentChargesUSD?: Array<number | null>;
    refiningChargesUSD?: Array<number | null>;
    tcRcUSD?: Array<number | null>;
    transportUSD?: Array<number | null>;
  };
  totalCogsUSD?: Array<number | null>;
  totalSellingUSD?: Array<number | null>;
  totalOperatingCostsUSD?: Array<number | null>;
};

type RoyaltyDetailSeries = {
  id: string;
  label: string;
  name?: string | null;
  base: 'revenue' | 'ebit' | 'ebitda' | 'quantity';
  rateType?: string | null;
  rate: number | null;
  royaltyUSD: Array<number | null>;
};

type TaxesDetailSeries = {
  federalIncomeTaxUSD?: Array<number | null>;
  municipalRevenueTaxUSD?: Array<number | null>;
};

type ProjectSeriesContext = {
  projectId: string;
  periodEndDatesUtc: string[];
  payableQtyByMetal: Record<string, Array<number | null>>;
  payableQtyUnitByMetal: Record<string, string>;
  priceUSDUnitByMetal: Record<string, string>;
  spotPriceUSDByMetal: Record<string, Array<number | null>>;
  revenueByMetal_USD: Record<string, Array<number | null>>;
  operations: {
    oreMinedTonnes?: Array<number | null>;
    oreMilledTonnes?: Array<number | null>;
    throughputUnit: 'tpd' | 'tpa' | null;
    nameplateThroughput: number | null;
    utilizationPct: number | null;
  };
  economicsBreakdown: EconomicsBreakdownSeries | null;
  royaltiesDetail: RoyaltyDetailSeries[];
  taxesDetail: TaxesDetailSeries | null;
  economics: {
    operatingCostsUSD: Array<number | null>;
    sustainingCapexUSD: Array<number | null>;
    siteGandA_USD: Array<number | null>;
    royaltiesUSD: Array<number | null>;
    reclamationUSD: Array<number | null>;
    byproductCreditsUSD: Array<number | null>;
    sustainingCostUSD: Array<number | null>;
    ebitdaUSD: Array<number | null>;
    depreciationUSD: Array<number | null>;
    ebitUSD: Array<number | null>;
    taxableIncomeUSD: Array<number | null>;
    effectiveTaxRate: Array<number | null>;
    taxUSD: Array<number | null>;
    workingCapitalDeltaUSD: Array<number | null>;
    fcffUSD: Array<number | null>;
    capexUSD: Array<number | null>;
    totalCapexUSD: Array<number | null>;
  };
};

type ProjectIdentityValidationResult = {
  diagnostics: string[];
  flags: {
    identityHasFailure: boolean;
    fcffIdentityFailInProductionWindow: boolean;
  };
  perPeriod: Array<{
    t: number;
    yearOrPeriodEndDate: string;
    checks: {
      grossProfit: 'pass' | 'fail' | 'cannot_evaluate';
      ebitda: 'pass' | 'fail' | 'cannot_evaluate';
      ebit: 'pass' | 'fail' | 'cannot_evaluate';
      tax: 'pass' | 'fail' | 'cannot_evaluate';
      fcff: 'pass' | 'fail' | 'cannot_evaluate';
    };
  }>;
};

function validateProjectIdentities(input: {
  periodEndDatesUtc: string[];
  productionStartPeriod: number;
  taxRate: number | null;
  grossRevenueUSD: Array<number | null>;
  operatingCostsUSD: Array<number | null>;
  royaltiesUSD: Array<number | null>;
  depreciationUSD: Array<number | null>;
  taxUSD: Array<number | null>;
  capexUSD: Array<number | null>;
  totalCapexUSD: Array<number | null>;
  workingCapitalDeltaUSD: Array<number | null>;
  sustainingCapexUSD: Array<number | null>;
  reclamationUSD: Array<number | null>;
  byproductCreditsUSD: Array<number | null>;
  grossProfitUSD: Array<number | null>;
  ebitdaUSD: Array<number | null>;
  ebitUSD: Array<number | null>;
  taxableIncomeUSD: Array<number | null>;
  fcffUSD: Array<number | null>;
  selling?: {
    treatmentChargesUSD?: Array<number | null>;
    refiningChargesUSD?: Array<number | null>;
    tcRcUSD?: Array<number | null>;
    transportUSD?: Array<number | null>;
  };
}): ProjectIdentityValidationResult {
  const EPS_USD = 0.01;
  const diagnostics: string[] = [];
  const perPeriod: ProjectIdentityValidationResult['perPeriod'] = [];
  let identityHasFailure = false;
  let fcffIdentityFailInProductionWindow = false;
  let loggedSellingAssumption = false;

  const allSellingSeries = [
    input.selling?.treatmentChargesUSD,
    input.selling?.refiningChargesUSD,
    input.selling?.tcRcUSD,
    input.selling?.transportUSD,
  ];
  const allSellingAbsent = allSellingSeries.every((series) => !Array.isArray(series));
  if (allSellingAbsent) {
    diagnostics.push('Identity checks: selling costs absent => assumed 0 in identity check');
    loggedSellingAssumption = true;
  }

  const formatFail = (t: number, label: string, expected: number, actual: number): string => {
    const date = input.periodEndDatesUtc[t] ?? String(t);
    const diff = expected - actual;
    return `IDENTITY FAIL t=${t} year=${date} ${label}: expected=${String(expected)} actual=${String(actual)} diff=${String(diff)}`;
  };

  for (let t = 0; t < input.periodEndDatesUtc.length; t += 1) {
    const checks: ProjectIdentityValidationResult['perPeriod'][number]['checks'] = {
      grossProfit: 'cannot_evaluate',
      ebitda: 'cannot_evaluate',
      ebit: 'cannot_evaluate',
      tax: 'cannot_evaluate',
      fcff: 'cannot_evaluate',
    };

    const gr = toFiniteOrNull(input.grossRevenueUSD[t]);
    const oc = toFiniteOrNull(input.operatingCostsUSD[t]);
    const gpActual = toFiniteOrNull(input.grossProfitUSD[t]);
    if (gr !== null && oc !== null && gpActual !== null) {
      const expected = gr - oc;
      if (Math.abs(expected - gpActual) > EPS_USD) {
        diagnostics.push(formatFail(t, 'Gross profit identity', expected, gpActual));
        checks.grossProfit = 'fail';
        identityHasFailure = true;
      } else {
        checks.grossProfit = 'pass';
      }
    }

    const roy = toFiniteOrNull(input.royaltiesUSD[t]);
    const ebitdaActual = toFiniteOrNull(input.ebitdaUSD[t]);
    let sellingSum = 0;
    let hasFiniteSelling = false;
    let sellingCannotEvaluate = false;
    for (const series of allSellingSeries) {
      if (!Array.isArray(series)) continue;
      const value = toFiniteOrNull(series[t]);
      if (value === null) {
        sellingCannotEvaluate = true;
        continue;
      }
      sellingSum += value;
      hasFiniteSelling = true;
    }
    if (!hasFiniteSelling && !loggedSellingAssumption) {
      diagnostics.push('Identity checks: selling costs absent => assumed 0 in identity check');
      loggedSellingAssumption = true;
    }
    if (gr !== null && oc !== null && roy !== null && ebitdaActual !== null && !sellingCannotEvaluate) {
      const expected = gr - oc - roy - sellingSum;
      if (Math.abs(expected - ebitdaActual) > EPS_USD) {
        diagnostics.push(formatFail(t, 'EBITDA identity', expected, ebitdaActual));
        checks.ebitda = 'fail';
        identityHasFailure = true;
      } else {
        checks.ebitda = 'pass';
      }
    }

    const dep = toFiniteOrNull(input.depreciationUSD[t]);
    const ebitda = toFiniteOrNull(input.ebitdaUSD[t]);
    const ebitActual = toFiniteOrNull(input.ebitUSD[t]);
    if (ebitda !== null && dep !== null && ebitActual !== null) {
      const expected = ebitda - dep;
      if (Math.abs(expected - ebitActual) > EPS_USD) {
        diagnostics.push(formatFail(t, 'EBIT identity', expected, ebitActual));
        checks.ebit = 'fail';
        identityHasFailure = true;
      } else {
        checks.ebit = 'pass';
      }
    }

    const taxableIncome = toFiniteOrNull(input.taxableIncomeUSD[t]);
    const taxActual = toFiniteOrNull(input.taxUSD[t]);
    if (taxableIncome !== null && taxActual !== null && input.taxRate !== null && Number.isFinite(input.taxRate)) {
      const expected = Math.max(0, taxableIncome) * input.taxRate;
      if (Math.abs(expected - taxActual) > EPS_USD) {
        diagnostics.push(formatFail(t, 'Tax identity', expected, taxActual));
        checks.tax = 'fail';
        identityHasFailure = true;
      } else {
        checks.tax = 'pass';
      }
    }

    const fcffActual = toFiniteOrNull(input.fcffUSD[t]);
    const totalCapex = toFiniteOrNull(input.totalCapexUSD[t]);
    const wc = toFiniteOrNull(input.workingCapitalDeltaUSD[t]);
    const recl = toFiniteOrNull(input.reclamationUSD[t]);
    const tax = toFiniteOrNull(input.taxUSD[t]);
    if (
      ebitActual !== null
      && tax !== null
      && dep !== null
      && totalCapex !== null
      && wc !== null
      && recl !== null
      && fcffActual !== null
    ) {
      const expected = ebitActual - tax + dep - totalCapex - wc - recl;
      if (Math.abs(expected - fcffActual) > EPS_USD) {
        diagnostics.push(formatFail(t, 'FCFF identity', expected, fcffActual));
        checks.fcff = 'fail';
        identityHasFailure = true;
        if (t >= input.productionStartPeriod) {
          fcffIdentityFailInProductionWindow = true;
        }
      } else {
        checks.fcff = 'pass';
      }
    } else if (t >= input.productionStartPeriod) {
      diagnostics.push(`Identity checks: cannot evaluate FCFF identity at t=${t} year=${input.periodEndDatesUtc[t] ?? String(t)} because one or more required inputs are null/non-finite`);
    }

    perPeriod.push({
      t,
      yearOrPeriodEndDate: input.periodEndDatesUtc[t] ?? String(t),
      checks,
    });
  }

  if (fcffIdentityFailInProductionWindow) {
    diagnostics.unshift('IDENTITY FAIL: FCFF mismatch in production window; DCF/NPV outputs may be invalid.');
  }

  return {
    diagnostics,
    flags: {
      identityHasFailure,
      fcffIdentityFailInProductionWindow,
    },
    perPeriod,
  };
}

function buildSnapshotSeries(args: {
  masterN: number;
  corporateDates: string[];
  projectSeriesContexts: ProjectSeriesContext[];
}): CorporateSnapshotSeries {
  const expectedLength = args.masterN + 1;
  if (args.corporateDates.length !== expectedLength) {
    throw new Error(`series.periodEndDatesUtc length must equal masterN+1 (${expectedLength})`);
  }

  const periodIndex = Array.from({ length: expectedLength }, (_, i) => i);
  const periodEndDatesUtc = args.corporateDates.map((date) => (typeof date === 'string' ? date : null));

  const throughputUnits = new Set(args.projectSeriesContexts.map((entry) => entry.operations.throughputUnit).filter((v) => v !== null));
  const throughputUnit = throughputUnits.size === 1 ? [...throughputUnits][0] as 'tpd' | 'tpa' : null;

  const nameplateVals = args.projectSeriesContexts.map((entry) => entry.operations.nameplateThroughput).filter((v): v is number => v !== null);
  const utilizationVals = args.projectSeriesContexts.map((entry) => entry.operations.utilizationPct).filter((v): v is number => v !== null);

  const oreMinedTonnes = sumStrictAlignedSeries({
    corporateDates: args.corporateDates,
    projectDateSeries: args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.operations.oreMinedTonnes))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.operations.oreMinedTonnes ?? []),
      })),
    label: 'series.oreMinedTonnes',
  });

  const oreMilledTonnes = sumStrictAlignedSeries({
    corporateDates: args.corporateDates,
    projectDateSeries: args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.operations.oreMilledTonnes))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.operations.oreMilledTonnes ?? []),
      })),
    label: 'series.oreMilledTonnes',
  });

  const payableQtyByMetal: Record<string, Array<number | null>> = {};
  const payableQtyUnitByMetal: Record<string, string> = {};
  const priceUsedByMetal_USD: Record<string, Array<number | null>> = {};
  const revenueByMetal_USD: Record<string, Array<number | null>> = {};
  const unitAudit: NonNullable<CorporateSnapshotSeries['unitAudit']> = { metals: {} };

  const metalKeys = [...new Set(args.projectSeriesContexts.flatMap((entry) => Object.keys(entry.payableQtyByMetal)))].sort((a, b) => a.localeCompare(b));

  for (const metal of metalKeys) {
    const qtyProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.payableQtyByMetal[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.payableQtyByMetal[metal]),
      }));

    const revenueProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.revenueByMetal_USD[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.revenueByMetal_USD[metal]),
      }));

    const spotPriceProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.spotPriceUSDByMetal[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(entry.spotPriceUSDByMetal[metal]),
      }));

    payableQtyByMetal[metal] = sumStrictAlignedSeries({ corporateDates: args.corporateDates, projectDateSeries: qtyProjects, label: `series.payableQtyByMetal.${metal}` });
    const fallbackRevenue = sumStrictAlignedSeries({ corporateDates: args.corporateDates, projectDateSeries: revenueProjects, label: `series.revenueByMetal_USD.${metal}` });

    const unitSet = new Set(args.projectSeriesContexts.map((entry) => entry.payableQtyUnitByMetal[metal]).filter((v): v is string => typeof v === 'string'));
    if (unitSet.size > 1) {
      throw new Error(`series.payableQtyUnitByMetal.${metal} has inconsistent units across projects`);
    }
    if (unitSet.size === 0) {
      throw new Error(`series.payableQtyUnitByMetal.${metal} missing for all projects`);
    }
    const qtyUnit = [...unitSet][0];
    payableQtyUnitByMetal[metal] = qtyUnit;

    const canonicalUnit = canonicalUnitForMetal(metal);
    const priceUnitSet = new Set(args.projectSeriesContexts.map((entry) => entry.priceUSDUnitByMetal[metal]).filter((v): v is string => typeof v === 'string'));
    const warnings: string[] = [];
    const priceUnit = priceUnitSet.size > 0 ? [...priceUnitSet][0] : `USD_${canonicalUnit}`;
    if (priceUnitSet.size > 1) {
      warnings.push(`price unit mismatch across projects for ${metal}`);
    }

    priceUsedByMetal_USD[metal] = new Array<number | null>(expectedLength).fill(null);
    revenueByMetal_USD[metal] = new Array<number | null>(expectedLength).fill(null);

    for (let t = 0; t < expectedLength; t += 1) {
      const spotValues = spotPriceProjects
        .map((project) => {
          const idx = project.periodEndDatesUtc.indexOf(args.corporateDates[t]);
          return idx >= 0 ? project.series[idx] : null;
        })
        .filter((value): value is number => value !== null);
      if (spotValues.length > 0) {
        const first = spotValues[0];
        if (spotValues.some((value) => value !== first)) {
          warnings.push(`spot price mismatch across projects: metal ${metal} period ${t}`);
        }
        priceUsedByMetal_USD[metal][t] = first;
      }

      const qty = payableQtyByMetal[metal][t];
      const price = priceUsedByMetal_USD[metal][t];

      if (qty === null || price === null) {
        revenueByMetal_USD[metal][t] = fallbackRevenue[t];
        continue;
      }

      const qtyCanonical = convertQuantityToCanonical(metal, qty, qtyUnit);
      const priceCanonical = convertPriceToCanonical(metal, price, priceUnit);

      if (qtyCanonical === null || priceCanonical === null) {
        revenueByMetal_USD[metal][t] = null;
        warnings.push(`unit mismatch: metal ${metal} period ${t}`);
      } else {
        revenueByMetal_USD[metal][t] = qtyCanonical * priceCanonical;
      }
    }

    const firstFiniteIndex = payableQtyByMetal[metal].findIndex((value): value is number => value !== null && Number.isFinite(value));
    const conversionFactorExample = firstFiniteIndex >= 0
      ? (() => {
          const raw = payableQtyByMetal[metal][firstFiniteIndex] as number;
          const canonical = convertQuantityToCanonical(metal, raw, qtyUnit);
          if (canonical === null || raw === 0) {
            return undefined;
          }
          return canonical / raw;
        })()
      : undefined;

    unitAudit.metals[metal] = {
      qtyUnit,
      canonicalQtyUnit: canonicalUnit,
      priceUnit,
      canonicalPriceUnit: canonicalUnit,
      ...(conversionFactorExample !== undefined ? { conversionFactorExample } : {}),
      warnings,
    };
  }

  const totalRevenue_USD = new Array<number | null>(expectedLength).fill(null);
  for (let t = 0; t < expectedLength; t += 1) {
    let sum = 0;
    let hasAny = false;
    let hasNull = false;
    for (const metal of metalKeys) {
      const revenue = revenueByMetal_USD[metal][t];
      if (revenue === null) {
        hasNull = true;
        continue;
      }
      hasAny = true;
      sum += revenue;
    }
    totalRevenue_USD[t] = hasAny && !hasNull ? sum : null;
  }

  const aggregateEconomic = (label: keyof ProjectSeriesContext['economics']): Array<number | null> => sumStrictAlignedSeries({
    corporateDates: args.corporateDates,
    projectDateSeries: args.projectSeriesContexts.map((entry) => ({
      projectId: entry.projectId,
      periodEndDatesUtc: entry.periodEndDatesUtc,
      series: sanitizeSeries(entry.economics[label]),
    })),
    label: `series.${label}`,
  });

  const operatingCostsUSD = aggregateEconomic('operatingCostsUSD');
  const sustainingCapexUSD = aggregateEconomic('sustainingCapexUSD');
  const siteGandA_USD = aggregateEconomic('siteGandA_USD');
  const royaltiesUSD = aggregateEconomic('royaltiesUSD');
  const reclamationUSD = aggregateEconomic('reclamationUSD');
  const byproductCreditsUSD = aggregateEconomic('byproductCreditsUSD');
  const sustainingCostUSD = aggregateEconomic('sustainingCostUSD');
  const ebitdaUSD = aggregateEconomic('ebitdaUSD');
  const depreciationUSD = aggregateEconomic('depreciationUSD');
  const ebitUSD = aggregateEconomic('ebitUSD');
  const taxableIncomeUSD = aggregateEconomic('taxableIncomeUSD');
  const effectiveTaxRate = aggregateEconomic('effectiveTaxRate');
  const taxUSD = aggregateEconomic('taxUSD');
  const workingCapitalDeltaUSD = aggregateEconomic('workingCapitalDeltaUSD');
  const fcffUSD = aggregateEconomic('fcffUSD');
  const capexUSD = aggregateEconomic('capexUSD');
  const totalCapexUSD = deriveTotalCapexSeries(capexUSD, sustainingCapexUSD);

  const aggregateBreakdownSeries = (seriesByProject: Array<{ projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> }>, label: string): Array<number | null> =>
    sumStrictAlignedSeries({
      corporateDates: args.corporateDates,
      projectDateSeries: seriesByProject,
      label,
    });

  const aggregateOptionalBreakdownSeries = (
    selector: (entry: ProjectSeriesContext) => Array<number | null> | undefined,
    label: string,
  ): Array<number | null> | undefined => {
    const contributing = args.projectSeriesContexts
      .map((entry) => {
        const series = selector(entry);
        if (!series) {
          return null;
        }
        return {
          projectId: entry.projectId,
          periodEndDatesUtc: entry.periodEndDatesUtc,
          series: sanitizeSeries(series),
        };
      })
      .filter((value): value is { projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> } => value !== null);

    if (contributing.length === 0) {
      return undefined;
    }

    return aggregateBreakdownSeries(contributing, label);
  };

  const hasAnyEconomicsBreakdown = args.projectSeriesContexts.some((entry) => entry.economicsBreakdown !== null);
  const economicsBreakdown: EconomicsBreakdownSeries = {};
  economicsBreakdown.cogs = {
    miningUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.miningUSD, 'series.economicsBreakdown.cogs.miningUSD'),
    millingUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.millingUSD, 'series.economicsBreakdown.cogs.millingUSD'),
    utilitiesUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.utilitiesUSD, 'series.economicsBreakdown.cogs.utilitiesUSD'),
    maintenanceUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.maintenanceUSD, 'series.economicsBreakdown.cogs.maintenanceUSD'),
    campUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.campUSD, 'series.economicsBreakdown.cogs.campUSD'),
    siteGandA_USD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.cogs?.siteGandA_USD, 'series.economicsBreakdown.cogs.siteGandA_USD'),
  };

  economicsBreakdown.selling = {
    treatmentChargesUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.treatmentChargesUSD, 'series.economicsBreakdown.selling.treatmentChargesUSD'),
    refiningChargesUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.refiningChargesUSD, 'series.economicsBreakdown.selling.refiningChargesUSD'),
    tcRcUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.tcRcUSD, 'series.economicsBreakdown.selling.tcRcUSD'),
    transportUSD: aggregateOptionalBreakdownSeries((entry) => entry.economicsBreakdown?.selling?.transportUSD, 'series.economicsBreakdown.selling.transportUSD'),
  };

  const totalCogsUSD = new Array<number | null>(expectedLength).fill(null);
  const totalSellingUSD = new Array<number | null>(expectedLength).fill(null);
  const totalOperatingCostsUSD = new Array<number | null>(expectedLength).fill(null);
  const cogs = economicsBreakdown.cogs ?? {};
  const selling = economicsBreakdown.selling ?? {};
  for (let t = 0; t < expectedLength; t += 1) {
    totalCogsUSD[t] = sumComponentsAtIndex([
      cogs.miningUSD?.[t] ?? null,
      cogs.millingUSD?.[t] ?? null,
      cogs.utilitiesUSD?.[t] ?? null,
      cogs.maintenanceUSD?.[t] ?? null,
      cogs.campUSD?.[t] ?? null,
      cogs.siteGandA_USD?.[t] ?? null,
    ]);

    const tcRcCombined = selling.tcRcUSD?.[t] ?? sumComponentsAtIndex([
      selling.treatmentChargesUSD?.[t] ?? null,
      selling.refiningChargesUSD?.[t] ?? null,
    ]);

    totalSellingUSD[t] = sumComponentsAtIndex([
      tcRcCombined,
      selling.transportUSD?.[t] ?? null,
    ]);

    totalOperatingCostsUSD[t] = sumComponentsAtIndex([
      totalCogsUSD[t],
      totalSellingUSD[t],
      operatingCostsUSD[t],
    ]);
  }

  economicsBreakdown.totalCogsUSD = totalCogsUSD.some((v) => v !== null) ? totalCogsUSD : undefined;
  economicsBreakdown.totalSellingUSD = totalSellingUSD.some((v) => v !== null) ? totalSellingUSD : undefined;
  economicsBreakdown.totalOperatingCostsUSD = totalOperatingCostsUSD.some((v) => v !== null) ? totalOperatingCostsUSD : undefined;

  const royaltiesById = new Map<string, {
    id: string;
    label: string;
    base: 'revenue' | 'ebit' | 'ebitda' | 'quantity';
    rate: number | null;
    projectSeries: Array<{ projectId: string; periodEndDatesUtc: string[]; series: Array<number | null> }>;
  }>();

  for (const entry of args.projectSeriesContexts) {
    for (const detail of entry.royaltiesDetail) {
      if (!royaltiesById.has(detail.id)) {
        royaltiesById.set(detail.id, {
          id: detail.id,
          label: detail.label,
          base: detail.base,
          rate: detail.rate,
          projectSeries: [],
        });
      }
      royaltiesById.get(detail.id)?.projectSeries.push({
        projectId: entry.projectId,
        periodEndDatesUtc: entry.periodEndDatesUtc,
        series: sanitizeSeries(detail.royaltyUSD),
      });
    }
  }

  const royaltiesDetail = [...royaltiesById.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((detail) => ({
      id: detail.id,
      label: detail.label,
      royaltyUSD: aggregateBreakdownSeries(detail.projectSeries, `series.royaltiesDetail.${detail.id}.royaltyUSD`),
    }));

  const taxesDetail: TaxesDetailSeries = {
    federalIncomeTaxUSD: aggregateOptionalBreakdownSeries((entry) => entry.taxesDetail?.federalIncomeTaxUSD, 'series.taxesDetail.federalIncomeTaxUSD'),
    municipalRevenueTaxUSD: aggregateOptionalBreakdownSeries((entry) => entry.taxesDetail?.municipalRevenueTaxUSD, 'series.taxesDetail.municipalRevenueTaxUSD'),
  };

  return {
    periodIndex,
    periodEndDatesUtc,
    oreMinedTonnes,
    oreMilledTonnes,
    throughputUnit,
    nameplateThroughput: nameplateVals.length > 0 ? nameplateVals.reduce((a, b) => a + b, 0) : null,
    utilizationPct: utilizationVals.length > 0 ? utilizationVals.reduce((a, b) => a + b, 0) / utilizationVals.length : null,
    payableQtyByMetal,
    payableQtyUnitByMetal,
    priceUsedByMetal_USD,
    revenueByMetal_USD,
    totalRevenue_USD,
    operatingCostsUSD,
    sustainingCapexUSD,
    siteGandA_USD,
    royaltiesUSD,
    reclamationUSD,
    byproductCreditsUSD,
    sustainingCostUSD,
    ebitdaUSD,
    depreciationUSD,
    ebitUSD,
    taxableIncomeUSD,
    effectiveTaxRate,
    taxUSD,
    workingCapitalDeltaUSD,
    fcffUSD,
    capexUSD,
    totalCapexUSD,
    economicsBreakdown: hasAnyEconomicsBreakdown ? economicsBreakdown : undefined,
    royaltiesDetail: royaltiesDetail.length > 0 ? royaltiesDetail : undefined,
    taxesDetail: taxesDetail.federalIncomeTaxUSD || taxesDetail.municipalRevenueTaxUSD ? taxesDetail : undefined,
    unitAudit,
  };
}


function firstInvalidSeriesIndex(series: Array<number | null>): number | null {
  for (let i = 0; i < series.length; i += 1) {
    const value = series[i];
    if (value === null || !Number.isFinite(value)) return i;
  }
  return null;
}

function firstFcffIssue(args: {
  revenue: Array<number | null>;
  operatingCosts: Array<number | null>;
  royalties: Array<number | null>;
  tax: Array<number | null>;
  capex: Array<number | null>;
  workingCapitalDelta: Array<number | null>;
  fcff: Array<number | null>;
}): { t: number; component: string } | null {
  const firstFcff = firstInvalidSeriesIndex(args.fcff);
  if (firstFcff === null) return null;
  const checks: Array<[string, Array<number | null>]> = [
    ['revenue', args.revenue],
    ['opex', args.operatingCosts],
    ['royalties', args.royalties],
    ['tax', args.tax],
    ['capex', args.capex],
    ['wc', args.workingCapitalDelta],
  ];
  for (const [name, series] of checks) {
    const value = series[firstFcff];
    if (value === null || !Number.isFinite(value)) {
      return { t: firstFcff, component: name };
    }
  }
  return { t: firstFcff, component: 'fcff' };
}

function isAllNullOrNonFinite(series: Array<number | null> | null | undefined): boolean {
  if (!Array.isArray(series) || series.length === 0) return true;
  return series.every((value) => value === null || !Number.isFinite(value));
}



type DelayScenarioDiagnostics = {
  k: number;
  tp_base: number | null;
  tp_eff: number | null;
  masterN: number;
  truncationCount: number;
  shiftRule: string;
  samples: {
    capexUSD: { baseFirst6: Array<number | null>; effectiveFirst6: Array<number | null> };
    operatingCostsUSD: { baseFirst6: Array<number | null>; effectiveFirst6: Array<number | null> };
    metalPayableSample: { metal: string; baseFirst6: Array<number | null>; effectiveFirst6: Array<number | null> };
  };
};

function shiftSeries(series: Array<number | null>, masterN: number, k: number): { shifted: Array<number | null>; truncated: number } {
  const out = new Array<number | null>(masterN + 1).fill(null);
  let truncated = 0;
  for (let t = 0; t <= masterN; t += 1) {
    const src = t - k;
    if (src < 0) continue;
    if (src <= masterN && src < series.length) {
      out[t] = toFiniteOrNull(series[src]);
    }
  }
  for (let src = masterN - k + 1; src < series.length; src += 1) {
    if (src >= 0) truncated += 1;
  }
  return { shifted: out, truncated };
}

function shiftPerPeriodArraysDeep(value: unknown, masterN: number, k: number): { value: unknown; truncationCount: number } {
  if (Array.isArray(value)) {
    const isPerPeriod = value.length === masterN + 1 && value.every((item) => item === null || typeof item === 'number');
    if (isPerPeriod) {
      const shifted = shiftSeries(value as Array<number | null>, masterN, k);
      return { value: shifted.shifted, truncationCount: shifted.truncated };
    }
    let truncationCount = 0;
    const mapped = value.map((entry) => {
      const shifted = shiftPerPeriodArraysDeep(entry, masterN, k);
      truncationCount += shifted.truncationCount;
      return shifted.value;
    });
    return { value: mapped, truncationCount };
  }

  if (value && typeof value === 'object') {
    let truncationCount = 0;
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const shifted = shiftPerPeriodArraysDeep(entry, masterN, k);
      truncationCount += shifted.truncationCount;
      return [key, shifted.value] as const;
    });
    return { value: Object.fromEntries(entries), truncationCount };
  }

  return { value, truncationCount: 0 };
}

function applyScalarMultiplier(series: Array<number | null>, mult: number | undefined): Array<number | null> {
  if (!(typeof mult === 'number' && Number.isFinite(mult))) {
    return series;
  }
  return series.map((v) => (v === null ? null : v * mult));
}

function sumFinite(values: Array<number | null>): number | null {
  let sum = 0;
  let has = false;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    has = true;
    sum += v;
  }
  return has ? sum : null;
}

function discountedSum(values: Array<number | null>, r: number): number | null {
  let sum = 0;
  let has = false;
  for (let t = 0; t < values.length; t += 1) {
    const v = values[t];
    if (v === null || !Number.isFinite(v)) continue;
    has = true;
    sum += v / ((1 + r) ** t);
  }
  return has ? sum : null;
}
type SnapshotDiagnostics = {
  warnings: string[];
  errors: string[];
  meta: {
    refresh: boolean;
    mode: 'inline' | 'symbol';
    projectCount: number;
    symbol?: string;
    fxSource?: 'auto' | 'manual';
    scenarioDelay?: DelayScenarioDiagnostics;
    corporateTotalsDebug?: {
      capexUSD_total: Array<number | null>;
      fcfUSD_total: Array<number | null>;
      operatingCostsUSD_total?: Array<number | null>;
      sustainingCapexUSD_total?: Array<number | null>;
      siteGandA_USD_total?: Array<number | null>;
      royaltiesUSD_total?: Array<number | null>;
      reclamationAccrualUSD_total?: Array<number | null>;
      payable_AuEq_Oz_total?: Array<number | null>;
      sustainingCostUSD_total?: Array<number | null>;
    };
    corporateFinancingDebug?: {
      shares_current: number | null;
      shares_post_financing: number | null;
      totalNewShares: number | null;
      perProjectNewShares: Array<{
        projectId: string;
        projectName: string;
        equityFraction: number | null;
        debtFraction: number | null;
        newShares: number | null;
        reasonIfUnavailable: string | null;
      }>;
    };
    corporateModeledValuationTimeline?: {
      tps: number[];
      lastTp: number | null;
      rangeEndTp: number | null;
      markers: Array<{
        tp: number;
        yearLabelUsed: string | null;
        value_high: number | null;
        value_low: number | null;
        value_mid_if_any: number | null;
        nullReasonIfAny: string | null;
      }>;
    };
  };
};

export type CorporateSnapshotRunResult =
  | { ok: true; snapshot: ReturnType<typeof buildCorporateSnapshot>; diagnostics: SnapshotDiagnostics }
  | { ok: false; diagnostics: SnapshotDiagnostics };

export async function runCorporateSnapshotPipeline(args: {
  body: unknown;
  refresh?: boolean;
  debug?: boolean;
}): Promise<CorporateSnapshotRunResult> {
  const refresh = args.refresh === true;
  const debug = args.debug === true;
  const diagnostics: SnapshotDiagnostics = {
    warnings: [],
    errors: [],
    meta: {
      refresh,
      mode: 'inline',
      projectCount: 0,
    },
  };

  try {
    const validation = validateSnapshotRequest(args.body);
    diagnostics.warnings.push(...validation.warnings);

    if (!validation.ok) {
        diagnostics.errors.push(...validation.errors);
        return { ok: false, diagnostics: finalizeDiagnostics(diagnostics) };
    }

    const input = validation.value;

    const projects = typeof input.symbol === 'string'
      ? await loadProjectsForSymbol(input.symbol)
      : input.projects;

    if (typeof input.symbol === 'string') {
      diagnostics.meta.mode = 'symbol';
      diagnostics.meta.symbol = input.symbol;
      if (projects.length === 0) {
        diagnostics.errors.push(`No stored projects found for symbol=${input.symbol}`);
        return { ok: false, diagnostics: finalizeDiagnostics(diagnostics) };
      }
    }

    const resolverScenario = input.scenario.mode === 'percentile'
      ? { mode: 'percentile' as const, lookbackYears: input.scenario.lookbackYears, percentile: input.scenario.percentile }
      : input.scenario.mode === 'fixed'
        ? { mode: 'fixed' as const, fixedPriceByKey: input.scenario.fixedPriceByKey }
        : { mode: 'spot' as const };

    const firstProjectPeriodEnd = typeof projects[0]?.rawJson?.time === 'object' && projects[0]?.rawJson?.time !== null
      ? (projects[0].rawJson.time as Record<string, unknown>).periodEndDatesUtc
      : undefined;
    const t0AnchorDate = Array.isArray(firstProjectPeriodEnd) && typeof firstProjectPeriodEnd[0] === 'string'
      ? firstProjectPeriodEnd[0]
      : null;
    const spotAnchorDateUtc = input.fx.anchor === 't0_period_end'
      ? (t0AnchorDate ?? getTodayUtcDateString())
      : getTodayUtcDateString();

    diagnostics.meta.projectCount = projects.length;
    diagnostics.meta.fxSource = input.fx.source;

    const requestedPriceKeys = new Set<string>();
    for (const project of projects) {
      const rawJson = project.rawJson as Record<string, unknown>;
      const metals = rawJson.metals;
      if (typeof metals === 'object' && metals !== null) {
        const priceKeyByMetal = (metals as Record<string, unknown>).priceKeyByMetal;
        if (typeof priceKeyByMetal === 'object' && priceKeyByMetal !== null) {
          for (const value of Object.values(priceKeyByMetal)) {
            if (typeof value === 'string') {
              requestedPriceKeys.add(value);
            }
          }
        }

        const auPriceKey = (metals as Record<string, unknown>).auPriceKey;
        if (typeof auPriceKey === 'string') {
          requestedPriceKeys.add(auPriceKey);
        }
      }
    }

    if (refresh && requestedPriceKeys.size > CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS) {
      diagnostics.errors.push(
        `refresh=1 exceeds max unique price keys (${CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS}); received ${requestedPriceKeys.size}`,
      );
      return { ok: false, diagnostics: finalizeDiagnostics(diagnostics) };
    }

    const projectsForBuildFunding = [] as Array<{
      projectId: string;
      projectName: string;
      productionStartPeriod: number;
      periodEndDatesUtc: string[];
      fdExtraShares: number;
    }>;

    const projectSeriesContexts: ProjectSeriesContext[] = [];

    const aggregation = await aggregateProjectsCorporateV1(
      {
        discountRate: input.discountRate,
        projects,
      },
      {
        projectToSeries: async ({ projectId, rawJson }) => {
          const rawJsonRecord = rawJson as Record<string, unknown>;
          const parsed = parseProjectJsonV1(rawJson);
          diagnostics.warnings.push(...parsed.warnings);
          const periodEndDatesUtc = parsed.engineInputWithoutPrices.periodEndDatesUtc;
          const productionStartPeriod = parsed.engineInputWithoutPrices.productionStartPeriod;
          if (!periodEndDatesUtc || periodEndDatesUtc.length === 0) {
            throw new Error(`Project ${projectId} is missing time.periodEndDatesUtc; required for corporate aggregation v1.`);
          }
          if (!Number.isInteger(productionStartPeriod)) {
            throw new Error(`Project ${projectId} is missing integer productionStartPeriod`);
          }

          projectsForBuildFunding.push({
            projectId,
            projectName: (() => {
              const meta = rawJsonRecord.meta as Record<string, unknown> | undefined;
              const fromMeta = meta && typeof meta.projectName === 'string' ? meta.projectName : null;
              return fromMeta ?? projectId;
            })(),
            productionStartPeriod,
            periodEndDatesUtc,
            fdExtraShares: parsed.context.equity?.fdExtraShares ?? 0,
          });

          const from = periodEndDatesUtc[0];
          const to = periodEndDatesUtc[periodEndDatesUtc.length - 1];

          const resolved = await resolveProjectPricesToEngineInput(
            { parsed, from, to, scenario: resolverScenario, projectId, spotAnchorDateUtc },
            {},
          );

          diagnostics.warnings.push(...(resolved.diagnostics?.warnings ?? []));

          if (resolverScenario.mode !== 'spot') {
            for (const [metal, series] of Object.entries(resolved.spotPriceUSDByMetal)) {
              const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
              const missingDates = series
                .map((value, index) => (value === null ? periodEndDatesUtc[index] : null))
                .filter((value): value is string => typeof value === 'string');

              if (missingDates.length > 0) {
                diagnostics.warnings.push(
                  `Missing price coverage for project=${projectId} metal=${metal} priceKey=${priceKey} missingPeriods=${missingDates.length} firstMissingDate=${missingDates[0]}`,
                );
              }
            }

            const missingAuDates = resolved.aisc.auPriceUSDPerOz
              .map((value, index) => (value === null ? periodEndDatesUtc[index] : null))
              .filter((value): value is string => typeof value === 'string');
            if (missingAuDates.length > 0) {
              diagnostics.warnings.push(
                `Missing price coverage for project=${projectId} metal=Au priceKey=${parsed.engineInputWithoutPrices.auPriceKey} missingPeriods=${missingAuDates.length} firstMissingDate=${missingAuDates[0]}`,
              );
            }
          }

          const rawSeriesRoyalties = (rawJsonRecord.series as { royaltiesUSD?: Array<number | null> } | undefined)?.royaltiesUSD;
          const explicitRoyaltiesUSD = Array.from({ length: periodEndDatesUtc.length }, (_, t) => toFiniteOrNull(rawSeriesRoyalties?.[t] ?? null));

          const outPreRoyalties = computeProjectEngineFullProductionV1(resolved);
          diagnostics.warnings.push(...outPreRoyalties.nationalTake.diagnostics);
          const projectLength = periodEndDatesUtc.length;
          const nullSeries = new Array<number | null>(projectLength).fill(null);
          const taxRate = parsed.engineInputWithoutPrices.taxRate;
          const depreciationUSD = sanitizeSeries(parsed.context.series?.depreciationUSD ?? nullSeries);
          diagnostics.warnings.push(`Tax base: TaxableIncome = max(0, EBIT); EBIT = EBITDA - Depreciation; taxRate=${taxRate === null ? 'null' : String(taxRate)}`);
          const grossRevenueUSD = sanitizeSeries(outPreRoyalties.revenue.grossRevenueUSD);
          const operatingCostsUSD = sanitizeSeries(parsed.engineInputWithoutPrices.phase1.operatingCostsUSD);
          const grossProfitUSD = grossRevenueUSD.map((gross, t) => {
            const op = operatingCostsUSD[t];
            if (gross === null || op === null) return null;
            return gross - op;
          });

          const projectEconomicsBreakdown = parsed.context.economicsBreakdown;
          const sanitizedGrossRevenueUSD = sanitizeSeries(outPreRoyalties.revenue.grossRevenueUSD);
          const grossRevenueHasNulls = sanitizedGrossRevenueUSD.some((value) => value === null);
          if (grossRevenueHasNulls) {
            diagnostics.warnings.push('royalties: grossRevenueUSD contains nulls; royalties set to null for those periods');
          }

          const royaltiesDetailRaw = projectEconomicsBreakdown?.royaltiesDetail ?? null;
          const computableRateTypes = new Set<string>();
          let computableRuleCount = 0;
          const royaltiesDetail = (royaltiesDetailRaw ?? []).map((detail) => {
            const rate = toFiniteOrNull(detail.rate);
            const isComputable =
              detail.base === 'revenue'
              && (detail.rateType === 'NSR_pct' || detail.rateType === 'ad_valorem_pct')
              && rate !== null;

            if (isComputable) {
              computableRuleCount += 1;
              computableRateTypes.add(String(detail.rateType));
              diagnostics.warnings.push(`royaltiesDetail used: ${detail.id} rate=${String(rate)}%`);
            } else {
              diagnostics.warnings.push(`royaltiesDetail ignored: ${detail.id} base=${String(detail.base)} rateType=${String(detail.rateType)} rate=${String(detail.rate)}`);
            }

            const royaltyUSD = sanitizedGrossRevenueUSD.map((gross) => {
              if (!isComputable || gross === null) return null;
              return gross * ((rate as number) / 100);
            });

            return {
              id: detail.id,
              label: detail.label,
              name: detail.name,
              base: detail.base,
              rateType: detail.rateType,
              rate,
              royaltyUSD: sanitizeSeries(royaltyUSD),
            };
          });

          const computedRoyaltiesUSD = sanitizedGrossRevenueUSD.map((gross, t) => {
            if (gross === null) return null;
            let sum = 0;
            let hasAny = false;
            for (const detail of royaltiesDetail) {
              const value = detail.royaltyUSD[t] ?? null;
              if (value === null) continue;
              sum += value;
              hasAny = true;
            }
            return hasAny ? sum : 0;
          });

          const hasRoyaltiesDetailArray = Array.isArray(royaltiesDetailRaw);
          const hasComputableRoyaltyRules = computableRuleCount > 0;
          const fallbackRoyaltiesUSD = isAllNullOrNonFinite(explicitRoyaltiesUSD)
            ? sanitizeSeries(outPreRoyalties.nationalTake.totalRoyaltiesUSD)
            : explicitRoyaltiesUSD;
          const royaltiesUSD = hasComputableRoyaltyRules
            ? sanitizeSeries(computedRoyaltiesUSD)
            : fallbackRoyaltiesUSD;

          if (hasComputableRoyaltyRules) {
            const rateTypes = Array.from(computableRateTypes).sort((a, b) => a.localeCompare(b)).join('|');
            diagnostics.warnings.push(`royalties: computed from royaltiesDetail (base=revenue, rateType=${rateTypes}, count=${String(computableRuleCount)})`);
            diagnostics.warnings.push('Royalties (computed)');
            if (!isAllNullOrNonFinite(explicitRoyaltiesUSD) && materiallyDifferentSeries(royaltiesUSD, explicitRoyaltiesUSD)) {
              diagnostics.warnings.push('royalties: computed royalties used; series.royaltiesUSD ignored due to royaltiesDetail precedence');
            }
          } else if (hasRoyaltiesDetailArray) {
            diagnostics.warnings.push('royaltiesDetail present but no computable rules; falling back to series.royaltiesUSD');
          } else {
            diagnostics.warnings.push('royaltiesDetail missing; using series.royaltiesUSD');
          }

          const out = computeProjectEngineFullProductionV1({
            ...resolved,
            phase1: {
              ...resolved.phase1,
              royaltiesUSD,
            },
          });
          const ebitdaUSD = sanitizeSeries(out.phase1.ebitdaUSD);
          const ebitUSD = ebitdaUSD.map((ebitda, t) => {
            const dep = depreciationUSD[t];
            if (ebitda === null || dep === null) return null;
            return ebitda - dep;
          });
          const taxableIncomeUSD = ebitUSD.map((ebit) => (ebit === null ? null : Math.max(0, ebit)));
          const taxByRule = taxableIncomeUSD.map((taxable) => (taxRate === null || taxable === null ? null : taxable * taxRate));
          const effectiveTaxRate = ebitUSD.map((ebit, t) => (ebit !== null && ebit > 0 && taxByRule[t] !== null ? (taxByRule[t] as number) / ebit : null));

          const taxesDetail = projectEconomicsBreakdown?.taxesDetail
            ? {
                federalIncomeTaxUSD: projectEconomicsBreakdown.taxesDetail.federalIncomeTaxUSD
                  ? sanitizeSeries(projectEconomicsBreakdown.taxesDetail.federalIncomeTaxUSD)
                  : undefined,
                municipalRevenueTaxUSD: projectEconomicsBreakdown.taxesDetail.municipalRevenueTaxUSD
                  ? sanitizeSeries(projectEconomicsBreakdown.taxesDetail.municipalRevenueTaxUSD)
                  : undefined,
              }
            : null;

          const identityValidation = validateProjectIdentities({
            periodEndDatesUtc,
            productionStartPeriod,
            taxRate,
            grossRevenueUSD,
            operatingCostsUSD,
            royaltiesUSD,
            depreciationUSD,
            taxUSD: sanitizeSeries(taxByRule),
            capexUSD: sanitizeSeries(out.capexUSD_used),
            totalCapexUSD: sanitizeSeries(out.phase1.totalCapexUSD),
            workingCapitalDeltaUSD: sanitizeSeries(out.phase1.workingCapitalDeltaUSD_effective),
            sustainingCapexUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.sustainingCapexUSD),
            reclamationUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.reclamationUSD),
            byproductCreditsUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.byproductCreditsUSD ?? nullSeries),
            grossProfitUSD,
            ebitdaUSD,
            ebitUSD: sanitizeSeries(ebitUSD),
            taxableIncomeUSD: sanitizeSeries(taxableIncomeUSD),
            fcffUSD: sanitizeSeries(out.phase1.fcffUSD),
            selling: {
              treatmentChargesUSD: projectEconomicsBreakdown?.selling?.treatmentChargesUSD
                ? sanitizeSeries(projectEconomicsBreakdown.selling.treatmentChargesUSD)
                : undefined,
              refiningChargesUSD: projectEconomicsBreakdown?.selling?.refiningChargesUSD
                ? sanitizeSeries(projectEconomicsBreakdown.selling.refiningChargesUSD)
                : undefined,
              tcRcUSD: projectEconomicsBreakdown?.selling?.tcRcUSD
                ? sanitizeSeries(projectEconomicsBreakdown.selling.tcRcUSD)
                : undefined,
              transportUSD: projectEconomicsBreakdown?.selling?.transportUSD
                ? sanitizeSeries(projectEconomicsBreakdown.selling.transportUSD)
                : undefined,
            },
          });

          if (identityValidation.diagnostics.length > 0) {
            diagnostics.warnings.push(`Identity checks (${projectId}):`);
            diagnostics.warnings.push(...identityValidation.diagnostics.map((line) => `[${projectId}] ${line}`));
          }

          projectSeriesContexts.push({
            projectId,
            periodEndDatesUtc,
            payableQtyByMetal: Object.fromEntries(
              Object.entries(parsed.engineInputWithoutPrices.payableQtyByMetal).map(([metal, series]) => [metal, sanitizeSeries(series)]),
            ),
            payableQtyUnitByMetal: { ...parsed.engineInputWithoutPrices.payableQtyUnitByMetal },
            priceUSDUnitByMetal: Object.fromEntries(
              Object.keys(parsed.engineInputWithoutPrices.priceKeyByMetal).map((metal) => [metal, `USD_${canonicalUnitForMetal(metal)}`]),
            ),
            spotPriceUSDByMetal: Object.fromEntries(
              Object.entries(resolved.spotPriceUSDByMetal).map(([metal, series]) => [metal, sanitizeSeries(series)]),
            ),
            revenueByMetal_USD: Object.fromEntries(
              Object.entries(out.revenue.byMetalRevenueUSD).map(([metal, series]) => [metal, sanitizeSeries(series)]),
            ),
            operations: {
              oreMinedTonnes: parsed.context.operations?.oreMinedTonnes ? sanitizeSeries(parsed.context.operations.oreMinedTonnes) : undefined,
              oreMilledTonnes: parsed.context.operations?.oreMilledTonnes ? sanitizeSeries(parsed.context.operations.oreMilledTonnes) : undefined,
              throughputUnit: parsed.context.operations?.capacity.throughputUnit ?? null,
              nameplateThroughput: toFiniteOrNull(parsed.context.operations?.capacity.nameplateThroughput),
              utilizationPct: toFiniteOrNull(parsed.context.operations?.capacity.utilizationPct),
            },
            economicsBreakdown: projectEconomicsBreakdown
              ? {
                  cogs: {
                    miningUSD: projectEconomicsBreakdown.cogs?.miningUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.miningUSD) : undefined,
                    millingUSD: projectEconomicsBreakdown.cogs?.millingUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.millingUSD) : undefined,
                    utilitiesUSD: projectEconomicsBreakdown.cogs?.utilitiesUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.utilitiesUSD) : undefined,
                    maintenanceUSD: projectEconomicsBreakdown.cogs?.maintenanceUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.maintenanceUSD) : undefined,
                    campUSD: projectEconomicsBreakdown.cogs?.campUSD ? sanitizeSeries(projectEconomicsBreakdown.cogs.campUSD) : undefined,
                    siteGandA_USD: projectEconomicsBreakdown.cogs?.siteGandA_USD ? sanitizeSeries(projectEconomicsBreakdown.cogs.siteGandA_USD) : undefined,
                  },
                  selling: {
                    treatmentChargesUSD: projectEconomicsBreakdown.selling?.treatmentChargesUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.treatmentChargesUSD) : undefined,
                    refiningChargesUSD: projectEconomicsBreakdown.selling?.refiningChargesUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.refiningChargesUSD) : undefined,
                    tcRcUSD: projectEconomicsBreakdown.selling?.tcRcUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.tcRcUSD) : undefined,
                    transportUSD: projectEconomicsBreakdown.selling?.transportUSD ? sanitizeSeries(projectEconomicsBreakdown.selling.transportUSD) : undefined,
                  },
                }
              : null,
            royaltiesDetail,
            taxesDetail,
            economics: {
              operatingCostsUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.operatingCostsUSD),
              sustainingCapexUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.sustainingCapexUSD),
              siteGandA_USD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.siteGandA_USD),
              royaltiesUSD,
              reclamationUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.reclamationUSD),
              byproductCreditsUSD: sanitizeSeries(parsed.engineInputWithoutPrices.phase1.byproductCreditsUSD ?? nullSeries),
              sustainingCostUSD: sanitizeSeries(out.phase1.sustainingCostUSD),
              ebitdaUSD,
              depreciationUSD,
              ebitUSD: sanitizeSeries(ebitUSD),
              taxableIncomeUSD: sanitizeSeries(taxableIncomeUSD),
              effectiveTaxRate: sanitizeSeries(effectiveTaxRate),
              taxUSD: sanitizeSeries(taxByRule),
              workingCapitalDeltaUSD: sanitizeSeries(out.phase1.workingCapitalDeltaUSD_effective),
              fcffUSD: sanitizeSeries(out.phase1.fcffUSD),
              capexUSD: sanitizeSeries(out.capexUSD_used),
              totalCapexUSD: sanitizeSeries(out.phase1.totalCapexUSD),
            },
          });

          return {
            periodEndDatesUtc,
            capexUSD: out.capexUSD_used,
            fcffUSD: out.phase1.fcffUSD,
            grossRevenueUSD: out.revenue.grossRevenueUSD,
            auPriceUSDPerOz: resolved.aisc.auPriceUSDPerOz,
            sustainingCostUSD: out.phase1.sustainingCostUSD,
            payableAuEqOz: out.aisc.payableAuEqOz,
          };
        },
      },
    );

    diagnostics.warnings.push(...aggregation.diagnostics.notes);


    let buildFundingNeedUSD = input.buildFundingNeed_USD;
    if (buildFundingNeedUSD === undefined) {
      diagnostics.warnings.push(
        'buildFundingNeed_USD derived from capex schedule using first production date window',
      );
      buildFundingNeedUSD = deriveBuildFundingNeedUSD({
        corporatePeriodEndDatesUtc: aggregation.corporatePeriodEndDatesUtc,
        capexUSD_total: aggregation.capexUSD_total,
        projects: projectsForBuildFunding,
      });

      if (buildFundingNeedUSD === null) {
        diagnostics.warnings.push(
          'buildFundingNeed_USD derivation returned null because capexUSD_total contains null in the build window',
        );
      }
    }

    let fxRate = input.fx_USD_to_TargetCurrency ?? null;
    if (input.fx.source === 'manual') {
      fxRate = input.fx.manual_fx_USD_to_TargetCurrency ?? input.fx_USD_to_TargetCurrency ?? null;
    } else {
      const fxScenario = input.fx.scenario.mode === 'percentile'
        ? { mode: 'percentile' as const, lookbackYears: input.fx.scenario.lookbackYears, percentile: input.fx.scenario.percentile }
        : input.fx.scenario.mode === 'fixed'
          ? {
              mode: 'fixed' as const,
              fixedFx: input.fx.scenario.fixedPriceByKey[fxKeyUSDTo(input.targetCurrency)],
            }
          : { mode: 'spot' as const };
      const resolvedFx = await resolveFxUSDToTarget({
        targetCurrency: input.targetCurrency,
        anchorDateUtc: input.fx.scenario.mode === 'spot' && spotAnchorDateUtc > getTodayUtcDateString()
          ? getTodayUtcDateString()
          : spotAnchorDateUtc,
        scenario: fxScenario,
        allowRefresh: refresh,
      });
      diagnostics.warnings.push(...resolvedFx.warnings);
      fxRate = resolvedFx.fx;

      if (fxRate === null && input.fx_USD_to_TargetCurrency !== undefined) {
        fxRate = input.fx_USD_to_TargetCurrency;
        diagnostics.warnings.push('FX auto-resolve failed; using legacy fx_USD_to_TargetCurrency fallback');
      }
      if (fxRate === null) {
        diagnostics.warnings.push('FX missing and auto-resolve failed; target-currency outputs will be null.');
      }
    }

    const marketInput = {
      shares_current: input.market?.shares_current ?? null,
      price_current_TargetCurrency: input.market?.price_current_TargetCurrency ?? null,
      preferredEquity_TargetCurrency: input.market?.preferredEquity_TargetCurrency ?? null,
      minorityInterest_TargetCurrency: input.market?.minorityInterest_TargetCurrency ?? null,
    };

    const financing = fxRate === null
      ? {
          cash_used_for_build_TargetCurrency: null,
          cash_t0_post_TargetCurrency: null,
          new_debt_TargetCurrency: null,
          debt_t0_post_TargetCurrency: null,
          equity_raised_TargetCurrency: null,
          new_shares: null,
          shares_post_financing: marketInput.shares_current,
          NPV_today_TargetCurrency: null,
          NAV_today_TargetCurrency: null,
          Debt_to_Equity_ratio: null,
          npvToday_TargetCurrency: null,
          navToday_TargetCurrency: null,
          cash_AfterCashFirst_TargetCurrency_t0: null,
          debt_TargetCurrency_t0: null,
          netCash_TargetCurrency_t0: null,
          enterpriseAdjustments_TargetCurrency_t0: 0,
          evAdditive_Component_TargetCurrency_t0: null,
        }
      : computeCorporateFinancing({
          NPV_today_USD: aggregation.NPV_today_USD,
          targetCurrency: input.targetCurrency,
          fx_USD_to_TargetCurrency: fxRate,
          cash_t0_TargetCurrency: input.balanceSheet?.cash_t0_TargetCurrency ?? null,
          debt_t0_TargetCurrency: input.balanceSheet?.debt_t0_TargetCurrency ?? null,
          shares_current: marketInput.shares_current,
          price_current_TargetCurrency: marketInput.price_current_TargetCurrency,
          financingPlan: input.financingPlan,
          buildFundingNeed_USD: buildFundingNeedUSD,
        });

    const productionStartIndices = projectsForBuildFunding
      .map((project) => {
        const productionDate = project.periodEndDatesUtc[project.productionStartPeriod];
        const corporateIndex = aggregation.corporatePeriodEndDatesUtc.indexOf(productionDate);
        return corporateIndex >= 0 ? corporateIndex : null;
      })
      .filter((value): value is number => value !== null);

    const corporateProductionStartPeriod =
      productionStartIndices.length > 0 ? Math.min(...productionStartIndices) : null;

    const delayPeriods = Number.isInteger(input.scenario.delayPeriods) && (input.scenario.delayPeriods as number) >= 0
      ? input.scenario.delayPeriods as number
      : 0;
    const tpEff = corporateProductionStartPeriod === null ? null : corporateProductionStartPeriod + delayPeriods;

    const totalFdExtraShares = projectsForBuildFunding.reduce((sum, project) => sum + project.fdExtraShares, 0);

    if (projectsForBuildFunding.length > 0 && corporateProductionStartPeriod === null) {
      diagnostics.warnings.push(
        'Lista2 CF+DCF productionStartPeriod unavailable after corporate date-grid alignment; outputs set to null',
      );
    }

    const snapshotSeriesBase = buildSnapshotSeries({
      masterN: aggregation.corporateMasterN,
      corporateDates: aggregation.corporatePeriodEndDatesUtc,
      projectSeriesContexts,
    });

    const shiftedDeep = shiftPerPeriodArraysDeep(snapshotSeriesBase, aggregation.corporateMasterN, delayPeriods);
    const snapshotSeries = shiftedDeep.value as CorporateSnapshotSeries;
    snapshotSeries.capexUSD = applyScalarMultiplier(snapshotSeries.capexUSD, input.scenario.capexMult);
    snapshotSeries.operatingCostsUSD = applyScalarMultiplier(snapshotSeries.operatingCostsUSD, input.scenario.opexMult);

    const aggregationEffective = {
      ...aggregation,
      capexUSD_total: snapshotSeries.capexUSD,
      fcffUSD_total: snapshotSeries.fcffUSD,
      grossRevenueUSD_total: snapshotSeries.totalRevenue_USD,
      auPriceUSDPerOz: snapshotSeries.priceUsedByMetal_USD.Au ?? aggregation.auPriceUSDPerOz,
      sustainingCostUSD_total: snapshotSeries.sustainingCostUSD,
      payableAuEqOz_total: snapshotSeries.payableQtyByMetal.Au ?? aggregation.payableAuEqOz_total,
      CF_LOM_USD: sumFinite(snapshotSeries.fcffUSD),
      NPV_today_USD: discountedSum(snapshotSeries.fcffUSD, input.discountRate),
      aiscAuEqUSDPerOz_LOM: (() => {
        const cost = sumFinite(snapshotSeries.sustainingCostUSD);
        const pay = sumFinite(snapshotSeries.payableQtyByMetal.Au ?? []);
        if (cost === null || pay === null || pay === 0) return null;
        return cost / pay;
      })(),
    };

    if (projectSeriesContexts.length > 1) {
      const corporateTotals = aggregateProjectsToCorporateTotals(
        projectSeriesContexts.map((entry) => ({
          capexUSD: entry.economics.capexUSD,
          fcfUSD: entry.economics.fcffUSD,
          operatingCostsUSD: entry.economics.operatingCostsUSD,
          sustainingCapexUSD: entry.economics.sustainingCapexUSD,
          siteGandA_USD: entry.economics.siteGandA_USD,
          royaltiesUSD: entry.economics.royaltiesUSD,
          reclamationAccrualUSD: entry.economics.reclamationUSD,
          payable_AuEq_Oz: entry.payableQtyByMetal.Au,
          sustainingCostUSD: entry.economics.sustainingCostUSD,
        })),
        aggregation.corporateMasterN,
      );

      diagnostics.meta.corporateTotalsDebug = corporateTotals;
      aggregationEffective.capexUSD_total = applyScalarMultiplier(shiftSeries(corporateTotals.capexUSD_total, aggregation.corporateMasterN, delayPeriods).shifted, input.scenario.capexMult);
      aggregationEffective.fcffUSD_total = shiftSeries(corporateTotals.fcfUSD_total, aggregation.corporateMasterN, delayPeriods).shifted;
      aggregationEffective.sustainingCostUSD_total = corporateTotals.sustainingCostUSD_total
        ? shiftSeries(corporateTotals.sustainingCostUSD_total, aggregation.corporateMasterN, delayPeriods).shifted
        : aggregationEffective.sustainingCostUSD_total;
      aggregationEffective.payableAuEqOz_total = corporateTotals.payable_AuEq_Oz_total
        ? shiftSeries(corporateTotals.payable_AuEq_Oz_total, aggregation.corporateMasterN, delayPeriods).shifted
        : aggregationEffective.payableAuEqOz_total;

      aggregationEffective.CF_LOM_USD = sumFinite(aggregationEffective.fcffUSD_total);
      aggregationEffective.NPV_today_USD = discountedSum(aggregationEffective.fcffUSD_total, input.discountRate);
      aggregationEffective.aiscAuEqUSDPerOz_LOM = (() => {
        const cost = sumFinite(aggregationEffective.sustainingCostUSD_total);
        const pay = sumFinite(aggregationEffective.payableAuEqOz_total);
        if (cost === null || pay === null || pay === 0) return null;
        return cost / pay;
      })();
    }

    const financingEffective = fxRate === null
      ? financing
      : computeCorporateFinancing({
          NPV_today_USD: aggregationEffective.NPV_today_USD,
          targetCurrency: input.targetCurrency,
          fx_USD_to_TargetCurrency: fxRate,
          cash_t0_TargetCurrency: input.balanceSheet?.cash_t0_TargetCurrency ?? null,
          debt_t0_TargetCurrency: input.balanceSheet?.debt_t0_TargetCurrency ?? null,
          shares_current: marketInput.shares_current,
          price_current_TargetCurrency: marketInput.price_current_TargetCurrency,
          financingPlan: input.financingPlan,
          buildFundingNeed_USD: buildFundingNeedUSD,
        });

    const perProjectNewShares = projectsForBuildFunding.map((project) => {
      const projectPlan = input.financingPlanByProject?.[project.projectId];
      const defaultEquity = input.financingPlan?.equity_fraction ?? 1;
      const defaultDebt = input.financingPlan?.debt_fraction ?? (1 - defaultEquity);
      const equityFractionRaw = projectPlan?.equity_fraction ?? defaultEquity;
      const debtFractionRaw = projectPlan?.debt_fraction ?? defaultDebt;
      const equityFraction = typeof equityFractionRaw === 'number' && Number.isFinite(equityFractionRaw) ? Math.max(0, Math.min(1, equityFractionRaw)) : null;
      const debtFraction = typeof debtFractionRaw === 'number' && Number.isFinite(debtFractionRaw) ? Math.max(0, Math.min(1, debtFractionRaw)) : null;

      const projectSeriesContext = projectSeriesContexts.find((entry) => entry.projectId === project.projectId);
      const projectCapexSeries = projectSeriesContext?.economics.capexUSD ?? null;
      if (!projectCapexSeries) {
        return {
          projectId: project.projectId,
          projectName: project.projectName,
          equityFraction,
          debtFraction,
          newShares: null,
          reasonIfUnavailable: 'newShares not computed: missing inputs project capex series',
        };
      }
      const capexBeforeProduction = projectCapexSeries.slice(0, Math.max(0, project.productionStartPeriod));
      if (capexBeforeProduction.some((value) => value === null || !Number.isFinite(value))) {
        return {
          projectId: project.projectId,
          projectName: project.projectName,
          equityFraction,
          debtFraction,
          newShares: null,
          reasonIfUnavailable: 'newShares not computed: missing inputs capexUSD build-window values',
        };
      }

      if (fxRate === null || !Number.isFinite(fxRate) || fxRate <= 0) {
        return {
          projectId: project.projectId,
          projectName: project.projectName,
          equityFraction,
          debtFraction,
          newShares: null,
          reasonIfUnavailable: 'newShares not computed: missing inputs fx_USD_to_TargetCurrency',
        };
      }

      const raisePrice = input.financingPlan?.equity_raise_price_TargetCurrency ?? marketInput.price_current_TargetCurrency;
      if (typeof raisePrice !== 'number' || !Number.isFinite(raisePrice) || raisePrice <= 0) {
        return {
          projectId: project.projectId,
          projectName: project.projectName,
          equityFraction,
          debtFraction,
          newShares: null,
          reasonIfUnavailable: 'newShares not computed: missing inputs equity_raise_price_TargetCurrency_perShare',
        };
      }

      if (equityFraction === null) {
        return {
          projectId: project.projectId,
          projectName: project.projectName,
          equityFraction,
          debtFraction,
          newShares: null,
          reasonIfUnavailable: 'newShares not computed: missing inputs equity_fraction',
        };
      }

      let negativeCapexSumProject = 0;
      let positiveCapexSumProject = 0;
      for (const capexValue of capexBeforeProduction) {
        if (typeof capexValue !== "number" || !Number.isFinite(capexValue)) {
          continue;
        }
        if (capexValue < 0) {
          negativeCapexSumProject += capexValue;
        }
        if (capexValue > 0) {
          positiveCapexSumProject += capexValue;
        }
      }

      const buildFundingNeedProjectUSD = Math.abs(negativeCapexSumProject) > 0
        ? Math.abs(negativeCapexSumProject)
        : positiveCapexSumProject > 0
          ? positiveCapexSumProject
          : 0;
      const equityNeedTarget = buildFundingNeedProjectUSD * fxRate * equityFraction;
      return {
        projectId: project.projectId,
        projectName: project.projectName,
        equityFraction,
        debtFraction,
        newShares: equityNeedTarget / raisePrice,
        reasonIfUnavailable: null,
      };
    });

    const hasUnavailableProjectShares = perProjectNewShares.some((project) => project.newShares === null);
    const totalNewShares = hasUnavailableProjectShares
      ? null
      : perProjectNewShares.reduce((sum: number, project) => sum + (project.newShares as number), 0);
    const sharesPostFinancingAggregated =
      typeof marketInput.shares_current === 'number'
      && Number.isFinite(marketInput.shares_current)
      && marketInput.shares_current > 0
      && totalNewShares !== null
        ? marketInput.shares_current + totalNewShares
        : null;

    if (debug) {
      diagnostics.meta.corporateFinancingDebug = {
        shares_current: marketInput.shares_current,
        shares_post_financing: sharesPostFinancingAggregated ?? financingEffective.shares_post_financing,
        totalNewShares,
        perProjectNewShares,
      };
    }

    const sharesPostFinancingForSnapshot = sharesPostFinancingAggregated ?? financingEffective.shares_post_financing;
    const shares_post_financing_fd_effective =
      typeof sharesPostFinancingForSnapshot === 'number'
      && Number.isFinite(sharesPostFinancingForSnapshot)
      && sharesPostFinancingForSnapshot > 0
        ? sharesPostFinancingForSnapshot + totalFdExtraShares
        : null;

    const financingSnapshot = { ...financingEffective, shares_post_financing: sharesPostFinancingForSnapshot };

    const delayDiagnostics: DelayScenarioDiagnostics = {
      k: delayPeriods,
      tp_base: corporateProductionStartPeriod,
      tp_eff: tpEff,
      masterN: aggregation.corporateMasterN,
      truncationCount: shiftedDeep.truncationCount,
      shiftRule: 'S_eff[t] = null for t < k; S_eff[t] = S_base[t-k] for k <= t <= masterN; overflow truncated',
      samples: {
        capexUSD: {
          baseFirst6: snapshotSeriesBase.capexUSD.slice(0, 6),
          effectiveFirst6: snapshotSeries.capexUSD.slice(0, 6),
        },
        operatingCostsUSD: {
          baseFirst6: snapshotSeriesBase.operatingCostsUSD.slice(0, 6),
          effectiveFirst6: snapshotSeries.operatingCostsUSD.slice(0, 6),
        },
        metalPayableSample: {
          metal: 'Au',
          baseFirst6: (snapshotSeriesBase.payableQtyByMetal.Au ?? []).slice(0, 6),
          effectiveFirst6: (snapshotSeries.payableQtyByMetal.Au ?? []).slice(0, 6),
        },
      },
    };
    diagnostics.meta.scenarioDelay = delayDiagnostics;
    diagnostics.warnings.push(`Scenario delay diagnostics: tp_base=${String(delayDiagnostics.tp_base)} tp_eff=${String(delayDiagnostics.tp_eff)} k=${delayDiagnostics.k}`);
    diagnostics.warnings.push(`Scenario shift rule: ${delayDiagnostics.shiftRule}; truncation_count=${delayDiagnostics.truncationCount}`);
    diagnostics.warnings.push(`Scenario sample capexUSD first6 base=${JSON.stringify(delayDiagnostics.samples.capexUSD.baseFirst6)} effective=${JSON.stringify(delayDiagnostics.samples.capexUSD.effectiveFirst6)}`);
    diagnostics.warnings.push(`Scenario sample operatingCostsUSD first6 base=${JSON.stringify(delayDiagnostics.samples.operatingCostsUSD.baseFirst6)} effective=${JSON.stringify(delayDiagnostics.samples.operatingCostsUSD.effectiveFirst6)}`);
    diagnostics.warnings.push(`Scenario sample payableQtyByMetal.${delayDiagnostics.samples.metalPayableSample.metal} first6 base=${JSON.stringify(delayDiagnostics.samples.metalPayableSample.baseFirst6)} effective=${JSON.stringify(delayDiagnostics.samples.metalPayableSample.effectiveFirst6)}`);

    if (tpEff !== null && tpEff > aggregation.corporateMasterN) {
      diagnostics.errors.push(`Scenario delay failure_reason=tp_eff (${tpEff}) > masterN (${aggregation.corporateMasterN}); LOM=0 and dependent metrics set to null`);
    }

    const fcffIssue = firstFcffIssue({
      revenue: snapshotSeries.totalRevenue_USD,
      operatingCosts: snapshotSeries.operatingCostsUSD,
      royalties: snapshotSeries.royaltiesUSD,
      tax: snapshotSeries.taxUSD,
      capex: snapshotSeries.capexUSD,
      workingCapitalDelta: snapshotSeries.workingCapitalDeltaUSD ?? new Array(snapshotSeries.fcffUSD.length).fill(0),
      fcff: snapshotSeries.fcffUSD,
    });
    if (fcffIssue) {
      diagnostics.warnings.push(`Lista2 CF+DCF skipped candidate: first invalid FCFF at t=${fcffIssue.t}; component=${fcffIssue.component}`);
    }

    const lista2 = tpEff !== null && tpEff > aggregation.corporateMasterN
      ? { metrics: makeNullLista2CfDcfMetrics(), warnings: ['failure_reason: tp_eff > masterN'], errors: [] }
      : computeLista2CfDcfMetrics({
        fcfUSD_total: aggregationEffective.fcffUSD_total,
        masterN: aggregationEffective.corporateMasterN,
        productionStartPeriod: tpEff,
        discountRate: input.discountRate,
        shares_post_financing: shares_post_financing_fd_effective,
        fx_USD_to_TargetCurrency: fxRate,
        npvToday_USD: aggregationEffective.NPV_today_USD,
      });
    diagnostics.warnings.push(...lista2.warnings);
    diagnostics.errors.push(...lista2.errors);
    const rawBody = args.body as Record<string, unknown>;
    const rawBalance = rawBody.balanceSheet;
    const totalStockholdersEquity_USD =
      typeof rawBalance === 'object' && rawBalance !== null && Number.isFinite((rawBalance as Record<string, unknown>).totalStockholdersEquity_t0_USD)
        ? ((rawBalance as Record<string, unknown>).totalStockholdersEquity_t0_USD as number)
        : typeof rawBalance === 'object' && rawBalance !== null && Number.isFinite((rawBalance as Record<string, unknown>).totalStockholdersEquity_USD)
          ? ((rawBalance as Record<string, unknown>).totalStockholdersEquity_USD as number)
          : null;

    const lista4 = computeLista4TenYearMetrics({
      masterN: aggregationEffective.corporateMasterN,
      revenueUSD_total: aggregationEffective.grossRevenueUSD_total,
      fcffUSD_total: aggregationEffective.fcffUSD_total,
      auPriceUSDPerOz: aggregationEffective.auPriceUSDPerOz,
      fx_USD_to_TargetCurrency: fxRate,
      shares_current: marketInput.shares_current,
      shares_post_financing: shares_post_financing_fd_effective,
      ev_TargetCurrency: null,
      totalStockholdersEquity_USD,
    });
    const lista3a = computeLista3aProjectEfficiencyMetrics({
      masterN: aggregationEffective.corporateMasterN,
      productionStartPeriod: tpEff,
      discountRate: input.discountRate,
      fcffUSD_total: aggregationEffective.fcffUSD_total,
      ebitUSD_total: snapshotSeries.ebitUSD,
      capexUSD_total: aggregationEffective.capexUSD_total,
    });
    diagnostics.warnings.push(...lista3a.warnings);

    const snapshot = buildCorporateSnapshot({
      targetCurrency: input.targetCurrency,
      aggregation: aggregationEffective,
      financing: financingSnapshot,
      market: marketInput,
      lista2CfDcf: lista2.metrics,
      lista3aProjectEfficiency: lista3a.metrics,
      lista4TenYear: lista4,
    });

    snapshot.series = snapshotSeries;
    snapshot.modeledValuationTimeline = buildCorporateModeledValuationTimeline({
      projects: projectsForBuildFunding.map((project) => ({
        productionStartPeriod: project.productionStartPeriod,
        periodEndDatesUtc: project.periodEndDatesUtc,
      })),
      corporatePeriodEndDatesUtc: aggregation.corporatePeriodEndDatesUtc,
      fcfUSD_total: aggregationEffective.fcffUSD_total,
      masterN: aggregationEffective.corporateMasterN,
      discountRate: input.discountRate,
      shares_post_financing: shares_post_financing_fd_effective,
      fx_USD_to_TargetCurrency: fxRate,
      npvToday_USD: aggregationEffective.NPV_today_USD,
    });
    snapshot.market = marketInput;
    snapshot.fx_USD_to_TargetCurrency = fxRate;
    snapshot.discountRate = input.discountRate;

    if (debug) {
      diagnostics.meta.corporateModeledValuationTimeline = snapshot.modeledValuationTimeline;
    }

    return { ok: true, snapshot, diagnostics: finalizeDiagnostics(diagnostics) };
  } catch (error) {
    diagnostics.errors.push((error as Error).message);
    return { ok: false, diagnostics: finalizeDiagnostics(diagnostics) };
  }
}
