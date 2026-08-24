import { resolveProducerPriceDeck } from '../priceDeck.ts';
import {
  aggregateProducedByMetal,
  buildNormalizedCompanyProduction,
  computeMetalRevenueUSD,
  computePhysicalAuEqOz,
  normalizeProjectProductionForYear,
  selectRevenueQuantityByMetal,
} from '../production.ts';
import type { ProducerJsonV1, ProducerProject, ProducerRunContext } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertClose(actual: number | null, expected: number, message: string, tolerance = 1e-9): void {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
  }
}

const provenance = { sourceId: 's1', estimateClass: 'company_guidance' as const };

function project(overrides: Partial<ProducerProject> = {}): ProducerProject {
  return {
    id: 'p1',
    name: 'Mine 1',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 0.6, provenance }],
    production: [],
    ...overrides,
  };
}

function producer(companyId: string, reportedPriceDecks?: ProducerJsonV1['reportedPriceDecks']): ProducerJsonV1 {
  return {
    version: 'producer_json_v1',
    company: { id: companyId, name: companyId },
    valuation: { valuationDateUtc: '2026-08-22' },
    projects: [],
    sources: [{ id: 's1', sourceType: 'company_release', publisher: 'Issuer', title: 'Guidance' }],
    reportedPriceDecks,
  };
}

const context: ProducerRunContext = {
  valuationDateUtc: '2026-08-22',
  selectedYear: 2030,
  priceMode: 'SPOT',
  caseMode: 'BASE',
};

