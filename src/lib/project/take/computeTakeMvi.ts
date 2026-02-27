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
  } | null;
};

export type ComputeTotalTakeUsdMviArgs = {
  masterN: number;
  productionStartPeriod: number;
  grossRevenueUSD: Array<number | null>;
  revenueByMetalUSD?: Record<string, (number | null)[]>;
  takeItems: Array<unknown> | null | undefined;
};

export type ComputeTotalTakeUsdMviResult = {
  totalTakeUSD: Array<number | null>;
  diagnostics: string[];
  includedCount: number;
  includedSummaries: string[];
};

type NormalizedItem = {
  id: string;
  jurisdictionLevel: JurisdictionLevel;
  rate: number;
  start_t: number | null;
  end_t: number | null;
  scope: 'project' | 'metalSpecific';
  metals: string[];
  usesProjectBase: boolean;
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
  const metals = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return metals;
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
  const baseType = item.baseDefinition?.baseType;
  if (baseType !== 'REVENUE') {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (baseType must be REVENUE)`);
    return null;
  }

  const rateType = item.rateDefinition?.rateType;
  if (rateType !== 'FIXED') {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (rateType must be FIXED)`);
    return null;
  }

  const rate = item.rateDefinition?.rate;
  if (!isFiniteNumber(rate) || rate < 0 || rate > 1) {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (rate must be finite in [0,1])`);
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
    diagnostics.push(`takeItems[${idx}](${id}): ignored (volumeCap capType must be "none")`);
    return null;
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

  diagnostics.push(`takeItem id=${id} scope=${scopeRaw} metals=[${metals.join(',')}] rate=${rate}`);

  return {
    id,
    jurisdictionLevel: normalizedJurisdiction,
    rate,
    start_t,
    end_t,
    scope: scopeRaw,
    metals,
    usesProjectBase,
  };
}

export function computeTotalTakeUSD_MVI(args: ComputeTotalTakeUsdMviArgs): ComputeTotalTakeUsdMviResult {
  const expectedLength = args.masterN + 1;
  if (args.grossRevenueUSD.length !== expectedLength) {
    throw new Error('grossRevenueUSD length must equal masterN+1');
  }

  const revenueByMetalUSD = args.revenueByMetalUSD ?? {};
  for (const [metal, series] of Object.entries(revenueByMetalUSD)) {
    if (series.length !== expectedLength) {
      throw new Error(`revenueByMetalUSD[${metal}] length must equal masterN+1`);
    }
  }

  const diagnostics: string[] = [];
  const normalizedItems: NormalizedItem[] = [];
  const rawItems = args.takeItems ?? [];
  const availableRevenueMetals = new Set(Object.keys(revenueByMetalUSD));

  for (let idx = 0; idx < rawItems.length; idx += 1) {
    const item = normalizeItem(rawItems[idx], idx, args.masterN, availableRevenueMetals, diagnostics);
    if (item) {
      normalizedItems.push(item);
    }
  }

  const totalTakeUSD = new Array<number | null>(expectedLength).fill(0);
  for (let t = 0; t < expectedLength; t += 1) {
    let sum = 0;
    let hasNullContribution = false;

    for (const item of normalizedItems) {
      if (!inTimingWindow(item, t)) {
        continue;
      }

      let baseUSD: number | null;
      if (item.usesProjectBase) {
        const gross = args.grossRevenueUSD[t];
        baseUSD = isFiniteNumber(gross) ? gross : null;
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

      sum += Math.max(0, baseUSD) * item.rate;
    }

    totalTakeUSD[t] = hasNullContribution ? null : sum;
  }

  return {
    totalTakeUSD,
    diagnostics,
    includedCount: normalizedItems.length,
    includedSummaries: normalizedItems.map((item) => `${item.id}[${item.jurisdictionLevel}]@${item.rate}`),
  };
}
