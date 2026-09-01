export type CorporateProductionLife = {
  lomYears: number | null;
  activeProductionYears: number | null;
  firstProductionPeriod: number | null;
  lastProductionPeriod: number | null;
  firstProductionYear: number | null;
  lastProductionYear: number | null;
  status: 'OK' | 'MISSING_PAYABLE_SERIES' | 'INVALID_PAYABLE_SERIES';
  diagnostic: string | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Canonical Corporate pre-revenue production life.
 *
 * LOM is the chronological annual span from the first period with positive
 * physical payable production in any metal through the last such period,
 * inclusive. Zero-production gaps inside that span remain part of LOM; closure
 * periods after the last payable production do not.
 *
 * This deliberately does not use AuEq, revenue, or a selected reference metal,
 * so the result is independent of scenario prices and metal selection.
 */
export function deriveCorporateProductionLife(args: {
  payableQtyByMetal?: Record<string, Array<number | null>> | null;
  corporateYearsByPeriod?: number[] | null;
}): CorporateProductionLife {
  const entries = Object.entries(args.payableQtyByMetal ?? {}).filter(([, series]) => Array.isArray(series) && series.length > 0);
  if (entries.length === 0) {
    return {
      lomYears: null,
      activeProductionYears: null,
      firstProductionPeriod: null,
      lastProductionPeriod: null,
      firstProductionYear: null,
      lastProductionYear: null,
      status: 'MISSING_PAYABLE_SERIES',
      diagnostic: 'Canonical physical payable-by-metal series are unavailable.',
    };
  }

  const length = entries[0][1].length;
  if (!entries.every(([, series]) => series.length === length)) {
    return {
      lomYears: null,
      activeProductionYears: null,
      firstProductionPeriod: null,
      lastProductionPeriod: null,
      firstProductionYear: null,
      lastProductionYear: null,
      status: 'INVALID_PAYABLE_SERIES',
      diagnostic: 'Canonical payable-by-metal series have inconsistent lengths.',
    };
  }

  for (const [metal, series] of entries) {
    if (series.some((value) => finite(value) && value < 0)) {
      return {
        lomYears: null,
        activeProductionYears: null,
        firstProductionPeriod: null,
        lastProductionPeriod: null,
        firstProductionYear: null,
        lastProductionYear: null,
        status: 'INVALID_PAYABLE_SERIES',
        diagnostic: `Canonical payable series for ${metal} contains a negative quantity.`,
      };
    }
  }

  const active = Array.from({ length }, (_, t) => entries.some(([, series]) => finite(series[t]) && (series[t] as number) > 0));
  const first = active.findIndex(Boolean);
  let last = -1;
  for (let t = active.length - 1; t >= 0; t -= 1) {
    if (active[t]) { last = t; break; }
  }

  if (first < 0 || last < first) {
    return {
      lomYears: null,
      activeProductionYears: null,
      firstProductionPeriod: null,
      lastProductionPeriod: null,
      firstProductionYear: null,
      lastProductionYear: null,
      status: 'INVALID_PAYABLE_SERIES',
      diagnostic: 'No positive physical payable-production period is available.',
    };
  }

  // If every metal is unknown in a period inside the production span, the span
  // is not fully evidenced. Explicit zeros are valid and represent an idle gap.
  for (let t = first; t <= last; t += 1) {
    const allUnknown = entries.every(([, series]) => series[t] === null || series[t] === undefined || !finite(series[t]));
    if (allUnknown) {
      return {
        lomYears: null,
        activeProductionYears: null,
        firstProductionPeriod: first,
        lastProductionPeriod: last,
        firstProductionYear: null,
        lastProductionYear: null,
        status: 'INVALID_PAYABLE_SERIES',
        diagnostic: `All canonical payable-metal quantities are unknown at period ${t} inside the production span.`,
      };
    }
  }

  const years = args.corporateYearsByPeriod;
  const yearsValid = Array.isArray(years)
    && years.length === length
    && years.every((year) => Number.isInteger(year))
    && years.every((year, index) => index === 0 || year === (years[index - 1] as number) + 1);

  const firstYear = yearsValid ? years[first] : null;
  const lastYear = yearsValid ? years[last] : null;
  const lomYears = yearsValid && finite(firstYear) && finite(lastYear)
    ? lastYear - firstYear + 1
    : last - first + 1;

  return {
    lomYears,
    activeProductionYears: active.slice(first, last + 1).filter(Boolean).length,
    firstProductionPeriod: first,
    lastProductionPeriod: last,
    firstProductionYear: firstYear,
    lastProductionYear: lastYear,
    status: 'OK',
    diagnostic: null,
  };
}
