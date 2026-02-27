import { buildProjectJsonV1Template } from '../template.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

(function runTemplateTests() {
  const template = buildProjectJsonV1Template({ version: 'project_json_v1' } as never);
  const expectedLen = template.time.masterN + 1;

  assert(template.economicsBreakdown != null, 'economicsBreakdown exists');
  assert(Array.isArray(template.economicsBreakdown?.royaltiesDetail), 'royaltiesDetail exists');

  if ((template.economicsBreakdown?.royaltiesDetail?.length ?? 0) > 0) {
    const item = template.economicsBreakdown?.royaltiesDetail?.[0] as Record<string, unknown>;
    for (const key of ['id', 'label', 'name', 'base', 'rateType', 'rate']) {
      assert(key in item, `royaltiesDetail[0].${key} exists`);
    }
  }

  for (const key of [
    'capexUSD',
    'operatingCostsUSD',
    'sustainingCapexUSD',
    'siteGandA_USD',
    'depreciationUSD',
    'workingCapitalDeltaUSD',
    'royaltiesUSD',
    'reclamationUSD',
    'byproductCreditsUSD',
  ] as const) {
    assertEqual(template.series[key]!.length, expectedLen, `series.${key} length`);
  }

  assert(template.operations != null, 'operations exists');
  assert(template.operations?.capacity != null, 'operations.capacity exists');
  assert('throughputUnit' in (template.operations?.capacity ?? {}), 'operations.capacity.throughputUnit exists');
  assert('nameplateThroughput' in (template.operations?.capacity ?? {}), 'operations.capacity.nameplateThroughput exists');
  assert('utilizationPct' in (template.operations?.capacity ?? {}), 'operations.capacity.utilizationPct exists');

  console.log('Project JSON v1 template tests passed');
})();
