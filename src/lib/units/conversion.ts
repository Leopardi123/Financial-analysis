import { canonicalUnitForMetal } from './metalUnits.ts';

const GRAMS_PER_TOZ = 31.1034768;
const GRAMS_PER_LB = 453.59237;
const LBS_PER_SHORT_TON = 2000;
const KILOGRAMS_PER_TONNE = 1000;

function toGrams(value: number, unit: string): number | null {
  if (unit === 'toz') return value * GRAMS_PER_TOZ;
  if (unit === 'g') return value;
  if (unit === 'kg') return value * KILOGRAMS_PER_TONNE;
  if (unit === 'lb') return value * GRAMS_PER_LB;
  if (unit === 'short_ton') return value * LBS_PER_SHORT_TON * GRAMS_PER_LB;
  if (unit === 'tonne') return value * KILOGRAMS_PER_TONNE * KILOGRAMS_PER_TONNE;
  return null;
}

function fromGrams(valueInGrams: number, unit: 'toz' | 'lb' | 'tonne'): number {
  if (unit === 'toz') return valueInGrams / GRAMS_PER_TOZ;
  if (unit === 'lb') return valueInGrams / GRAMS_PER_LB;
  return valueInGrams / (KILOGRAMS_PER_TONNE * KILOGRAMS_PER_TONNE);
}

export function convertQuantityToCanonical(
  metal: string,
  value: number,
  unit: string,
): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const grams = toGrams(value, unit);
  if (grams === null) {
    return null;
  }

  return fromGrams(grams, canonicalUnitForMetal(metal));
}

export function convertPriceToCanonical(
  metal: string,
  price: number,
  priceUnit: string,
): number | null {
  if (!Number.isFinite(price)) {
    return null;
  }

  const underscore = priceUnit.indexOf('_');
  if (underscore < 0) {
    return null;
  }
  const unit = priceUnit.slice(underscore + 1);
  const canonical = canonicalUnitForMetal(metal);
  const oneCanonicalInSource = convertQuantityToCanonical(metal, 1, canonical);
  const oneSourceInCanonical = convertQuantityToCanonical(metal, 1, unit);

  if (oneCanonicalInSource === null || oneSourceInCanonical === null || oneCanonicalInSource === 0 || oneSourceInCanonical === 0) {
    return null;
  }

  if (unit === canonical) {
    return price;
  }

  // USD/sourceUnit -> USD/canonicalUnit
  const canonicalPerSource = oneSourceInCanonical;
  return price / canonicalPerSource;
}
