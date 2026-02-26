export interface MonthlyPricePayload {
  dates: string[];
  close: number[];
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  volume?: Array<number | null>;
}

function assertAligned(payload: MonthlyPricePayload): void {
  const expected = payload.dates.length;
  const fields: Array<[string, Array<number | null> | number[] | undefined]> = [
    ["close", payload.close],
    ["open", payload.open],
    ["high", payload.high],
    ["low", payload.low],
    ["volume", payload.volume],
  ];

  for (const [field, values] of fields) {
    if (!values) continue;
    if (values.length !== expected) {
      throw new Error(`Monthly payload field ${field} must match dates length`);
    }
  }
}

function compareDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function normalizePayload(payload: MonthlyPricePayload): MonthlyPricePayload {
  assertAligned(payload);
  const rows = payload.dates.map((date, index) => ({
    date,
    close: payload.close[index],
    open: payload.open?.[index] ?? null,
    high: payload.high?.[index] ?? null,
    low: payload.low?.[index] ?? null,
    volume: payload.volume?.[index] ?? null,
  }));

  rows.sort((left, right) => compareDate(left.date, right.date));

  return {
    dates: rows.map((row) => row.date),
    close: rows.map((row) => row.close),
    open: payload.open ? rows.map((row) => row.open) : undefined,
    high: payload.high ? rows.map((row) => row.high) : undefined,
    low: payload.low ? rows.map((row) => row.low) : undefined,
    volume: payload.volume ? rows.map((row) => row.volume) : undefined,
  };
}

export function encodeMonthlyPayload(payload: MonthlyPricePayload): string {
  return JSON.stringify(normalizePayload(payload));
}

export function decodeMonthlyPayload(payload: string): MonthlyPricePayload {
  const parsed = JSON.parse(payload) as MonthlyPricePayload;
  return normalizePayload(parsed);
}

export function mergeMonthlyPayload(base: MonthlyPricePayload, updates: MonthlyPricePayload): MonthlyPricePayload {
  assertAligned(base);
  assertAligned(updates);

  const byDate = new Map<string, { close: number; open: number | null; high: number | null; low: number | null; volume: number | null }>();

  const consume = (payload: MonthlyPricePayload) => {
    for (let index = 0; index < payload.dates.length; index += 1) {
      byDate.set(payload.dates[index], {
        close: payload.close[index],
        open: payload.open?.[index] ?? null,
        high: payload.high?.[index] ?? null,
        low: payload.low?.[index] ?? null,
        volume: payload.volume?.[index] ?? null,
      });
    }
  };

  consume(base);
  consume(updates);

  const sortedDates = [...byDate.keys()].sort(compareDate);

  const usesOpen = Boolean(base.open || updates.open);
  const usesHigh = Boolean(base.high || updates.high);
  const usesLow = Boolean(base.low || updates.low);
  const usesVolume = Boolean(base.volume || updates.volume);

  return {
    dates: sortedDates,
    close: sortedDates.map((date) => byDate.get(date)?.close ?? null).map((value) => value as number),
    open: usesOpen ? sortedDates.map((date) => byDate.get(date)?.open ?? null) : undefined,
    high: usesHigh ? sortedDates.map((date) => byDate.get(date)?.high ?? null) : undefined,
    low: usesLow ? sortedDates.map((date) => byDate.get(date)?.low ?? null) : undefined,
    volume: usesVolume ? sortedDates.map((date) => byDate.get(date)?.volume ?? null) : undefined,
  };
}

export function sliceMonthlyPayload(payload: MonthlyPricePayload, fromDate: string, toDate: string): MonthlyPricePayload {
  assertAligned(payload);
  if (fromDate > toDate) {
    throw new Error("fromDate must be <= toDate");
  }

  const normalized = normalizePayload(payload);
  const includedIndices: number[] = [];

  normalized.dates.forEach((date, index) => {
    if (date >= fromDate && date <= toDate) {
      includedIndices.push(index);
    }
  });

  return {
    dates: includedIndices.map((index) => normalized.dates[index]),
    close: includedIndices.map((index) => normalized.close[index]),
    open: normalized.open ? includedIndices.map((index) => normalized.open?.[index] ?? null) : undefined,
    high: normalized.high ? includedIndices.map((index) => normalized.high?.[index] ?? null) : undefined,
    low: normalized.low ? includedIndices.map((index) => normalized.low?.[index] ?? null) : undefined,
    volume: normalized.volume ? includedIndices.map((index) => normalized.volume?.[index] ?? null) : undefined,
  };
}
