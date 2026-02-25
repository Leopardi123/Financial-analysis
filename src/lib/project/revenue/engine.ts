import type { ProjectRevenueInput, ProjectRevenueOutput } from './types.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateMetals(input: ProjectRevenueInput): string[] {
  const qtyMetals = Object.keys(input.payableQtyByMetal);
  const priceMetals = Object.keys(input.priceUSDByMetal);

  if (qtyMetals.length === 0 || priceMetals.length === 0) {
    throw new Error('At least one metal is required in both payableQtyByMetal and priceUSDByMetal');
  }

  const qtySet = new Set(qtyMetals);
  const priceSet = new Set(priceMetals);

  if (qtySet.size !== priceSet.size || qtyMetals.some((metal) => !priceSet.has(metal))) {
    throw new Error('payableQtyByMetal and priceUSDByMetal must have exactly matching metal keys');
  }

  return qtyMetals;
}

function validateSeries(input: ProjectRevenueInput, metals: string[]): void {
  const expectedLength = input.masterN + 1;

  for (const metal of metals) {
    const qtySeries = input.payableQtyByMetal[metal];
    const priceSeries = input.priceUSDByMetal[metal];

    if (qtySeries.length !== expectedLength) {
      throw new Error(`payableQtyByMetal[${metal}] length must equal masterN+1`);
    }

    if (priceSeries.length !== expectedLength) {
      throw new Error(`priceUSDByMetal[${metal}] length must equal masterN+1`);
    }

    for (let t = 0; t <= input.masterN; t += 1) {
      const qty = qtySeries[t];
      if (isFiniteNumber(qty) && qty < 0) {
        throw new Error(`payableQtyByMetal[${metal}][${t}] cannot be negative`);
      }

      const price = priceSeries[t];
      if (isFiniteNumber(price) && price < 0) {
        throw new Error(`priceUSDByMetal[${metal}][${t}] cannot be negative`);
      }
    }
  }
}

export function computeProjectRevenue(input: ProjectRevenueInput): ProjectRevenueOutput {
  const metals = validateMetals(input);
  validateSeries(input, metals);

  const byMetalRevenueUSD: Record<string, (number | null)[]> = {};
  for (const metal of metals) {
    byMetalRevenueUSD[metal] = new Array<number | null>(input.masterN + 1).fill(null);
  }

  const grossRevenueUSD = new Array<number | null>(input.masterN + 1).fill(null);

  for (let t = 0; t <= input.masterN; t += 1) {
    let gross = 0;
    let hasNull = false;

    for (const metal of metals) {
      const qty = input.payableQtyByMetal[metal][t];
      const price = input.priceUSDByMetal[metal][t];

      if (isFiniteNumber(qty) && isFiniteNumber(price)) {
        const revenue = qty * price;
        byMetalRevenueUSD[metal][t] = revenue;
        gross += revenue;
      } else {
        byMetalRevenueUSD[metal][t] = null;
        hasNull = true;
      }
    }

    grossRevenueUSD[t] = hasNull ? null : gross;
  }

  return {
    byMetalRevenueUSD,
    grossRevenueUSD,
  };
}
