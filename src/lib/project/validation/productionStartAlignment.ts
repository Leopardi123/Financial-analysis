export type DriverFirstNonZeroIndexMap = Record<string, number | null>;

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
    'operations.oreMinedTonnes': firstNonZeroIndex(args.oreMinedTonnes),
    'operations.oreMilledTonnes': firstNonZeroIndex(args.oreMilledTonnes),
  };

  const payable = args.payableQtyByMetal ?? {};
  for (const metal of Object.keys(payable).sort((a, b) => a.localeCompare(b))) {
    map[`metals.payableQtyByMetal.${metal}`] = firstNonZeroIndex(payable[metal]);
  }

  return map;
}

export function productionStartIndexCandidate(map: DriverFirstNonZeroIndexMap): number | null {
  const candidates = Object.values(map).filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}
