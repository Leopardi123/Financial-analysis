export type VerifiedProjectCalendarAxis = {
  yearsByPeriod: number[];
  periodEndDatesUtc: string[];
  productionStartYear: number;
};

export type ProjectCalendarAxisResult =
  | { ok: true; value: VerifiedProjectCalendarAxis }
  | { ok: false; error: string };

const fail = (detail: string): ProjectCalendarAxisResult => ({
  ok: false,
  error: `Ej verifierad Project timeline: ${detail}`,
});

/**
 * Reconciles the complete project JSON time axis with the engine axis. Project
 * charts must never invent presentation years from an array index or offset.
 * `masterN` is the inclusive final period index, hence every series has N + 1 rows.
 */
export function verifyProjectCalendarAxis(args: {
  masterN: number;
  fcffLength: number;
  productionStartPeriod: number;
  productionStartYear?: number | null;
  periodEndDatesUtc?: unknown;
  yearsByPeriod?: unknown;
}): ProjectCalendarAxisResult {
  if (!Number.isInteger(args.masterN) || args.masterN < 0) return fail('masterN must be a non-negative integer');
  const expectedLength = args.masterN + 1;
  if (args.fcffLength !== expectedLength) return fail(`FCFF length=${args.fcffLength}, expected masterN+1=${expectedLength}`);
  if (!Array.isArray(args.periodEndDatesUtc)) return fail('time.periodEndDatesUtc is missing');
  if (args.periodEndDatesUtc.length !== expectedLength) return fail(`time.periodEndDatesUtc length=${args.periodEndDatesUtc.length}, expected ${expectedLength}`);
  if (!Array.isArray(args.yearsByPeriod)) return fail('yearsByPeriod is missing');
  if (args.yearsByPeriod.length !== expectedLength) return fail(`yearsByPeriod length=${args.yearsByPeriod.length}, expected ${expectedLength}`);
  if (!Number.isInteger(args.productionStartPeriod) || args.productionStartPeriod < 0 || args.productionStartPeriod >= expectedLength) {
    return fail(`productionStartPeriod=${args.productionStartPeriod} is outside 0..${args.masterN}`);
  }

  const dates: string[] = [];
  const dateYears: number[] = [];
  for (let periodIndex = 0; periodIndex < expectedLength; periodIndex += 1) {
    const rawDate = args.periodEndDatesUtc[periodIndex];
    if (typeof rawDate !== 'string') return fail(`time.periodEndDatesUtc[${periodIndex}] is not a date string`);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
    const timestamp = Date.parse(`${rawDate}T00:00:00Z`);
    if (!match || !Number.isFinite(timestamp)) return fail(`time.periodEndDatesUtc[${periodIndex}]=${rawDate} is invalid`);
    dates.push(rawDate);
    dateYears.push(Number(match[1]));
    if (periodIndex > 0 && rawDate <= dates[periodIndex - 1]) return fail(`period dates are not strictly chronological at index ${periodIndex}`);
  }

  const years = args.yearsByPeriod.map((value, periodIndex) => {
    if (!Number.isInteger(value)) return null;
    return value === dateYears[periodIndex] ? value as number : null;
  });
  const mismatch = years.findIndex((value) => value === null);
  if (mismatch >= 0) return fail(`yearsByPeriod[${mismatch}]=${String(args.yearsByPeriod[mismatch])} does not match periodEndDatesUtc year=${dateYears[mismatch]}`);

  const resolvedProductionStartYear = dateYears[args.productionStartPeriod];
  if (args.productionStartYear != null && args.productionStartYear !== resolvedProductionStartYear) {
    return fail(`productionStartYear=${args.productionStartYear} does not match period ${args.productionStartPeriod} year=${resolvedProductionStartYear}`);
  }
  return { ok: true, value: { yearsByPeriod: years as number[], periodEndDatesUtc: dates, productionStartYear: resolvedProductionStartYear } };
}
