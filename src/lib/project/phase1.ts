import type { ProjectPhase1Input, ProjectPhase1Output } from './types.ts';

const CAPEX_NEGATIVE_ERROR = 'capexUSD must be non-negative spend';
const TAX_MODE_CONFLICT_ERROR = 'taxCashFlowUSD is mutually exclusive with taxRate';
const DEVELOPMENT_REVENUE_MODE_CONFLICT_ERROR = 'capitalizedDevelopmentRevenueUSD is mutually exclusive with capitalizedDevelopmentRevenueShareByPeriod';

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
  if (series == null) return new Array(expectedLength).fill(null);
  if (series.length !== expectedLength) throw new Error(`${fieldName} length must equal masterN+1`);
  return series.map((value) => toNumberOrNull(value));
}

function safeValue(series: (number | null)[], index: number): number {
  return series[index] ?? 0;
}

/**
 * Resolve the source-defined portion of metal revenue that is capitalized during
 * development instead of recognized in operating EBITDA. Explicit report dollars
 * and a dynamic revenue-share proxy are deliberately mutually exclusive.
 */
export function resolveCapitalizedDevelopmentRevenueUSD(
  input: Pick<ProjectPhase1Input, 'capitalizedDevelopmentRevenueUSD' | 'capitalizedDevelopmentRevenueShareByPeriod'>,
  revenueUSD: (number | null)[],
  expectedLength: number,
): (number | null)[] {
  const hasLockedRevenue = input.capitalizedDevelopmentRevenueUSD !== undefined && input.capitalizedDevelopmentRevenueUSD !== null;
  const hasRevenueShare = input.capitalizedDevelopmentRevenueShareByPeriod !== undefined && input.capitalizedDevelopmentRevenueShareByPeriod !== null;
  if (hasLockedRevenue && hasRevenueShare) throw new Error(DEVELOPMENT_REVENUE_MODE_CONFLICT_ERROR);

  if (hasLockedRevenue) {
    return normalizeSeriesLength(input.capitalizedDevelopmentRevenueUSD, expectedLength, 'capitalizedDevelopmentRevenueUSD');
  }
  if (!hasRevenueShare) return new Array(expectedLength).fill(0);

  const shares = normalizeSeriesLength(input.capitalizedDevelopmentRevenueShareByPeriod, expectedLength, 'capitalizedDevelopmentRevenueShareByPeriod');
  return Array.from({ length: expectedLength }, (_, t) => {
    const share = shares[t];
    const revenue = revenueUSD[t];
    if (!isFiniteNumber(share) || !isFiniteNumber(revenue)) return null;
    if (share < 0 || share > 1) throw new Error(`capitalizedDevelopmentRevenueShareByPeriod[${t}] must be within [0,1]`);
    return revenue * share;
  });
}

