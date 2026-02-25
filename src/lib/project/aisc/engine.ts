import type { ProjectAiscInput, ProjectAiscOutput } from './types.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeSeries(series: (number | null)[], expectedLength: number, name: string): (number | null)[] {
  if (series.length !== expectedLength) {
    throw new Error(`${name} length must equal masterN+1`);
  }

  return series.map((value) => (isFiniteNumber(value) ? value : null));
}

export function computeProjectAisc(input: ProjectAiscInput): ProjectAiscOutput {
  if (!Number.isInteger(input.productionStartPeriod)) {
    throw new Error('productionStartPeriod must be an integer');
  }

  const expectedLength = input.masterN + 1;
  const grossRevenueUSD = normalizeSeries(input.grossRevenueUSD, expectedLength, 'grossRevenueUSD');
  const auPriceUSDPerOz = normalizeSeries(input.auPriceUSDPerOz, expectedLength, 'auPriceUSDPerOz');
  const sustainingCostUSD = normalizeSeries(input.sustainingCostUSD, expectedLength, 'sustainingCostUSD');

  const payableAuEqOz: (number | null)[] = new Array(expectedLength).fill(null);

  for (let t = 0; t <= input.masterN; t += 1) {
    const grossRevenueAtT = grossRevenueUSD[t];
    const auPriceAtT = auPriceUSDPerOz[t];

    if (grossRevenueAtT != null && auPriceAtT != null && auPriceAtT > 0) {
      payableAuEqOz[t] = grossRevenueAtT / auPriceAtT;
    }
  }

  if (input.productionStartPeriod > input.masterN) {
    return {
      payableAuEqOz,
      lomPeriods: 0,
      aiscAuEqUSDPerOz_LOM: null,
    };
  }

  let lomPeriods = 0;
  let denominator = 0;

  for (let t = input.productionStartPeriod; t <= input.masterN; t += 1) {
    const payableAtT = payableAuEqOz[t];

    if (payableAtT != null && payableAtT > 0) {
      lomPeriods += 1;
      denominator += payableAtT;
    }
  }

  if (lomPeriods === 0 || denominator <= 0) {
    return {
      payableAuEqOz,
      lomPeriods,
      aiscAuEqUSDPerOz_LOM: null,
    };
  }

  let numerator = 0;

  for (let t = input.productionStartPeriod; t <= input.masterN; t += 1) {
    const payableAtT = payableAuEqOz[t];

    if (payableAtT == null || payableAtT <= 0) {
      continue;
    }

    const sustainingAtT = sustainingCostUSD[t];
    if (sustainingAtT == null) {
      return {
        payableAuEqOz,
        lomPeriods,
        aiscAuEqUSDPerOz_LOM: null,
      };
    }

    numerator += sustainingAtT;
  }

  return {
    payableAuEqOz,
    lomPeriods,
    aiscAuEqUSDPerOz_LOM: numerator / denominator,
  };
}
