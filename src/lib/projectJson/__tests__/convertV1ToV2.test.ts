import { convertProjectJsonV1ToV2 } from '../convertV1ToV2.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

(function runConvertProjectJsonV1ToV2Tests() {
  const v1 = {
    version: 'project_json_v1',
    meta: {
      projectId: 'p1',
      projectName: 'Alpha',
      currency: 'USD',
    },
    time: {
      masterN: 3,
      productionStartPeriod: 1,
    },
    economics: {
      discountRate: 0.08,
    },
    metals: {
      payableQtyByMetal: {
        Au: [0, 10, 20, 30],
      },
    },
    mining: {
      oreMinedKt: [1, 2, 3, 4],
      nested: {
        stripRatio: [0.1, 0.2, null, 0.4],
      },
      nonSeries: {
        enabled: true,
      },
    },
    costs: {
      cashCostUSD: [100, 200, 300],
    },
    scalarConfig: {
      foo: 'bar',
    },
  };

  const converted = convertProjectJsonV1ToV2(v1) as Record<string, unknown>;

  assertEqual(converted.version, 'project_json_v2', 'version converted');
  assertEqual((converted.meta as Record<string, unknown>).projectId, 'p1', 'meta.projectId mapped');
  assertEqual((converted.meta as Record<string, unknown>).notes, '', 'meta.notes defaulted to empty string');
  assertEqual((converted.time as Record<string, unknown>).productionStartYear, null, 'productionStartYear defaults to null');
  assertEqual((converted.economics as Record<string, unknown>).discountRate, 0.08, 'economics moved as-is');
  assert(Array.isArray((converted._choices_version as unknown[])), '_choices_version exists');
  assertEqual(((converted.sources as Record<string, unknown>).raw), null, 'sources.raw is null');

  const series = converted.series as Record<string, unknown>;
  assertEqual((series.oreMinedKt as number[]).length, 4, 'series array preserved with same length');
  assertEqual((series.oreMinedKt as number[])[2], 3, 'series values preserved');
  assertEqual((series.cashCostUSD as number[]).length, 3, 'masterN length arrays preserved');
  assertEqual((series.stripRatio as Array<number | null>)[2], null, 'null values preserved in arrays');
  assert(!Object.prototype.hasOwnProperty.call(series, 'enabled'), 'non-array fields are not hoisted');
  assert(!Object.prototype.hasOwnProperty.call(converted, 'scalarConfig'), 'non-series top-level config dropped');

  let threw = false;
  try {
    convertProjectJsonV1ToV2({ version: 'project_json_v2' });
  } catch {
    threw = true;
  }
  assert(threw, 'throws on non-v1 version');
})();
