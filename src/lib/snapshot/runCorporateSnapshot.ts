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
import { computeLista3 } from '../metrics/lista3.ts';
import { computeLista4TenYearMetrics } from './lista4TenYear.ts';
import { buildCorporateModeledValuationTimeline } from './corporateModeledValuationTimeline.ts';
import { aggregateProjectsToCorporateTotals } from './aggregateProjectsToCorporateTotals.ts';
import type { CorporateSnapshotSeries } from '../corporate/snapshot/types.ts';
import { canonicalUnitForMetal } from '../units/metalUnits.ts';
import { convertPriceToCanonical, convertQuantityToCanonical } from '../units/conversion.ts';
import { resolveV2TimeAxis } from '../time/resolveV2TimeAxis.ts';

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

function sumStrict(values: Array<number | null>): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }
    sum += value;
  }
  return sum;
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return (numerator as number) / (denominator as number);
}

function sumWherePayablePositive(args: {
  payableAuEqOz: Array<number | null>;
  sourceUSD: Array<number | null>;
  tp: number;
  masterN: number;
}): { sumPayable: number; sumSource: number; payableCount: number } | null {
  let sumPayable = 0;
  let sumSource = 0;
  let payableCount = 0;
  for (let t = args.tp; t <= args.masterN; t += 1) {
    const payable = toFiniteOrNull(args.payableAuEqOz[t]);
    if (payable === null) continue;
    if (payable <= 0) continue;
    const source = toFiniteOrNull(args.sourceUSD[t]);
    if (source === null) {
      return null;
    }
    sumPayable += payable;
    sumSource += source;
    payableCount += 1;
  }
  return { sumPayable, sumSource, payableCount };
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
  corporateYearsByPeriod: number[];
  projectDateSeries: Array<{ projectId: string; yearsByPeriod: number[]; series: Array<number | null> }>;
  label: string;
}): Array<number | null> {
  const sums = new Array<number>(args.corporateYearsByPeriod.length).fill(0);
  const hasContributor = new Array<boolean>(args.corporateYearsByPeriod.length).fill(false);
  const nullAtDate = new Array<boolean>(args.corporateYearsByPeriod.length).fill(false);

  for (const projectSeries of args.projectDateSeries) {
    assertSeriesLength(
      projectSeries.series,
      projectSeries.yearsByPeriod.length,
      `${args.label} project=${projectSeries.projectId}`,
    );

    const dateToIndex = new Map<number, number>(
      projectSeries.yearsByPeriod.map((date, idx) => [date, idx]),
    );

    for (let t = 0; t < args.corporateYearsByPeriod.length; t += 1) {
      if (nullAtDate[t]) {
        continue;
      }
      const projectIndex = dateToIndex.get(args.corporateYearsByPeriod[t]);
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
  taxRate: number | null;
  taxRateByPeriod: Array<number | null> | null;
  yearsByPeriod: number[];
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

type PeriodLabel = string;

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
  periodLabels: PeriodLabel[];
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
    const date = input.periodLabels[t] ?? String(t);
    const diff = expected - actual;
    return `IDENTITY FAIL t=${t} year=${date} ${label}: expected=${String(expected)} actual=${String(actual)} diff=${String(diff)}`;
  };

  for (let t = 0; t < input.periodLabels.length; t += 1) {
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
      diagnostics.push(`Identity checks: cannot evaluate FCFF identity at t=${t} year=${input.periodLabels[t] ?? String(t)} because one or more required inputs are null/non-finite`);
    }

    perPeriod.push({
      t,
      yearOrPeriodEndDate: input.periodLabels[t] ?? String(t),
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
  corporateYearsByPeriod: number[];
  projectSeriesContexts: ProjectSeriesContext[];
}): CorporateSnapshotSeries {
  const expectedLength = args.masterN + 1;
  if (args.corporateYearsByPeriod.length !== expectedLength) {
    throw new Error(`series.yearsByPeriod length must equal masterN+1 (${expectedLength})`);
  }

  const periodIndex = Array.from({ length: expectedLength }, (_, i) => i);
  const yearsByPeriod = [...args.corporateYearsByPeriod];

  const throughputUnits = new Set(args.projectSeriesContexts.map((entry) => entry.operations.throughputUnit).filter((v) => v !== null));
  const throughputUnit = throughputUnits.size === 1 ? [...throughputUnits][0] as 'tpd' | 'tpa' : null;

  const nameplateVals = args.projectSeriesContexts.map((entry) => entry.operations.nameplateThroughput).filter((v): v is number => v !== null);
  const utilizationVals = args.projectSeriesContexts.map((entry) => entry.operations.utilizationPct).filter((v): v is number => v !== null);

  const oreMinedTonnes = sumStrictAlignedSeries({
    corporateYearsByPeriod: args.corporateYearsByPeriod,
    projectDateSeries: args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.operations.oreMinedTonnes))
      .map((entry) => ({
        projectId: entry.projectId,
        yearsByPeriod: entry.yearsByPeriod,
        series: sanitizeSeries(entry.operations.oreMinedTonnes ?? []),
      })),
    label: 'series.oreMinedTonnes',
  });

  const oreMilledTonnes = sumStrictAlignedSeries({
    corporateYearsByPeriod: args.corporateYearsByPeriod,
    projectDateSeries: args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.operations.oreMilledTonnes))
      .map((entry) => ({
        projectId: entry.projectId,
        yearsByPeriod: entry.yearsByPeriod,
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
        yearsByPeriod: entry.yearsByPeriod,
        series: sanitizeSeries(entry.payableQtyByMetal[metal]),
      }));

    const revenueProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.revenueByMetal_USD[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        yearsByPeriod: entry.yearsByPeriod,
        series: sanitizeSeries(entry.revenueByMetal_USD[metal]),
      }));

    const spotPriceProjects = args.projectSeriesContexts
      .filter((entry) => Array.isArray(entry.spotPriceUSDByMetal[metal]))
      .map((entry) => ({
        projectId: entry.projectId,
        yearsByPeriod: entry.yearsByPeriod,
        series: sanitizeSeries(entry.spotPriceUSDByMetal[metal]),
      }));

    payableQtyByMetal[metal] = sumStrictAlignedSeries({ corporateYearsByPeriod: args.corporateYearsByPeriod, projectDateSeries: qtyProjects, label: `series.payableQtyByMetal.${metal}` });
    const fallbackRevenue = sumStrictAlignedSeries({ corporateYearsByPeriod: args.corporateYearsByPeriod, projectDateSeries: revenueProjects, label: `series.revenueByMetal_USD.${metal}` });

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
          const idx = project.yearsByPeriod.indexOf(args.corporateYearsByPeriod[t]);
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
    corporateYearsByPeriod: args.corporateYearsByPeriod,
    projectDateSeries: args.projectSeriesContexts.map((entry) => ({
      projectId: entry.projectId,
      yearsByPeriod: entry.yearsByPeriod,
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

  const aggregateBreakdownSeries = (seriesByProject: Array<{ projectId: string; yearsByPeriod: number[]; series: Array<number | null> }>, label: string): Array<number | null> =>
    sumStrictAlignedSeries({
      corporateYearsByPeriod: args.corporateYearsByPeriod,
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
          yearsByPeriod: entry.yearsByPeriod,
          series: sanitizeSeries(series),
        };
      })
      .filter((value): value is { projectId: string; yearsByPeriod: number[]; series: Array<number | null> } => value !== null);

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
    projectSeries: Array<{ projectId: string; yearsByPeriod: number[]; series: Array<number | null> }>;
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
        yearsByPeriod: entry.yearsByPeriod,
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
    yearsByPeriod,
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


export function computeEarliestMilestoneDcfPresentScalars(args: {
  milestones: Array<{ milestoneYear: number; tp_k: number; dcfProdStartExCapex_TargetCurrency: number | null }>;
  discountRate: number;
  shares_post_financing: number | null;
}): {
  DCF_prodStart_present_TargetCurrency: number | null;
  DCF_prodStart_present_perShare_TargetCurrency: number | null;
} {
  const earliestMilestone = [...args.milestones]
    .filter((milestone) => Number.isInteger(milestone.milestoneYear) && Number.isInteger(milestone.tp_k) && milestone.tp_k >= 0)
    .sort((left, right) => left.milestoneYear - right.milestoneYear)[0] ?? null;

  if (!earliestMilestone) {
    return {
      DCF_prodStart_present_TargetCurrency: null,
      DCF_prodStart_present_perShare_TargetCurrency: null,
    };
  }

  if (!Number.isFinite(args.discountRate) || args.discountRate <= 0) {
    return {
      DCF_prodStart_present_TargetCurrency: null,
      DCF_prodStart_present_perShare_TargetCurrency: null,
    };
  }

  const dcfProdStartExCapex =
    earliestMilestone.dcfProdStartExCapex_TargetCurrency !== null
    && Number.isFinite(earliestMilestone.dcfProdStartExCapex_TargetCurrency)
      ? earliestMilestone.dcfProdStartExCapex_TargetCurrency
      : null;
  const dfToToday = 1 / ((1 + args.discountRate) ** earliestMilestone.tp_k);
  const dcfProdStartPresent =
    dcfProdStartExCapex !== null && Number.isFinite(dfToToday)
      ? dcfProdStartExCapex * dfToToday
      : null;

  const perShare =
    dcfProdStartPresent !== null
    && args.shares_post_financing !== null
    && Number.isFinite(args.shares_post_financing)
    && args.shares_post_financing > 0
      ? dcfProdStartPresent / args.shares_post_financing
      : null;

  return {
    DCF_prodStart_present_TargetCurrency: dcfProdStartPresent,
    DCF_prodStart_present_perShare_TargetCurrency: perShare,
  };
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
      corporateProdStartCapexWindowDebug?: Array<{
        milestoneYear: number;
        tp_prev: number;
        tp_k: number;
        windowYears: number[];
        windowCapexUSD: Array<number | null>;
        windowCapexUSD_sum_strict: number | null;
        fx_USD_to_TargetCurrency: number | null;
        windowCapexTarget_sum_strict: number | null;
      }>;
    };
    corporateFinancingDebug?: {
      shares_current: number | null;
      shares_post_financing: number | null;
      totalNewShares: number | null;
      totalDebt_USD: number | null;
      totalDebt_TargetCurrency: number | null;
      perProjectNewShares: Array<{
        projectId: string;
        projectName: string;
        equityFraction: number | null;
        debtFraction: number | null;
        newShares: number | null;
        debtAmount_USD: number | null;
        reasonIfUnavailable: string | null;
      }>;
      navEqCheck?: {
        NPV_today_TargetCurrency: number | null;
        cash_t0_TargetCurrency: number | null;
        debt_t0_TargetCurrency: number | null;
        NAV_today_TargetCurrency: number | null;
        delta_NAV_minus_NPV: number | null;
      };
    };
    corporateModeledValuationTimeline?: {
      tps: number[];
      lastTp: number | null;
      rangeEndTp: number | null;
      markers: Array<{
        tp: number;
        yearLabelUsed: string | null;
        corporateTpIndexUsed: number | null;
        fcfTailSumUSD: number | null;
        value_high: number | null;
        value_low: number | null;
        value_mid_if_any: number | null;
        nullReasonIfAny: string | null;
        debug?: {
          sharesDenominatorUsed: number | null;
          sharesDenominatorType: 'shares_post_financing';
          value_low_total_TargetCurrency: number | null;
          value_high_total_TargetCurrency: number | null;
          lista2_DCF_prodStart_exCapex_TargetCurrency_used: number | null;
          lista2_NAV_prodStart_TargetCurrency_used: number | null;
        };
      }>;
    };
    corporateLista3Debug?: {
      scope?: 'corporate' | 'project';
      sourcePath?: string;
      tp_main: number | null;
      initialCapexUSD_main: number | null;
      shares_post_financing: number | null;
      series: {
        fcfUSD_total: Array<number | null>;
        capexUSD_total: Array<number | null>;
        nopatUSD_total?: Array<number | null>;
      };
      corporateNopatInputs?: {
        requiredInputs: string[];
        projectInputs: Array<{
          projectId: string;
          taxRate: number | null;
          taxRateByPeriod: Array<number | null> | null;
          sampleEbitUSD: Array<number | null>;
        }>;
        perPeriod: Array<{
          t: number;
          contributions: Array<{
            projectId: string;
            ebitUSD: number | null;
            taxRate: number | null;
            nopatContributionUSD: number | null;
          }>;
          nopatUSD_total: number | null;
        }>;
        missingInputs: Array<{
          projectId: string;
          t: number;
          missing: Array<'ebitUSD' | 'taxRate'>;
        }>;
      };
      perMetric: Record<string, {
        formula: string;
        inputs: Record<string, unknown>;
        intermediates: Record<string, unknown>;
        missingInputs: string[];
        output: {
          value: number | null;
          computedValuePreview?: number | null;
          storedValue?: number | null;
          nullReason?: string | null;
        };
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

    const firstProjectTime = typeof projects[0]?.rawJson?.time === 'object' && projects[0]?.rawJson?.time !== null
      ? (projects[0].rawJson.time as Record<string, unknown>)
      : undefined;
    const firstProjectYears = (() => {
      if (!firstProjectTime) return undefined;
      if (!Number.isInteger(firstProjectTime.masterN) || !Number.isInteger(firstProjectTime.productionStartPeriod) || !Number.isInteger(firstProjectTime.productionStartYear)) {
        return undefined;
      }
      return resolveV2TimeAxis({
        masterN: firstProjectTime.masterN as number,
        productionStartPeriod: firstProjectTime.productionStartPeriod as number,
        productionStartYear: firstProjectTime.productionStartYear as number,
      }).yearsByPeriod;
    })();
    const t0AnchorDate = Array.isArray(firstProjectYears) && Number.isFinite(firstProjectYears[0])
      ? `${firstProjectYears[0]}-12-31`
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
      masterN: number;
      productionStartPeriod: number;
      productionStartYear: number;
      yearsByPeriod: number[];
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
          const rawTime = (rawJsonRecord.time ?? null) as {
            masterN?: unknown;
            productionStartPeriod?: unknown;
            productionStartYear?: unknown;
          } | null;
          let yearsByPeriod: number[];
          let productionStartPeriod: number;
          let productionStartYear: number;
          try {
            const resolvedTime = resolveV2TimeAxis({
              masterN: rawTime?.masterN as number,
              productionStartPeriod: rawTime?.productionStartPeriod as number,
              productionStartYear: rawTime?.productionStartYear as number,
            });
            yearsByPeriod = resolvedTime.yearsByPeriod;
            productionStartPeriod = resolvedTime.productionStartPeriod;
            productionStartYear = resolvedTime.productionStartYear;
          } catch {
            throw new Error(
              `Invalid v2 time for project ${projectId}: masterN=${String(rawTime?.masterN)}, productionStartPeriod=${String(rawTime?.productionStartPeriod)}, productionStartYear=${String(rawTime?.productionStartYear)}`,
            );
          }

          projectsForBuildFunding.push({
            projectId,
            projectName: (() => {
              const meta = rawJsonRecord.meta as Record<string, unknown> | undefined;
              const fromMeta = meta && typeof meta.projectName === 'string' ? meta.projectName : null;
              return fromMeta ?? projectId;
            })(),
            masterN: yearsByPeriod.length - 1,
            productionStartPeriod,
            productionStartYear,
            yearsByPeriod,
            fdExtraShares: parsed.context.equity?.fdExtraShares ?? 0,
          });

          const from = `${yearsByPeriod[0]}-12-31`;
          const to = `${yearsByPeriod[yearsByPeriod.length - 1]}-12-31`;

          const resolved = await resolveProjectPricesToEngineInput(
            { parsed, from, to, scenario: resolverScenario, projectId, spotAnchorDateUtc },
            {},
          );

          diagnostics.warnings.push(...(resolved.diagnostics?.warnings ?? []));

          if (resolverScenario.mode !== 'spot') {
            for (const [metal, series] of Object.entries(resolved.spotPriceUSDByMetal)) {
              const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
              const missingYears = series
                .map((value, index) => (value === null ? yearsByPeriod[index] : null))
                .filter((value): value is number => typeof value === 'number');

              if (missingYears.length > 0) {
                diagnostics.warnings.push(
                  `Missing price coverage for project=${projectId} metal=${metal} priceKey=${priceKey} missingPeriods=${missingYears.length} firstMissingYear=${missingYears[0]}`,
                );
              }
            }

            const missingAuYears = resolved.aisc.auPriceUSDPerOz
              .map((value, index) => (value === null ? yearsByPeriod[index] : null))
              .filter((value): value is number => typeof value === 'number');
            if (missingAuYears.length > 0) {
              diagnostics.warnings.push(
                `Missing price coverage for project=${projectId} metal=Au priceKey=${parsed.engineInputWithoutPrices.auPriceKey} missingPeriods=${missingAuYears.length} firstMissingYear=${missingAuYears[0]}`,
              );
            }
          }

          const rawSeriesRoyalties = (rawJsonRecord.series as { royaltiesUSD?: Array<number | null> } | undefined)?.royaltiesUSD;
          const explicitRoyaltiesUSD = Array.from({ length: yearsByPeriod.length }, (_, t) => toFiniteOrNull(rawSeriesRoyalties?.[t] ?? null));

          const outPreRoyalties = computeProjectEngineFullProductionV1(resolved);
          diagnostics.warnings.push(...outPreRoyalties.nationalTake.diagnostics);
          const projectLength = yearsByPeriod.length;
          const nullSeries = new Array<number | null>(projectLength).fill(null);
          const taxRate = parsed.engineInputWithoutPrices.taxRate;
          const rawEconomics = (rawJsonRecord.economics ?? null) as Record<string, unknown> | null;
          const rawTaxRateByPeriod = Array.isArray(rawEconomics?.taxRateByPeriod)
            ? rawEconomics.taxRateByPeriod as unknown[]
            : null;
          const taxRateByPeriod = rawTaxRateByPeriod
            ? Array.from({ length: projectLength }, (_, t) => toFiniteOrNull(typeof rawTaxRateByPeriod[t] === 'number' ? rawTaxRateByPeriod[t] as number : null))
            : null;
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
            periodLabels: yearsByPeriod.map((year) => String(year)),
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
            taxRate,
            taxRateByPeriod,
            yearsByPeriod,
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
            yearsByPeriod,
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
        yearsByPeriod: aggregation.corporateYearsByPeriod,
        masterN: aggregation.corporateMasterN,
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
        const productionDate = project.yearsByPeriod[project.productionStartPeriod];
        const corporateIndex = aggregation.corporateYearsByPeriod.indexOf(productionDate);
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
      corporateYearsByPeriod: aggregation.corporateYearsByPeriod,
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
          debtAmount_USD: null,
          reasonIfUnavailable: 'project financing not computed: missing inputs project capex series',
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
          debtAmount_USD: null,
          reasonIfUnavailable: 'project financing not computed: missing inputs capexUSD build-window values',
        };
      }

      if (fxRate === null || !Number.isFinite(fxRate) || fxRate <= 0) {
        return {
          projectId: project.projectId,
          projectName: project.projectName,
          equityFraction,
          debtFraction,
          newShares: null,
          debtAmount_USD: null,
          reasonIfUnavailable: 'project financing not computed: missing inputs fx_USD_to_TargetCurrency',
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
          debtAmount_USD: null,
          reasonIfUnavailable: 'project financing not computed: missing inputs equity_raise_price_TargetCurrency_perShare',
        };
      }

      if (equityFraction === null || debtFraction === null) {
        return {
          projectId: project.projectId,
          projectName: project.projectName,
          equityFraction,
          debtFraction,
          newShares: null,
          debtAmount_USD: null,
          reasonIfUnavailable: 'project financing not computed: missing inputs equity_fraction or debt_fraction',
        };
      }

      let negativeCapexSumProject = 0;
      let positiveCapexSumProject = 0;
      for (const capexValue of capexBeforeProduction) {
        if (typeof capexValue !== 'number' || !Number.isFinite(capexValue)) {
          continue;
        }
        if (capexValue < 0) {
          negativeCapexSumProject += capexValue;
        }
        if (capexValue > 0) {
          positiveCapexSumProject += capexValue;
        }
      }

      const projectCapexToFinance_USD = Math.abs(negativeCapexSumProject) > 0
        ? Math.abs(negativeCapexSumProject)
        : positiveCapexSumProject > 0
          ? positiveCapexSumProject
          : 0;
      const equityAmount_USD = projectCapexToFinance_USD * equityFraction;
      const debtAmount_USD = projectCapexToFinance_USD * debtFraction;
      const equityNeedTarget = equityAmount_USD * fxRate;
      return {
        projectId: project.projectId,
        projectName: project.projectName,
        equityFraction,
        debtFraction,
        newShares: equityNeedTarget / raisePrice,
        debtAmount_USD,
        reasonIfUnavailable: null,
      };
    });

    const hasUnavailableProjectShares = perProjectNewShares.some((project) => project.newShares === null);
    const totalNewShares = hasUnavailableProjectShares
      ? null
      : perProjectNewShares.reduce((sum: number, project) => sum + (project.newShares as number), 0);
    const hasUnavailableProjectDebt = perProjectNewShares.some((project) => project.debtAmount_USD === null);
    const totalDebt_USD = hasUnavailableProjectDebt
      ? null
      : perProjectNewShares.reduce((sum: number, project) => sum + (project.debtAmount_USD as number), 0);
    const totalDebt_TargetCurrency =
      totalDebt_USD !== null
      && fxRate !== null
      && Number.isFinite(fxRate)
      && fxRate > 0
        ? totalDebt_USD * fxRate
        : null;

    const sharesPostFinancingAggregated =
      typeof marketInput.shares_current === 'number'
      && Number.isFinite(marketInput.shares_current)
      && marketInput.shares_current > 0
      && totalNewShares !== null
        ? marketInput.shares_current + totalNewShares
        : null;

    const debtPreTarget = input.balanceSheet?.debt_t0_TargetCurrency ?? null;
    const debtPostTarget =
      typeof debtPreTarget === 'number'
      && Number.isFinite(debtPreTarget)
      && totalDebt_TargetCurrency !== null
        ? debtPreTarget + totalDebt_TargetCurrency
        : financingEffective.debt_t0_post_TargetCurrency;
    const navTodayTarget =
      financingEffective.NPV_today_TargetCurrency === null
      || financingEffective.cash_t0_post_TargetCurrency === null
      || debtPostTarget === null
        ? null
        : financingEffective.NPV_today_TargetCurrency + (financingEffective.cash_t0_post_TargetCurrency - debtPostTarget);

    const sharesPostFinancingForSnapshot = sharesPostFinancingAggregated ?? financingEffective.shares_post_financing;
    const shares_post_financing_fd_effective =
      typeof sharesPostFinancingForSnapshot === 'number'
      && Number.isFinite(sharesPostFinancingForSnapshot)
      && sharesPostFinancingForSnapshot > 0
        ? sharesPostFinancingForSnapshot + totalFdExtraShares
        : null;

    const financingSnapshot = {
      ...financingEffective,
      new_debt_TargetCurrency: totalDebt_TargetCurrency ?? financingEffective.new_debt_TargetCurrency,
      debt_t0_post_TargetCurrency: debtPostTarget,
      debt_TargetCurrency_t0: debtPostTarget,
      NAV_today_TargetCurrency: navTodayTarget,
      navToday_TargetCurrency: navTodayTarget,
      netCash_TargetCurrency_t0:
        financingEffective.cash_t0_post_TargetCurrency === null || debtPostTarget === null
          ? financingEffective.netCash_TargetCurrency_t0
          : financingEffective.cash_t0_post_TargetCurrency - debtPostTarget,
      evAdditive_Component_TargetCurrency_t0:
        financingEffective.cash_t0_post_TargetCurrency === null || debtPostTarget === null
          ? financingEffective.evAdditive_Component_TargetCurrency_t0
          : debtPostTarget - financingEffective.cash_t0_post_TargetCurrency,
      shares_post_financing: sharesPostFinancingForSnapshot,
    };

    if (debug) {
      diagnostics.meta.corporateFinancingDebug = {
        shares_current: marketInput.shares_current,
        shares_post_financing: sharesPostFinancingForSnapshot,
        totalNewShares,
        totalDebt_USD,
        totalDebt_TargetCurrency,
        perProjectNewShares,
        navEqCheck: {
          NPV_today_TargetCurrency: financingSnapshot.NPV_today_TargetCurrency,
          cash_t0_TargetCurrency: financingSnapshot.cash_t0_post_TargetCurrency,
          debt_t0_TargetCurrency: financingSnapshot.debt_t0_post_TargetCurrency,
          NAV_today_TargetCurrency: financingSnapshot.NAV_today_TargetCurrency,
          delta_NAV_minus_NPV:
            financingSnapshot.NAV_today_TargetCurrency === null || financingSnapshot.NPV_today_TargetCurrency === null
              ? null
              : financingSnapshot.NAV_today_TargetCurrency - financingSnapshot.NPV_today_TargetCurrency,
        },
      };
    }

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
        capexUSD_total: aggregationEffective.capexUSD_total,
        masterN: aggregationEffective.corporateMasterN,
        productionStartPeriod: tpEff,
        discountRate: input.discountRate,
        shares_post_financing: shares_post_financing_fd_effective,
        fx_USD_to_TargetCurrency: fxRate,
        npvToday_USD: aggregationEffective.NPV_today_USD,
        netCash_t0_post_TargetCurrency: financingSnapshot.netCash_TargetCurrency_t0,
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

    const milestoneYears = [...new Set(
      projectsForBuildFunding
        .filter((project) => project.productionStartPeriod > 0)
        .map((project) => project.productionStartYear)
        .filter((year): year is number => Number.isInteger(year)),
    )].sort((a, b) => a - b);

    const milestoneTpByYear = Object.fromEntries(
      milestoneYears.map((year) => [year, aggregationEffective.corporateYearsByPeriod.indexOf(year)]),
    ) as Record<number, number>;

    const milestonePairs = milestoneYears
      .map((year) => ({ year, tp: milestoneTpByYear[year] }))
      .filter(({ tp }) => Number.isInteger(tp) && tp >= 0 && tp <= aggregationEffective.corporateMasterN);

    const tp_main = milestonePairs.length > 0 ? milestonePairs[0].tp : null;
    const initialCapexUSD_main = tp_main === null
      ? null
      : sumStrict(aggregationEffective.capexUSD_total.slice(0, tp_main));

    const corporateNopatRequiredInputs = ['ebitUSD', 'taxRate'];
    const corporateNopatProjectInputs = projectSeriesContexts.map((entry) => ({
      projectId: entry.projectId,
      taxRate: entry.taxRate,
      taxRateByPeriod: entry.taxRateByPeriod,
      sampleEbitUSD: entry.economics.ebitUSD.slice(0, Math.min(7, aggregationEffective.corporateMasterN + 1)),
    }));
    const corporateNopatMissingInputs: Array<{ projectId: string; t: number; missing: Array<'ebitUSD' | 'taxRate'> }> = [];
    const corporateNopatPerPeriod: Array<{
      t: number;
      contributions: Array<{ projectId: string; ebitUSD: number | null; taxRate: number | null; nopatContributionUSD: number | null }>;
      nopatUSD_total: number | null;
    }> = [];
    const corporateNopatUSDTotal: Array<number | null> = [];

    for (let t = 0; t <= aggregationEffective.corporateMasterN; t += 1) {
      let periodHasMissing = false;
      let periodSum = 0;
      const contributions: Array<{ projectId: string; ebitUSD: number | null; taxRate: number | null; nopatContributionUSD: number | null }> = [];
      for (const entry of projectSeriesContexts) {
        const projectIndex = entry.yearsByPeriod.indexOf(aggregationEffective.corporateYearsByPeriod[t]);
        const ebitValue = projectIndex >= 0 ? toFiniteOrNull(entry.economics.ebitUSD[projectIndex]) : null;
        const taxRateAtT = projectIndex >= 0
          ? (Array.isArray(entry.taxRateByPeriod)
              ? toFiniteOrNull(entry.taxRateByPeriod[projectIndex])
              : toFiniteOrNull(entry.taxRate))
          : null;
        const missing: Array<'ebitUSD' | 'taxRate'> = [];
        if (ebitValue === null) missing.push('ebitUSD');
        if (taxRateAtT === null) missing.push('taxRate');
        const nopatContributionUSD = missing.length > 0
          ? null
          : (ebitValue as number) * (1 - (taxRateAtT as number));
        contributions.push({
          projectId: entry.projectId,
          ebitUSD: ebitValue,
          taxRate: taxRateAtT,
          nopatContributionUSD,
        });
        if (missing.length > 0) {
          periodHasMissing = true;
          corporateNopatMissingInputs.push({ projectId: entry.projectId, t, missing });
        } else {
          periodSum += nopatContributionUSD as number;
        }
      }
      const nopatAtT = periodHasMissing ? null : periodSum;
      corporateNopatUSDTotal.push(nopatAtT);
      corporateNopatPerPeriod.push({ t, contributions, nopatUSD_total: nopatAtT });
    }

    const computeAvgNopatRoic = (): { value: number | null; nullReason: string | null } => {
      const capexAbs = Number.isFinite(initialCapexUSD_main) ? Math.abs(initialCapexUSD_main as number) : null;
      if (capexAbs === null || capexAbs <= 0) {
        return { value: null, nullReason: 'domain rule: |Initial_CAPEX_USD| must be > 0' };
      }
      if (tp_main === null || tp_main < 0 || tp_main > aggregationEffective.corporateMasterN) {
        return { value: null, nullReason: 'domain rule: tp_main invalid for [tp..masterN] window' };
      }
      const range = corporateNopatUSDTotal.slice(tp_main, aggregationEffective.corporateMasterN + 1);
      if (range.some((value) => value === null)) {
        return { value: null, nullReason: 'domain rule: nopatUSD_total strict null in [tp..masterN]' };
      }
      const finiteValues = range.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (finiteValues.length < 1) {
        return { value: null, nullReason: 'domain rule: no finite nopatUSD_total in [tp..masterN]' };
      }
      const avgNopat = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
      return { value: avgNopat / capexAbs, nullReason: null };
    };

    const avgNopatRoic = computeAvgNopatRoic();

    const corporateLista3Result = computeLista3({
      masterN: aggregationEffective.corporateMasterN,
      tp: tp_main,
      fcfUSD: aggregationEffective.fcffUSD_total,
      initialCapexUSD: initialCapexUSD_main,
      strictRoi10Y: true,
      roiAsRatio: true,
      paybackRealUseInitialCapex: true,
      paybackApproxAsRatio: true,
    }, { debug: true });
    const discountFactors_toToday = Array.from(
      { length: aggregationEffective.corporateMasterN + 1 },
      (_, t) => 1 / ((1 + input.discountRate) ** t),
    );

    const computeAiscLom = (): { value: number | null; nullReason: string | null } => {
      if (tp_main === null || tp_main > aggregationEffective.corporateMasterN) {
        return { value: null, nullReason: 'domain rule: tp_main invalid for production window' };
      }
      const sustainingVsPayable = sumWherePayablePositive({
        payableAuEqOz: aggregationEffective.payableAuEqOz_total,
        sourceUSD: aggregationEffective.sustainingCostUSD_total,
        tp: tp_main,
        masterN: aggregationEffective.corporateMasterN,
      });
      if (sustainingVsPayable === null) {
        return { value: null, nullReason: 'domain rule: sustainingCostUSD missing where payableAuEqOz>0' };
      }
      if (sustainingVsPayable.sumPayable <= 0) {
        return { value: null, nullReason: 'domain rule: ΣpayableAuEqOz==0 for t>=tp' };
      }
      return { value: sustainingVsPayable.sumSource / sustainingVsPayable.sumPayable, nullReason: null };
    };

    const computeBreakEven = (): { value: number | null; nullReason: string | null } => {
      const aisc = computeAiscLom();
      if (aisc.value === null || tp_main === null) {
        return { value: null, nullReason: aisc.nullReason };
      }
      const capexTotal = sumStrict(aggregationEffective.capexUSD_total.slice(0, aggregationEffective.corporateMasterN + 1));
      if (capexTotal === null) {
        return { value: null, nullReason: 'domain rule: capexUSD_total contains non-finite values' };
      }
      const sustainingVsPayable = sumWherePayablePositive({
        payableAuEqOz: aggregationEffective.payableAuEqOz_total,
        sourceUSD: aggregationEffective.sustainingCostUSD_total,
        tp: tp_main,
        masterN: aggregationEffective.corporateMasterN,
      });
      if (sustainingVsPayable === null || sustainingVsPayable.sumPayable <= 0) {
        return { value: null, nullReason: 'domain rule: ΣpayableAuEqOz==0 for t>=tp' };
      }
      return {
        value: (capexTotal + sustainingVsPayable.sumSource) / sustainingVsPayable.sumPayable,
        nullReason: null,
      };
    };

    const computeCapexPerAnnual = (): { value: number | null; nullReason: string | null } => {
      if (tp_main === null || tp_main > aggregationEffective.corporateMasterN) {
        return { value: null, nullReason: 'domain rule: tp_main invalid for production window' };
      }
      if (!Number.isFinite(initialCapexUSD_main)) {
        return { value: null, nullReason: 'domain rule: Initial_CAPEX_USD missing' };
      }
      let sumPayable = 0;
      let lom = 0;
      for (let t = tp_main; t <= aggregationEffective.corporateMasterN; t += 1) {
        const payable = toFiniteOrNull(aggregationEffective.payableAuEqOz_total[t]);
        if (payable === null || payable <= 0) continue;
        sumPayable += payable;
        lom += 1;
      }
      if (lom <= 0) return { value: null, nullReason: 'domain rule: LOM==0 (no payableAuEqOz>0 for t>=tp)' };
      const annualAuEq = sumPayable / lom;
      const ratio = safeRatio(Math.abs(initialCapexUSD_main as number), annualAuEq);
      return ratio === null
        ? { value: null, nullReason: 'domain rule: annual AuEq denominator is 0' }
        : { value: ratio, nullReason: null };
    };

    const computeAvgEbitRoce = (): { value: number | null; nullReason: string | null } => {
      if (tp_main === null || tp_main > aggregationEffective.corporateMasterN) {
        return { value: null, nullReason: 'domain rule: tp_main invalid for production window' };
      }
      if (!Number.isFinite(initialCapexUSD_main)) {
        return { value: null, nullReason: 'domain rule: Initial_CAPEX_USD missing' };
      }
      const ebitFinite: number[] = [];
      for (let t = tp_main; t <= aggregationEffective.corporateMasterN; t += 1) {
        const ebit = toFiniteOrNull(snapshotSeries.ebitUSD[t]);
        if (ebit !== null) ebitFinite.push(ebit);
      }
      if (ebitFinite.length < 1) {
        return { value: null, nullReason: 'domain rule: missing finite EBIT in tp..masterN' };
      }
      const avgEbit = ebitFinite.reduce((sum, value) => sum + value, 0) / ebitFinite.length;
      const ratio = safeRatio(avgEbit, Math.abs(initialCapexUSD_main as number));
      return ratio === null
        ? { value: null, nullReason: 'domain rule: Initial_CAPEX_USD denominator is 0' }
        : { value: ratio, nullReason: null };
    };

    const computeDiscountedEbitRoce = (): { value: number | null; nullReason: string | null } => {
      if (tp_main === null || tp_main > aggregationEffective.corporateMasterN) {
        return { value: null, nullReason: 'domain rule: tp_main invalid for production window' };
      }
      if (!Number.isFinite(initialCapexUSD_main)) {
        return { value: null, nullReason: 'domain rule: Initial_CAPEX_USD missing' };
      }
      let discountedSum = 0;
      let count = 0;
      for (let t = tp_main; t <= aggregationEffective.corporateMasterN; t += 1) {
        const ebit = toFiniteOrNull(snapshotSeries.ebitUSD[t]);
        const df = toFiniteOrNull(discountFactors_toToday[t]);
        if (ebit === null || df === null) continue;
        discountedSum += ebit * df;
        count += 1;
      }
      if (count < 1) {
        return { value: null, nullReason: 'domain rule: missing finite EBIT*discountFactor in tp..masterN' };
      }
      const ratio = safeRatio(discountedSum, Math.abs(initialCapexUSD_main as number));
      return ratio === null
        ? { value: null, nullReason: 'domain rule: Initial_CAPEX_USD denominator is 0' }
        : { value: ratio, nullReason: null };
    };

    const computeKapitalavkastningMetrics = (): {
      kapitalavkastningLom: number | null;
      kapitalavkastningPerYear: number | null;
      nullReason: string | null;
      intermediates: {
        capex0: number | null;
        fcf_sum_LOM: number | null;
        LOM_periods: number | null;
      };
      inputsUsed: {
        tp_main: number | null;
        masterN: number;
        initialCapexUSD_main: number | null;
        fcf_slice_summary: {
          rangeStart: number | null;
          rangeEnd: number;
          finiteCount: number;
          finiteSum: number | null;
        };
      };
    } => {
      const capex0Raw = Number.isFinite(initialCapexUSD_main) ? Math.abs(initialCapexUSD_main as number) : null;
      const capex0 = typeof capex0Raw === 'number' && capex0Raw > 0 ? capex0Raw : null;
      const baseInputs = {
        tp_main,
        masterN: aggregationEffective.corporateMasterN,
        initialCapexUSD_main,
      };
      if (capex0 === null) {
        return {
          kapitalavkastningLom: null,
          kapitalavkastningPerYear: null,
          nullReason: 'domain rule: |Initial_CAPEX_USD| must be > 0',
          intermediates: { capex0, fcf_sum_LOM: null, LOM_periods: null },
          inputsUsed: {
            ...baseInputs,
            fcf_slice_summary: {
              rangeStart: tp_main,
              rangeEnd: aggregationEffective.corporateMasterN,
              finiteCount: 0,
              finiteSum: null,
            },
          },
        };
      }
      if (tp_main === null || tp_main < 0 || tp_main > aggregationEffective.corporateMasterN) {
        return {
          kapitalavkastningLom: null,
          kapitalavkastningPerYear: null,
          nullReason: 'domain rule: tp_main invalid for [tp..masterN] window',
          intermediates: { capex0, fcf_sum_LOM: null, LOM_periods: null },
          inputsUsed: {
            ...baseInputs,
            fcf_slice_summary: {
              rangeStart: tp_main,
              rangeEnd: aggregationEffective.corporateMasterN,
              finiteCount: 0,
              finiteSum: null,
            },
          },
        };
      }

      let fcfSumLom = 0;
      let lomPeriods = 0;
      for (let t = tp_main; t <= aggregationEffective.corporateMasterN; t += 1) {
        const fcf = toFiniteOrNull(aggregationEffective.fcffUSD_total[t]);
        if (fcf === null) continue;
        fcfSumLom += fcf;
        lomPeriods += 1;
      }
      if (lomPeriods < 1) {
        return {
          kapitalavkastningLom: null,
          kapitalavkastningPerYear: null,
          nullReason: 'domain rule: no finite FCFF values in [tp..masterN]',
          intermediates: { capex0, fcf_sum_LOM: null, LOM_periods: 0 },
          inputsUsed: {
            ...baseInputs,
            fcf_slice_summary: {
              rangeStart: tp_main,
              rangeEnd: aggregationEffective.corporateMasterN,
              finiteCount: 0,
              finiteSum: null,
            },
          },
        };
      }

      const kapitalavkastningLom = fcfSumLom / capex0;
      return {
        kapitalavkastningLom,
        kapitalavkastningPerYear: kapitalavkastningLom / lomPeriods,
        nullReason: null,
        intermediates: {
          capex0,
          fcf_sum_LOM: fcfSumLom,
          LOM_periods: lomPeriods,
        },
        inputsUsed: {
          ...baseInputs,
          fcf_slice_summary: {
            rangeStart: tp_main,
            rangeEnd: aggregationEffective.corporateMasterN,
            finiteCount: lomPeriods,
            finiteSum: fcfSumLom,
          },
        },
      };
    };

    const kapitalavkastningMetrics = computeKapitalavkastningMetrics();

    const additionalLista3ByMetric = {
      AISC_LOM: computeAiscLom(),
      BreakEven_AuEq: computeBreakEven(),
      CAPEX_per_Annual_AuEq: computeCapexPerAnnual(),
      LOM_avg_EBIT_ROCE: computeAvgEbitRoce(),
      LOM_discounted_EBIT_ROCE: computeDiscountedEbitRoce(),
    };

    const corporateLista3 = {
      ...corporateLista3Result.metrics,
      AISC_LOM: additionalLista3ByMetric.AISC_LOM.value,
      BreakEven_AuEq: additionalLista3ByMetric.BreakEven_AuEq.value,
      CAPEX_per_Annual_AuEq: additionalLista3ByMetric.CAPEX_per_Annual_AuEq.value,
      LOM_avg_EBIT_ROCE: additionalLista3ByMetric.LOM_avg_EBIT_ROCE.value,
      LOM_discounted_EBIT_ROCE: additionalLista3ByMetric.LOM_discounted_EBIT_ROCE.value,
      Corporate_ROIC: null,
      LOM_avg_NOPAT_ROIC: avgNopatRoic.value,
      Kapitalavkastning_LOM: kapitalavkastningMetrics.kapitalavkastningLom,
      Kapitalavkastning_per_Year: kapitalavkastningMetrics.kapitalavkastningPerYear,
    };

    const corporateLista3Debug = {
      ...corporateLista3Result.debug,
      scope: 'corporate' as const,
      sourcePath: 'snapshot.corporate.lista3Metrics',
      shares_post_financing: shares_post_financing_fd_effective,
      series: {
        ...corporateLista3Result.debug.series,
        capexUSD_total: aggregationEffective.capexUSD_total.slice(0, Math.max(0, aggregationEffective.corporateMasterN + 1)),
        nopatUSD_total: corporateNopatUSDTotal.slice(0, Math.max(0, aggregationEffective.corporateMasterN + 1)),
      },
      corporateNopatInputs: {
        requiredInputs: corporateNopatRequiredInputs,
        projectInputs: corporateNopatProjectInputs,
        perPeriod: corporateNopatPerPeriod,
        missingInputs: corporateNopatMissingInputs,
      },
    };
    corporateLista3Debug.perMetric.Payback_approx.output.value = corporateLista3.Payback_approx_years;
    corporateLista3Debug.perMetric.Payback_real.output.value = corporateLista3.Payback_real_years;
    corporateLista3Debug.perMetric.ROI_10Y.output.value = corporateLista3.ROI_10Y_pct;
    corporateLista3Debug.perMetric.IRR.output.value = corporateLista3.IRR;
    corporateLista3Debug.perMetric.Payback_real.inputs.initialCapexUSD_main_passed = initialCapexUSD_main;
    corporateLista3Debug.perMetric.Payback_real.intermediates.investmentAbs_used = initialCapexUSD_main === null
      ? null
      : Math.abs(initialCapexUSD_main);

    const hasRequiredInputValue = (value: unknown): boolean => {
      if (Array.isArray(value)) {
        if (value.length < 1) return false;
        const finiteCount = value.filter((item) => typeof item === 'number' && Number.isFinite(item)).length;
        return finiteCount > 0;
      }
      return typeof value === 'number' && Number.isFinite(value);
    };

    const perMetric = corporateLista3Debug.perMetric as Record<string, {
      formula: string;
      requiredInputs?: string[];
      inputs: Record<string, unknown>;
      intermediates: Record<string, unknown>;
      missingInputs: string[];
      output: {
        value: number | null;
        computedValuePreview?: number | null;
        storedValue?: number | null;
        nullReason?: string | null;
      };
    } | undefined>;

    const ensureMetricPayload = (metricKey: string) => {
      if (!perMetric[metricKey]) {
        perMetric[metricKey] = {
          formula: 'n/a',
          inputs: {},
          intermediates: {},
          missingInputs: [],
          output: { value: null },
        };
      }
      return perMetric[metricKey] as {
        formula: string;
        requiredInputs?: string[];
        inputs: Record<string, unknown>;
        intermediates: Record<string, unknown>;
        missingInputs: string[];
        output: {
          value: number | null;
          computedValuePreview?: number | null;
          storedValue?: number | null;
          nullReason?: string | null;
        };
      };
    };

    const metricRequirements: Record<string, string[]> = {
      AISC_LOM: ['sustainingCostUSD_total', 'payableAuEqOz_total', 'tp_main'],
      BreakEven_AuEq: ['capexUSD_total', 'sustainingCostUSD_total', 'payableAuEqOz_total', 'tp_main'],
      CAPEX_per_Annual_AuEq: ['initialCapexUSD_main', 'payableAuEqOz_total', 'tp_main', 'masterN'],
      Payback_approx: ['initialCapexUSD_main', 'fcfUSD_total', 'tp_main'],
      Payback_real: ['initialCapexUSD_main', 'fcfUSD_total', 'tp_main'],
      IRR: ['fcfUSD_total', 'masterN'],
      ROI_10Y: ['initialCapexUSD_main', 'fcfUSD_total', 'tp_main'],
      LOM_avg_EBIT_ROCE: ['ebitUSD_total', 'initialCapexUSD_main', 'tp_main'],
      LOM_discounted_EBIT_ROCE: ['ebitUSD_total', 'discountFactors_toToday', 'initialCapexUSD_main', 'tp_main'],
      Corporate_ROIC: ['nopatUSD_total', 'investedCapitalUSD_total'],
      LOM_avg_NOPAT_ROIC: ['nopatUSD_total', 'initialCapexUSD_main', 'tp_main'],
      Kapitalavkastning_LOM: ['fcfUSD_total', 'initialCapexUSD_main', 'tp_main'],
      Kapitalavkastning_per_Year: ['fcfUSD_total', 'initialCapexUSD_main', 'tp_main'],
    };

    const commonInputValues: Record<string, unknown> = {
      tp_main,
      masterN: aggregationEffective.corporateMasterN,
      initialCapexUSD_main,
      fcfUSD_total: aggregationEffective.fcffUSD_total,
      capexUSD_total: aggregationEffective.capexUSD_total,
      sustainingCostUSD_total: aggregationEffective.sustainingCostUSD_total,
      payableAuEqOz_total: aggregationEffective.payableAuEqOz_total,
      ebitUSD_total: snapshotSeries.ebitUSD,
      nopatUSD_total: corporateNopatUSDTotal,
      discountFactors_toToday: Array.from({ length: aggregationEffective.corporateMasterN + 1 }, (_, t) => 1 / ((1 + input.discountRate) ** t)),
      investedCapitalUSD_total: null,
    };

    Object.entries(metricRequirements).forEach(([metricKey, requiredInputs]) => {
      const payload = ensureMetricPayload(metricKey);
      payload.requiredInputs = requiredInputs;
      payload.inputs = {
        ...payload.inputs,
        ...Object.fromEntries(requiredInputs.map((inputKey) => [inputKey, commonInputValues[inputKey] ?? null])),
      };
      const computedMissing = requiredInputs.filter((inputKey) => !hasRequiredInputValue(commonInputValues[inputKey]));
      payload.missingInputs = [...new Set([...(Array.isArray(payload.missingInputs) ? payload.missingInputs : []), ...computedMissing])];
    });

    const kapitalLomPayload = ensureMetricPayload('Kapitalavkastning_LOM');
    kapitalLomPayload.formula = 'Σ FCFF(t=tp..masterN) / |Initial_CAPEX_USD|';
    kapitalLomPayload.inputs = {
      ...kapitalLomPayload.inputs,
      ...kapitalavkastningMetrics.inputsUsed,
    };
    kapitalLomPayload.intermediates = {
      ...kapitalLomPayload.intermediates,
      ...kapitalavkastningMetrics.intermediates,
    };

    const kapitalPerYearPayload = ensureMetricPayload('Kapitalavkastning_per_Year');
    kapitalPerYearPayload.formula = '(Σ FCFF(t=tp..masterN) / |Initial_CAPEX_USD|) / LOM_periods';
    kapitalPerYearPayload.inputs = {
      ...kapitalPerYearPayload.inputs,
      ...kapitalavkastningMetrics.inputsUsed,
    };
    kapitalPerYearPayload.intermediates = {
      ...kapitalPerYearPayload.intermediates,
      ...kapitalavkastningMetrics.intermediates,
    };

    const previewValues: Record<string, number | null> = {
      AISC_LOM: additionalLista3ByMetric.AISC_LOM.value,
      BreakEven_AuEq: additionalLista3ByMetric.BreakEven_AuEq.value,
      CAPEX_per_Annual_AuEq: additionalLista3ByMetric.CAPEX_per_Annual_AuEq.value,
      LOM_avg_EBIT_ROCE: additionalLista3ByMetric.LOM_avg_EBIT_ROCE.value,
      LOM_discounted_EBIT_ROCE: additionalLista3ByMetric.LOM_discounted_EBIT_ROCE.value,
      Corporate_ROIC: null,
      LOM_avg_NOPAT_ROIC: avgNopatRoic.value,
      Kapitalavkastning_LOM: kapitalavkastningMetrics.kapitalavkastningLom,
      Kapitalavkastning_per_Year: kapitalavkastningMetrics.kapitalavkastningPerYear,
    };

    const reasonByMetric: Record<string, string | null> = {
      AISC_LOM: additionalLista3ByMetric.AISC_LOM.nullReason,
      BreakEven_AuEq: additionalLista3ByMetric.BreakEven_AuEq.nullReason,
      CAPEX_per_Annual_AuEq: additionalLista3ByMetric.CAPEX_per_Annual_AuEq.nullReason,
      LOM_avg_EBIT_ROCE: additionalLista3ByMetric.LOM_avg_EBIT_ROCE.nullReason,
      LOM_discounted_EBIT_ROCE: additionalLista3ByMetric.LOM_discounted_EBIT_ROCE.nullReason,
      Corporate_ROIC: 'domain rule: missing required inputs',
      LOM_avg_NOPAT_ROIC: avgNopatRoic.nullReason,
      Kapitalavkastning_LOM: kapitalavkastningMetrics.nullReason,
      Kapitalavkastning_per_Year: kapitalavkastningMetrics.nullReason,
    };

    Object.keys(previewValues).forEach((metricKey) => {
      const payload = ensureMetricPayload(metricKey);
      const storedValue = (corporateLista3 as Record<string, unknown>)[metricKey];
      const finiteStoredValue = typeof storedValue === 'number' && Number.isFinite(storedValue)
        ? storedValue
        : null;
      const computedValuePreview = previewValues[metricKey];
      payload.output.computedValuePreview = computedValuePreview;
      payload.output.storedValue = finiteStoredValue;
      payload.output.value = finiteStoredValue;

      if (finiteStoredValue === null) {
        const hasKey = Object.prototype.hasOwnProperty.call(corporateLista3, metricKey);
        if (!hasKey) {
          payload.output.nullReason = 'not computed / key missing';
        } else if (computedValuePreview !== null && !Number.isFinite(computedValuePreview)) {
          payload.output.nullReason = 'NaN/Infinity guarded';
        } else {
          payload.output.nullReason = reasonByMetric[metricKey] ?? 'domain rule: metric returned null';
        }
      } else {
        payload.output.nullReason = null;
      }
    });

    diagnostics.meta.corporateLista3Debug = corporateLista3Debug;

    const snapshot = buildCorporateSnapshot({
      targetCurrency: input.targetCurrency,
      aggregation: aggregationEffective,
      financing: financingSnapshot,
      market: marketInput,
      lista2CfDcf: lista2.metrics,
      lista3aProjectEfficiency: lista3a.metrics,
      lista4TenYear: lista4,
      corporateLista3Metrics: corporateLista3,
      corporateLista3Debug,
    });

    snapshot.series = snapshotSeries;

    const corporateProdStartCapexWindowDebug = milestonePairs.map(({ year, tp }) => {
      const prevMilestoneTp = milestonePairs
        .filter((candidate) => candidate.year < year)
        .map((candidate) => candidate.tp)
        .filter((candidateTp): candidateTp is number => Number.isInteger(candidateTp) && candidateTp >= 0 && candidateTp <= tp)
        .sort((a, b) => b - a)[0] ?? 0;
      const windowYears = aggregationEffective.corporateYearsByPeriod.slice(prevMilestoneTp, tp);
      const windowCapexUSD = aggregationEffective.capexUSD_total.slice(prevMilestoneTp, tp);
      const windowCapexUSD_sum_strict = windowCapexUSD.some((value) => value === null || value === undefined || !Number.isFinite(value))
        ? null
        : (windowCapexUSD as number[]).reduce((sum, value) => sum + value, 0);
      const fx_USD_to_TargetCurrency = fxRate !== null && Number.isFinite(fxRate) ? fxRate : null;
      const windowCapexTarget_sum_strict =
        windowCapexUSD_sum_strict !== null && fx_USD_to_TargetCurrency !== null
          ? windowCapexUSD_sum_strict * fx_USD_to_TargetCurrency
          : null;
      return {
        milestoneYear: year,
        tp_prev: prevMilestoneTp,
        tp_k: tp,
        windowYears,
        windowCapexUSD,
        windowCapexUSD_sum_strict,
        fx_USD_to_TargetCurrency,
        windowCapexTarget_sum_strict,
      };
    });

    const lista2MetricsByTp = Object.fromEntries(
      milestonePairs
        .map(({ year, tp }) => {
          const capexWindowDebug = corporateProdStartCapexWindowDebug.find((entry) => entry.milestoneYear === year) ?? null;
          const prevMilestoneTp = capexWindowDebug?.tp_prev ?? 0;

          const tpMetrics = computeLista2CfDcfMetrics({
            fcfUSD_total: aggregationEffective.fcffUSD_total,
            capexUSD_total: aggregationEffective.capexUSD_total,
            masterN: aggregationEffective.corporateMasterN,
            productionStartPeriod: tp,
            initialCapexStartPeriod: prevMilestoneTp,
            discountRate: input.discountRate,
            shares_post_financing: shares_post_financing_fd_effective,
            fx_USD_to_TargetCurrency: fxRate,
            npvToday_USD: aggregationEffective.NPV_today_USD,
            netCash_t0_post_TargetCurrency: financingSnapshot.netCash_TargetCurrency_t0,
          });
          diagnostics.warnings.push(...tpMetrics.warnings);
          diagnostics.errors.push(...tpMetrics.errors);

          const dcfCheck = tpMetrics.metrics.DCF_prodStart_exCapex_TargetCurrency;
          const npvCheck = tpMetrics.metrics.NPV_prodStart_TargetCurrency;
          const navCheck = tpMetrics.metrics.NAV_prodStart_TargetCurrency;
          const initialCapexCheck = tpMetrics.metrics.InitialCAPEX_incremental_TargetCurrency;
          const netCashCheck = financingSnapshot.netCash_TargetCurrency_t0;
          if (
            dcfCheck !== null && npvCheck !== null && initialCapexCheck !== null
            && Number.isFinite(dcfCheck) && Number.isFinite(npvCheck) && Number.isFinite(initialCapexCheck)
          ) {
            const delta = (dcfCheck - npvCheck) - initialCapexCheck;
            if (Math.abs(delta) > 0.01) {
              diagnostics.warnings.push(`Corporate prod-start identity fail year=${year}: DCF-NPV-InitialCAPEX_incremental=${String(delta)}`);
            }
          }
          if (
            dcfCheck !== null && navCheck !== null && initialCapexCheck !== null && netCashCheck !== null
            && Number.isFinite(dcfCheck) && Number.isFinite(navCheck) && Number.isFinite(initialCapexCheck) && Number.isFinite(netCashCheck)
          ) {
            const delta = (dcfCheck - navCheck) - (initialCapexCheck - netCashCheck);
            if (Math.abs(delta) > 0.01) {
              diagnostics.warnings.push(`Corporate prod-start identity fail year=${year}: DCF-NAV-(InitialCAPEX_incremental-netCash0)=${String(delta)}`);
            }
          }
          return [tp, {
            DCF_prodStart_exCapex_TargetCurrency: tpMetrics.metrics.DCF_prodStart_exCapex_TargetCurrency,
            DCF_prodStart_exCapex_perShare_TargetCurrency: tpMetrics.metrics.DCF_prodStart_exCapex_perShare_TargetCurrency,
            DCF_prodStart_present_TargetCurrency: tpMetrics.metrics.DCF_prodStart_present_TargetCurrency,
            DCF_prodStart_present_perShare_TargetCurrency: tpMetrics.metrics.DCF_prodStart_present_perShare_TargetCurrency,
            NAV_prodStart_TargetCurrency: tpMetrics.metrics.NAV_prodStart_TargetCurrency,
            NAV_prodStart_perShare_TargetCurrency: tpMetrics.metrics.NAV_prodStart_perShare_TargetCurrency,
            NPV_prodStart_TargetCurrency: tpMetrics.metrics.NPV_prodStart_TargetCurrency,
            NPV_prodStart_perShare_TargetCurrency: tpMetrics.metrics.NPV_prodStart_perShare_TargetCurrency,
            InitialCAPEX_incremental_TargetCurrency: tpMetrics.metrics.InitialCAPEX_incremental_TargetCurrency,
          }];
        }),
    );

    const earliestMilestonePresentScalars = computeEarliestMilestoneDcfPresentScalars({
      milestones: milestonePairs.map(({ year, tp }) => {
        const metrics = lista2MetricsByTp[tp];
        return {
          milestoneYear: year,
          tp_k: tp,
          dcfProdStartExCapex_TargetCurrency: metrics?.DCF_prodStart_exCapex_TargetCurrency ?? null,
        };
      }),
      discountRate: input.discountRate,
      shares_post_financing: shares_post_financing_fd_effective,
    });
    snapshot.DCF_prodStart_present_TargetCurrency = earliestMilestonePresentScalars.DCF_prodStart_present_TargetCurrency;
    snapshot.DCF_prodStart_present_perShare_TargetCurrency = earliestMilestonePresentScalars.DCF_prodStart_present_perShare_TargetCurrency;

    if (!diagnostics.meta.corporateTotalsDebug) {
      diagnostics.meta.corporateTotalsDebug = {
        capexUSD_total: aggregationEffective.capexUSD_total,
        fcfUSD_total: aggregationEffective.fcffUSD_total,
      };
    }
    diagnostics.meta.corporateTotalsDebug.corporateProdStartCapexWindowDebug = corporateProdStartCapexWindowDebug;

    if (process.env.NEXT_PUBLIC_DEBUG_PRODSTART === '1') {
      console.debug('[corporate-prod-start-capex-window-debug]', corporateProdStartCapexWindowDebug);
    }

    snapshot.modeledValuationTimeline = buildCorporateModeledValuationTimeline({
      projects: milestoneYears.map((year) => ({
        productionStartPeriod: milestoneTpByYear[year],
        productionStartYear: year,
      })),
      yearsByPeriod: aggregationEffective.corporateYearsByPeriod,
      fcfUSD_total: aggregationEffective.fcffUSD_total,
      capexUSD_total: aggregationEffective.capexUSD_total,
      masterN: aggregationEffective.corporateMasterN,
      shares_post_financing: shares_post_financing_fd_effective,
      lista2MetricsByTp,
      includeDebugSanity: debug,
      diagnosticsWarnings: diagnostics.warnings,
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
