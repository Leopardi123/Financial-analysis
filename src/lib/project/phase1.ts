import type { ProjectPhase1Input, ProjectPhase1Output } from './types.ts';

const CAPEX_NEGATIVE_ERROR = 'capexUSD must be non-negative spend';
const TAX_MODE_CONFLICT_ERROR = 'taxCashFlowUSD is mutually exclusive with taxRate';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function normalizeSeriesLength(
  series: (number | null)[] | null | undefined,
  expectedLength: number,
  fieldName: string,
): (number | null)[] {
  if (series == null) {
    return new Array(expectedLength).fill(null);
  }

  if (series.length !== expectedLength) {
    throw new Error(`${fieldName} length must equal masterN+1`);
  }

  return series.map((value) => toNumberOrNull(value));
}

function safeValue(series: (number | null)[], index: number): number {
  return series[index] ?? 0;
}

export function computeProjectPhase1(input: ProjectPhase1Input): ProjectPhase1Output {
  const length = input.masterN + 1;

  if (!Number.isInteger(input.productionStartPeriod)) {
    throw new Error('productionStartPeriod must be an integer');
  }

  const taxRate = input.taxRate ?? null;
  if (taxRate !== null && !isFiniteNumber(taxRate)) {
    throw new Error('taxRate must be finite');
  }
  if (taxRate !== null && (taxRate < 0 || taxRate > 0.6)) {
    throw new Error('taxRate must be between 0 and 0.6');
  }

  const hasExplicitTaxCashFlow = input.taxCashFlowUSD !== undefined && input.taxCashFlowUSD !== null;
  if (hasExplicitTaxCashFlow && taxRate !== null) {
    throw new Error(TAX_MODE_CONFLICT_ERROR);
  }

  const hasTerminalProceeds = input.terminalProceedsUSD !== undefined && input.terminalProceedsUSD !== null;

  const revenueUSD = normalizeSeriesLength(input.revenueUSD, length, 'revenueUSD');
  const operatingCostsUSD = normalizeSeriesLength(input.operatingCostsUSD, length, 'operatingCostsUSD');
  const sustainingCapexUSD = normalizeSeriesLength(input.sustainingCapexUSD, length, 'sustainingCapexUSD');
  const siteGandA_USD = normalizeSeriesLength(input.siteGandA_USD, length, 'siteGandA_USD');
  const royaltiesUSD = normalizeSeriesLength(input.royaltiesUSD, length, 'royaltiesUSD');
  const reclamationUSD = normalizeSeriesLength(input.reclamationUSD, length, 'reclamationUSD');
  const capexUSD = normalizeSeriesLength(input.capexUSD, length, 'capexUSD');
  const byproductCreditsUSD = normalizeSeriesLength(input.byproductCreditsUSD, length, 'byproductCreditsUSD');
  const depreciationUSD = normalizeSeriesLength(input.depreciationUSD, length, 'depreciationUSD');
  const workingCapitalDeltaUSD = normalizeSeriesLength(input.workingCapitalDeltaUSD, length, 'workingCapitalDeltaUSD');
  const taxCashFlowUSD = hasExplicitTaxCashFlow
    ? normalizeSeriesLength(input.taxCashFlowUSD, length, 'taxCashFlowUSD')
    : null;
  const terminalProceedsUSD = hasTerminalProceeds
    ? normalizeSeriesLength(input.terminalProceedsUSD, length, 'terminalProceedsUSD')
    : null;

  const sustainingCostUSD: (number | null)[] = new Array(length).fill(null);
  const sustainingAdjustedOperatingEarningsUSD: (number | null)[] = new Array(length).fill(null);
  const ebitdaUSD: (number | null)[] = new Array(length).fill(null);
  const ebitUSD: (number | null)[] = new Array(length).fill(null);
  const totalCapexUSD: (number | null)[] = new Array(length).fill(null);
  const taxableIncomeUSD: (number | null)[] = new Array(length).fill(null);
  const effectiveTaxRate: (number | null)[] = new Array(length).fill(null);
  const taxUSD: (number | null)[] = new Array(length).fill(null);
  const nopatUSD: (number | null)[] = new Array(length).fill(null);
  const fcffUSD: (number | null)[] = new Array(length).fill(null);
  const workingCapitalDeltaUSD_effective: (number | null)[] = new Array(length).fill(0);
  const terminalProceedsUSD_effective: (number | null)[] = new Array(length).fill(0);

  for (let t = 0; t < length; t += 1) {
    const r = safeValue(revenueUSD, t);
    const op = safeValue(operatingCostsUSD, t);
    const sc = safeValue(sustainingCapexUSD, t);
    const ga = safeValue(siteGandA_USD, t);
    const roy = safeValue(royaltiesUSD, t);
    const rec = safeValue(reclamationUSD, t);
    const bp = safeValue(byproductCreditsUSD, t);
    const dep = safeValue(depreciationUSD, t);
    const dWC = safeValue(workingCapitalDeltaUSD, t);
    const terminal = hasTerminalProceeds ? terminalProceedsUSD?.[t] ?? null : 0;
    const cx = capexUSD[t];
    if (cx !== null && cx < 0) {
      throw new Error(CAPEX_NEGATIVE_ERROR);
    }
    workingCapitalDeltaUSD_effective[t] = dWC;

    if (!isFiniteNumber(terminal)) {
      terminalProceedsUSD_effective[t] = null;
    } else {
      terminalProceedsUSD_effective[t] = terminal;
    }

    const sustainingValue = op + sc + ga + roy + rec - bp;
    const sustainingAdjustedOperatingEarningsValue = r - op - sc - ga - roy - rec + bp;
    const ebitdaValue = r - op - ga - roy - rec + bp;
    const ebitValue = sustainingAdjustedOperatingEarningsValue - dep;

    sustainingCostUSD[t] = Number.isFinite(sustainingValue) ? sustainingValue : null;
    sustainingAdjustedOperatingEarningsUSD[t] = Number.isFinite(sustainingAdjustedOperatingEarningsValue)
      ? sustainingAdjustedOperatingEarningsValue
      : null;
    ebitdaUSD[t] = Number.isFinite(ebitdaValue) ? ebitdaValue : null;
    ebitUSD[t] = Number.isFinite(ebitValue) ? ebitValue : null;

    if (ebitUSD[t] == null) {
      taxableIncomeUSD[t] = null;
      effectiveTaxRate[t] = null;
      taxUSD[t] = null;
      nopatUSD[t] = null;
      fcffUSD[t] = null;
      continue;
    }

    const ebitAtT = ebitUSD[t] as number;
    const taxableIncomeAtT = Math.max(0, ebitAtT);
    taxableIncomeUSD[t] = Number.isFinite(taxableIncomeAtT) ? taxableIncomeAtT : null;

    if (hasExplicitTaxCashFlow) {
      const explicitTaxCashFlowAtT = taxCashFlowUSD?.[t] ?? null;
      if (!isFiniteNumber(explicitTaxCashFlowAtT)) {
        effectiveTaxRate[t] = null;
        taxUSD[t] = null;
        nopatUSD[t] = null;
        fcffUSD[t] = null;
        continue;
      }
      const taxValue = -explicitTaxCashFlowAtT;
      taxUSD[t] = Number.isFinite(taxValue) ? taxValue : null;
      effectiveTaxRate[t] = ebitAtT > 0 && taxUSD[t] !== null ? (taxUSD[t] as number) / ebitAtT : null;
    } else {
      if (taxRate === null || taxableIncomeUSD[t] === null) {
        effectiveTaxRate[t] = null;
        taxUSD[t] = null;
        nopatUSD[t] = null;
        fcffUSD[t] = null;
        continue;
      }

      const taxValue = (taxableIncomeUSD[t] as number) * taxRate;
      taxUSD[t] = Number.isFinite(taxValue) ? taxValue : null;
      effectiveTaxRate[t] = ebitAtT > 0 && taxUSD[t] !== null ? (taxUSD[t] as number) / ebitAtT : null;
    }

    if (taxUSD[t] == null) {
      nopatUSD[t] = null;
      fcffUSD[t] = null;
      continue;
    }

    const taxAtT = taxUSD[t] as number;
    const nopatValue = ebitAtT - taxAtT;
    nopatUSD[t] = Number.isFinite(nopatValue) ? nopatValue : null;

    if (nopatUSD[t] == null) {
      totalCapexUSD[t] = null;
      fcffUSD[t] = null;
      continue;
    }

    if (cx == null) {
      totalCapexUSD[t] = null;
      fcffUSD[t] = null;
      continue;
    }

    const totalCapexValue = cx + sc;
    totalCapexUSD[t] = Number.isFinite(totalCapexValue) ? totalCapexValue : null;
    if (totalCapexUSD[t] == null || terminalProceedsUSD_effective[t] == null) {
      fcffUSD[t] = null;
      continue;
    }

    const nopatAtT = nopatUSD[t] as number;
    // Reclamation and sustaining CAPEX are already included in operating earnings.
    // Terminal proceeds are deliberately added only here so salvage/other disposal
    // cash flows cannot distort revenue, EBITDA, EBIT or the tax base.
    const fcffValue = nopatAtT + dep - cx - dWC + (terminalProceedsUSD_effective[t] as number);
    fcffUSD[t] = Number.isFinite(fcffValue) ? fcffValue : null;
  }

  return {
    sustainingCostUSD,
    sustainingAdjustedOperatingEarningsUSD,
    ebitdaUSD,
    depreciationUSD,
    totalCapexUSD,
    ebitUSD,
    taxableIncomeUSD,
    effectiveTaxRate,
    taxUSD,
    nopatUSD,
    fcffUSD,
    workingCapitalDeltaUSD_effective,
    terminalProceedsUSD_effective,
  };
}

export { CAPEX_NEGATIVE_ERROR, TAX_MODE_CONFLICT_ERROR };
