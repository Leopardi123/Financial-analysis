import {
  parseProjectJsonV1 as parseProjectJsonV1Legacy,
  type ParsedProjectJsonV1,
} from './parseLegacy.ts';

export type { ProjectJsonV1Context, ParsedProjectJsonV1 } from './parseLegacy.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseStrictOptionalSeries(
  raw: unknown,
  fieldName: 'taxCashFlowUSD' | 'terminalProceedsUSD',
  expectedLength: number,
): Array<number | null> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const series = (raw as { series?: unknown }).series;
  if (!series || typeof series !== 'object' || Array.isArray(series)) {
    return null;
  }
  const valueRaw = (series as Record<string, unknown>)[fieldName];
  if (valueRaw === undefined || valueRaw === null) {
    return null;
  }
  if (!Array.isArray(valueRaw)) {
    throw new Error(`series.${fieldName} must be an array of length ${expectedLength} (masterN+1).`);
  }
  if (valueRaw.length !== expectedLength) {
    throw new Error(
      `series.${fieldName} must be an array of length ${expectedLength} (masterN+1). Received array length ${valueRaw.length}.`,
    );
  }

  return valueRaw.map((value, index) => {
    if (value === null) {
      return null;
    }
    if (!isFiniteNumber(value)) {
      throw new Error(
        `series.${fieldName}[${index}] must be null or a finite number. Received ${JSON.stringify(value)}.`,
      );
    }
    if (fieldName === 'terminalProceedsUSD' && value < 0) {
      throw new Error(`series.terminalProceedsUSD[${index}] must be null or a finite number >= 0.`);
    }
    return value;
  });
}

/**
 * Backwards-compatible parser overlay for report-locked cash-flow fields.
 * The preserved legacy parser remains authoritative for every pre-existing
 * project field. If neither overlay field exists, the parsed result is returned
 * unchanged, which keeps existing Project/Corporate calculations on the old path.
 */
export function parseProjectJsonV1(raw: any): ParsedProjectJsonV1 {
  const parsed = parseProjectJsonV1Legacy(raw);
  const expectedLength = parsed.engineInput.masterN + 1;
  const taxCashFlowUSD = parseStrictOptionalSeries(raw, 'taxCashFlowUSD', expectedLength);
  const terminalProceedsUSD = parseStrictOptionalSeries(raw, 'terminalProceedsUSD', expectedLength);

  if (taxCashFlowUSD !== null) {
    if (parsed.engineInputWithoutPrices.taxRate !== null) {
      throw new Error('series.taxCashFlowUSD is mutually exclusive with economics.taxRate');
    }
    parsed.engineInput.phase1.taxCashFlowUSD = [...taxCashFlowUSD];
    parsed.engineInputWithoutPrices.phase1.taxCashFlowUSD = [...taxCashFlowUSD];
  }

  if (terminalProceedsUSD !== null) {
    parsed.engineInput.phase1.terminalProceedsUSD = [...terminalProceedsUSD];
    parsed.engineInputWithoutPrices.phase1.terminalProceedsUSD = [...terminalProceedsUSD];
  }

  return parsed;
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
  return parseProjectJsonV1(raw);
}
