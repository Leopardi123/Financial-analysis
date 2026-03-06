const PLACEHOLDER_STRINGS = new Set(['—', '-', 'n/a', 'na', 'null', 'undefined']);

export function cellHasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return false;
    return !PLACEHOLDER_STRINGS.has(normalized.toLowerCase());
  }

  if (typeof value === 'boolean') return true;
  if (typeof value === 'bigint') return value !== 0n;

  return true;
}

export function rowHasDisplayValue(values: Array<unknown> | null | undefined): boolean {
  return Array.isArray(values) && values.some((value) => cellHasDisplayValue(value));
}
