export const EXTRA_SHARES_HELP = 'Fritt antal ytterligare aktier som läggs ovanpå beräknat antal aktier post finance.';

export function parseExtraShares(value: string | number | null | undefined): number {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.MAX_SAFE_INTEGER;
}

export function formatExtraSharesInput(value: string | number | null | undefined): string {
  if (String(value ?? '').trim() === '') return '';
  return parseExtraShares(value).toLocaleString('sv-SE', { maximumFractionDigits: 0 });
}

export function extraSharesStorageKey(scope: 'project' | 'corporate', ticker: string, projectId?: string | null): string {
  return `marketBox.extraShares.v1.${scope}.${ticker.toUpperCase()}.${scope === 'project' ? projectId ?? 'none' : 'consolidated'}`;
}
