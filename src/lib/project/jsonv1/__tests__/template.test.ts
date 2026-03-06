import { buildProjectJsonV1Template, getProjectJsonV1Template } from '../template.ts';

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
  const expectedRoyaltyKeys = [
    'id',
    'label',
    'name',
    'base',
    'rateType',
    'rate',
    'royaltyUSD',
    'source',
    'notes',
    '_choices_base',
    '_choices_rateType',
    '_choices_source',
  ].sort();
  assertDeepEqual(Object.keys(item).sort(), expectedRoyaltyKeys, 'royaltiesDetail[0] has exact schema key set');
  assertDeepEqual(item._choices_base, ['ebit', 'ebitda', 'quantity', 'revenue'], 'royalty base choices present and sorted');
  assertDeepEqual(item._choices_rateType, ['NSR_pct', 'ad_valorem_pct'], 'royalty rateType choices present and sorted');

  const defaultTemplate = getProjectJsonV1Template();
  assertEqual(defaultTemplate.equity?.fdExtraShares, 0, 'template fdExtraShares defaults to 0');
  assert((defaultTemplate.meta?.notes ?? '').includes('masterN+1'), 'template notes include array length guidance');
  assertEqual(defaultTemplate.metals.payableQtyUnitByMetal.Au, 'toz', 'template Au unit uses toz');
  const takeItem = (defaultTemplate.takeItems?.[0] ?? null) as Record<string, unknown> | null;
  assert(takeItem != null, 'takeItems[0] exists');
  assertDeepEqual(takeItem?._choices_type, ['AD_VALOREM', 'NSR'], 'take type choices present and sorted');
  assertDeepEqual(takeItem?._choices_jurisdictionLevel, ['contractual', 'municipal', 'national', 'other', 'provincial_state'], 'take jurisdiction choices present and sorted');

  assert(Array.isArray(defaultTemplate.operations?.gradeByMetal?.Au), 'template includes gradeByMetal Au example array');
  assert(Array.isArray(defaultTemplate.operations?.recoveryPctByMetal?.Au), 'template includes recoveryPctByMetal Au example array');

  const capacity = defaultTemplate.operations?.capacity as Record<string, unknown>;
  assertDeepEqual(capacity._choices_throughputUnit, ['tpa', 'tpd'], 'throughput choices present and sorted');

  assertEqual((defaultTemplate.time as Record<string, unknown>)._example_productionStartPeriod, 2, 'time helper example documents 0-based productionStartPeriod');
  assert(typeof (defaultTemplate.time as Record<string, unknown>)._description_timeseries_alignment === 'string', 'time helper alignment description exists');
  assert(!Object.prototype.hasOwnProperty.call(defaultTemplate.time as Record<string, unknown>, 'periodEndDatesUtc'), 'template no longer includes periodEndDatesUtc');
  assert(Array.isArray((defaultTemplate.series as Record<string, unknown>)._example_capexUSD), 'series helper example for capexUSD exists');

  assert(typeof (defaultTemplate as Record<string, unknown>)._description_numeric_scale === 'string', 'global numeric scale description exists');
  assertEqual((defaultTemplate.series as Record<string, unknown>)._unit_capexUSD, 'USD millions', 'capex unit helper is USD millions');
  assertEqual((defaultTemplate.series as Record<string, unknown>)._unit_operatingCostsUSD, 'USD millions', 'operating costs unit helper is USD millions');
  assertEqual((defaultTemplate.operations as Record<string, unknown>)._unit_oreMinedTonnes, 'tonnes', 'ore mined unit helper is tonnes');
  assertEqual((defaultTemplate.metals as Record<string, unknown>)._unit_payableQtyByMetal, 'Physical units per payableQtyUnitByMetal (no thousand/million scaling)', 'payable quantity unit helper exists');

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
