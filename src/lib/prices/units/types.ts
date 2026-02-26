export const CANONICAL_UNITS = {
  USD_PER_TOZ: 'USD_PER_TOZ',
  USD_PER_OZ: 'USD_PER_OZ',
  USD_PER_LB: 'USD_PER_LB',
  USD_PER_TONNE: 'USD_PER_TONNE',
  FX_USD_TO_CCY: 'FX_USD_TO_CCY',
} as const;

export const QUANTITY_UNITS = {
  TOZ: 'TOZ',
  OZ: 'OZ',
  LB: 'LB',
  TONNE: 'TONNE',
  KG: 'KG',
  G: 'G',
} as const;

export type CanonicalUnit = (typeof CANONICAL_UNITS)[keyof typeof CANONICAL_UNITS];
export type QuantityUnit = (typeof QUANTITY_UNITS)[keyof typeof QUANTITY_UNITS];

export const UNIT_CONSTANTS = {
  LB_PER_TONNE: 2204.62262185,
  G_PER_TOZ: 31.1034768,
  G_PER_OZ: 28.349523125,
} as const;
