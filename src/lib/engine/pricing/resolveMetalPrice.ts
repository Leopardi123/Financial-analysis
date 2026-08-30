import { getPriceKeyDefinition } from '../../prices/keys.ts';
import { isFredCommodityPriceKey } from '../../prices/providers/fred.ts';
import { isImfCommodityPriceKey } from '../../prices/providers/imfCommodity.ts';

export type ManualMetalPriceEntry = {
  metalKey: string;
  displayName: string;
  unit: string | null;
  value: number;
  enteredAtUtc: string;
  expiresAtUtc: string;
};

export type ResolvedMetalPrice = {
  value: number | null;
  source: 'fmp' | 'fred' | 'imf' | 'manual' | 'missing' | 'expired';
  metal: string;
  unit: string | null;
  enteredAtUtc: string | null;
  expiresAtUtc: string | null;
  reason: string | null;
  actionRequired: boolean;
};

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toUnitLabel(priceKey: string): string | null {
  try {
    const definition = getPriceKeyDefinition(priceKey);
    if (definition.canonicalUnit === 'USD_per_lb') return 'USD/lb';
    if (definition.canonicalUnit === 'USD_per_tonne') return 'USD/tonne';
    if (definition.canonicalUnit === 'USD_per_toz') return 'USD/toz';
    return definition.canonicalUnit;
  } catch {
    return null;
  }
}

function providerLabel(priceKey: string): string {
  if (isFredCommodityPriceKey(priceKey)) return 'FRED/IMF monthly benchmark';
  if (isImfCommodityPriceKey(priceKey)) return 'IMF Primary Commodity Prices monthly benchmark';
  return 'FMP Legacy price';
}

export function isManualMetalPriceValid(entry: ManualMetalPriceEntry | null | undefined, nowUtcIso: string = new Date().toISOString()): boolean {
  if (!entry || !isFinitePositive(entry.value)) return false;
  const expiresMs = Date.parse(entry.expiresAtUtc);
  const nowMs = Date.parse(nowUtcIso);
  return Number.isFinite(expiresMs) && Number.isFinite(nowMs) && expiresMs > nowMs;
}

export function resolveMetalPrice(args: {
  metal: string;
  metalKey: string;
  fmpSpotValue: number | null;
  manualEntry?: ManualMetalPriceEntry | null;
  nowUtcIso?: string;
}): ResolvedMetalPrice {
  const nowUtcIso = args.nowUtcIso ?? new Date().toISOString();
  const unit = args.manualEntry?.unit ?? toUnitLabel(args.metalKey);
  const isFredBenchmark = isFredCommodityPriceKey(args.metalKey);
  const isImfBenchmark = isImfCommodityPriceKey(args.metalKey);
  const isMonthlyBenchmark = isFredBenchmark || isImfBenchmark;
  const provider = providerLabel(args.metalKey);

  if (isFinitePositive(args.fmpSpotValue)) {
    return {
      value: args.fmpSpotValue,
      source: isImfBenchmark ? 'imf' : isFredBenchmark ? 'fred' : 'fmp',
      metal: args.metal,
      unit,
      enteredAtUtc: null,
      expiresAtUtc: null,
      reason: isMonthlyBenchmark ? `${provider} available.` : null,
      actionRequired: false,
    };
  }

  if (isManualMetalPriceValid(args.manualEntry, nowUtcIso)) {
    return {
      value: args.manualEntry!.value,
      source: 'manual',
      metal: args.metal,
      unit,
      enteredAtUtc: args.manualEntry?.enteredAtUtc ?? null,
      expiresAtUtc: args.manualEntry?.expiresAtUtc ?? null,
      reason: `${provider} unavailable. Using valid manual fallback price.`,
      actionRequired: false,
    };
  }

  const expired = Boolean(args.manualEntry?.expiresAtUtc) && !isManualMetalPriceValid(args.manualEntry, nowUtcIso);
  return {
    value: null,
    source: expired ? 'expired' : 'missing',
    metal: args.metal,
    unit,
    enteredAtUtc: args.manualEntry?.enteredAtUtc ?? null,
    expiresAtUtc: args.manualEntry?.expiresAtUtc ?? null,
    reason: expired
      ? `${provider} unavailable and manual fallback price has expired.`
      : `${provider} unavailable and no valid manual fallback price exists.`,
    actionRequired: true,
  };
}
