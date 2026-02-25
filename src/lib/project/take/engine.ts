import type { ProjectTakeMVIInput, ProjectTakeMVIOutput, TakeItemMVI } from './types.ts';

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

function validateItem(item: TakeItemMVI, masterN: number, seenIds: Set<string>): void {
  if (!item.id) {
    throw new Error('item id is required');
  }

  if (seenIds.has(item.id)) {
    throw new Error(`duplicate item id: ${item.id}`);
  }
  seenIds.add(item.id);

  if (!isFiniteNumber(item.rate.value) || item.rate.value < 0) {
    throw new Error(`rate.value must be finite and >= 0 for item ${item.id}`);
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

  const seenIds = new Set<string>();
  for (const item of input.items) {
    validateItem(item, input.masterN, seenIds);
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

      const metal = item.base.metal;
      const baseSeries = metal && input.byMetalRevenueUSD?.[metal] ? input.byMetalRevenueUSD[metal] : input.grossRevenueUSD;
      const baseAtT = baseSeries[t];

      if (!isFiniteNumber(baseAtT)) {
        takeByItemUSD[item.id][t] = null;
        hasNull = true;
        continue;
      }

      const itemTake = Math.max(0, baseAtT) * item.rate.value;
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
