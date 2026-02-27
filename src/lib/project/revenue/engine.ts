import { computeRevenueByMetalUSD } from './computeRevenueByMetal.ts';
import type { ProjectRevenueInput, ProjectRevenueOutput } from './types.ts';

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
  }
}

export function computeProjectRevenue(input: ProjectRevenueInput): ProjectRevenueOutput {
  const metals = validateMetals(input);
  validateSeries(input, metals);

  const computed = computeRevenueByMetalUSD({
    masterN: input.masterN,
    payableQtyByMetal: input.payableQtyByMetal,
    priceUSDByMetal: input.priceUSDByMetal,
    streamsByMetal: input.streamsByMetal,
  });

  return {
    byMetalRevenueUSD: computed.revenueByMetalUSD,
    grossRevenueUSD: computed.grossRevenueUSD,
    deliveredQtyByMetal: computed.deliveredQtyByMetal,
    streamCostToProjectUSDByMetal: computed.streamCostToProjectUSDByMetal,
  };
}
