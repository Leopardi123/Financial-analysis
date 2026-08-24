export type PriceKind = "commodity" | "forex";

export type CanonicalPriceUnit = "USD_per_toz" | "USD_per_lb" | "USD_per_tonne" | "FX_spot";

export interface PriceKeyDefinition {
  priceKey: string;
  kind: PriceKind;
  canonicalUnit: CanonicalPriceUnit;
  decimals: number;
  description: string;
}

export const PRICE_KEY_DEFINITIONS: readonly PriceKeyDefinition[] = [
  {
    priceKey: "XAU_USD_TOZ",
    kind: "commodity",
    canonicalUnit: "USD_per_toz",
    decimals: 6,
    description: "Gold price in USD per troy ounce",
  },
  {
    priceKey: "XAG_USD_TOZ",
    kind: "commodity",
    canonicalUnit: "USD_per_toz",
    decimals: 6,
    description: "Silver price in USD per troy ounce",
  },
  {
    priceKey: "XPT_USD_TOZ",
    kind: "commodity",
    canonicalUnit: "USD_per_toz",
    decimals: 6,
    description: "Platinum price in USD per troy ounce",
  },
  {
    priceKey: "XPD_USD_TOZ",
    kind: "commodity",
    canonicalUnit: "USD_per_toz",
    decimals: 6,
    description: "Palladium price in USD per troy ounce",
  },
  {
    priceKey: "CU_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Copper price in USD per pound (COMEX basis)",
  },
  {
    priceKey: "CU_USD_TONNE",
    kind: "commodity",
    canonicalUnit: "USD_per_tonne",
    decimals: 6,
    description: "Copper price in USD per tonne (LME basis)",
  },
  {
    priceKey: "AL_USD_TONNE",
    kind: "commodity",
    canonicalUnit: "USD_per_tonne",
    decimals: 6,
    description: "Aluminium price in USD per metric tonne",
  },
  {
    priceKey: "ZN_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Zinc benchmark price in USD per pound",
  },
  {
    priceKey: "PB_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Lead benchmark price in USD per pound",
  },
  {
    priceKey: "NI_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Nickel benchmark price in USD per pound",
  },
  {
    priceKey: "SN_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Tin benchmark price in USD per pound",
  },
  {
    priceKey: "IRON_ORE_USD_TONNE",
    kind: "commodity",
    canonicalUnit: "USD_per_tonne",
    decimals: 6,
    description: "Iron ore benchmark price in USD per metric tonne",
  },
  {
    priceKey: "URANIUM_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Uranium benchmark price in USD per pound",
  },
  {
    priceKey: "USD_SEK",
    kind: "forex",
    canonicalUnit: "FX_spot",
    decimals: 6,
    description: "USD/SEK foreign exchange rate",
  },
  {
    priceKey: "EUR_USD",
    kind: "forex",
    canonicalUnit: "FX_spot",
    decimals: 6,
    description: "EUR/USD foreign exchange rate",
  },
  {
    priceKey: "USD_CAD",
    kind: "forex",
    canonicalUnit: "FX_spot",
    decimals: 6,
    description: "USD/CAD foreign exchange rate",
  },
] as const;

export const PRICE_KEY_SET = new Set(PRICE_KEY_DEFINITIONS.map((definition) => definition.priceKey));

export type PriceKey = string;

export function getPriceKeyDefinition(priceKey: string): PriceKeyDefinition {
  const definition = PRICE_KEY_DEFINITIONS.find((item) => item.priceKey === priceKey);
  if (!definition) {
    throw new Error(`Unknown price key: ${priceKey}`);
  }
  return definition;
}
