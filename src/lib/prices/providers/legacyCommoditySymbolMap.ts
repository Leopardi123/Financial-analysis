const LEGACY_PRICE_KEY_TO_SYMBOL: Record<string, string> = {
  XAU_USD_TOZ: 'GCUSD',
  XAG_USD_TOZ: 'SIUSD',
  XPD_USD_TOZ: 'PAUSD',
  XPT_USD_TOZ: 'PLUSD',
  CU_USD_LB: 'HGUSD',
  NI_USD_LB: 'NIUSD',
  CO_USD_LB: 'COBALT',
  ZN_USD_LB: 'ZNUSD',
  PB_USD_LB: 'PBUSD',
  SN_USD_LB: 'SNUSD',
  AL_USD_LB: 'ALUSD',
  URANIUM_USD_LB: 'URANIUM',
  USD_CAD: 'USDCAD',
  FX_USD_CAD: 'USDCAD',
  CAD_USD: 'CADUSD',
  FX_CAD_USD: 'CADUSD',
  USD_SEK: 'USDSEK',
  FX_USD_SEK: 'USDSEK',
  SEK_USD: 'SEKUSD',
  FX_SEK_USD: 'SEKUSD',
  USD_EUR: 'USDEUR',
  FX_USD_EUR: 'USDEUR',
  EUR_USD: 'EURUSD',
  FX_EUR_USD: 'EURUSD',
};

const LEGACY_SYMBOL_PATTERN = /^[A-Z0-9]+$/;

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
    if (mappedSymbol !== normalized) {
      continue;
    }

    if (priceKey.includes('_USD_TOZ') || priceKey.endsWith('_USD_LB') || priceKey.endsWith('_USD_TONNE')) {
      return priceKey;
    }
  }
  return null;
}
