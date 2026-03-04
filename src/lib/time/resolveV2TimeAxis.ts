export type ResolvedV2TimeAxis = {
  masterN: number;
  productionStartPeriod: number;
  productionStartYear: number;
  yearsByPeriod: number[];
};

function readFiniteInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be a finite integer`);
  }
  return value;
}

export function resolveV2TimeAxis(time: {
  masterN: number;
  productionStartPeriod: number;
  productionStartYear: number;
}): ResolvedV2TimeAxis {
  const masterN = readFiniteInteger(time.masterN, 'time.masterN');
  if (masterN < 0) {
    throw new Error('time.masterN must be >= 0');
  }

  const productionStartPeriod = readFiniteInteger(time.productionStartPeriod, 'time.productionStartPeriod');
  if (productionStartPeriod < 0 || productionStartPeriod > masterN) {
    throw new Error('time.productionStartPeriod must satisfy 0 <= productionStartPeriod <= masterN');
  }

  const productionStartYear = readFiniteInteger(time.productionStartYear, 'time.productionStartYear');

  const yearsByPeriod = Array.from({ length: masterN + 1 }, (_, t) => productionStartYear + (t - productionStartPeriod));

  return {
    masterN,
    productionStartPeriod,
    productionStartYear,
    yearsByPeriod,
  };
}

export function yearLabelFromV2(
  time: { masterN: number; productionStartPeriod: number; productionStartYear: number },
  t: number,
): string {
  const resolved = resolveV2TimeAxis(time);
  if (!Number.isInteger(t) || t < 0 || t > resolved.masterN) {
    return '—';
  }
  return String(resolved.yearsByPeriod[t]);
}
