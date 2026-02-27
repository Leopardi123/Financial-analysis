export function fxKeyUSDTo(targetCurrency: string): string {
  const normalized = targetCurrency.toUpperCase().replace(/[^A-Z]/g, '');
  return `FX_USD_${normalized}`;
}

function normalizeCurrencyCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z]/g, '');
}

export function fxLookupCandidatesUSDTo(targetCurrency: string): Array<{ priceKey: string; invert: boolean }> {
  const normalizedTarget = normalizeCurrencyCode(targetCurrency);
  if (!normalizedTarget || normalizedTarget === 'USD') {
    return [];
  }

  return [
    { priceKey: `USD_${normalizedTarget}`, invert: false },
    { priceKey: `FX_USD_${normalizedTarget}`, invert: false },
    { priceKey: `${normalizedTarget}_USD`, invert: true },
    { priceKey: `FX_${normalizedTarget}_USD`, invert: true },
  ];
}
