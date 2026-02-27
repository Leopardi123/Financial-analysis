type JurisdictionLevel = 'contractual' | 'national' | 'provincial_state' | 'municipal' | 'other';

type TakeItemMviLike = {
  id?: unknown;
  type?: unknown;
  jurisdictionLevel?: unknown;
  appliesTo?: {
    scope?: unknown;
    metals?: unknown;
    geography?: unknown;
    timing?: {
      start_t?: unknown;
      end_t?: unknown;
    } | null;
    volumeCap?: {
      capType?: unknown;
      capAmount?: unknown;
      capMetal?: unknown;
    } | null;
  } | null;
  baseDefinition?: {
    baseType?: unknown;
  } | null;
  rateDefinition?: {
    rateType?: unknown;
    rate?: unknown;
    tiers?: unknown;
  } | null;
  priceKey?: unknown;
};

export type ComputeTotalTakeUsdMviArgs = {
  masterN: number;
  productionStartPeriod: number;
  grossRevenueUSD: Array<number | null>;
  revenueByMetalUSD?: Record<string, (number | null)[]>;
  spotPriceUSDByMetal?: Record<string, (number | null)[]>;
  priceSeriesByKey?: Record<string, (number | null)[]>;
  priceKeyByMetal?: Record<string, string>;
  auPriceKey?: string | null;
  takeItems: Array<unknown> | null | undefined;
};

export type ComputeTotalTakeUsdMviResult = {
  totalTakeUSD: Array<number | null>;
  diagnostics: string[];
  includedCount: number;
  includedSummaries: string[];
};

type RateDefinition =
  | { rateType: 'FIXED'; rate: number }
  | {
    rateType: 'TIERED';
    thresholdType: 'price' | 'revenue';
    tiers: Array<{ thresholdValue: number; rate: number }>;
  };

type NormalizedItem = {
  id: string;
  jurisdictionLevel: JurisdictionLevel;
  rateDefinition: RateDefinition;
  start_t: number | null;
  end_t: number | null;
  scope: 'project' | 'metalSpecific';
  metals: string[];
  usesProjectBase: boolean;
  priceKey: string | null;
};

type PreparedItem = {
  item: NormalizedItem;
  priceRefSeries: Array<number | null> | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function inTimingWindow(item: NormalizedItem, t: number): boolean {
  return !((item.start_t !== null && t < item.start_t) || (item.end_t !== null && t > item.end_t));
}

function asTakeItemLike(value: unknown): TakeItemMviLike | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as TakeItemMviLike;
}