async function run(): Promise<void> {
  const owned = project({
    production: [{
      id: 'au-owned',
      metal: 'Au',
      measure: 'produced',
      period: { kind: 'year', year: 2030 },
      quantity: { kind: 'point', value: 100 },
      unit: 'koz',
      basis: 'project_100pct',
      provenance,
    }],
  });
  const ownedNormalized = normalizeProjectProductionForYear(owned, 2030);
  assertClose(ownedNormalized[0].claim?.kind === 'point' ? ownedNormalized[0].claim.value : null, 60_000, '100 koz at 60% ownership should normalize to 60 koz attributable');
  assertEqual(ownedNormalized[0].unit, 'toz', 'gold canonical production unit');

  const attributable = project({
    production: [{
      id: 'au-attr',
      metal: 'Au',
      measure: 'produced',
      period: { kind: 'year', year: 2030 },
      quantity: { kind: 'point', value: 60 },
      unit: 'koz',
      basis: 'attributable',
      provenance,
    }],
  });
  const attributableNormalized = normalizeProjectProductionForYear(attributable, 2030);
  assertClose(attributableNormalized[0].claim?.kind === 'point' ? attributableNormalized[0].claim.value : null, 60_000, 'attributable production must not be multiplied by ownership again');

  const ownershipChange = project({
    ownership: [
      { effectiveFrom: '2020-01-01', effectiveTo: '2030-06-30', ownershipPct: 0.6, provenance },
      { effectiveFrom: '2030-07-01', ownershipPct: 0.8, provenance },
    ],
    production: owned.production,
  });
  const changed = normalizeProjectProductionForYear(ownershipChange, 2030)[0];
  assertEqual(changed.quality, 'not_computable', 'mid-year ownership change must not silently prorate annual production');
  assert(/cannot be silently prorated/.test(changed.reason ?? ''), 'ownership-change diagnostic');

  const multiYear = project({
    production: [{
      id: 'avg',
      metal: 'Au',
      measure: 'produced',
      period: { kind: 'year_range_average', startYear: 2030, endYear: 2033 },
      quantity: { kind: 'approximate', value: 400 },
      unit: 'koz',
      basis: 'attributable',
      provenance,
    }],
  });
  const multi = normalizeProjectProductionForYear(multiYear, 2030)[0];
  assertEqual(multi.quality, 'not_computable', 'multi-year average must not become a precise single-year value');
  assertEqual(multi.claim, null, 'multi-year average scalar should remain unresolved');

  const range = project({
    production: [{
      id: 'range',
      metal: 'Au',
      measure: 'produced',
      period: { kind: 'year', year: 2030 },
      quantity: { kind: 'range', low: 240, high: 270 },
      unit: 'koz',
      basis: 'attributable',
      provenance,
    }],
  });
  const ranged = normalizeProjectProductionForYear(range, 2030)[0];
  assertEqual(ranged.quality, 'not_computable', 'production range must not be midpointed');
  assert(ranged.claim?.kind === 'range', 'range shape must be preserved');
  if (ranged.claim?.kind === 'range') {
    assertClose(ranged.claim.low, 240_000, 'range low unit normalization');
    assertClose(ranged.claim.high, 270_000, 'range high unit normalization');
  }

  const measures = project({
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [
      { id: 'prod', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
      { id: 'sold', metal: 'Au', measure: 'sold', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 90 }, unit: 'toz', basis: 'attributable', provenance },
      { id: 'pay', metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 80 }, unit: 'toz', basis: 'attributable', provenance },
    ],
  });
  const measureItems = normalizeProjectProductionForYear(measures, 2030);
  const revenueQuantity = selectRevenueQuantityByMetal(measureItems).Au;
  assertClose(revenueQuantity.value, 80, 'revenue quantity preference should be payable > sold > produced');
  assertEqual(revenueQuantity.quality, 'exact', 'payable revenue quantity should remain exact');

  const producedOnly = project({
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [{ id: 'prod-only', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance }],
  });
  const producedOnlyRevenueQuantity = selectRevenueQuantityByMetal(normalizeProjectProductionForYear(producedOnly, 2030)).Au;
  assertClose(producedOnlyRevenueQuantity.value, 100, 'produced-only revenue proxy value');
  assertEqual(producedOnlyRevenueQuantity.quality, 'approximation', 'produced-only revenue proxy must be marked approximation');

  const fakeResolver = async (args: { price_key: string }) => ({
    values: [args.price_key === 'XAU_USD_TOZ' ? 2_000 : args.price_key === 'XAG_USD_TOZ' ? 20 : null],
    warnings: [] as string[],
  });
  const spotA = await resolveProducerPriceDeck(
    { producer: producer('A'), context, metals: ['Au', 'Ag'] },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  const spotB = await resolveProducerPriceDeck(
    { producer: producer('B'), context, metals: ['Au'] },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(spotA.id, 'SPOT:2026-08-22', 'spot deck id should be valuation-date anchored');
  assertEqual(spotA.id, spotB.id, 'all peers on the same valuation date must share the same SPOT deck id');
  assertClose(spotA.pricesByMetal.Au.valueUSD, 2_000, 'spot gold price');
  assertClose(spotA.pricesByMetal.Ag.valueUSD, 20, 'spot silver price');

  const dateMismatchProducer = producer('DATE-MISMATCH');
  dateMismatchProducer.valuation.valuationDateUtc = '2026-08-21';
  let dateMismatchThrew = false;
  try {
    await resolveProducerPriceDeck(
      { producer: dateMismatchProducer, context, metals: ['Au'] },
      { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
    );
  } catch (error) {
    dateMismatchThrew = error instanceof Error && /does not match run context/.test(error.message);
  }
  assert(dateMismatchThrew, 'producer valuationDateUtc and run-context valuationDateUtc must be locked together');

  const ltMissing = await resolveProducerPriceDeck({ producer: producer('A'), context: { ...context, priceMode: 'LT' }, metals: ['Au'] });
  assertEqual(ltMissing.id, 'LT:UNRESOLVED', 'LT must not invent a long-term deck');
  assertEqual(ltMissing.pricesByMetal.Au, undefined, 'missing LT deck must not create a price');

  const lt = await resolveProducerPriceDeck({
    producer: producer('A'),
    context: { ...context, priceMode: 'LT' },
    metals: ['Au', 'Ag'],
    ltDeck: { id: 'lt-v1', pricesByMetal: { Au: { value: 1_800, unit: 'USD_per_toz' }, Ag: { value: 18, unit: 'USD_per_toz' } } },
  });
  assertEqual(lt.id, 'LT:lt-v1', 'explicit LT deck id');
  assertClose(lt.pricesByMetal.Au.valueUSD, 1_800, 'explicit LT gold price');

  const reportedDecks: ProducerJsonV1['reportedPriceDecks'] = [
    { id: 'r1', label: 'Deck 1', metals: { Au: { value: 1_700, unit: 'USD_per_toz' } }, provenance },
    { id: 'r2', label: 'Deck 2', metals: { Au: { value: 1_900, unit: 'USD_per_toz' } }, provenance },
  ];
  const reportedAmbiguous = await resolveProducerPriceDeck({
    producer: producer('A', reportedDecks),
    context: { ...context, priceMode: 'REPORTED' },
    metals: ['Au'],
  });
  assertEqual(reportedAmbiguous.id, 'REPORTED:UNRESOLVED', 'multiple reported decks must not be mixed implicitly');
  const reportedExplicit = await resolveProducerPriceDeck({
    producer: producer('A', reportedDecks),
    context: { ...context, priceMode: 'REPORTED' },
    metals: ['Au'],
    reportedPriceDeckId: 'r2',
  });
  assertClose(reportedExplicit.pricesByMetal.Au.valueUSD, 1_900, 'explicit reported deck selection');

  const cuBlocked = await resolveProducerPriceDeck(
    { producer: producer('A'), context, metals: ['Cu'] },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(cuBlocked.pricesByMetal.Cu.valueUSD, null, 'unverified copper proxy must be blocked by default');
  assert(/TEMP COMEX HG proxy/.test(cuBlocked.warnings.join(' ')), 'copper blocked reason must be explicit');

  const auAgProject = project({
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [
      { id: 'au', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
      { id: 'ag', metal: 'Ag', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 1_000 }, unit: 'toz', basis: 'attributable', provenance },
    ],
  });
  const normalizedAuAg = normalizeProjectProductionForYear(auAgProject, 2030);
  const producedAuAg = aggregateProducedByMetal(normalizedAuAg);
  const auEq = computePhysicalAuEqOz(producedAuAg, spotA);
  assertClose(auEq.value, 110, 'physical AuEq should use the same selected deck: 100 Au + 1000 Ag * 20/2000');
  const revenue = computeMetalRevenueUSD(producedAuAg, spotA);
  assertClose(revenue.totalRevenueUSD, 220_000, 'metal revenue under selected deck');

  const development = project({ id: 'dev', statusAsOfValuationDate: 'development', production: producedOnly.production });
  assertEqual(buildNormalizedCompanyProduction({ projects: [development], year: 2030, caseMode: 'BASE' }).length, 0, 'development project excluded from BASE');
  assertEqual(buildNormalizedCompanyProduction({ projects: [development], year: 2030, caseMode: 'GROWTH' }).length, 1, 'development project included in GROWTH when explicit production exists');

  console.log('Mining Producer normalization tests passed');
}

void run();
