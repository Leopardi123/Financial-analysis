export type DriverFirstNonZeroIndexMap = Record<string, number | null>;

const ORE_MINED_DRIVER = 'operations.oreMinedTonnes';
const ORE_MILLED_DRIVER = 'operations.oreMilledTonnes';
const PAYABLE_DRIVER_PREFIX = 'metals.payableQtyByMetal.';

export function firstNonZeroIndex(values: Array<number | null | undefined> | null | undefined): number | null {
  if (!Array.isArray(values)) return null;
  for (let i = 0; i < values.length; i += 1) {
    const normalized = Number(values[i] ?? 0);
    if (Number.isFinite(normalized) && normalized !== 0) {
      return i;
    }
  }
  return null;
}

export function buildProductionDriverFirstNonZeroMap(args: {
  oreMinedTonnes?: Array<number | null | undefined> | null;
  oreMilledTonnes?: Array<number | null | undefined> | null;
  payableQtyByMetal?: Record<string, Array<number | null | undefined> | null | undefined> | null;
}): DriverFirstNonZeroIndexMap {
  const map: DriverFirstNonZeroIndexMap = {
    [ORE_MINED_DRIVER]: firstNonZeroIndex(args.oreMinedTonnes),
    [ORE_MILLED_DRIVER]: firstNonZeroIndex(args.oreMilledTonnes),
  };

  const payable = args.payableQtyByMetal ?? {};
  for (const metal of Object.keys(payable).sort((a, b) => a.localeCompare(b))) {
    map[`${PAYABLE_DRIVER_PREFIX}${metal}`] = firstNonZeroIndex(payable[metal]);
  }

  return map;
}

function isActualProductionDriver(key: string): boolean {
  return key === ORE_MILLED_DRIVER || key.startsWith(PAYABLE_DRIVER_PREFIX);
}

function validIndices(entries: Array<[string, number | null]>): number[] {
  return entries
    .map(([, value]) => value)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

/**
 * Production start is defined by first processing/payable production when those
 * drivers exist. Ore mined is only a fallback because technical reports can
 * disclose pre-production stripping/mining years before first mill feed.
 */
export function productionStartIndexCandidate(map: DriverFirstNonZeroIndexMap): number | null {
  const entries = Object.entries(map);
  const actualProductionCandidates = validIndices(entries.filter(([key]) => isActualProductionDriver(key)));
  if (actualProductionCandidates.length > 0) {
    return Math.min(...actualProductionCandidates);
  }

  const oreMined = map[ORE_MINED_DRIVER];
  return typeof oreMined === 'number' && Number.isInteger(oreMined) && oreMined >= 0 ? oreMined : null;
}

/**
 * Returns actual production drivers that disagree with the selected start.
 * Pre-production ore mining is deliberately excluded from disagreement checks.
 */
export function productionStartDriverDisagreement(map: DriverFirstNonZeroIndexMap): {
  candidate: number | null;
  disagreeingDrivers: Array<{ driver: string; firstNonZeroIndex: number }>;
} {
  const candidate = productionStartIndexCandidate(map);
  if (candidate === null) return { candidate: null, disagreeingDrivers: [] };

  const disagreeingDrivers = Object.entries(map)
    .filter(([key, value]) => isActualProductionDriver(key)
      && typeof value === 'number'
      && Number.isInteger(value)
      && value >= 0
      && value !== candidate)
    .map(([driver, value]) => ({ driver, firstNonZeroIndex: value as number }));

  return { candidate, disagreeingDrivers };
}