function normalizeMetals(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function normalizeItem(
  raw: unknown,
  idx: number,
  masterN: number,
  availableRevenueMetals: Set<string>,
  diagnostics: string[],
): NormalizedItem | null {
  const item = asTakeItemLike(raw);
  if (!item) {
    diagnostics.push(`takeItems[${idx}]: ignored (item must be object)`);
    return null;
  }

  if (typeof item.id !== 'string' || item.id.trim().length === 0) {
    diagnostics.push(`takeItems[${idx}]: ignored (missing id)`);
    return null;
  }

  const id = item.id;
  if (item.baseDefinition?.baseType !== 'REVENUE') {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (baseType must be REVENUE)`);
    return null;
  }

  const rateType = item.rateDefinition?.rateType;
  let rateDefinition: RateDefinition | null = null;
  if (rateType === 'FIXED') {
    const rate = item.rateDefinition?.rate;
    if (!isFiniteNumber(rate) || rate < 0 || rate > 1) {
      diagnostics.push(`takeItems[${idx}](${id}): ignored (rate must be finite in [0,1])`);
      return null;
    }
    rateDefinition = { rateType: 'FIXED', rate };
  } else if (rateType === 'TIERED') {
    const tiersRaw = item.rateDefinition?.tiers;
    if (!Array.isArray(tiersRaw) || tiersRaw.length === 0) {
      diagnostics.push(`takeItems[${idx}](${id}): ignored (tiers must be a non-empty array)`);
      return null;
    }
    const tiers: Array<{ thresholdType: 'price' | 'revenue'; thresholdValue: number; rate: number }> = [];
    for (let tierIdx = 0; tierIdx < tiersRaw.length; tierIdx += 1) {
      const tier = tiersRaw[tierIdx];
      if (!tier || typeof tier !== 'object' || Array.isArray(tier)) {
        diagnostics.push(`takeItems[${idx}](${id}): ignored (tier ${tierIdx} must be object)`);
        return null;
      }
      const thresholdType = (tier as { thresholdType?: unknown }).thresholdType;
      const thresholdValue = (tier as { thresholdValue?: unknown }).thresholdValue;
      const rate = (tier as { rate?: unknown }).rate;
      if (thresholdType !== 'price' && thresholdType !== 'revenue') {
        diagnostics.push(`takeItems[${idx}](${id}): ignored (tier ${tierIdx} thresholdType must be "price" or "revenue")`);
        return null;
      }
      if (!isFiniteNumber(thresholdValue) || thresholdValue < 0) {
        diagnostics.push(`takeItems[${idx}](${id}): ignored (tier ${tierIdx} thresholdValue must be finite >= 0)`);
        return null;
      }
      if (!isFiniteNumber(rate) || rate < 0 || rate > 1) {
        diagnostics.push(`takeItems[${idx}](${id}): ignored (tier ${tierIdx} rate must be finite in [0,1])`);
        return null;
      }
      tiers.push({ thresholdType, thresholdValue, rate });
    }

    const thresholdType = tiers[0].thresholdType;
    if (tiers.some((tier) => tier.thresholdType !== thresholdType)) {
      diagnostics.push(`takeItems[${idx}](${id}): ignored (mixed thresholdType not supported)`);
      return null;
    }

    rateDefinition = {
      rateType: 'TIERED',
      thresholdType,
      tiers: tiers
        .map((tier) => ({ thresholdValue: tier.thresholdValue, rate: tier.rate }))
        .sort((a, b) => a.thresholdValue - b.thresholdValue),
    };
  } else {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (rateType must be FIXED or TIERED)`);
    return null;
  }

  const scopeRaw = item.appliesTo?.scope;
  if (scopeRaw !== 'project' && scopeRaw !== 'metalSpecific') {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (unsupported scope)`);
    return null;
  }

  const metals = normalizeMetals(item.appliesTo?.metals);
  if (!metals || metals.length === 0) {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (metals empty)`);
    return null;
  }

  const usesProjectBase = scopeRaw === 'project' || metals.includes('ALL');
  if (item.appliesTo?.geography !== 'ALL') {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (appliesTo.geography must be "ALL")`);
    return null;
  }

  const capType = item.appliesTo?.volumeCap?.capType;
  if (capType !== undefined && capType !== null && capType !== 'none') {
    diagnostics.push(`takeItems[${idx}](${id}): volumeCap capType=${String(capType)} ignored in MVI`);
  }

  if (!usesProjectBase) {
    for (const metal of metals) {
      if (!availableRevenueMetals.has(metal)) {
        diagnostics.push(`takeItems[${idx}](${id}): ignored (metal missing from revenueByMetalUSD: ${metal})`);
        return null;
      }
    }
  }

  const start_t = item.appliesTo?.timing?.start_t ?? null;
  const end_t = item.appliesTo?.timing?.end_t ?? null;
  if (start_t !== null && (!isInteger(start_t) || start_t < 0 || start_t > masterN)) {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (timing.start_t must be integer in [0, masterN])`);
    return null;
  }
  if (end_t !== null && (!isInteger(end_t) || end_t < 0 || end_t > masterN)) {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (timing.end_t must be integer in [0, masterN])`);
    return null;
  }
  if (start_t !== null && end_t !== null && start_t > end_t) {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (timing.start_t cannot be greater than timing.end_t)`);
    return null;
  }

  const jurisdictionLevel = item.jurisdictionLevel;
  const normalizedJurisdiction: JurisdictionLevel =
    jurisdictionLevel === 'contractual'
    || jurisdictionLevel === 'national'
    || jurisdictionLevel === 'provincial_state'
    || jurisdictionLevel === 'municipal'
    || jurisdictionLevel === 'other'
      ? jurisdictionLevel
      : 'other';

  const priceKey = typeof item.priceKey === 'string' && item.priceKey.trim().length > 0 ? item.priceKey : null;

  if (rateDefinition.rateType === 'TIERED') {
    diagnostics.push(
      `takeItem id=${id} rateType=TIERED thresholdType=${rateDefinition.thresholdType} tiers=${rateDefinition.tiers.length} priceKey=${priceKey ?? 'null'}`,
    );
  } else {
    diagnostics.push(`takeItem id=${id} scope=${scopeRaw} metals=[${metals.join(',')}] rate=${rateDefinition.rate}`);
  }

  return {
    id,
    jurisdictionLevel: normalizedJurisdiction,
    rateDefinition,
    start_t,
    end_t,
    scope: scopeRaw,
    metals,
    usesProjectBase,
    priceKey,
  };
}

