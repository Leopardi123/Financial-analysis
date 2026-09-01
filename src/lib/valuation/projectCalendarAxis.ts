export type ProjectJsonVersion = 'project_json_v1' | 'project_json_v2' | 'project_json_v3';

export type NormalizedProjectCalendarAxis = {
  yearsByPeriod: number[];
  periodEndDatesUtc: string[] | null;
  source: 'parsed-canonical-years' | 'yearsByPeriod' | 'calendarYears' | 'periodEndDatesUtc';
};

export type VerifiedProjectCalendarAxis = NormalizedProjectCalendarAxis & {
  productionStartYear: number;
};

export type ProjectCalendarAxisResult<T = VerifiedProjectCalendarAxis> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const fail = <T>(detail: string): ProjectCalendarAxisResult<T> => ({
  ok: false,
  error: `Ej verifierad Project timeline: ${detail}`,
});

function readAbsoluteYears(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every((year) => Number.isInteger(year) && year >= 1000 && year <= 9999)
    ? value as number[]
    : null;
}

function readDates(value: unknown): { dates: string[]; years: number[] } | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const dates: string[] = [];
  const years: number[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match || !Number.isFinite(Date.parse(`${raw}T00:00:00Z`))) return null;
    dates.push(raw);
    years.push(Number(match[1]));
  }
  return { dates, years };
}

/** Build one absolute axis from supported, already-modelled time sources. */
export function normalizeProjectCalendarAxis(args: {
  parsedCanonicalYears?: unknown;
  yearsByPeriod?: unknown;
  calendarYears?: unknown;
  periodEndDatesUtc?: unknown;
}): ProjectCalendarAxisResult<NormalizedProjectCalendarAxis> {
  const dates = readDates(args.periodEndDatesUtc);
  if (args.periodEndDatesUtc != null && !dates) return fail('periodEndDatesUtc finns men innehåller ogiltiga perioddatum');
  const candidates = [
    ['parsed-canonical-years', readAbsoluteYears(args.parsedCanonicalYears)],
    ['yearsByPeriod', readAbsoluteYears(args.yearsByPeriod)],
    ['calendarYears', readAbsoluteYears(args.calendarYears)],
    ['periodEndDatesUtc', dates?.years ?? null],
  ] as const;
  const selected = candidates.find((candidate) => candidate[1] !== null);
  if (!selected) return fail('inga absoluta periodår kan härledas från den parsade eller lagrade projektmodellen');
  return { ok: true, value: { yearsByPeriod: [...(selected[1] as number[])], periodEndDatesUtc: dates?.dates ?? null, source: selected[0] } };
}

/** Verify the normalized result; raw dates are reconciled when the schema provides them. */
export function verifyNormalizedProjectCalendarAxis(args: {
  version: ProjectJsonVersion;
  normalized: NormalizedProjectCalendarAxis;
  masterN: number;
  fcffLength: number;
  productionStartPeriod: number;
  productionStartYear?: number | null;
}): ProjectCalendarAxisResult {
  if (!Number.isInteger(args.masterN) || args.masterN < 0) return fail('masterN must be a non-negative integer');
  const periodCount = args.normalized.yearsByPeriod.length;
  const allowedCounts = args.version === 'project_json_v1' ? [args.masterN, args.masterN + 1] : [args.masterN + 1];
  if (!allowedCounts.includes(periodCount)) {
    return fail(`normaliserad periodmängd=${periodCount}, expected ${allowedCounts.join(' or ')} for ${args.version}`);
  }
  if (args.fcffLength !== periodCount) return fail(`FCFF length=${args.fcffLength}, normaliserad periodmängd=${periodCount}`);
  if (!Number.isInteger(args.productionStartPeriod) || args.productionStartPeriod < 0 || args.productionStartPeriod >= periodCount) {
    return fail(`productionStartPeriod=${args.productionStartPeriod} is outside 0..${periodCount - 1}`);
  }
  for (let index = 1; index < periodCount; index += 1) {
    if (args.normalized.yearsByPeriod[index] <= args.normalized.yearsByPeriod[index - 1]) return fail(`periodåren är inte strikt kronologiska vid index ${index}`);
  }
  if (args.normalized.periodEndDatesUtc) {
    if (args.normalized.periodEndDatesUtc.length !== periodCount) return fail(`periodEndDatesUtc length=${args.normalized.periodEndDatesUtc.length}, normaliserad periodmängd=${periodCount}`);
    for (let index = 0; index < periodCount; index += 1) {
      const dateYear = Number(args.normalized.periodEndDatesUtc[index].slice(0, 4));
      if (dateYear !== args.normalized.yearsByPeriod[index]) return fail(`periodEndDatesUtc[${index}] year=${dateYear}, normaliserat år=${args.normalized.yearsByPeriod[index]}`);
    }
  }
  const resolvedProductionStartYear = args.normalized.yearsByPeriod[args.productionStartPeriod];
  if (args.version === 'project_json_v2' && !Number.isInteger(args.productionStartYear)) return fail('productionStartYear saknas för project_json_v2');
  if (args.productionStartYear != null && args.productionStartYear !== resolvedProductionStartYear) {
    return fail(`productionStartYear=${args.productionStartYear} does not match period ${args.productionStartPeriod} year=${resolvedProductionStartYear}`);
  }
  return { ok: true, value: { ...args.normalized, productionStartYear: resolvedProductionStartYear } };
}

/** Compatibility composition for callers that already have one yearsByPeriod source. */
export function verifyProjectCalendarAxis(args: {
  version?: ProjectJsonVersion;
  masterN: number;
  fcffLength: number;
  productionStartPeriod: number;
  productionStartYear?: number | null;
  periodEndDatesUtc?: unknown;
  yearsByPeriod?: unknown;
  calendarYears?: unknown;
  parsedCanonicalYears?: unknown;
}): ProjectCalendarAxisResult {
  const normalized = normalizeProjectCalendarAxis(args);
  if (!normalized.ok) return normalized;
  return verifyNormalizedProjectCalendarAxis({
    version: args.version ?? 'project_json_v2', normalized: normalized.value,
    masterN: args.masterN, fcffLength: args.fcffLength,
    productionStartPeriod: args.productionStartPeriod, productionStartYear: args.productionStartYear,
  });
}
