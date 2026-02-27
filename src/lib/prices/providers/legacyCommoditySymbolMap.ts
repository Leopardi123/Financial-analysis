const LEGACY_PRICE_KEY_TO_SYMBOL: Record<string, string> = {
  XAU_USD_TOZ: 'GCUSD',
  XAG_USD_TOZ: 'SIUSD',
  XPT_USD_TOZ: 'PLUSD',
  XPD_USD_TOZ: 'PAUSD',
  CU_USD_LB: 'HGUSD',
  NI_USD_LB: 'NIUSD',
  ZN_USD_LB: 'ZNUSD',
  PB_USD_LB: 'PBUSD',
  AL_USD_LB: 'ALUSD',
  SN_USD_LB: 'SNUSD',
  CO_USD_LB: 'COBALT',
  LI_USD_TONNE: 'LITHIUM',
  MN_USD_TONNE: 'MANGANESE',
  GRAPHITE_USD_TONNE: 'GRAPHITE',
  IRON_ORE_USD_TONNE: 'IRON',
  MET_COAL_USD_TONNE: 'METCOAL',
  THERMAL_COAL_USD_TONNE: 'COAL',
  URANIUM_USD_LB: 'URANIUM',
  USD_CAD: 'USD/CAD',
  CAD_USD: 'CAD/USD',
  USD_SEK: 'USD/SEK',
  SEK_USD: 'SEK/USD',
  USD_EUR: 'USD/EUR',
  EUR_USD: 'EUR/USD',
};

const LEGACY_SYMBOL_PATTERN = /^[A-Z]+(?:\/[A-Z]+)?$/;

export function getLegacySymbolForPriceKey(priceKey: string): string | null {
  const mapped = LEGACY_PRICE_KEY_TO_SYMBOL[priceKey];
  if (mapped) {
    return mapped;
  }

  const normalized = priceKey.trim().toUpperCase();
  if (LEGACY_SYMBOL_PATTERN.test(normalized)) {
    return normalized;
  }

  return null;
}


export function getCommodityPriceKeyForLegacySymbol(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase();
  for (const [priceKey, mappedSymbol] of Object.entries(LEGACY_PRICE_KEY_TO_SYMBOL)) {
    if (mappedSymbol === normalized && (priceKey.includes('_USD_TOZ') || priceKey.endsWith('_USD_LB') || priceKey.endsWith('_USD_TONNE'))) {
      return priceKey;
    }
  }
  return null;
}