function resolvePriceSeriesForItem(
  item: NormalizedItem,
  args: ComputeTotalTakeUsdMviArgs,
  projectMetals: string[],
): Array<number | null> | null {
  const priceSeriesByKey = args.priceSeriesByKey ?? {};
  const priceKeyByMetal = args.priceKeyByMetal ?? {};
  const spotPriceUSDByMetal = args.spotPriceUSDByMetal ?? {};

  if (item.priceKey) {
    const byKey = priceSeriesByKey[item.priceKey];
    if (byKey) {
      return byKey;
    }
    for (const [metal, key] of Object.entries(priceKeyByMetal)) {
      if (key === item.priceKey && spotPriceUSDByMetal[metal]) {
        return spotPriceUSDByMetal[metal];
      }
    }
    return null;
  }

  if (item.scope === 'metalSpecific' && item.metals.length === 1 && item.metals[0] !== 'ALL') {
    return spotPriceUSDByMetal[item.metals[0]] ?? null;
  }

  if (typeof args.auPriceKey === 'string' && args.auPriceKey.trim().length > 0) {
    const auSeries = priceSeriesByKey[args.auPriceKey];
    if (auSeries) {
      return auSeries;
    }
  }

  if (projectMetals.length === 1) {
    return spotPriceUSDByMetal[projectMetals[0]] ?? null;
  }

  return null;
}

function resolveTierRateAtT(
  item: NormalizedItem,
  t: number,
  baseUSD: number | null,
  priceRefSeries: Array<number | null> | null,
): number | null {
  if (item.rateDefinition.rateType === 'FIXED') {
    return item.rateDefinition.rate;
  }

  const metric = item.rateDefinition.thresholdType === 'revenue'
    ? (isFiniteNumber(baseUSD) ? baseUSD : null)
    : (isFiniteNumber(priceRefSeries?.[t]) ? priceRefSeries?.[t] as number : null);

  if (!isFiniteNumber(metric)) {
    return null;
  }

  let selectedRate = 0;
  for (const tier of item.rateDefinition.tiers) {
    if (metric >= tier.thresholdValue) {
      selectedRate = tier.rate;
    }
  }
  return selectedRate;
}

