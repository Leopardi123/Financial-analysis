import type { ProjectTakeMVIInput, ProjectTakeMVIOutput, TakeItemMVI, TakeRateTiered } from './types.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toValidPeriodIndex(value: number | null | undefined, name: string, masterN: number): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer when provided`);
  }

  if (value < 0 || value > masterN) {
    throw new Error(`${name} must be within 0..masterN`);
  }

  return value;
}

function validateTieredRate(rate: TakeRateTiered, itemId: string): void {
  if (rate.thresholdType !== 'revenue') {
    throw new Error(`thresholdType must be revenue for item ${itemId}`);
  }

  if (rate.tiers.length < 1) {
    throw new Error(`tiers must contain at least one tier for item ${itemId}`);
  }

  const [firstTier] = rate.tiers;
  if (firstTier.thresholdValue !== 0) {
    throw new Error(`first tier thresholdValue must be 0 for item ${itemId}`);
  }

  let previousThreshold = -1;
  for (const tier of rate.tiers) {
    if (!isFiniteNumber(tier.thresholdValue) || tier.thresholdValue < 0) {
      throw new Error(`tier thresholdValue must be finite and >= 0 for item ${itemId}`);
    }

    if (tier.thresholdValue < previousThreshold) {
      throw new Error(`tiers must be sorted ascending by thresholdValue for item ${itemId}`);
    }

    if (!isFiniteNumber(tier.rate) || tier.rate < 0) {
      throw new Error(`tier rate must be finite and >= 0 for item ${itemId}`);
    }

    previousThreshold = tier.thresholdValue;
  }
}

function selectTieredRate(rate: TakeRateTiered, baseValue: number): number {
  let selectedRate = rate.tiers[0].rate;
  for (const tier of rate.tiers) {
    if (baseValue >= tier.thresholdValue) {
      selectedRate = tier.rate;
      continue;
    }

    break;
  }

  return selectedRate;
}

function validateItem(item: TakeItemMVI, masterN: number, seenIds: Set<string>): void {
  if (!item.id) {
    throw new Error('item id is required');
  }

  if (seenIds.has(item.id)) {
    throw new Error(`duplicate item id: ${item.id}`);
  }
  seenIds.add(item.id);

  if (item.base.baseType === 'OPERATING_PROFIT' && item.rate.rateType === 'TIERED') {
    throw new Error(`rateType TIERED is not supported for baseType OPERATING_PROFIT on item ${item.id}`);
  }

  if (item.rate.rateType === 'FIXED') {
    if (!isFiniteNumber(item.rate.value) || item.rate.value < 0) {
      throw new Error(`rate.value must be finite and >= 0 for item ${item.id}`);
    }
  } else {
    validateTieredRate(item.rate, item.id);
  }

  const start = toValidPeriodIndex(item.appliesTo?.start_t, 'start_t', masterN);
  const end = toValidPeriodIndex(item.appliesTo?.end_t, 'end_t', masterN);

  if (start !== null && end !== null && start > end) {
    throw new Error(`start_t must be <= end_t for item ${item.id}`);
  }
}

export function computeProjectTakeMVI(input: ProjectTakeMVIInput): ProjectTakeMVIOutput {
  const expectedLength = input.masterN + 1;
  if (input.grossRevenueUSD.length !== expectedLength) {
    throw new Error('grossRevenueUSD length must equal masterN+1');
  }

  const needsOperatingProfit = input.items.some((item) => item.base.baseType === 'OPERATING_PROFIT');
  if (needsOperatingProfit && input.operatingProfitUSD?.length !== expectedLength) {
    throw new Error('operatingProfitUSD length must equal masterN+1 when OPERATING_PROFIT items are configured');
  }

  const seenIds = new Set<string>();
  for (const item of input.items) {
    validateItem(item, input.masterN, seenIds);
    if (item.base.baseType !== 'REVENUE') {
      continue;
    }

    const metal = item.base.metal;
    if (metal && input.byMetalRevenueUSD?.[metal] && input.byMetalRevenueUSD[metal].length !== expectedLength) {
      throw new Error(`byMetalRevenueUSD[${metal}] length must equal masterN+1`);
    }
  }

  const takeByItemUSD: Record<string, (number | null)[]> = {};
  for (const item of input.items) {
    takeByItemUSD[item.id] = new Array<number | null>(expectedLength).fill(0);
  }

  const totalTakeUSD = new Array<number | null>(expectedLength).fill(0);
  const netRevenueAfterTakeUSD = new Array<number | null>(expectedLength).fill(0);

  for (let t = 0; t <= input.masterN; t += 1) {
    let hasNull = false;
    let total = 0;

    for (const item of input.items) {
      const start = item.appliesTo?.start_t ?? null;
      const end = item.appliesTo?.end_t ?? null;
      const outsideWindow = (start !== null && t < start) || (end !== null && t > end);

      if (outsideWindow) {
        takeByItemUSD[item.id][t] = 0;
        continue;
      }

      let baseAtT: number | null | undefined;
      if (item.base.baseType === 'OPERATING_PROFIT') {
        baseAtT = input.operatingProfitUSD?.[t];
      } else {
        const metal = item.base.metal;
        const baseSeries = metal && input.byMetalRevenueUSD?.[metal] ? input.byMetalRevenueUSD[metal] : input.grossRevenueUSD;
        baseAtT = baseSeries[t];
      }

      if (!isFiniteNumber(baseAtT)) {
        takeByItemUSD[item.id][t] = null;
        hasNull = true;
        continue;
      }

      const selectedRate = item.rate.rateType === 'FIXED' ? item.rate.value : selectTieredRate(item.rate, baseAtT);
      const itemTake = Math.max(0, baseAtT) * selectedRate;
      takeByItemUSD[item.id][t] = itemTake;
      total += itemTake;
    }

    if (hasNull) {
      totalTakeUSD[t] = null;
      netRevenueAfterTakeUSD[t] = null;
      continue;
    }

    totalTakeUSD[t] = total;
    const grossAtT = input.grossRevenueUSD[t];
    netRevenueAfterTakeUSD[t] = isFiniteNumber(grossAtT) ? grossAtT - total : null;
  }

  return {
    totalTakeUSD,
    netRevenueAfterTakeUSD,
    takeByItemUSD,
  };
}
