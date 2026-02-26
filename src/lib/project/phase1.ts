import type { ProjectPhase1Input, ProjectPhase1Output } from './types.ts';

const CAPEX_NEGATIVE_ERROR = 'capexUSD must be non-negative spend';

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

  const taxRate = input.taxRate ?? 0;
  if (!isFiniteNumber(taxRate)) {
    throw new Error('taxRate must be finite');
  }
  if (taxRate < 0 || taxRate > 0.6) {
    throw new Error('taxRate must be between 0 and 0.6');
  }

  const revenueUSD = normalizeSeriesLength(input.revenueUSD, length, 'revenueUSD');
  const operatingCostsUSD = normalizeSeriesLength(input.operatingCostsUSD, length, 'operatingCostsUSD');
  const sustainingCapexUSD = normalizeSeriesLength(input.sustainingCapexUSD, length, 'sustainingCapexUSD');
  const siteGandA_USD = normalizeSeriesLength(input.siteGandA_USD, length, 'siteGandA_USD');
  const royaltiesUSD = normalizeSeriesLength(input.royaltiesUSD, length, 'royaltiesUSD');
  const reclamationUSD = normalizeSeriesLength(input.reclamationUSD, length, 'reclamationUSD');
  const capexUSD = normalizeSeriesLength(input.capexUSD, length, 'capexUSD');
  const byproductCreditsUSD = normalizeSeriesLength(input.byproductCreditsUSD, length, 'byproductCreditsUSD');
  const workingCapitalDeltaUSD = normalizeSeriesLength(input.workingCapitalDeltaUSD, length, 'workingCapitalDeltaUSD');

  const sustainingCostUSD: (number | null)[] = new Array(length).fill(null);
  const ebitUSD: (number | null)[] = new Array(length).fill(null);
  const taxUSD: (number | null)[] = new Array(length).fill(null);
  const nopatUSD: (number | null)[] = new Array(length).fill(null);
  const fcffUSD: (number | null)[] = new Array(length).fill(null);
  const workingCapitalDeltaUSD_effective: (number | null)[] = new Array(length).fill(0);

  for (let t = 0; t < length; t += 1) {
    const r = safeValue(revenueUSD, t);
    const op = safeValue(operatingCostsUSD, t);
    const sc = safeValue(sustainingCapexUSD, t);
    const ga = safeValue(siteGandA_USD, t);
    const roy = safeValue(royaltiesUSD, t);
    const rec = safeValue(reclamationUSD, t);
    const bp = safeValue(byproductCreditsUSD, t);
    const dWC = safeValue(workingCapitalDeltaUSD, t);
    workingCapitalDeltaUSD_effective[t] = dWC;

    const sustainingValue = op + sc + ga + roy + rec - bp;
    const ebitValue = r - op - sc - ga - roy - rec + bp;

    sustainingCostUSD[t] = Number.isFinite(sustainingValue) ? sustainingValue : null;
    ebitUSD[t] = Number.isFinite(ebitValue) ? ebitValue : null;

    if (ebitUSD[t] == null) {
      taxUSD[t] = null;
      nopatUSD[t] = null;
      fcffUSD[t] = null;
      continue;
    }

    const ebitAtT = ebitUSD[t] as number;
    const taxValue = Math.max(0, ebitAtT) * taxRate;
    taxUSD[t] = Number.isFinite(taxValue) ? taxValue : null;

    if (taxUSD[t] == null) {
      nopatUSD[t] = null;
      fcffUSD[t] = null;
      continue;
    }

    const taxAtT = taxUSD[t] as number;
    const nopatValue = ebitAtT - taxAtT;
    nopatUSD[t] = Number.isFinite(nopatValue) ? nopatValue : null;

    if (nopatUSD[t] == null) {
      fcffUSD[t] = null;
      continue;
    }

    const cx = capexUSD[t];
    if (cx == null) {
      fcffUSD[t] = null;
      continue;
    }

    if (cx < 0) {
      throw new Error(CAPEX_NEGATIVE_ERROR);
    }

    const nopatAtT = nopatUSD[t] as number;
    const fcffValue = nopatAtT - cx - dWC;
    fcffUSD[t] = Number.isFinite(fcffValue) ? fcffValue : null;
  }

  return {
    sustainingCostUSD,
    ebitUSD,
    taxUSD,
    nopatUSD,
    fcffUSD,
    workingCapitalDeltaUSD_effective,
  };
}

export { CAPEX_NEGATIVE_ERROR };
