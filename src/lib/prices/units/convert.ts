import { CANONICAL_UNITS, UNIT_CONSTANTS } from './types.js';

function normalizeUnit(unit: string): string {
  return unit.trim().toUpperCase();
}

function isFxUnit(unit: string): boolean {
  return unit === CANONICAL_UNITS.FX_USD_TO_CCY || unit.startsWith('FX_USD_TO_');
}

export function convertPriceToCanonical(args: {
  value: number;
  fromUnit: string;
  canonicalUnit: string;
}): number {
  if (!Number.isFinite(args.value)) {
    throw new Error('Price conversion requires finite value');
  }

  const fromUnit = normalizeUnit(args.fromUnit);
  const canonicalUnit = normalizeUnit(args.canonicalUnit);

  if (fromUnit === canonicalUnit) {
    return args.value;
  }

  if (isFxUnit(fromUnit) || isFxUnit(canonicalUnit)) {
    if (fromUnit !== canonicalUnit) {
      throw new Error(`FX unit mismatch: ${fromUnit} -> ${canonicalUnit}`);
    }
    return args.value;
  }

  if (fromUnit === CANONICAL_UNITS.USD_PER_LB && canonicalUnit === CANONICAL_UNITS.USD_PER_TONNE) {
    return args.value * UNIT_CONSTANTS.LB_PER_TONNE;
  }

  if (fromUnit === CANONICAL_UNITS.USD_PER_TONNE && canonicalUnit === CANONICAL_UNITS.USD_PER_LB) {
    return args.value / UNIT_CONSTANTS.LB_PER_TONNE;
  }

  throw new Error(`Unsupported price conversion: ${fromUnit} -> ${canonicalUnit}`);
}
