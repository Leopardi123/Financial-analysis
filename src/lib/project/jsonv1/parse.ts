import {
  parseProjectJsonV1 as parseProjectJsonV1Legacy,
  type ParsedProjectJsonV1,
} from './parseLegacy.ts';

export type { ProjectJsonV1Context, ParsedProjectJsonV1 } from './parseLegacy.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseExplicitTaxCashFlow(raw: unknown, expectedLength: number): Array<number | null> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const series = (raw as { series?: unknown }).series;
  if (!series || typeof series !== 'object' || Array.isArray(series)) {
    return null;
  }
  const taxCashFlowRaw = (series as { taxCashFlowUSD?: unknown }).taxCashFlowUSD;
  if (taxCashFlowRaw === undefined || taxCashFlowRaw === null) {
    return null;
  }
  if (!Array.isArray(taxCashFlowRaw)) {
    throw new Error(
      `series.taxCashFlowUSD must be an array of length ${expectedLength} (masterN+1).`,
    );
  }
  if (taxCashFlowRaw.length !== expectedLength) {
    throw new Error(
      `series.taxCashFlowUSD must be an array of length ${expectedLength} (masterN+1). Received array length ${taxCashFlowRaw.length}.`,
    );
  }

  return taxCashFlowRaw.map((value, index) => {
    if (value === null) {
      return null;
    }
    if (!isFiniteNumber(value)) {
      throw new Error(
        `series.taxCashFlowUSD[${index}] must be null or a finite number. Received ${JSON.stringify(value)}.`,
      );
    }
    return value;
  });
}

/**
 * Backwards-compatible parser overlay for report-locked tax cash flows.
 *
 * The legacy parser remains the source of truth for every pre-existing field.
 * If series.taxCashFlowUSD is absent, the returned engine input is therefore
 * identical to the legacy path. When present, only the new optional Phase 1
 * field is added. taxRate and taxCashFlowUSD are deliberately mutually
 * exclusive so an explicit report tax series can never be double-counted.
 */
export function parseProjectJsonV1(raw: any): ParsedProjectJsonV1 {
  const parsed = parseProjectJsonV1Legacy(raw);
  const expectedLength = parsed.engineInput.masterN + 1;
  const taxCashFlowUSD = parseExplicitTaxCashFlow(raw, expectedLength);

  if (taxCashFlowUSD === null) {
    return parsed;
  }

  if (parsed.engineInputWithoutPrices.taxRate !== null) {
    throw new Error('series.taxCashFlowUSD is mutually exclusive with economics.taxRate');
  }

  parsed.engineInput.phase1.taxCashFlowUSD = [...taxCashFlowUSD];
  parsed.engineInputWithoutPrices.phase1.taxCashFlowUSD = [...taxCashFlowUSD];
  return parsed;
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
  return parseProjectJsonV1(raw);
}
