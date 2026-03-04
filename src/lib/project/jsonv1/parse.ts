import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import { PRICE_KEY_DEFINITIONS, PRICE_KEY_SET } from '../../prices/keys.ts';
import type { ProjectJsonV1, QtyUnit } from './schema.ts';
import { buildProductionDriverFirstNonZeroMap, productionStartIndexCandidate } from '../validation/productionStartAlignment.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripChoiceKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripChoiceKeysDeep(item)) as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith('_choices_')) {
      continue;
    }
    out[key] = stripChoiceKeysDeep(nested);
  }
  return out as T;
}

function deepCloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPeriodSeriesCandidate(value: unknown, expectedLength: number): value is Array<number | null> {
  return Array.isArray(value)
    && value.length === expectedLength
    && value.every((item) => item === null || typeof item === 'number');
}

function shiftArray(arr: Array<number | null>, shift: number): Array<number | null> {
  const len = arr.length;
  const newArr = new Array<number | null>(len).fill(null);
  for (let t = 0; t < len; t += 1) {
    const srcIndex = t - shift;
    if (srcIndex >= 0 && srcIndex < len) {
      newArr[t] = arr[srcIndex];
    }
  }
  return newArr;
}

function shiftPeriodSeriesDeep(value: unknown, expectedLength: number, shift: number): unknown {
  if (isPeriodSeriesCandidate(value, expectedLength)) {
    return shiftArray(value, shift);
  }
  if (Array.isArray(value)) {
    return value.map((item) => shiftPeriodSeriesDeep(item, expectedLength, shift));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = shiftPeriodSeriesDeep(nested, expectedLength, shift);
  }
  return out;
}

function fail(path: string, expected: string, actual: unknown): never {
  throw new Error(`${path} expected ${expected}, received ${JSON.stringify(actual)}`);
}

type NormalizationDiagnostic = {
  rule: string;
  path: string;
  summary: string;
};

function formatValueForMessage(value: unknown): string {
  if (typeof value === 'number') {
    return `number ${value}`;
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }
  return `${typeof value} ${JSON.stringify(value)}`;
}

function formatArrayExample(value: number, length: number): string {
  return `[${Array.from({ length }, () => String(value)).join(', ')}]`;
}

function recordSeriesDiagnostic(args: {
  diagnostics: NormalizationDiagnostic[];
  rule: string;
  path: string;
  series: Array<number | null>;
}): void {
  const { diagnostics, rule, path, series } = args;
  const head = series.slice(0, 3);
  const tail = series.slice(-3);
  diagnostics.push({
    rule,
    path,
    summary: `length=${series.length}; head=${JSON.stringify(head)}; tail=${JSON.stringify(tail)}`,
  });
}

function asInteger(value: unknown, path: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    fail(path, `integer >= ${min}`, value);
  }
  return value;
}

function asSeries(value: unknown, path: string, expectedLength: number): Array<number | null> {
  if (!Array.isArray(value)) {
    const sample = isFiniteNumber(value) ? formatArrayExample(value, expectedLength) : formatArrayExample(0, expectedLength);
    throw new Error(`${path} must be an array of length ${expectedLength} (masterN+1). Received ${formatValueForMessage(value)}. Example: ${sample}. Tip: Use 'Fill array with scalar' auto-fix.`);
  }
  if (value.length !== expectedLength) {
    throw new Error(`${path} must be an array of length ${expectedLength} (masterN+1). Received array length ${value.length}. Example: ${formatArrayExample(0, expectedLength)}. Tip: Use 'Fill array with scalar' auto-fix for scalar values.`);
  }
  return value as Array<number | null>;
}

function normalizeSeriesToMasterLength(args: {
  value: unknown;
  path: string;
  expectedLength: number;
  safeToZero: boolean;
  allowScalarBroadcast?: boolean;
  diagnostics?: NormalizationDiagnostic[];
}): { series: Array<number | null>; normalized: boolean } {
  const { value, path, expectedLength, safeToZero, allowScalarBroadcast = false, diagnostics } = args;
  if (!Array.isArray(value)) {
    if (allowScalarBroadcast && isFiniteNumber(value)) {
      const broadcasted = new Array<number | null>(expectedLength).fill(value);
      if (diagnostics) {
        recordSeriesDiagnostic({ diagnostics, rule: 'scalar_to_array_broadcast', path, series: broadcasted });
      }
      return { series: broadcasted, normalized: true };
    }
    throw new Error(`${path} must be an array of length ${expectedLength} (masterN+1). Received ${formatValueForMessage(value)}. Example: ${formatArrayExample(0, expectedLength)}. Tip: Use 'Fill array with scalar' auto-fix.`);
  }

  const normalized = new Array<number | null>(expectedLength).fill(null);
  const copyLength = Math.min(value.length, expectedLength);

  let normalizedFlag = value.length !== expectedLength;
  for (let i = 0; i < copyLength; i += 1) {
    const item = value[i];
    const finite = isFiniteNumber(item) ? item : null;
    if (finite === null && safeToZero) {
      normalized[i] = 0;
      if (item === null || item === undefined || !Number.isFinite(item as number)) {
        normalizedFlag = true;
      }
      continue;
    }
    normalized[i] = finite;
  }

  if (safeToZero) {
    for (let i = copyLength; i < expectedLength; i += 1) {
      normalized[i] = 0;
      normalizedFlag = true;
    }
  }

  return { series: normalized, normalized: normalizedFlag };
}

function normalizeSparseSeries(path: string, arr: unknown, masterN: number): Array<number | null> | undefined {
  if (arr === undefined || arr === null) {
    return undefined;
  }
  if (!Array.isArray(arr)) {
    fail(path, `array length <= ${masterN + 1}`, arr);
  }
  if (arr.length > masterN + 1) {
    throw new Error(`${path} length ${arr.length} exceeds expected max length ${masterN + 1}`);
  }

  const normalized = new Array<number | null>(masterN + 1).fill(null);
  for (let i = 0; i < arr.length; i += 1) {
    const value = arr[i];
    normalized[i] = isFiniteNumber(value) ? value : null;
  }
  return normalized;
}


function validateNonNegativeFiniteSeries(series: Array<number | null>, path: string): void {
  for (let i = 0; i < series.length; i += 1) {
    const value = series[i];
    if (isFiniteNumber(value) && value < 0) {
      fail(`${path}[${i}]`, 'null or finite number >= 0', value);
    }
  }
}

