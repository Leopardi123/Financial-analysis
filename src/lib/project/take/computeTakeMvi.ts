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

function isAllMetals(value: unknown): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === 'ALL';
}

function normalizeItem(
  raw: unknown,
  idx: number,
  masterN: number,
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

  if (item.appliesTo?.scope !== 'project') {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (appliesTo.scope must be "project")`);
    return null;
  }

  if (!isAllMetals(item.appliesTo?.metals)) {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (appliesTo.metals must be ["ALL"])`);
    return null;
  }

  if (item.appliesTo?.geography !== 'ALL') {
    diagnostics.push(`takeItems[${idx}](${id}): ignored (appliesTo.geography must be "ALL")`);
    return null;
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

  return {
    id,
    jurisdictionLevel: normalizedJurisdiction,
    rate,
    start_t,
    end_t,
  };
}

export function computeTotalTakeUSD_MVI(args: ComputeTotalTakeUsdMviArgs): ComputeTotalTakeUsdMviResult {
  const expectedLength = args.masterN + 1;
  if (args.grossRevenueUSD.length !== expectedLength) {
    throw new Error('grossRevenueUSD length must equal masterN+1');
  }

  const diagnostics: string[] = [];
  const normalizedItems: NormalizedItem[] = [];
  const rawItems = args.takeItems ?? [];

  for (let idx = 0; idx < rawItems.length; idx += 1) {
    const item = normalizeItem(rawItems[idx], idx, args.masterN, diagnostics);
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
      const gross = args.grossRevenueUSD[t];
      if (!isFiniteNumber(gross)) {
        hasNullContribution = true;
        break;
      }
      sum += Math.max(0, gross) * item.rate;
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

