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
 * Backwards-compatible parser overlay for report evidence and terminal cash flow.
 *
 * `series.taxCashFlowUSD` is validated here as report-deck reconciliation evidence,
 * but is deliberately NOT copied into canonical Project/Corporate runtime inputs.
 * Normal runtime tax must continue to be derived dynamically from the runtime tax
 * model (currently economics.taxRate where available) after canonical prices have
 * produced runtime EBIT. Keeping the report tax series in raw JSON lets a separate
 * reconciliation/control path consume it without freezing spot tax.
 *
 * `series.terminalProceedsUSD` is different: salvage/disposal proceeds are genuine
 * project cash-flow timing inputs and remain part of normal runtime FCFF.
 */
export function parseProjectJsonV1(raw: any): ParsedProjectJsonV1 {
  const parsed = parseProjectJsonV1Legacy(raw);
  const expectedLength = parsed.engineInput.masterN + 1;

  // Hard validation only. Do not inject report tax cash flow into runtime engine input.
  parseStrictOptionalSeries(raw, 'taxCashFlowUSD', expectedLength);

  const terminalProceedsUSD = parseStrictOptionalSeries(raw, 'terminalProceedsUSD', expectedLength);
  if (terminalProceedsUSD !== null) {
    parsed.engineInput.phase1.terminalProceedsUSD = [...terminalProceedsUSD];
    parsed.engineInputWithoutPrices.phase1.terminalProceedsUSD = [...terminalProceedsUSD];
  }

  return parsed;
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
  return parseProjectJsonV1(raw);
}
