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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

(function runTemplateTests() {
  const template = buildProjectJsonV1Template({ version: 'project_json_v1' } as never);
  const expectedLen = template.time.masterN + 1;

  assert(template.economicsBreakdown != null, 'economicsBreakdown exists');
  assert(Array.isArray(template.economicsBreakdown?.royaltiesDetail), 'royaltiesDetail exists');
  assert((template.economicsBreakdown?.royaltiesDetail?.length ?? 0) >= 1, 'royaltiesDetail has at least one row');

  const item = template.economicsBreakdown?.royaltiesDetail?.[0] as Record<string, unknown>;
  const expectedRoyaltyKeys = ['id', 'label', 'name', 'base', 'rateType', 'rate', 'royaltyUSD', 'source', 'notes'].sort();
  assertDeepEqual(Object.keys(item).sort(), expectedRoyaltyKeys, 'royaltiesDetail[0] has exact schema key set');

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

  const filled = buildProjectJsonV1Template({
    version: 'project_json_v1',
    economicsBreakdown: {
      royaltiesDetail: [{
        id: 'r-1',
        label: 'NSR',
        base: 'quantity',
        rate: 0.02,
      }],
    },
  } as never);

  const filledRow = filled.economicsBreakdown?.royaltiesDetail?.[0] as Record<string, unknown>;
  assertEqual(filledRow.id, 'r-1', 'existing royaltiesDetail.id preserved');
  assertEqual(filledRow.label, 'NSR', 'existing royaltiesDetail.label preserved');
  assertEqual(filledRow.base, 'quantity', 'existing royaltiesDetail.base preserved');
  assertEqual(filledRow.rate, 0.02, 'existing royaltiesDetail.rate preserved');

  for (const key of expectedRoyaltyKeys) {
    assert(key in filledRow, `deep-filled royaltiesDetail key exists: ${key}`);
  }

  console.log('Project JSON v1 template tests passed');
})();
