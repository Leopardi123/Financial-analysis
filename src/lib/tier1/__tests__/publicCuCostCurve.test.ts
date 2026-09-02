import assert from 'node:assert/strict';
import {
  PUBLIC_CU_COST_PILOT_OBSERVATIONS,
  TIER_PUBLIC_CU_COST_PILOT_POLICY,
  buildPublicCuPilotCurve,
  normalizePublicCuCostObservation,
  type PublicCuPilotObservation,
} from '../publicCuCostCurve.ts';

assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.status, 'RESEARCH_ONLY');
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.comparisonEnabled, false);
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.dataYear, 2024);
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.denominatorBasis, 'CONTAINED_CU_PRODUCED');
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.allocation, 'GROSS_CONTAINED_METAL_PRODUCTION_VALUE_PRO_RATA');
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.quartileMethod, 'PRODUCTION_WEIGHTED_NEAREST_CUMULATIVE_THRESHOLD');
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles, 20);
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal.Cu.value, 4.16);
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal.Au.value, 2_386);
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal.Ag.value, 28.27);
assert.equal(TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal.Mo.value, 21.30);
assert.match(TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.sourceUrl, /sec\.gov/);
assert.match(TIER_PUBLIC_CU_COST_PILOT_POLICY.streamTreatmentNote, /physical 2024 contained-metal production/i);

assert.equal(PUBLIC_CU_COST_PILOT_OBSERVATIONS.length, 10);
assert.equal(PUBLIC_CU_COST_PILOT_OBSERVATIONS.filter((row) => row.status === 'ELIGIBLE_FOR_PILOT').length, 5);
assert.equal(PUBLIC_CU_COST_PILOT_OBSERVATIONS.filter((row) => row.status === 'PARTIAL').length, 5);
for (const row of PUBLIC_CU_COST_PILOT_OBSERVATIONS) {
  assert.ok(row.sourceUrl.startsWith('https://'));
  assert.ok(row.sourcePageOrTable.length > 0);
  assert.equal(row.dataYear, 2024);
}

const expectedById: Record<string, number> = {
  'kamoa-kakula-2024': 1.6024406418839245,
  'hudbay-peru-2024': 1.7990708636817774,
  'copper-mountain-2024': 3.0235795426919565,
  'kansanshi-2024': 1.931082177131546,
  'sentinel-2024': 1.94,
};

for (const [id, expected] of Object.entries(expectedById)) {
  const source = PUBLIC_CU_COST_PILOT_OBSERVATIONS.find((row) => row.id === id);
  assert.ok(source, `Missing pilot observation ${id}`);
  if (!source) continue;
  const normalized = normalizePublicCuCostObservation(source);
  assert.equal(normalized.status, 'NORMALIZED', `${id} must be source-complete for the pilot.`);
  if (normalized.status !== 'NORMALIZED') continue;
  assert.ok(Math.abs(normalized.normalizedCuCostUSDPerLbContainedCu - expected) < 1e-12, `${id} normalized cost drifted.`);
  assert.ok(normalized.copperReferenceValueShare > 0 && normalized.copperReferenceValueShare <= 1);
  assert.ok(normalized.commonPoolUSD > 0);
}

const base = PUBLIC_CU_COST_PILOT_OBSERVATIONS.find((row) => row.id === 'kamoa-kakula-2024');
assert.ok(base);
if (!base) throw new Error('Kamoa pilot source is required.');
const kamoa = normalizePublicCuCostObservation(base);
assert.equal(kamoa.status, 'NORMALIZED');
if (kamoa.status === 'NORMALIZED') {
  assert.equal(kamoa.copperReferenceValueShare, 1, 'Pure-copper Kamoa must not be diluted by an invented co-product.');
  assert.ok(Math.abs(kamoa.commonPoolUSD - 1_544_039_000) < 1e-6);
}

const kansanshiSource = PUBLIC_CU_COST_PILOT_OBSERVATIONS.find((row) => row.id === 'kansanshi-2024');
assert.ok(kansanshiSource);
if (!kansanshiSource) throw new Error('Kansanshi pilot source is required.');
const kansanshi = normalizePublicCuCostObservation(kansanshiSource);
assert.equal(kansanshi.status, 'NORMALIZED');
if (kansanshi.status === 'NORMALIZED') {
  assert.ok(Math.abs(kansanshi.preAllocationCashCostUSDPerLbContainedCu - 2.24) < 1e-12);
  assert.ok(kansanshi.copperReferenceValueShare < 1, 'Kansanshi gold production must receive a share of the common pool.');
}

for (const row of PUBLIC_CU_COST_PILOT_OBSERVATIONS.filter((candidate) => candidate.status === 'PARTIAL')) {
  const result = normalizePublicCuCostObservation(row);
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.ok(result.status === 'NOT_VERIFIED' && result.blockers.length > 0);
}

const pilot = buildPublicCuPilotCurve();
assert.equal(pilot.status, 'NOT_READY');
assert.equal(pilot.comparisonEnabled, false);
assert.equal(pilot.eligibleObservationCount, 5);
assert.equal(pilot.minimumRequired, 20);
assert.equal(pilot.q1Max, null);
assert.equal(pilot.p50Max, null);
assert.equal(pilot.p75Max, null);
assert.equal(pilot.totalContainedCuTonnes, 964_397);

const syntheticTwenty: PublicCuPilotObservation[] = Array.from({ length: 20 }, (_, index) => ({ ...base, id: `synthetic-${index}` }));
const syntheticCurve = buildPublicCuPilotCurve(syntheticTwenty);
assert.equal(syntheticCurve.status, 'RESEARCH_CURVE_READY');
assert.equal(syntheticCurve.comparisonEnabled, false, 'Even a statistically ready research curve must not silently activate the Tier gate.');
assert.ok(syntheticCurve.q1Max !== null && syntheticCurve.p50Max !== null && syntheticCurve.p75Max !== null);
assert.ok(syntheticCurve.q1Max === syntheticCurve.p50Max && syntheticCurve.p50Max === syntheticCurve.p75Max);

const wrongYear = normalizePublicCuCostObservation({ ...base, id: 'wrong-year', dataYear: 2023 });
assert.equal(wrongYear.status, 'NOT_VERIFIED');
assert.ok(wrongYear.status === 'NOT_VERIFIED' && wrongYear.blockers.some((item) => item.includes('DATA_YEAR_2023')));

const wrongDenominator = normalizePublicCuCostObservation({ ...base, id: 'wrong-denominator', denominatorBasis: 'PAYABLE_CU_PRODUCED' });
assert.equal(wrongDenominator.status, 'NOT_VERIFIED');
assert.ok(wrongDenominator.status === 'NOT_VERIFIED' && wrongDenominator.blockers.some((item) => item.includes('DENOMINATOR_PAYABLE_CU_PRODUCED')));

const unsupportedProduct = normalizePublicCuCostObservation({
  ...base,
  id: 'unsupported-product',
  productionByMetal: {
    ...base.productionByMetal,
    Zn: { value: 10_000, unit: 'tonne' },
  } as any,
} as PublicCuPilotObservation);
assert.equal(unsupportedProduct.status, 'NOT_VERIFIED');
assert.ok(unsupportedProduct.status === 'NOT_VERIFIED' && unsupportedProduct.blockers.includes('UNSUPPORTED_REFERENCE_PRICE_PRODUCT_Zn'));

console.log('publicCuCostCurve.test.ts passed');
