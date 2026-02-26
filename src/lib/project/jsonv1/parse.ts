import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import type { ProjectJsonV1 } from './schema.ts';

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

  return operations;
}

export type ProjectJsonV1Context = {
  operations?: ProjectJsonV1['operations'] | null;
};

export type ParsedProjectJsonV1 = {
  engineInput: ProjectEngineFullProductionV1Input;
  context: ProjectJsonV1Context;
};

export function parseProjectJsonV1(raw: unknown): ProjectEngineFullProductionV1Input {
  return parseProjectJsonV1WithContext(raw).engineInput;
}

export function parseProjectJsonV1WithContext(raw: unknown): ParsedProjectJsonV1 {
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
  const spotPriceUSDByMetal = asRecordOfSeries(raw.metals.spotPriceUSDByMetal, 'metals.spotPriceUSDByMetal', expectedLength);
  const auPriceUSDPerOz = asSeries(raw.metals.auPriceUSDPerOz, 'metals.auPriceUSDPerOz', expectedLength);

  const payableMetals = Object.keys(payableQtyByMetal);
  if (payableMetals.length === 0) {
    fail('metals.payableQtyByMetal', 'at least one metal key', payableMetals);
  }

  for (const metal of payableMetals) {
    if (!(metal in spotPriceUSDByMetal)) {
      fail(`metals.spotPriceUSDByMetal.${metal}`, 'series for every payable metal', undefined);
    }

    validateNonNegativeFiniteSeries(payableQtyByMetal[metal], `metals.payableQtyByMetal.${metal}`);
    validateNonNegativeFiniteSeries(spotPriceUSDByMetal[metal], `metals.spotPriceUSDByMetal.${metal}`);
  }

  validateNonNegativeFiniteSeries(auPriceUSDPerOz, 'metals.auPriceUSDPerOz');

  const streamsByMetal = raw.streamsByMetal;
  if (streamsByMetal !== undefined && streamsByMetal !== null && !isPlainObject(streamsByMetal)) {
    fail('streamsByMetal', 'object map or null', streamsByMetal);
  }

  const takeItems = raw.takeItems;
  if (takeItems !== undefined && takeItems !== null && !Array.isArray(takeItems)) {
    fail('takeItems', 'array or null', takeItems);
  }

  const operations = raw.operations === undefined ? undefined : parseOperations(raw.operations, expectedLength);

  const engineInput: ProjectEngineFullProductionV1Input = {
    masterN,
    streamsByMetal: (streamsByMetal as ProjectEngineFullProductionV1Input['streamsByMetal']) ?? null,
    payableQtyByMetal,
    spotPriceUSDByMetal,
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
      // Corporate pipeline should overwrite discountRate at runtime.
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz,
    },
  };

  return {
    engineInput,
    context: {
      operations: operations ?? null,
    },
  };
}