export function computeProjectPhase1(input: ProjectPhase1Input): ProjectPhase1Output {
  const length = input.masterN + 1;
  if (!Number.isInteger(input.productionStartPeriod)) throw new Error('productionStartPeriod must be an integer');

  const taxRate = input.taxRate ?? null;
  if (taxRate !== null && !isFiniteNumber(taxRate)) throw new Error('taxRate must be finite');
  if (taxRate !== null && (taxRate < 0 || taxRate > 0.6)) throw new Error('taxRate must be between 0 and 0.6');

  const hasExplicitTaxCashFlow = input.taxCashFlowUSD !== undefined && input.taxCashFlowUSD !== null;
  if (hasExplicitTaxCashFlow && taxRate !== null) throw new Error(TAX_MODE_CONFLICT_ERROR);
  const hasTerminalProceeds = input.terminalProceedsUSD !== undefined && input.terminalProceedsUSD !== null;

  const revenueUSD = normalizeSeriesLength(input.revenueUSD, length, 'revenueUSD');
  const capitalizedDevelopmentRevenueUSD = resolveCapitalizedDevelopmentRevenueUSD(input, revenueUSD, length);
  const capitalizedDevelopmentCostsUSD = input.capitalizedDevelopmentCostsUSD == null
    ? new Array<number | null>(length).fill(0)
    : normalizeSeriesLength(input.capitalizedDevelopmentCostsUSD, length, 'capitalizedDevelopmentCostsUSD');
  const operatingCostsUSD = normalizeSeriesLength(input.operatingCostsUSD, length, 'operatingCostsUSD');
  const sellingCostsUSD = normalizeSeriesLength(input.sellingCostsUSD, length, 'sellingCostsUSD');
  const sustainingCapexUSD = normalizeSeriesLength(input.sustainingCapexUSD, length, 'sustainingCapexUSD');
  const siteGandA_USD = normalizeSeriesLength(input.siteGandA_USD, length, 'siteGandA_USD');
  const royaltiesUSD = normalizeSeriesLength(input.royaltiesUSD, length, 'royaltiesUSD');
  const reclamationUSD = normalizeSeriesLength(input.reclamationUSD, length, 'reclamationUSD');
  const capexUSD = normalizeSeriesLength(input.capexUSD, length, 'capexUSD');
  const byproductCreditsUSD = normalizeSeriesLength(input.byproductCreditsUSD, length, 'byproductCreditsUSD');
  const depreciationUSD = normalizeSeriesLength(input.depreciationUSD, length, 'depreciationUSD');
  const workingCapitalDeltaUSD = normalizeSeriesLength(input.workingCapitalDeltaUSD, length, 'workingCapitalDeltaUSD');
  const preTaxChargesUSD = normalizeSeriesLength(input.preTaxChargesUSD, length, 'preTaxChargesUSD');
  const postTaxChargesUSD = normalizeSeriesLength(input.postTaxChargesUSD, length, 'postTaxChargesUSD');
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
  const sellingCostsUSD_effective: (number | null)[] = new Array(length).fill(0);
  const preTaxChargesUSD_effective: (number | null)[] = new Array(length).fill(0);
  const postTaxChargesUSD_effective: (number | null)[] = new Array(length).fill(0);
  const taxLossCarryforwardUSD_effective: (number | null)[] = new Array(length).fill(0);
  const operatingRevenueUSD_effective: (number | null)[] = new Array(length).fill(0);
  const capitalizedDevelopmentRevenueUSD_effective: (number | null)[] = new Array(length).fill(0);
  const capitalizedDevelopmentCostsUSD_effective: (number | null)[] = new Array(length).fill(0);
  const terminalProceedsUSD_effective: (number | null)[] = new Array(length).fill(0);
  let taxLossCarryforward = 0;

  for (let t = 0; t < length; t += 1) {
    const r = safeValue(revenueUSD, t);
    const capitalizedRevenue = safeValue(capitalizedDevelopmentRevenueUSD, t);
    const capitalizedCosts = safeValue(capitalizedDevelopmentCostsUSD, t);
    const operatingRevenue = r - capitalizedRevenue;
    const op = safeValue(operatingCostsUSD, t);
    const sell = safeValue(sellingCostsUSD, t);
    const sc = safeValue(sustainingCapexUSD, t);
    const ga = safeValue(siteGandA_USD, t);
    const roy = safeValue(royaltiesUSD, t);
    const rec = safeValue(reclamationUSD, t);
    const bp = safeValue(byproductCreditsUSD, t);
    const dep = safeValue(depreciationUSD, t);
    const dWC = safeValue(workingCapitalDeltaUSD, t);
    const preTaxCharge = safeValue(preTaxChargesUSD, t);
    const postTaxCharge = safeValue(postTaxChargesUSD, t);
    const terminal = hasTerminalProceeds ? terminalProceedsUSD?.[t] ?? null : 0;
    const cx = capexUSD[t];
    if (cx !== null && cx < 0) throw new Error(CAPEX_NEGATIVE_ERROR);
    if (capitalizedRevenue < 0) throw new Error(`capitalizedDevelopmentRevenueUSD[${t}] must be non-negative`);
    if (capitalizedCosts < 0) throw new Error(`capitalizedDevelopmentCostsUSD[${t}] must be non-negative`);

    workingCapitalDeltaUSD_effective[t] = dWC;
    sellingCostsUSD_effective[t] = sell;
    preTaxChargesUSD_effective[t] = preTaxCharge;
    postTaxChargesUSD_effective[t] = postTaxCharge;
    operatingRevenueUSD_effective[t] = operatingRevenue;
    capitalizedDevelopmentRevenueUSD_effective[t] = capitalizedRevenue;
    capitalizedDevelopmentCostsUSD_effective[t] = capitalizedCosts;
    terminalProceedsUSD_effective[t] = isFiniteNumber(terminal) ? terminal : null;

    const sustainingValue = op + sell + sc + ga + roy + rec - bp;
    const sustainingAdjustedOperatingEarningsValue = operatingRevenue - op - sell - sc - ga - roy - rec + bp;
    const ebitdaValue = operatingRevenue - op - sell - ga - roy - rec + bp;
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
      taxLossCarryforwardUSD_effective[t] = null;
      continue;
    }

    const ebitAtT = ebitUSD[t] as number;
    const incomeBeforeCorporateTax = ebitAtT - preTaxCharge;
    let taxableIncomeAtT = Math.max(0, incomeBeforeCorporateTax);

    if (!hasExplicitTaxCashFlow && input.taxLossCarryforward === true) {
      if (incomeBeforeCorporateTax < 0) {
        taxLossCarryforward += -incomeBeforeCorporateTax;
        taxableIncomeAtT = 0;
      } else {
        const offset = Math.min(taxLossCarryforward, incomeBeforeCorporateTax);
        taxLossCarryforward -= offset;
        taxableIncomeAtT = incomeBeforeCorporateTax - offset;
      }
    }
    taxableIncomeUSD[t] = Number.isFinite(taxableIncomeAtT) ? taxableIncomeAtT : null;
    taxLossCarryforwardUSD_effective[t] = Number.isFinite(taxLossCarryforward) ? taxLossCarryforward : null;

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
      effectiveTaxRate[t] = incomeBeforeCorporateTax > 0 && taxUSD[t] !== null
        ? (taxUSD[t] as number) / incomeBeforeCorporateTax
        : null;
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
      effectiveTaxRate[t] = incomeBeforeCorporateTax > 0 && taxUSD[t] !== null
        ? (taxUSD[t] as number) / incomeBeforeCorporateTax
        : null;
    }

    if (taxUSD[t] == null) {
      nopatUSD[t] = null;
      fcffUSD[t] = null;
      continue;
    }

    const taxAtT = taxUSD[t] as number;
    const nopatValue = incomeBeforeCorporateTax - taxAtT;
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
    // Selling costs, reclamation and sustaining CAPEX are already included in operating earnings.
    // Pre-tax fiscal charges reduce taxable income/NOPAT; post-tax charges reduce only FCFF.
    // Capitalized development revenue/costs bypass operating EBITDA/EBIT/tax and affect only FCFF.
    // Terminal proceeds are deliberately added only here so salvage/other disposal cash flows
    // cannot distort revenue, EBITDA, EBIT or the tax base.
    const fcffValue = nopatAtT + dep - cx - dWC + capitalizedRevenue - capitalizedCosts
      + (terminalProceedsUSD_effective[t] as number) - postTaxCharge;
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
    sellingCostsUSD_effective,
    preTaxChargesUSD_effective,
    postTaxChargesUSD_effective,
    taxLossCarryforwardUSD_effective,
    operatingRevenueUSD_effective,
    capitalizedDevelopmentRevenueUSD_effective,
    capitalizedDevelopmentCostsUSD_effective,
    terminalProceedsUSD_effective,
  };
}

export { CAPEX_NEGATIVE_ERROR, TAX_MODE_CONFLICT_ERROR, DEVELOPMENT_REVENUE_MODE_CONFLICT_ERROR };