export function computeTotalTakeUSD_MVI(args: ComputeTotalTakeUsdMviArgs): ComputeTotalTakeUsdMviResult {
  const expectedLength = args.masterN + 1;
  if (args.grossRevenueUSD.length !== expectedLength) {
    throw new Error('grossRevenueUSD length must equal masterN+1');
  }

  const revenueByMetalUSD = args.revenueByMetalUSD ?? {};
  const spotPriceUSDByMetal = args.spotPriceUSDByMetal ?? {};
  const priceSeriesByKey = args.priceSeriesByKey ?? {};

  for (const [metal, series] of Object.entries(revenueByMetalUSD)) {
    if (series.length !== expectedLength) {
      throw new Error(`revenueByMetalUSD[${metal}] length must equal masterN+1`);
    }
  }
  for (const [metal, series] of Object.entries(spotPriceUSDByMetal)) {
    if (series.length !== expectedLength) {
      throw new Error(`spotPriceUSDByMetal[${metal}] length must equal masterN+1`);
    }
  }
  for (const [key, series] of Object.entries(priceSeriesByKey)) {
    if (series.length !== expectedLength) {
      throw new Error(`priceSeriesByKey[${key}] length must equal masterN+1`);
    }
  }

  const diagnostics: string[] = [];
  const normalizedItems: NormalizedItem[] = [];
  const rawItems = args.takeItems ?? [];
  const availableRevenueMetals = new Set(Object.keys(revenueByMetalUSD));
  const projectMetals = Object.keys(revenueByMetalUSD);

  for (let idx = 0; idx < rawItems.length; idx += 1) {
    const item = normalizeItem(rawItems[idx], idx, args.masterN, availableRevenueMetals, diagnostics);
    if (item) {
      normalizedItems.push(item);
    }
  }

  const preparedItems: PreparedItem[] = [];
  for (const item of normalizedItems) {
    if (item.rateDefinition.rateType === 'TIERED' && item.rateDefinition.thresholdType === 'price') {
      const projectMultiMetal = projectMetals.length > 1;
      if (!item.priceKey && ((item.scope === 'project' || item.metals.includes('ALL')) && projectMultiMetal)) {
        diagnostics.push(`takeItem id=${item.id} ignored: price threshold requires priceKey (multi-metal project)`);
        continue;
      }
      if (!item.priceKey && item.scope === 'metalSpecific' && item.metals.length > 1) {
        diagnostics.push(`takeItem id=${item.id} ignored: price threshold requires priceKey (multi-metal item)`);
        continue;
      }

      const resolved = resolvePriceSeriesForItem(item, args, projectMetals);
      if (!resolved) {
        diagnostics.push(`takeItem id=${item.id} ignored: price threshold priceKey not resolvable`);
        continue;
      }
      preparedItems.push({ item, priceRefSeries: resolved });
      continue;
    }

    preparedItems.push({ item, priceRefSeries: null });
  }

  const totalTakeUSD = new Array<number | null>(expectedLength).fill(0);
  for (let t = 0; t < expectedLength; t += 1) {
    let sum = 0;
    let hasNullContribution = false;

    for (const prepared of preparedItems) {
      const item = prepared.item;
      if (!inTimingWindow(item, t)) {
        continue;
      }

      let baseUSD: number | null;
      if (item.usesProjectBase) {
        baseUSD = isFiniteNumber(args.grossRevenueUSD[t]) ? args.grossRevenueUSD[t] : null;
      } else {
        let metalSum = 0;
        let metalHasNull = false;
        for (const metal of item.metals) {
          const metalRevenue = revenueByMetalUSD[metal]?.[t];
          if (!isFiniteNumber(metalRevenue)) {
            metalHasNull = true;
            break;
          }
          metalSum += metalRevenue;
        }
        baseUSD = metalHasNull ? null : metalSum;
      }

      if (!isFiniteNumber(baseUSD)) {
        hasNullContribution = true;
        break;
      }

      const rateAtT = resolveTierRateAtT(item, t, baseUSD, prepared.priceRefSeries);
      if (!isFiniteNumber(rateAtT)) {
        hasNullContribution = true;
        break;
      }

      sum += Math.max(0, baseUSD) * rateAtT;
    }

    totalTakeUSD[t] = hasNullContribution ? null : sum;
  }

  return {
    totalTakeUSD,
    diagnostics,
    includedCount: preparedItems.length,
    includedSummaries: preparedItems.map(({ item }) => {
      if (item.rateDefinition.rateType === 'FIXED') {
        return `${item.id}[${item.jurisdictionLevel}]@${item.rateDefinition.rate}`;
      }
      return `${item.id}[${item.jurisdictionLevel}]@TIERED`;
    }),
  };
}
