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
    description: "Gold spot price in USD per troy ounce",
  },
  {
    priceKey: "XAG_USD_TOZ",
    kind: "commodity",
    canonicalUnit: "USD_per_toz",
    decimals: 6,
    description: "Silver spot price in USD per troy ounce",
  },
  {
    priceKey: "CU_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Copper price in USD per pound",
  },
  {
    priceKey: "ZN_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Zinc price in USD per pound",
  },
  {
    priceKey: "PB_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Lead price in USD per pound",
  },
  {
    priceKey: "NI_USD_LB",
    kind: "commodity",
    canonicalUnit: "USD_per_lb",
    decimals: 6,
    description: "Nickel price in USD per pound",
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

export function getPriceKeyDefinition(priceKey: string): PriceKeyDefinition {
  const definition = PRICE_KEY_DEFINITIONS.find((item) => item.priceKey === priceKey);
  if (!definition) {
    throw new Error(`Unknown price key: ${priceKey}`);
  }
  return definition;
}
