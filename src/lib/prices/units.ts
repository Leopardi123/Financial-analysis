export type MassUnit = "tonne" | "short_ton" | "long_ton" | "lb" | "kg";
export type PreciousQuantityUnit = "toz" | "g" | "kg";
export type PriceUnit = "USD_per_toz" | "USD_per_lb" | "USD_per_tonne";

const MASS_TO_KG: Record<MassUnit, number> = {
  tonne: 1000,
  short_ton: 907.18474,
  long_ton: 1016.0469088,
  lb: 0.45359237,
  kg: 1,
};

const PRECIOUS_TO_G: Record<PreciousQuantityUnit, number> = {
  toz: 31.1034768,
  g: 1,
  kg: 1000,
};

const PRICE_UNIT_DENOMINATOR_LB: Record<PriceUnit, number> = {
  USD_per_lb: 1,
  USD_per_tonne: 1 / 2204.6226218487757,
  USD_per_toz: 1 / 14.583333333333334,
};

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function convertMass(value: number, from: MassUnit, to: MassUnit): number | null {
  if (!(from in MASS_TO_KG)) {
    throw new Error(`Unknown unit: ${from}`);
  }
  if (!(to in MASS_TO_KG)) {
    throw new Error(`Unknown unit: ${to}`);
  }

  const normalizedValue = finiteOrNull(value);
  if (normalizedValue === null) {
    return null;
  }

  const inKg = normalizedValue * MASS_TO_KG[from];
  return finiteOrNull(inKg / MASS_TO_KG[to]);
}

export function convertPreciousQuantity(value: number, from: PreciousQuantityUnit, to: PreciousQuantityUnit): number | null {
  if (!(from in PRECIOUS_TO_G)) {
    throw new Error(`Unknown unit: ${from}`);
  }
  if (!(to in PRECIOUS_TO_G)) {
    throw new Error(`Unknown unit: ${to}`);
  }

  const normalizedValue = finiteOrNull(value);
  if (normalizedValue === null) {
    return null;
  }

  const inGrams = normalizedValue * PRECIOUS_TO_G[from];
  return finiteOrNull(inGrams / PRECIOUS_TO_G[to]);
}

export function convertPriceUnit(value: number, from: PriceUnit, to: PriceUnit): number | null {
  if (!(from in PRICE_UNIT_DENOMINATOR_LB)) {
    throw new Error(`Unknown unit: ${from}`);
  }
  if (!(to in PRICE_UNIT_DENOMINATOR_LB)) {
    throw new Error(`Unknown unit: ${to}`);
  }

  const normalizedValue = finiteOrNull(value);
  if (normalizedValue === null) {
    return null;
  }

  const usdPerLb = normalizedValue * PRICE_UNIT_DENOMINATOR_LB[from];
  return finiteOrNull(usdPerLb / PRICE_UNIT_DENOMINATOR_LB[to]);
}
