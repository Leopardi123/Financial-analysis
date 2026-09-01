import type { ProjectJsonV3CostComponent } from '../project/jsonv3/schema.ts';

export type Tier1CostAllocationTrace = {
  componentId: string;
  mode: 'MIXED_REVENUE_WEIGHTED' | 'DIRECT_TO_METAL';
  directMetal: string | null;
  allocatedCostUSDByProduct: Record<string, number[]>;
};

export type Tier1CostAllocationComputable = {
  status: 'COMPUTABLE';
  allocatedCostUSDByProduct: Record<string, number[]>;
  sourceCostUSD: number[];
  allocatedCostUSD: number[];
  trace: Tier1CostAllocationTrace[];
};

export type Tier1CostAllocationNotVerified = {
  status: 'NOT_VERIFIED';
  reason: string;
};

export type Tier1CostAllocationResult = Tier1CostAllocationComputable | Tier1CostAllocationNotVerified;

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function notVerified(reason: string): Tier1CostAllocationNotVerified {
  return { status: 'NOT_VERIFIED', reason };
}

/**
 * Allocate an explicitly selected canonical Project cost pool across products.
 *
 * This function deliberately does not choose allocation prices, build revenue,
 * decide which C1 components belong in a benchmark, or mutate Project economics.
 * The caller must provide an explicit allocation-revenue vector. Missing or
 * ambiguous component allocation metadata fails closed.
 */
export function allocateTier1CoProductCost(args: {
  components: ProjectJsonV3CostComponent[];
  allocationRevenueUSDByProduct: Record<string, Array<number | null>>;
  toleranceAbsUSD?: number;
}): Tier1CostAllocationResult {
  if (!Array.isArray(args.components) || args.components.length === 0) {
    return notVerified('Ingen canonical cost component har valts för co-product-allokering.');
  }

  const products = Object.keys(args.allocationRevenueUSDByProduct);
  if (products.length === 0) {
    return notVerified('Allocation revenue saknar produkter.');
  }

  const firstRevenue = args.allocationRevenueUSDByProduct[products[0]];
  if (!Array.isArray(firstRevenue) || firstRevenue.length === 0) {
    return notVerified(`Allocation revenue för ${products[0]} saknar periodserie.`);
  }
  const length = firstRevenue.length;

  const revenueByProduct: Record<string, number[]> = {};
  for (const product of products) {
    const series = args.allocationRevenueUSDByProduct[product];
    if (!Array.isArray(series) || series.length !== length) {
      return notVerified(`Allocation revenue för ${product} måste ha exakt ${length} perioder.`);
    }
    const normalized: number[] = [];
    for (let t = 0; t < length; t += 1) {
      const value = series[t];
      if (!finiteNonNegative(value)) {
        return notVerified(`Allocation revenue ${product}[${t}] måste vara ett ändligt icke-negativt USD-värde.`);
      }
      normalized.push(value);
    }
    revenueByProduct[product] = normalized;
  }

  const ids = new Set<string>();
  const allocatedCostUSDByProduct = Object.fromEntries(products.map((product) => [product, new Array<number>(length).fill(0)])) as Record<string, number[]>;
  const sourceCostUSD = new Array<number>(length).fill(0);
  const trace: Tier1CostAllocationTrace[] = [];

  for (const [index, component] of args.components.entries()) {
    if (!component || typeof component.id !== 'string' || !component.id.trim()) {
      return notVerified(`Cost component ${index} saknar giltigt id.`);
    }
    if (ids.has(component.id)) return notVerified(`Cost allocation innehåller duplicate component id=${component.id}.`);
    ids.add(component.id);

    if (!Array.isArray(component.seriesUSD) || component.seriesUSD.length !== length) {
      return notVerified(`Cost component ${component.id} måste ha exakt ${length} perioder.`);
    }
    const costSeries: number[] = [];
    for (let t = 0; t < length; t += 1) {
      const value = component.seriesUSD[t];
      if (!finiteNonNegative(value)) {
        return notVerified(`Cost component ${component.id}[${t}] måste vara ett ändligt icke-negativt USD-värde.`);
      }
      costSeries.push(value);
      sourceCostUSD[t] += value;
    }

    const allocation = component.allocation;
    if (!allocation) {
      return notVerified(`Cost component ${component.id} saknar explicit allocation metadata.`);
    }

    const componentAllocated = Object.fromEntries(products.map((product) => [product, new Array<number>(length).fill(0)])) as Record<string, number[]>;

    if (allocation.mode === 'DIRECT_TO_METAL') {
      if (typeof allocation.metal !== 'string' || !allocation.metal.trim()) {
        return notVerified(`Cost component ${component.id} har DIRECT_TO_METAL utan giltigt metal/product-id.`);
      }
      if (!(allocation.metal in revenueByProduct)) {
        return notVerified(`Cost component ${component.id} pekar på ${allocation.metal}, som saknas i allocation revenue vector.`);
      }
      for (let t = 0; t < length; t += 1) {
        componentAllocated[allocation.metal][t] = costSeries[t];
        allocatedCostUSDByProduct[allocation.metal][t] += costSeries[t];
      }
      trace.push({ componentId: component.id, mode: allocation.mode, directMetal: allocation.metal, allocatedCostUSDByProduct: componentAllocated });
      continue;
    }

    if (allocation.mode !== 'MIXED_REVENUE_WEIGHTED') {
      return notVerified(`Cost component ${component.id} har okänd allocation mode.`);
    }

    for (let t = 0; t < length; t += 1) {
      const mixedCost = costSeries[t];
      const totalRevenue = products.reduce((sum, product) => sum + revenueByProduct[product][t], 0);
      if (totalRevenue <= 0) {
        if (mixedCost === 0) continue;
        return notVerified(`Cost component ${component.id}[${t}] har positiv mixed cost men allocation revenue summerar till 0.`);
      }
      for (const product of products) {
        const share = revenueByProduct[product][t] / totalRevenue;
        const allocated = mixedCost * share;
        componentAllocated[product][t] = allocated;
        allocatedCostUSDByProduct[product][t] += allocated;
      }
    }
    trace.push({ componentId: component.id, mode: allocation.mode, directMetal: null, allocatedCostUSDByProduct: componentAllocated });
  }

  const allocatedCostUSD = Array.from({ length }, (_, t) => products.reduce((sum, product) => sum + allocatedCostUSDByProduct[product][t], 0));
  const tolerance = finiteNonNegative(args.toleranceAbsUSD) ? args.toleranceAbsUSD : 1e-6;
  for (let t = 0; t < length; t += 1) {
    if (Math.abs(sourceCostUSD[t] - allocatedCostUSD[t]) > tolerance) {
      return notVerified(`Allocation conservation misslyckades vid t=${t}: source=${sourceCostUSD[t]} allocated=${allocatedCostUSD[t]}.`);
    }
  }

  return {
    status: 'COMPUTABLE',
    allocatedCostUSDByProduct,
    sourceCostUSD,
    allocatedCostUSD,
    trace,
  };
}
