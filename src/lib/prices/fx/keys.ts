export function fxKeyUSDTo(targetCurrency: string): string {
  const normalized = targetCurrency.toUpperCase().replace(/[^A-Z]/g, '');
  return `FX_USD_${normalized}`;
}