function hasAnyNonNull(series: Array<number | null>): boolean {
  return series.some((value) => toFiniteOrNull(value) !== null);
}


function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

const PRICE_KEY_ALIASES: Record<string, string> = {
  AU: 'XAU_USD_TOZ',
  GOLD: 'XAU_USD_TOZ',
  XAU: 'XAU_USD_TOZ',
  AG: 'XAG_USD_TOZ',
  SILVER: 'XAG_USD_TOZ',
  XAG: 'XAG_USD_TOZ',
};

const VALID_PRICE_KEYS = PRICE_KEY_DEFINITIONS.map((item) => item.priceKey);
const VALID_PRICE_KEYS_HELP_TEXT = VALID_PRICE_KEYS.join(', ');

function normalizePriceKeyInput(args: {
  value: string;
  path: string;
  diagnostics: NormalizationDiagnostic[];
}): string {
  const { value, path, diagnostics } = args;
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  const aliasMapped = PRICE_KEY_ALIASES[upper] ?? upper;

  if (aliasMapped !== value) {
    diagnostics.push({
      rule: 'price_key_normalized',
      path,
      summary: `Normalized ${JSON.stringify(value)} -> ${JSON.stringify(aliasMapped)}.`,
    });
  }

  return aliasMapped;
}

function assertKnownPriceKey(path: string, priceKey: string): void {
  if (PRICE_KEY_SET.has(priceKey)) {
    return;
  }

  throw new Error(
    `${path} must be one of: [${VALID_PRICE_KEYS_HELP_TEXT}]. Received ${JSON.stringify(priceKey)}. Example: XAU_USD_TOZ.`,
  );
}

function asOptionalSparseSeries(value: unknown, path: string, masterN: number): Array<number | null> | undefined {
  return normalizeSparseSeries(path, value, masterN);
}

