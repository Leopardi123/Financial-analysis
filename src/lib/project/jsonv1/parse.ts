import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import type { ProjectJsonV1, QtyUnit } from './schema.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, expected: string, actual: unknown): never {
  throw new Error(`${path} expected ${expected}, received ${JSON.stringify(actual)}`);
}

function asInteger(value: unknown, path: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    fail(path, `integer >= ${min}`, value);
  }
  return value;
}

function asSeries(value: unknown, path: string, expectedLength: number): Array<number | null> {
  if (!Array.isArray(value)) {
    fail(path, `array length ${expectedLength}`, value);
  }
  if (value.length !== expectedLength) {
    fail(path, `array length ${expectedLength}`, value.length);
  }
  return value as Array<number | null>;
}

function normalizeSeriesToMasterLength(args: {
  value: unknown;
  path: string;
  expectedLength: number;
  safeToZero: boolean;
}): { series: Array<number | null>; normalized: boolean } {
  const { value, path, expectedLength, safeToZero } = args;
  if (!Array.isArray(value)) {
    fail(path, 'array', value);
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

function hasAnyNonZero(series: Array<number | null>): boolean {
  return series.some((value) => {
    const finite = toFiniteOrNull(value);
    return finite !== null && finite !== 0;
  });
}

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function asOptionalSparseSeries(value: unknown, path: string, masterN: number): Array<number | null> | undefined {
  return normalizeSparseSeries(path, value, masterN);
}

function parseEconomicsBreakdown(raw: unknown, masterN: number, siteGandA_USD: Array<number | null>): ProjectJsonV1['economicsBreakdown'] {
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

    if (cogs.siteGandA_USD && hasAnyNonNull(cogs.siteGandA_USD) && hasAnyNonZero(siteGandA_USD)) {
      fail('economicsBreakdown.cogs.siteGandA_USD', 'must not be provided when series.siteGandA_USD has any non-null values', cogs.siteGandA_USD);
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

function parseOperations(raw: unknown, masterN: number): { operations: ProjectJsonV1['operations']; normalized: boolean } {
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
  engineInputWithoutPrices: Omit<ProjectEngineFullProductionV1Input, 'spotPriceUSDByMetal' | 'aisc'> & {
    payableQtyByMetal: Record<string, Array<number | null>>;
    streamsByMetal: Record<string, import('../streams/types').StreamMVIConfig> | null;
    takeItems: Array<import('../take/types').TakeItemMVI>;
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

export function parseProjectJsonV1(raw: unknown): ParsedProjectJsonV1 {
  if (!isPlainObject(raw)) {
    fail('root', 'object', raw);
  }

  if (raw.version !== 'project_json_v1') {
    fail('version', '"project_json_v1"', raw.version);
  }

  if (!isPlainObject(raw.time)) {
    fail('time', 'object', raw.time);
  }

  const masterN = asInteger(raw.time.masterN, 'time.masterN', 0);
  const productionStartPeriod = asInteger(raw.time.productionStartPeriod, 'time.productionStartPeriod', 0);
  const expectedLength = masterN + 1;
  const periodEndDatesUtc = parsePeriodEndDates(raw.time.periodEndDatesUtc, expectedLength);

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
        fail('equity.fdExtraShares', 'finite number >= 0', rawFdExtraShares);
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
  let projectSeriesNormalized = false;

  const capexNormalized = normalizeSeriesToMasterLength({
    value: raw.series.capexUSD,
    path: 'series.capexUSD',
    expectedLength,
    safeToZero: true,
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
  });
  projectSeriesNormalized = projectSeriesNormalized || operatingCostsNormalized.normalized;
  const operatingCostsUSD = operatingCostsNormalized.series;
  const sustainingCapexNormalized = normalizeSeriesToMasterLength({
    value: raw.series.sustainingCapexUSD,
    path: 'series.sustainingCapexUSD',
    expectedLength,
    safeToZero: true,
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
  });
  projectSeriesNormalized = projectSeriesNormalized || siteGandaNormalized.normalized;
  const siteGandA_USD = siteGandaNormalized.series;
  const reclamationNormalized = normalizeSeriesToMasterLength({
    value: raw.series.reclamationUSD,
    path: 'series.reclamationUSD',
    expectedLength,
    safeToZero: true,
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

  const economicsBreakdown = parseEconomicsBreakdown(raw.economicsBreakdown, masterN, siteGandA_USD);

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
    if (typeof qtyUnit !== 'string' || !QTY_UNIT_SET.has(qtyUnit as QtyUnit)) {
      fail(`metals.payableQtyUnitByMetal.${metal}`, 'known QtyUnit', qtyUnit);
    }
    payableQtyUnitByMetal[metal] = qtyUnit as QtyUnit;

    const priceKey = raw.metals.priceKeyByMetal[metal];
    if (typeof priceKey !== 'string' || priceKey.trim().length === 0) {
      fail(`metals.priceKeyByMetal.${metal}`, 'non-empty string', priceKey);
    }
    priceKeyByMetal[metal] = priceKey;
  }

  const extraUnitKeys = Object.keys(raw.metals.payableQtyUnitByMetal).filter((key) => !(key in payableQtyByMetal));
  if (extraUnitKeys.length > 0) {
    fail('metals.payableQtyUnitByMetal', 'same keys as payableQtyByMetal', extraUnitKeys);
  }

  const extraPriceKeys = Object.keys(raw.metals.priceKeyByMetal).filter((key) => !(key in payableQtyByMetal));
  if (extraPriceKeys.length > 0) {
    fail('metals.priceKeyByMetal', 'same keys as payableQtyByMetal', extraPriceKeys);
  }

  const auPriceKey = raw.metals.auPriceKey;
  if (typeof auPriceKey !== 'string' || auPriceKey.trim().length === 0) {
    fail('metals.auPriceKey', 'non-empty string', auPriceKey);
  }

  const streamsByMetal = raw.streamsByMetal;
  if (streamsByMetal !== undefined && streamsByMetal !== null && !isPlainObject(streamsByMetal)) {
    fail('streamsByMetal', 'object map or null', streamsByMetal);
  }

  const takeItems = raw.takeItems;
  if (takeItems !== undefined && takeItems !== null && !Array.isArray(takeItems)) {
    fail('takeItems', 'array or null', takeItems);
  }

  const parsedOperations = raw.operations === undefined ? undefined : parseOperations(raw.operations, masterN);
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
  };
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
  return parseProjectJsonV1(raw);
}
