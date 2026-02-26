import type { TakeItemMVI } from './types.ts';

export type TakeEngineInputs = {
  masterN: number;
  grossRevenueUSD: Array<number | null>;
  revenueByMetalUSD?: Record<string, Array<number | null>>;
  payableQtyByMetal?: Record<string, Array<number | null>>;
  takeItems: Array<TakeItemMVI>;
};

export type TakeEngineOutputs = {
  itemTakeUSDById: Record<string, Array<number | null>>;
  totalTakeUSD: Array<number | null>;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateLen(series: Array<number | null>, expected: number, name: string): void {
  if (series.length !== expected) {
    throw new Error(`${name} length must equal masterN+1`);
  }
}

function getRate(item: TakeItemMVI, base: number): number {
  if (item.rateType === 'FIXED') {
    const rate = item.rateFixed;
    if (!isFiniteNumber(rate) || rate < 0 || rate > 1) {
      throw new Error(`Invalid FIXED rate for item ${item.id}`);
    }
    return rate;
  }

  const tiers = [...(item.tiers ?? [])].sort((a, b) => a.thresholdUSD - b.thresholdUSD);
  if (tiers.length === 0) {
    throw new Error(`Missing tiers for item ${item.id}`);
  }

  let selectedRate: number | null = null;
  for (const tier of tiers) {
    if (!isFiniteNumber(tier.thresholdUSD) || tier.thresholdUSD < 0) {
      throw new Error(`Invalid tier threshold for item ${item.id}`);
    }
    if (!isFiniteNumber(tier.rate) || tier.rate < 0 || tier.rate > 1) {
      throw new Error(`Invalid tier rate for item ${item.id}`);
    }
    if (base >= tier.thresholdUSD) {
      selectedRate = tier.rate;
    }
  }

  return selectedRate ?? 0;
}

function inWindow(item: TakeItemMVI, t: number): boolean {
  const start = item.start_t ?? null;
  const end = item.end_t ?? null;
  return !((start !== null && t < start) || (end !== null && t > end));
}

function normalizeMetals(item: TakeItemMVI): string[] {
  return item.metals.length === 0 ? ['ALL'] : item.metals;
}

export function computeTakeEngine(input: TakeEngineInputs): TakeEngineOutputs {
  const expectedLen = input.masterN + 1;
  validateLen(input.grossRevenueUSD, expectedLen, 'grossRevenueUSD');

  for (const [metal, series] of Object.entries(input.revenueByMetalUSD ?? {})) {
    validateLen(series, expectedLen, `revenueByMetalUSD[${metal}]`);
  }
  for (const [metal, series] of Object.entries(input.payableQtyByMetal ?? {})) {
    validateLen(series, expectedLen, `payableQtyByMetal[${metal}]`);
  }

  const seen = new Set<string>();
  for (const item of input.takeItems) {
    if (seen.has(item.id)) {
      throw new Error(`duplicate item id: ${item.id}`);
    }
    seen.add(item.id);
    if (item.baseType === 'PAYABLE_QTY') {
      throw new Error('PAYABLE_QTY not supported without unit charge');
    }
    if (item.cap?.capType === 'payableQty') {
      throw new Error(`capType payableQty not supported for item ${item.id}`);
    }
  }

  const itemTakeUSDById: Record<string, Array<number | null>> = {};
  for (const item of input.takeItems) {
    itemTakeUSDById[item.id] = new Array(expectedLen).fill(0);
  }

  const cumulativeRevenueByItem: Record<string, number> = {};

  for (const item of input.takeItems) {
    cumulativeRevenueByItem[item.id] = 0;
    const itemSeries = itemTakeUSDById[item.id];
    const enabled = item.enabled ?? true;
    const metals = normalizeMetals(item);

    for (let t = 0; t < expectedLen; t += 1) {
      if (!enabled || !inWindow(item, t)) {
        itemSeries[t] = 0;
        continue;
      }

      let base: number | null = null;
      if (item.baseType === 'REVENUE') {
        base = input.grossRevenueUSD[t] ?? null;
      } else if (item.baseType === 'BY_METAL_REVENUE') {
        if (metals.includes('ALL')) {
          throw new Error(`BY_METAL_REVENUE requires explicit metals for item ${item.id}`);
        }
        if (!input.revenueByMetalUSD) {
          throw new Error(`revenueByMetalUSD is required for item ${item.id}`);
        }
        let sum = 0;
        for (const metal of metals) {
          const series = input.revenueByMetalUSD[metal];
          if (!series) {
            throw new Error(`revenueByMetalUSD missing metal ${metal} for item ${item.id}`);
          }
          const v = series[t];
          if (!isFiniteNumber(v)) {
            base = null;
            break;
          }
          sum += v;
        }
        if (base !== null) {
          base = sum;
        }
      }

      if (!isFiniteNumber(base)) {
        itemSeries[t] = null;
        continue;
      }

      const cap = item.cap;
      if (cap && cap.capType === 'revenue') {
        const capAmount = cap.capAmountUSD;
        if (!isFiniteNumber(capAmount) || capAmount < 0) {
          throw new Error(`Invalid revenue cap for item ${item.id}`);
        }
        if (cumulativeRevenueByItem[item.id] > capAmount) {
          itemSeries[t] = 0;
          continue;
        }
      }

      const rate = getRate(item, base);
      const nonNegBase = Math.max(0, base);
      itemSeries[t] = nonNegBase * rate;

      if (cap && cap.capType === 'revenue') {
        cumulativeRevenueByItem[item.id] += nonNegBase;
      }
    }
  }

  const totalTakeUSD = new Array<number | null>(expectedLen).fill(0);
  for (let t = 0; t < expectedLen; t += 1) {
    let anyNull = false;
    let sum = 0;
    for (const item of input.takeItems) {
      const enabled = item.enabled ?? true;
      if (!enabled) {
        continue;
      }
      const v = itemTakeUSDById[item.id][t];
      if (!isFiniteNumber(v)) {
        anyNull = true;
        break;
      }
      sum += v;
    }
    totalTakeUSD[t] = anyNull ? null : sum;
  }

  return { itemTakeUSDById, totalTakeUSD };
}
