export type MetalFailureEntry = Record<string, unknown>;

export function extractFailingMetals(raw: unknown): Record<string, MetalFailureEntry[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, MetalFailureEntry[]> = {};
  for (const [metal, entriesRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(entriesRaw)) continue;
    const failing = entriesRaw.filter((entry) => {
      const rec = (entry ?? null) as Record<string, unknown> | null;
      return rec?.isExpectedToCompute === true && rec?.didCompute === false;
    }) as MetalFailureEntry[];
    if (failing.length > 0) out[metal] = failing;
  }
  return out;
}

export function rowHasMetalRevenueFailure(label: string, metals: string[]): boolean {
  return metals.some((metal) =>
    label.includes(` ${metal} `) || label.includes(` ${metal}(`) || label.includes(` ${metal})`),
  );
}

export function extractFallbackOrFailingPriceMetals(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, itemRaw]) => {
      const item = (itemRaw ?? null) as Record<string, unknown> | null;
      const source = typeof item?.priceSourceUsed === 'string' ? item.priceSourceUsed : '';
      return source === 'json-fallback' || source === 'failure';
    })
    .map(([metal]) => metal)
    .sort((a, b) => a.localeCompare(b));
}
