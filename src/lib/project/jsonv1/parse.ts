import {
  parseProjectJsonV1 as parseProjectJsonV1Legacy,
  type ParsedProjectJsonV1,
} from './parseLegacy.ts';
import { isProjectJsonV3, parseProjectJsonV3 } from '../jsonv3/compile.ts';
import { validateProjectJsonV3SingleSource } from '../jsonv3/validateSingleSource.ts';

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
    if (value === null) return null;
    if (!isFiniteNumber(value)) {
      throw new Error(`series.${fieldName}[${index}] must be null or a finite number. Received ${JSON.stringify(value)}.`);
    }
    if (fieldName === 'terminalProceedsUSD' && value < 0) {
      throw new Error(`series.terminalProceedsUSD[${index}] must be null or a finite number >= 0.`);
    }
    return value;
  });
}

function parseProjectJsonV2(raw: any): ParsedProjectJsonV1 {
  const parsed = parseProjectJsonV1Legacy(raw);
  const expectedLength = parsed.engineInput.masterN + 1;
  parseStrictOptionalSeries(raw, 'taxCashFlowUSD', expectedLength);
  const terminalProceedsUSD = parseStrictOptionalSeries(raw, 'terminalProceedsUSD', expectedLength);
  if (terminalProceedsUSD !== null) {
    parsed.engineInput.phase1.terminalProceedsUSD = [...terminalProceedsUSD];
    parsed.engineInputWithoutPrices.phase1.terminalProceedsUSD = [...terminalProceedsUSD];
  }
  return parsed;
}

/**
 * Transitional read-only bridge for legacy runtime code that still reads
 * raw.time.productionStartYear directly.
 *
 * V3 deliberately does NOT store productionStartYear. The canonical calendar
 * axis is resolved from runtimePlacement by parseProjectJsonV3. This proxy only
 * exposes that already-resolved year through property access. It is not an own
 * property, is omitted by Object.keys/JSON.stringify, and therefore cannot leak
 * back into stored project_json_v3 or defeat the single-source validator.
 */
function installV3RuntimeTimeReadBridge(raw: unknown, parsed: ParsedProjectJsonV1): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const root = raw as Record<string, unknown>;
  const timeValue = root.time;
  if (!timeValue || typeof timeValue !== 'object' || Array.isArray(timeValue)) return;

  const time = timeValue as Record<string, unknown>;
  if (
    Number.isInteger(time.productionStartYear)
    && !Object.prototype.hasOwnProperty.call(time, 'productionStartYear')
  ) {
    return;
  }

  const engine = parsed.engineInputWithoutPrices;
  const productionStartYear = engine.yearsByPeriod[engine.productionStartPeriod];
  if (!Number.isInteger(productionStartYear)) {
    throw new Error('Canonical parsed project timeline does not resolve a productionStartYear.');
  }

  root.time = new Proxy(time, {
    get(target, property, receiver) {
      if (property === 'productionStartYear') return productionStartYear;
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (property === 'productionStartYear') return true;
      return Reflect.has(target, property);
    },
  });
}

/** Version-dispatching parser. V2 and V3 compile to the same canonical engine input. */
export function parseProjectJsonV1(raw: any): ParsedProjectJsonV1 {
  if (isProjectJsonV3(raw)) {
    validateProjectJsonV3SingleSource(raw);
    const parsed = parseProjectJsonV3(raw);
    installV3RuntimeTimeReadBridge(raw, parsed);
    return parsed;
  }
  return parseProjectJsonV2(raw);
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
  return parseProjectJsonV1(raw);
}