function parseEconomicsBreakdown(raw: unknown, masterN: number, siteGandA_USD: Array<number | null>, hasSeriesSiteGandAInput: boolean, diagnostics: NormalizationDiagnostic[]): ProjectJsonV1['economicsBreakdown'] {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  if (!isPlainObject(raw)) {
    fail('economicsBreakdown', 'object or null', raw);
  }

  const out: NonNullable<ProjectJsonV1['economicsBreakdown']> = {};

  if ('meta' in raw && raw.meta !== undefined) {
    if (raw.meta === null) {
      out.meta = null;
    } else {
      if (!isPlainObject(raw.meta)) {
        fail('economicsBreakdown.meta', 'object or null', raw.meta);
      }
      const defaultSource = raw.meta.defaultSource;
      if (defaultSource !== undefined && defaultSource !== null && defaultSource !== 'PEA' && defaultSource !== 'PFS' && defaultSource !== 'FS' && defaultSource !== 'Other') {
        fail('economicsBreakdown.meta.defaultSource', '"PEA" | "PFS" | "FS" | "Other" | null', defaultSource);
      }
      const notes = raw.meta.notes;
      if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        fail('economicsBreakdown.meta.notes', 'string | null', notes);
      }
      out.meta = {
        defaultSource: defaultSource ?? null,
        notes: notes ?? null,
      };
    }
  }

  if ('cogs' in raw && raw.cogs !== undefined) {
    if (raw.cogs === null) {
      fail('economicsBreakdown.cogs', 'object', raw.cogs);
    }
    if (!isPlainObject(raw.cogs)) {
      fail('economicsBreakdown.cogs', 'object', raw.cogs);
    }

    const cogs: NonNullable<NonNullable<ProjectJsonV1['economicsBreakdown']>['cogs']> = {};
    cogs.miningUSD = asOptionalSparseSeries(raw.cogs.miningUSD, 'economicsBreakdown.cogs.miningUSD', masterN);
    cogs.millingUSD = asOptionalSparseSeries(raw.cogs.millingUSD, 'economicsBreakdown.cogs.millingUSD', masterN);
    cogs.utilitiesUSD = asOptionalSparseSeries(raw.cogs.utilitiesUSD, 'economicsBreakdown.cogs.utilitiesUSD', masterN);
    cogs.maintenanceUSD = asOptionalSparseSeries(raw.cogs.maintenanceUSD, 'economicsBreakdown.cogs.maintenanceUSD', masterN);
    cogs.campUSD = asOptionalSparseSeries(raw.cogs.campUSD, 'economicsBreakdown.cogs.campUSD', masterN);
    cogs.siteGandA_USD = asOptionalSparseSeries(raw.cogs.siteGandA_USD, 'economicsBreakdown.cogs.siteGandA_USD', masterN);

    for (const key of ['miningUSD','millingUSD','utilitiesUSD','maintenanceUSD','campUSD','siteGandA_USD'] as const) {
      const series = cogs[key];
      if (series) {
        validateNonNegativeFiniteSeries(series, `economicsBreakdown.cogs.${key}`);
      }
    }

    if (cogs.siteGandA_USD && hasAnyNonNull(cogs.siteGandA_USD) && hasSeriesSiteGandAInput) {
      let firstDiff = -1;
      for (let i = 0; i < cogs.siteGandA_USD.length; i += 1) {
        const left = toFiniteOrNull(cogs.siteGandA_USD[i]);
        const right = toFiniteOrNull(siteGandA_USD[i]);
        const equivalent = left === right
          || (left === null && right === 0)
          || (left === 0 && right === null);
        if (!equivalent) {
          firstDiff = i;
          break;
        }
      }
      if (firstDiff === -1) {
        cogs.siteGandA_USD = undefined;
        diagnostics.push({
          rule: 'dedup_identical_site_ganda_overlap',
          path: 'economicsBreakdown.cogs.siteGandA_USD',
          summary: 'Auto-resolved duplicate siteGandA: kept series.siteGandA_USD, removed economicsBreakdown.cogs.siteGandA_USD (equivalent arrays).',
        });
      } else {
        throw new Error(`economicsBreakdown.cogs.siteGandA_USD conflicts with series.siteGandA_USD. First difference at index ${firstDiff}: economicsBreakdown=${String(cogs.siteGandA_USD[firstDiff])}, series=${String(siteGandA_USD[firstDiff])}. Editor cannot auto-resolve because arrays differ. Provide site G&A in one place only (prefer series.siteGandA_USD).`);
      }
    }

    out.cogs = cogs;
  }

  if ('selling' in raw && raw.selling !== undefined) {
    if (raw.selling === null) {
      fail('economicsBreakdown.selling', 'object', raw.selling);
    }
    if (!isPlainObject(raw.selling)) {
      fail('economicsBreakdown.selling', 'object', raw.selling);
    }

    const selling: NonNullable<NonNullable<ProjectJsonV1['economicsBreakdown']>['selling']> = {};
    selling.treatmentChargesUSD = asOptionalSparseSeries(raw.selling.treatmentChargesUSD, 'economicsBreakdown.selling.treatmentChargesUSD', masterN);
    selling.refiningChargesUSD = asOptionalSparseSeries(raw.selling.refiningChargesUSD, 'economicsBreakdown.selling.refiningChargesUSD', masterN);
    selling.tcRcUSD = asOptionalSparseSeries(raw.selling.tcRcUSD, 'economicsBreakdown.selling.tcRcUSD', masterN);
    selling.transportUSD = asOptionalSparseSeries(raw.selling.transportUSD, 'economicsBreakdown.selling.transportUSD', masterN);

    for (const key of ['treatmentChargesUSD','refiningChargesUSD','tcRcUSD','transportUSD'] as const) {
      const series = selling[key];
      if (series) {
        validateNonNegativeFiniteSeries(series, `economicsBreakdown.selling.${key}`);
      }
    }

    if (
      selling.tcRcUSD
      && hasAnyNonNull(selling.tcRcUSD)
      && ((selling.treatmentChargesUSD && hasAnyNonNull(selling.treatmentChargesUSD))
        || (selling.refiningChargesUSD && hasAnyNonNull(selling.refiningChargesUSD)))
    ) {
      fail('economicsBreakdown.selling', 'tcRcUSD cannot be provided together with treatmentChargesUSD or refiningChargesUSD', raw.selling);
    }

    out.selling = selling;
  }

  if ('royaltiesDetail' in raw && raw.royaltiesDetail !== undefined) {
    if (raw.royaltiesDetail === null) {
      out.royaltiesDetail = null;
    } else {
      if (!Array.isArray(raw.royaltiesDetail)) {
        fail('economicsBreakdown.royaltiesDetail', 'array or null', raw.royaltiesDetail);
      }
      out.royaltiesDetail = raw.royaltiesDetail.map((item, idx) => {
        if (!isPlainObject(item)) {
          fail(`economicsBreakdown.royaltiesDetail[${idx}]`, 'object', item);
        }
        if (typeof item.id !== 'string' || item.id.trim().length === 0) {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].id`, 'non-empty string', item.id);
        }
        if (typeof item.label !== 'string' || item.label.trim().length === 0) {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].label`, 'non-empty string', item.label);
        }
        if (item.base !== 'revenue' && item.base !== 'ebit' && item.base !== 'ebitda' && item.base !== 'quantity') {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].base`, '"revenue"|"ebit"|"ebitda"|"quantity"', item.base);
        }
        if (item.rate !== undefined && item.rate !== null && (!isFiniteNumber(item.rate) || item.rate < 0)) {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].rate`, 'null or finite number >= 0', item.rate);
        }
        const name = item.name;
        if (name !== undefined && name !== null && typeof name !== 'string') {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].name`, 'string | null', name);
        }
        const rateType = item.rateType;
        if (rateType !== undefined && rateType !== null && typeof rateType !== 'string') {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].rateType`, 'string | null', rateType);
        }
        const royaltyUSD = asOptionalSparseSeries(item.royaltyUSD, `economicsBreakdown.royaltiesDetail[${idx}].royaltyUSD`, masterN);
        if (royaltyUSD) {
          validateNonNegativeFiniteSeries(royaltyUSD, `economicsBreakdown.royaltiesDetail[${idx}].royaltyUSD`);
        }
        const source = item.source;
        if (source !== undefined && source !== null && source !== 'PEA' && source !== 'PFS' && source !== 'FS' && source !== 'Other') {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].source`, '"PEA" | "PFS" | "FS" | "Other" | null', source);
        }
        const notes = item.notes;
        if (notes !== undefined && notes !== null && typeof notes !== 'string') {
          fail(`economicsBreakdown.royaltiesDetail[${idx}].notes`, 'string | null', notes);
        }
        return {
          id: item.id,
          label: item.label,
          name: name ?? null,
          base: item.base,
          rateType: rateType ?? null,
          rate: item.rate ?? null,
          royaltyUSD,
          source: source ?? null,
          notes: notes ?? null,
        };
      });
    }
  }

  if ('taxesDetail' in raw && raw.taxesDetail !== undefined) {
    if (raw.taxesDetail === null) {
      out.taxesDetail = null;
    } else {
      if (!isPlainObject(raw.taxesDetail)) {
        fail('economicsBreakdown.taxesDetail', 'object or null', raw.taxesDetail);
      }
      const taxesDetail: NonNullable<NonNullable<ProjectJsonV1['economicsBreakdown']>['taxesDetail']> = {};
      taxesDetail.federalIncomeTaxUSD = asOptionalSparseSeries(raw.taxesDetail.federalIncomeTaxUSD, 'economicsBreakdown.taxesDetail.federalIncomeTaxUSD', masterN);
      taxesDetail.municipalRevenueTaxUSD = asOptionalSparseSeries(raw.taxesDetail.municipalRevenueTaxUSD, 'economicsBreakdown.taxesDetail.municipalRevenueTaxUSD', masterN);
      if (taxesDetail.federalIncomeTaxUSD) {
        validateNonNegativeFiniteSeries(taxesDetail.federalIncomeTaxUSD, 'economicsBreakdown.taxesDetail.federalIncomeTaxUSD');
      }
      if (taxesDetail.municipalRevenueTaxUSD) {
        validateNonNegativeFiniteSeries(taxesDetail.municipalRevenueTaxUSD, 'economicsBreakdown.taxesDetail.municipalRevenueTaxUSD');
      }
      out.taxesDetail = taxesDetail;
    }
  }

  return out;
}



function validateTakeItemsBasicShape(takeItems: unknown[], path: string): void {
  for (let idx = 0; idx < takeItems.length; idx += 1) {
    const item = takeItems[idx];
    if (!isPlainObject(item)) {
      continue;
    }
    if (!isPlainObject(item.rateDefinition)) {
      continue;
    }
    const rateType = item.rateDefinition.rateType;
    if (rateType !== undefined && rateType !== 'FIXED' && rateType !== 'TIERED') {
      fail(`${path}[${idx}].rateDefinition.rateType`, '"FIXED" | "TIERED"', rateType);
    }
    if (item.priceKey !== undefined && item.priceKey !== null && typeof item.priceKey !== 'string') {
      fail(`${path}[${idx}].priceKey`, 'string | null', item.priceKey);
    }
    const tiers = item.rateDefinition.tiers;
    if (tiers !== undefined && tiers !== null) {
      if (!Array.isArray(tiers)) {
        fail(`${path}[${idx}].rateDefinition.tiers`, 'array', tiers);
      }
      for (let tierIdx = 0; tierIdx < tiers.length; tierIdx += 1) {
        const tier = tiers[tierIdx];
        if (!isPlainObject(tier)) {
          fail(`${path}[${idx}].rateDefinition.tiers[${tierIdx}]`, 'object', tier);
        }
        const thresholdType = tier.thresholdType;
        if (thresholdType !== undefined && thresholdType !== 'price' && thresholdType !== 'revenue') {
          fail(`${path}[${idx}].rateDefinition.tiers[${tierIdx}].thresholdType`, '"price" | "revenue"', thresholdType);
        }
      }
    }
  }
}

function asRecordOfRawSeries(value: unknown, path: string): Record<string, unknown[]> {
  if (!isPlainObject(value)) {
    fail(path, 'object map of series', value);
  }

  const entries = Object.entries(value);
  const mapped: Record<string, unknown[]> = {};
  for (const [key, rawSeries] of entries) {
    if (!Array.isArray(rawSeries)) {
      fail(`${path}.${key}`, 'array', rawSeries);
    }
    mapped[key] = rawSeries;
  }

  return mapped;
}

function asRecordOfSeries(value: unknown, path: string, expectedLength: number): Record<string, Array<number | null>> {
  if (!isPlainObject(value)) {
    fail(path, 'object map of series', value);
  }

  const entries = Object.entries(value);
  const mapped: Record<string, Array<number | null>> = {};
  for (const [key, rawSeries] of entries) {
    mapped[key] = asSeries(rawSeries, `${path}.${key}`, expectedLength);
  }

  return mapped;
}

const QTY_UNIT_SET = new Set<QtyUnit>(['toz', 'g', 'kg', 'lb', 'tonne', 'short_ton', 'long_ton']);

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePeriodEndDates(raw: unknown, expectedLength: number): Array<string> | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!Array.isArray(raw)) {
    fail('time.periodEndDatesUtc', `array length ${expectedLength}`, raw);
  }

  if (raw.length !== expectedLength) {
    fail('time.periodEndDatesUtc', `array length ${expectedLength}`, raw.length);
  }

  const periodEndDatesUtc: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const value = raw[i];
    if (typeof value !== 'string' || !isIsoDate(value)) {
      fail(`time.periodEndDatesUtc[${i}]`, 'YYYY-MM-DD string', value);
    }

    if (i > 0 && raw[i - 1] >= value) {
      fail(`time.periodEndDatesUtc[${i}]`, `strictly increasing date after ${raw[i - 1]}`, value);
    }

    periodEndDatesUtc.push(value);
  }

  return periodEndDatesUtc;
}

function parseOperations(raw: unknown, masterN: number, diagnostics: NormalizationDiagnostic[]): { operations: ProjectJsonV1['operations']; normalized: boolean } {
  if (raw == null) {
    return { operations: raw as null, normalized: false };
  }

  if (!isPlainObject(raw)) {
    fail('operations', 'object or null', raw);
  }

  const capacity = raw.capacity;
  if (!isPlainObject(capacity)) {
    fail('operations.capacity', 'object', capacity);
  }

  const throughputUnit = capacity.throughputUnit;
  if (throughputUnit !== 'tpd' && throughputUnit !== 'tpa') {
    fail('operations.capacity.throughputUnit', '"tpd" or "tpa"', throughputUnit);
  }

  const nameplateThroughput = capacity.nameplateThroughput;
  if (!isFiniteNumber(nameplateThroughput) || nameplateThroughput <= 0) {
    fail('operations.capacity.nameplateThroughput', 'finite number > 0', nameplateThroughput);
  }

  const utilizationPct = capacity.utilizationPct;
  if (utilizationPct !== undefined && utilizationPct !== null) {
    if (!isFiniteNumber(utilizationPct) || utilizationPct < 0 || utilizationPct > 1) {
      fail('operations.capacity.utilizationPct', 'null or finite number in [0, 1]', utilizationPct);
    }
  }

  const operations: NonNullable<ProjectJsonV1['operations']> = {
    capacity: {
      throughputUnit,
      nameplateThroughput,
      utilizationPct: utilizationPct ?? null,
    },
  };
  let normalized = false;

  if ('oreMilledTonnes' in raw && raw.oreMilledTonnes !== undefined) {
    const oreMilledTonnes = normalizeSeriesToMasterLength({
      value: raw.oreMilledTonnes,
      path: 'operations.oreMilledTonnes',
      expectedLength: masterN + 1,
      safeToZero: true,
    });
    normalized = normalized || oreMilledTonnes.normalized;
    validateNonNegativeFiniteSeries(oreMilledTonnes.series, 'operations.oreMilledTonnes');
    operations.oreMilledTonnes = oreMilledTonnes.series;
  }

  if ('oreMinedTonnes' in raw && raw.oreMinedTonnes !== undefined) {
    const oreMinedTonnes = normalizeSeriesToMasterLength({
      value: raw.oreMinedTonnes,
      path: 'operations.oreMinedTonnes',
      expectedLength: masterN + 1,
      safeToZero: true,
    });
    normalized = normalized || oreMinedTonnes.normalized;
    validateNonNegativeFiniteSeries(oreMinedTonnes.series, 'operations.oreMinedTonnes');
    operations.oreMinedTonnes = oreMinedTonnes.series;
  }

  if ('oreTonnageUnit' in raw && raw.oreTonnageUnit !== undefined) {
    const oreTonnageUnit = raw.oreTonnageUnit;
    if (oreTonnageUnit !== null && oreTonnageUnit !== 'tonne' && oreTonnageUnit !== 'short_ton' && oreTonnageUnit !== 'long_ton') {
      fail('operations.oreTonnageUnit', '"tonne" | "short_ton" | "long_ton" | null', oreTonnageUnit);
    }
    operations.oreTonnageUnit = oreTonnageUnit;
  }

  const parseOptionalSeriesMap = (value: unknown, path: string): Record<string, Array<number | null>> | undefined => {
    if (value === undefined) return undefined;
    if (!isPlainObject(value)) {
      fail(path, 'object map of series', value);
    }
    const mapped: Record<string, Array<number | null>> = {};
    for (const [key, rawSeries] of Object.entries(value)) {
      const series = normalizeSeriesToMasterLength({
        value: rawSeries,
        path: `${path}.${key}`,
        expectedLength: masterN + 1,
        safeToZero: true,
        allowScalarBroadcast: true,
        diagnostics,
      });
      normalized = normalized || series.normalized;
      validateNonNegativeFiniteSeries(series.series, `${path}.${key}`);
      mapped[key] = series.series;
    }
    return mapped;
  };

  if ('gradeByMetal' in raw) {
    operations.gradeByMetal = parseOptionalSeriesMap(raw.gradeByMetal, 'operations.gradeByMetal');
  }

  if ('gradeUnitByMetal' in raw && raw.gradeUnitByMetal !== undefined) {
    if (!isPlainObject(raw.gradeUnitByMetal)) {
      fail('operations.gradeUnitByMetal', 'object map of string units', raw.gradeUnitByMetal);
    }
    const gradeUnitByMetal: Record<string, string> = {};
    for (const [metal, unit] of Object.entries(raw.gradeUnitByMetal)) {
      if (typeof unit !== 'string' || unit.trim().length === 0) {
        fail(`operations.gradeUnitByMetal.${metal}`, 'non-empty string', unit);
      }
      gradeUnitByMetal[metal] = unit;
    }
    operations.gradeUnitByMetal = gradeUnitByMetal;
  }

  if ('recoveryPctByMetal' in raw) {
    operations.recoveryPctByMetal = parseOptionalSeriesMap(raw.recoveryPctByMetal, 'operations.recoveryPctByMetal');
  }

  return { operations, normalized };
}

export type ProjectJsonV1Context = {
  operations?: ProjectJsonV1['operations'] | null;
  economicsBreakdown?: ProjectJsonV1['economicsBreakdown'];
  series?: {
    depreciationUSD?: Array<number | null>;
  };
  equity?: {
    fdExtraShares: number;
    fdNotes?: string;
  };
};

export type ParsedProjectJsonV1 = {
  diagnostics: {
    normalization: NormalizationDiagnostic[];
  };
  engineInputWithoutPrices: Omit<ProjectEngineFullProductionV1Input, 'spotPriceUSDByMetal' | 'aisc'> & {
    payableQtyByMetal: Record<string, Array<number | null>>;
    streamsByMetal: Record<string, import('../streams/types').StreamMVIConfig> | null;
    takeItems: Array<unknown>;
    masterN: number;
    productionStartPeriod: number;
    taxRate: number | null;
    priceKeyByMetal: Record<string, string>;
    auPriceKey: string;
    payableQtyUnitByMetal: Record<string, QtyUnit>;
    periodEndDatesUtc?: Array<string>;
  };
  context: ProjectJsonV1Context;
  priceOverrides: NonNullable<ProjectJsonV1['priceOverrides']>;
  engineInput: ProjectEngineFullProductionV1Input;
  warnings: string[];
};

function normalizeSpendSeriesAbs(
  series: Array<number | null>,
  warningMessage: string,
  warnings: string[],
): Array<number | null> {
  let hadNegative = false;
  const normalized = series.map((value) => {
    if (isFiniteNumber(value) && value < 0) {
      hadNegative = true;
      return Math.abs(value);
    }
    return value;
  });

  if (hadNegative) {
    warnings.push(warningMessage);
  }

  return normalized;
}

export function parseProjectJsonV1(raw: any): ParsedProjectJsonV1 {
  raw = stripChoiceKeysDeep(raw);
  if (!isPlainObject(raw)) {
    fail('root', 'object', raw);
  }

  if (raw.version !== 'project_json_v2') {
    throw new Error('Only project_json_v2 supported in rolling model.');
  }

  if (!isPlainObject(raw.time)) {
    fail('time', 'object', raw.time);
  }

  const masterN = asInteger(raw.time.masterN, 'time.masterN', 0);
  const productionStartPeriod = asInteger(raw.time.productionStartPeriod, 'time.productionStartPeriod', 0);
  const productionStartYear = asInteger(raw.time.productionStartYear, 'time.productionStartYear', 1000);
  if (productionStartYear > 9999) {
    throw new Error(`time.productionStartYear must be a 4-digit integer. Received productionStartYear=${productionStartYear}.`);
  }
  if (productionStartPeriod > masterN) {
    throw new Error(`time.productionStartPeriod must be <= time.masterN. Received productionStartPeriod=${productionStartPeriod}, masterN=${masterN}.`);
  }
  const expectedLength = masterN + 1;
  const periodEndDatesUtc = parsePeriodEndDates(raw.time.periodEndDatesUtc, expectedLength);

  const rawOperations = raw.operations;
  const operationsRecord = isPlainObject(rawOperations) ? rawOperations : null;
  const rawMetals = raw.metals;
  const metalsRecord = isPlainObject(rawMetals) ? rawMetals : null;
  const payableRecord = isPlainObject(metalsRecord?.payableQtyByMetal) ? metalsRecord.payableQtyByMetal : {};
  const alignmentPayableQtyByMetalRaw = Object.fromEntries(
    Object.entries(payableRecord).map(([metal, values]) => [metal, Array.isArray(values) ? values as Array<number | null | undefined> : null]),
  ) as Record<string, Array<number | null | undefined> | null>;

  const driverFirstNonZeroIndex = buildProductionDriverFirstNonZeroMap({
    oreMinedTonnes: Array.isArray(operationsRecord?.oreMinedTonnes) ? operationsRecord.oreMinedTonnes as Array<number | null | undefined> : null,
    oreMilledTonnes: Array.isArray(operationsRecord?.oreMilledTonnes) ? operationsRecord.oreMilledTonnes as Array<number | null | undefined> : null,
    payableQtyByMetal: alignmentPayableQtyByMetalRaw,
  });
  const productionStartIndex = productionStartIndexCandidate(driverFirstNonZeroIndex);
  if (productionStartIndex === null && productionStartPeriod > 0) {
    throw new Error('No production series has non-zero values, cannot validate tp.');
  }
  if (productionStartIndex !== null && productionStartIndex !== productionStartPeriod) {
    const yearAtTp = productionStartYear;
    const yearAtCand = productionStartYear + (productionStartIndex - productionStartPeriod);
    throw new Error(
      `tp mismatch: tp=${productionStartPeriod} (year ${yearAtTp}) but first production driver is at index ${productionStartIndex} (year ${yearAtCand}). Fix by either changing tp or shifting your production-driver series so first non-zero equals tp. Drivers=${JSON.stringify(driverFirstNonZeroIndex)}`,
    );
  }

  const currentYear = new Date().getUTCFullYear();
  const impliedStartYear = productionStartYear - productionStartPeriod;
  const shiftYears = currentYear - impliedStartYear;
  if ((raw as Record<string, unknown>).debug === true) {
    console.debug({
      currentYear,
      productionStartYear,
      impliedStartYear,
      shiftYears,
    });
  }

  const shiftedRaw = shiftPeriodSeriesDeep(deepCloneJsonValue(raw), expectedLength, shiftYears);
  if (!isPlainObject(shiftedRaw)) {
    fail('root', 'object', shiftedRaw);
  }

  raw = shiftedRaw;

  if (!isPlainObject(raw.economics)) {
    fail('economics', 'object', raw.economics);
  }

  const rawTaxRate = raw.economics.taxRate;
  if (rawTaxRate !== undefined && rawTaxRate !== null && (!isFiniteNumber(rawTaxRate) || rawTaxRate < 0 || rawTaxRate > 0.6)) {
    fail('economics.taxRate', 'finite number in [0, 0.6]', rawTaxRate);
  }
  const taxRate = rawTaxRate ?? null;

  let fdExtraShares = 0;
  let fdNotes: string | undefined;
  if (raw.equity !== undefined) {
    if (!isPlainObject(raw.equity)) {
      fail('equity', 'object', raw.equity);
    }
    const rawFdExtraShares = raw.equity.fdExtraShares;
    if (rawFdExtraShares !== undefined) {
      if (!isFiniteNumber(rawFdExtraShares) || rawFdExtraShares < 0) {
        throw new Error(`equity.fdExtraShares must be a finite number >= 0. Received ${formatValueForMessage(rawFdExtraShares)}. Example: 0`);
      }
      fdExtraShares = rawFdExtraShares;
    }

    const rawFdNotes = raw.equity.fdNotes;
    if (rawFdNotes !== undefined) {
      if (typeof rawFdNotes !== 'string') {
        fail('equity.fdNotes', 'string', rawFdNotes);
      }
      fdNotes = rawFdNotes;
    }
  }

  if (!isPlainObject(raw.series)) {
    fail('series', 'object', raw.series);
  }

  const warnings: string[] = [];
  const normalizationDiagnostics: NormalizationDiagnostic[] = [];
  let projectSeriesNormalized = false;

  const capexNormalized = normalizeSeriesToMasterLength({
    value: raw.series.capexUSD,
    path: 'series.capexUSD',
    expectedLength,
    safeToZero: true,
    diagnostics: normalizationDiagnostics,
  });
  projectSeriesNormalized = projectSeriesNormalized || capexNormalized.normalized;
  const capexUSD = normalizeSpendSeriesAbs(
    capexNormalized.series,
    'capexUSD: detected negative values; normalized to spend (abs).',
    warnings,
  );
  const operatingCostsNormalized = normalizeSeriesToMasterLength({
    value: raw.series.operatingCostsUSD,
    path: 'series.operatingCostsUSD',
    expectedLength,
    safeToZero: true,
    diagnostics: normalizationDiagnostics,
  });
  projectSeriesNormalized = projectSeriesNormalized || operatingCostsNormalized.normalized;
  const operatingCostsUSD = operatingCostsNormalized.series;
  const sustainingCapexNormalized = normalizeSeriesToMasterLength({
    value: raw.series.sustainingCapexUSD,
    path: 'series.sustainingCapexUSD',
    expectedLength,
    safeToZero: true,
    diagnostics: normalizationDiagnostics,
  });
  projectSeriesNormalized = projectSeriesNormalized || sustainingCapexNormalized.normalized;
  const sustainingCapexUSD = normalizeSpendSeriesAbs(
    sustainingCapexNormalized.series,
    'sustainingCapexUSD: detected negative values; normalized to spend (abs).',
    warnings,
  );
  const siteGandaNormalized = normalizeSeriesToMasterLength({
    value: raw.series.siteGandA_USD,
    path: 'series.siteGandA_USD',
    expectedLength,
    safeToZero: true,
    diagnostics: normalizationDiagnostics,
  });
  projectSeriesNormalized = projectSeriesNormalized || siteGandaNormalized.normalized;
  const siteGandA_USD = siteGandaNormalized.series;
  const rawSeriesSiteGandA = asOptionalSparseSeries(raw.series.siteGandA_USD, 'series.siteGandA_USD', masterN);
  const hasSeriesSiteGandAInput = rawSeriesSiteGandA !== undefined && hasAnyNonNull(rawSeriesSiteGandA);
  const reclamationNormalized = normalizeSeriesToMasterLength({
    value: raw.series.reclamationUSD,
    path: 'series.reclamationUSD',
    expectedLength,
    safeToZero: true,
    diagnostics: normalizationDiagnostics,
  });
  projectSeriesNormalized = projectSeriesNormalized || reclamationNormalized.normalized;
  const reclamationUSD = reclamationNormalized.series;
  const byproductCreditsNormalized =
    raw.series.byproductCreditsUSD === undefined
      ? undefined
      : normalizeSeriesToMasterLength({
          value: raw.series.byproductCreditsUSD,
          path: 'series.byproductCreditsUSD',
          expectedLength,
          safeToZero: true,
        });
  if (byproductCreditsNormalized) {
    projectSeriesNormalized = projectSeriesNormalized || byproductCreditsNormalized.normalized;
  }
  const byproductCreditsUSD = byproductCreditsNormalized?.series;

  const workingCapitalNormalized =
    raw.series.workingCapitalDeltaUSD === undefined
      ? undefined
      : normalizeSeriesToMasterLength({
          value: raw.series.workingCapitalDeltaUSD,
          path: 'series.workingCapitalDeltaUSD',
          expectedLength,
          safeToZero: true,
        });
  if (workingCapitalNormalized) {
    projectSeriesNormalized = projectSeriesNormalized || workingCapitalNormalized.normalized;
  }
  const workingCapitalDeltaUSD = workingCapitalNormalized?.series;

  const depreciationNormalized =
    raw.series.depreciationUSD === undefined
      ? undefined
      : normalizeSeriesToMasterLength({
          value: raw.series.depreciationUSD,
          path: 'series.depreciationUSD',
          expectedLength,
          safeToZero: true,
        });
  if (depreciationNormalized) {
    projectSeriesNormalized = projectSeriesNormalized || depreciationNormalized.normalized;
  }
  const depreciationUSD = depreciationNormalized?.series;

  const economicsBreakdown = parseEconomicsBreakdown(raw.economicsBreakdown, masterN, siteGandA_USD, hasSeriesSiteGandAInput, normalizationDiagnostics);

  if (!isPlainObject(raw.metals)) {
    fail('metals', 'object', raw.metals);
  }

  const payableQtyByMetalRaw = asRecordOfRawSeries(raw.metals.payableQtyByMetal, 'metals.payableQtyByMetal');
  const payableQtyByMetal: Record<string, Array<number | null>> = {};
  for (const [metal, series] of Object.entries(payableQtyByMetalRaw)) {
    const normalizedSeries = normalizeSeriesToMasterLength({
      value: series,
      path: `metals.payableQtyByMetal.${metal}`,
      expectedLength,
      safeToZero: true,
    });
    projectSeriesNormalized = projectSeriesNormalized || normalizedSeries.normalized;
    payableQtyByMetal[metal] = normalizedSeries.series;
  }
  const payableMetals = Object.keys(payableQtyByMetal);
  if (payableMetals.length === 0) {
    fail('metals.payableQtyByMetal', 'at least one metal key', payableMetals);
  }

  if (!isPlainObject(raw.metals.payableQtyUnitByMetal)) {
    fail('metals.payableQtyUnitByMetal', 'object map of units', raw.metals.payableQtyUnitByMetal);
  }

  if (!isPlainObject(raw.metals.priceKeyByMetal)) {
    fail('metals.priceKeyByMetal', 'object map of price keys', raw.metals.priceKeyByMetal);
  }

  const payableQtyUnitByMetal: Record<string, QtyUnit> = {};
  const priceKeyByMetal: Record<string, string> = {};

  for (const metal of payableMetals) {
    validateNonNegativeFiniteSeries(payableQtyByMetal[metal], `metals.payableQtyByMetal.${metal}`);

    const qtyUnit = raw.metals.payableQtyUnitByMetal[metal];
    if (qtyUnit === 'oz') {
      payableQtyUnitByMetal[metal] = 'toz';
      normalizationDiagnostics.push({
        rule: 'qty_unit_oz_to_toz',
        path: `metals.payableQtyUnitByMetal.${metal}`,
        summary: 'Converted oz -> toz',
      });
    } else {
      if (typeof qtyUnit !== 'string' || !QTY_UNIT_SET.has(qtyUnit as QtyUnit)) {
        throw new Error(`metals.payableQtyUnitByMetal.${metal} must be one of ${JSON.stringify(Array.from(QTY_UNIT_SET))}. Received ${JSON.stringify(qtyUnit)}. Example: "toz". Tip: Use 'Normalize unit oz→toz' auto-fix.`);
      }
      payableQtyUnitByMetal[metal] = qtyUnit as QtyUnit;
    }

    const priceKey = raw.metals.priceKeyByMetal[metal];
    if (typeof priceKey !== 'string' || priceKey.trim().length === 0) {
      fail(`metals.priceKeyByMetal.${metal}`, 'non-empty string', priceKey);
    }
    const normalizedPriceKey = normalizePriceKeyInput({
      value: priceKey,
      path: `metals.priceKeyByMetal.${metal}`,
      diagnostics: normalizationDiagnostics,
    });
    if (metal === 'Cu' && normalizedPriceKey !== 'CU_USD_LB' && normalizedPriceKey !== 'CU_USD_TONNE') {
      throw new Error(
        `metals.priceKeyByMetal.Cu must be one of: [CU_USD_LB, CU_USD_TONNE]. Received ${JSON.stringify(normalizedPriceKey)}. Copper accepts only canonical keys (uppercase); CU_USD_LB = COMEX basis, CU_USD_TONNE = LME basis.`,
      );
    }
    assertKnownPriceKey(`priceKeyByMetal.${metal}`, normalizedPriceKey);
    priceKeyByMetal[metal] = normalizedPriceKey;
  }

  const extraUnitKeys = Object.keys(raw.metals.payableQtyUnitByMetal).filter((key) => !(key in payableQtyByMetal));
  if (extraUnitKeys.length > 0) {
    fail('metals.payableQtyUnitByMetal', 'same keys as payableQtyByMetal', extraUnitKeys);
  }

  const extraPriceKeys = Object.keys(raw.metals.priceKeyByMetal).filter((key) => !(key in payableQtyByMetal));
  if (extraPriceKeys.length > 0) {
    fail('metals.priceKeyByMetal', 'same keys as payableQtyByMetal', extraPriceKeys);
  }

  const auPriceKeyRaw = raw.metals.auPriceKey;
  let auPriceKey: string | null = null;
  if (typeof auPriceKeyRaw === 'string' && auPriceKeyRaw.trim().length > 0) {
    auPriceKey = normalizePriceKeyInput({
      value: auPriceKeyRaw,
      path: 'metals.auPriceKey',
      diagnostics: normalizationDiagnostics,
    });
    assertKnownPriceKey('metals.auPriceKey', auPriceKey);
  } else if (auPriceKeyRaw !== undefined && auPriceKeyRaw !== null && auPriceKeyRaw !== '') {
    fail('metals.auPriceKey', 'string | null', auPriceKeyRaw);
  }

  const auPriceKeyByMetal = priceKeyByMetal.Au;
  if (auPriceKeyByMetal && !auPriceKey) {
    auPriceKey = auPriceKeyByMetal;
    normalizationDiagnostics.push({
      rule: 'au_price_key_autofill',
      path: 'metals.auPriceKey',
      summary: 'Set metals.auPriceKey from metals.priceKeyByMetal.Au for AuEq consistency.',
    });
  }

  if (auPriceKeyByMetal && auPriceKey && auPriceKey !== auPriceKeyByMetal) {
    throw new Error(
      `metals.auPriceKey (${JSON.stringify(auPriceKey)}) must equal metals.priceKeyByMetal.Au (${JSON.stringify(auPriceKeyByMetal)}) to keep AuEq calculations consistent. Set auPriceKey equal to priceKeyByMetal.Au to keep AuEq calculations consistent.`,
    );
  }

  if (!auPriceKey) {
    fail('metals.auPriceKey', 'non-empty string', auPriceKeyRaw);
  }

  const streamsByMetal = raw.streamsByMetal;
  if (streamsByMetal !== undefined && streamsByMetal !== null && !isPlainObject(streamsByMetal)) {
    fail('streamsByMetal', 'object map or null', streamsByMetal);
  }

  const takeItems = raw.takeItems;
  if (takeItems !== undefined && takeItems !== null && !Array.isArray(takeItems)) {
    fail('takeItems', 'array or null', takeItems);
  }
  if (Array.isArray(takeItems)) {
    validateTakeItemsBasicShape(takeItems, 'takeItems');
  }

  const parsedOperations = raw.operations === undefined ? undefined : parseOperations(raw.operations, masterN, normalizationDiagnostics);
  const operations = parsedOperations?.operations;
  projectSeriesNormalized = projectSeriesNormalized || (parsedOperations?.normalized ?? false);

  const explicitOverrides = raw.priceOverrides;
  if (explicitOverrides !== undefined && explicitOverrides !== null && !isPlainObject(explicitOverrides)) {
    fail('priceOverrides', 'object or null', explicitOverrides);
  }

  const legacySpot =
    raw.metals.spotPriceUSDByMetal === undefined
      ? undefined
      : asRecordOfSeries(raw.metals.spotPriceUSDByMetal, 'metals.spotPriceUSDByMetal', expectedLength);
  const legacyAu =
    raw.metals.auPriceUSDPerOz === undefined
      ? undefined
      : asSeries(raw.metals.auPriceUSDPerOz, 'metals.auPriceUSDPerOz', expectedLength);

  if (legacySpot) {
    for (const [metal, series] of Object.entries(legacySpot)) {
      validateNonNegativeFiniteSeries(series, `metals.spotPriceUSDByMetal.${metal}`);
    }
  }
  if (legacyAu) {
    validateNonNegativeFiniteSeries(legacyAu, 'metals.auPriceUSDPerOz');
  }

  const overrideSpot = explicitOverrides?.spotPriceUSDByMetal
    ? asRecordOfSeries(explicitOverrides.spotPriceUSDByMetal, 'priceOverrides.spotPriceUSDByMetal', expectedLength)
    : legacySpot;

  const overrideAu = explicitOverrides?.auPriceUSDPerOz
    ? asSeries(explicitOverrides.auPriceUSDPerOz, 'priceOverrides.auPriceUSDPerOz', expectedLength)
    : legacyAu;

  if (overrideSpot) {
    for (const [metal, series] of Object.entries(overrideSpot)) {
      validateNonNegativeFiniteSeries(series, `priceOverrides.spotPriceUSDByMetal.${metal}`);
    }
  }
  if (overrideAu) {
    validateNonNegativeFiniteSeries(overrideAu, 'priceOverrides.auPriceUSDPerOz');
  }

  if (projectSeriesNormalized) {
    warnings.push('Normalized series length to masterN+1; padded/truncated as needed; null→0 for safe-to-zero series.');
  }

  const nulls = new Array(expectedLength).fill(null) as Array<number | null>;
  const fallbackSpot: Record<string, Array<number | null>> = {};
  for (const metal of payableMetals) {
    fallbackSpot[metal] = overrideSpot?.[metal] ? [...overrideSpot[metal]] : [...nulls];
  }

  const engineInput: ProjectEngineFullProductionV1Input = {
    masterN,
    streamsByMetal: (streamsByMetal as ProjectEngineFullProductionV1Input['streamsByMetal']) ?? null,
    payableQtyByMetal,
    spotPriceUSDByMetal: fallbackSpot,
    priceKeyByMetal,
    auPriceKey,
    takeItems: (takeItems as ProjectEngineFullProductionV1Input['takeItems']) ?? [],
    royaltiesDetail: economicsBreakdown?.royaltiesDetail ?? null,
    phase1: {
      masterN,
      productionStartPeriod,
      taxRate,
      capexUSD,
      operatingCostsUSD,
      sustainingCapexUSD,
      siteGandA_USD,
      reclamationUSD,
      byproductCreditsUSD,
      depreciationUSD,
      workingCapitalDeltaUSD,
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: overrideAu ? [...overrideAu] : [...nulls],
    },
  };

  return {
    engineInputWithoutPrices: {
      masterN,
      streamsByMetal: (streamsByMetal as ProjectEngineFullProductionV1Input['streamsByMetal']) ?? null,
      payableQtyByMetal,
      takeItems: (takeItems as ProjectEngineFullProductionV1Input['takeItems']) ?? [],
      royaltiesDetail: economicsBreakdown?.royaltiesDetail ?? null,
      phase1: {
        masterN,
        productionStartPeriod,
        taxRate,
        capexUSD,
        operatingCostsUSD,
        sustainingCapexUSD,
        siteGandA_USD,
        reclamationUSD,
        byproductCreditsUSD,
        depreciationUSD,
        workingCapitalDeltaUSD,
      },
      phase2: {
        discountRate: 0.1,
      },
      productionStartPeriod,
      taxRate,
      priceKeyByMetal,
      auPriceKey,
      payableQtyUnitByMetal,
      periodEndDatesUtc,
    },
    context: {
      operations: operations ?? null,
      economicsBreakdown: economicsBreakdown ?? null,
      series: {
        depreciationUSD,
      },
      equity: {
        fdExtraShares,
        ...(fdNotes !== undefined ? { fdNotes } : {}),
      },
    },
    priceOverrides: {
      spotPriceUSDByMetal: overrideSpot,
      auPriceUSDPerOz: overrideAu,
    },
    engineInput,
    warnings,
    diagnostics: { normalization: normalizationDiagnostics },
  };
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
  return parseProjectJsonV1(raw);
}
