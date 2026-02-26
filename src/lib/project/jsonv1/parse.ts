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

function validateNonNegativeFiniteSeries(series: Array<number | null>, path: string): void {
  for (let i = 0; i < series.length; i += 1) {
    const value = series[i];
    if (isFiniteNumber(value) && value < 0) {
      fail(`${path}[${i}]`, 'null or finite number >= 0', value);
    }
  }
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

function parseOperations(raw: unknown, expectedLength: number): ProjectJsonV1['operations'] {
  if (raw == null) {
    return raw as null;
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

  if ('oreMilledTonnes' in raw && raw.oreMilledTonnes !== undefined) {
    const oreMilledTonnes = asSeries(raw.oreMilledTonnes, 'operations.oreMilledTonnes', expectedLength);
    validateNonNegativeFiniteSeries(oreMilledTonnes, 'operations.oreMilledTonnes');
    operations.oreMilledTonnes = oreMilledTonnes;
  }

  if ('oreMinedTonnes' in raw && raw.oreMinedTonnes !== undefined) {
    const oreMinedTonnes = asSeries(raw.oreMinedTonnes, 'operations.oreMinedTonnes', expectedLength);
    validateNonNegativeFiniteSeries(oreMinedTonnes, 'operations.oreMinedTonnes');
    operations.oreMinedTonnes = oreMinedTonnes;
  }

  if ('oreTonnageUnit' in raw && raw.oreTonnageUnit !== undefined) {
    const oreTonnageUnit = raw.oreTonnageUnit;
    if (oreTonnageUnit !== null && oreTonnageUnit !== 'tonne' && oreTonnageUnit !== 'short_ton' && oreTonnageUnit !== 'long_ton') {
      fail('operations.oreTonnageUnit', '"tonne" | "short_ton" | "long_ton" | null', oreTonnageUnit);
    }
    operations.oreTonnageUnit = oreTonnageUnit;
  }

  return operations;
}

export type ProjectJsonV1Context = {
  operations?: ProjectJsonV1['operations'] | null;
};

export type ParsedProjectJsonV1 = {
  engineInputWithoutPrices: Omit<ProjectEngineFullProductionV1Input, 'spotPriceUSDByMetal' | 'aisc'> & {
    payableQtyByMetal: Record<string, Array<number | null>>;
    streamsByMetal: Record<string, import('../streams/types').StreamMVIConfig> | null;
    takeItems: Array<import('../take/types').TakeItemMVI>;
    masterN: number;
    productionStartPeriod: number;
    taxRate: number;
    priceKeyByMetal: Record<string, string>;
    auPriceKey: string;
    payableQtyUnitByMetal: Record<string, QtyUnit>;
  };
  context: ProjectJsonV1Context;
  priceOverrides: NonNullable<ProjectJsonV1['priceOverrides']>;
  engineInput: ProjectEngineFullProductionV1Input;
};

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

  if (!isPlainObject(raw.economics)) {
    fail('economics', 'object', raw.economics);
  }

  const rawTaxRate = raw.economics.taxRate;
  if (rawTaxRate !== undefined && (!isFiniteNumber(rawTaxRate) || rawTaxRate < 0 || rawTaxRate > 0.6)) {
    fail('economics.taxRate', 'finite number in [0, 0.6]', rawTaxRate);
  }
  const taxRate = rawTaxRate ?? 0;

  if (!isPlainObject(raw.series)) {
    fail('series', 'object', raw.series);
  }

  const capexUSD = asSeries(raw.series.capexUSD, 'series.capexUSD', expectedLength);
  const operatingCostsUSD = asSeries(raw.series.operatingCostsUSD, 'series.operatingCostsUSD', expectedLength);
  const sustainingCapexUSD = asSeries(raw.series.sustainingCapexUSD, 'series.sustainingCapexUSD', expectedLength);
  const siteGandA_USD = asSeries(raw.series.siteGandA_USD, 'series.siteGandA_USD', expectedLength);
  const reclamationUSD = asSeries(raw.series.reclamationUSD, 'series.reclamationUSD', expectedLength);
  const byproductCreditsUSD =
    raw.series.byproductCreditsUSD === undefined
      ? undefined
      : asSeries(raw.series.byproductCreditsUSD, 'series.byproductCreditsUSD', expectedLength);

  if (!isPlainObject(raw.metals)) {
    fail('metals', 'object', raw.metals);
  }

  const payableQtyByMetal = asRecordOfSeries(raw.metals.payableQtyByMetal, 'metals.payableQtyByMetal', expectedLength);
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

  const operations = raw.operations === undefined ? undefined : parseOperations(raw.operations, expectedLength);

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
      },
      phase2: {
        discountRate: 0.1,
      },
      productionStartPeriod,
      taxRate,
      priceKeyByMetal,
      auPriceKey,
      payableQtyUnitByMetal,
    },
    context: {
      operations: operations ?? null,
    },
    priceOverrides: {
      spotPriceUSDByMetal: overrideSpot,
      auPriceUSDPerOz: overrideAu,
    },
    engineInput,
  };
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
  return parseProjectJsonV1(raw);
}
