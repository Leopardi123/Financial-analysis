import { aggregateCanonicalCostBuckets, evaluateCostDisclosureForYear, type CostEvaluationContext } from '../costs.ts';
import type { ResolvedProducerPriceDeck } from '../priceDeck.ts';
import type { NormalizedProductionDisclosure } from '../production.ts';
import type { CostDisclosure, ProducerProject, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

function assertClose(actual: number | null, expected: number, message: string, tolerance = 1e-9): void {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
  }
}

const provenance: Provenance = { sourceId: 's1', estimateClass: 'company_guidance' };

const project: ProducerProject = {
  id: 'p1',
  name: 'Mine 1',
  primaryMetal: 'Au',
  statusAsOfValuationDate: 'operating',
  ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 0.6, provenance }],
  production: [],
};

const productionItems: NormalizedProductionDisclosure[] = [
  {
    projectId: 'p1', disclosureId: 'au-prod', metal: 'Au', measure: 'produced',
    claim: { kind: 'point', value: 60_000 }, unit: 'toz', quality: 'exact',
  },
  {
    projectId: 'p1', disclosureId: 'au-pay', metal: 'Au', measure: 'payable',
    claim: { kind: 'point', value: 58_000 }, unit: 'toz', quality: 'exact',
  },
  {
    projectId: 'p1', disclosureId: 'ag-prod', metal: 'Ag', measure: 'produced',
    claim: { kind: 'point', value: 300_000 }, unit: 'toz', quality: 'exact',
  },
];

const spotDeck: ResolvedProducerPriceDeck = {
  id: 'SPOT:2026-08-22',
  mode: 'SPOT',
  valuationDateUtc: '2026-08-22',
  pricesByMetal: {
    Au: { metal: 'Au', valueUSD: 2_100, unit: 'USD_per_toz', priceKey: 'XAU_USD_TOZ', readiness: 'production_ready' },
    Ag: { metal: 'Ag', valueUSD: 25, unit: 'USD_per_toz', priceKey: 'XAG_USD_TOZ', readiness: 'production_ready' },
  },
  warnings: [],
};

const reportedDeck: ResolvedProducerPriceDeck = {
  ...spotDeck,
  id: 'REPORTED:test:r1',
  mode: 'REPORTED',
  sourceReportedDeckId: 'r1',
};

function context(overrides: Partial<CostEvaluationContext> = {}): CostEvaluationContext {
  return {
    year: 2030,
    priceMode: 'SPOT',
    deck: spotDeck,
    productionItems,
    revenue: {
      revenueByMetalUSD: { Au: 121_800_000, Ag: 7_500_000 },
      totalRevenueUSD: 129_300_000,
      quality: 'exact',
      reasons: [],
    },
    usdPerCurrencyUnitByCurrency: { CAD: 0.73 },
    project,
    ...overrides,
  };
}

function cost(overrides: Partial<CostDisclosure>): CostDisclosure {
  return {
    id: 'c1',
    component: 'cash_operating_cost',
    period: { kind: 'year', year: 2030 },
    economicBasis: 'attributable',
    canonicalClassification: 'operating',
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 10_000_000 }, currency: 'USD' },
    provenance,
    ...overrides,
  };
}

(function runCostTests() {
  const fixed = evaluateCostDisclosureForYear(cost({}), context());
  assertClose(fixed?.valueUSD ?? null, 10_000_000, 'fixed USD cost');
  assertEqual(fixed?.quality, 'exact', 'fixed USD cost quality');

  const cad = evaluateCostDisclosureForYear(cost({
    id: 'cad',
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 10_000_000 }, currency: 'CAD' },
  }), context());
  assertClose(cad?.valueUSD ?? null, 7_300_000, 'fixed CAD cost uses explicit USD-per-CAD FX');

  const missingFx = evaluateCostDisclosureForYear(cost({
    id: 'brl',
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 10_000_000 }, currency: 'BRL' },
  }), context());
  assertEqual(missingFx?.valueUSD, null, 'missing FX blocks cost');
  assert(/must not be guessed/.test(missingFx?.reasons.join(' ') ?? ''), 'missing FX diagnostic');

  const ownedFixed = evaluateCostDisclosureForYear(cost({
    id: 'owned-fixed',
    economicBasis: 'project_100pct',
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 10_000_000 }, currency: 'USD' },
  }), context());
  assertClose(ownedFixed?.valueUSD ?? null, 6_000_000, 'absolute project-100% fixed amount scales by ownership once');

  const perUnit = evaluateCostDisclosureForYear(cost({
    id: 'per-unit',
    model: {
      type: 'per_unit', amount: { kind: 'point', value: 500 }, currency: 'USD',
      denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
    },
  }), context());
  assertClose(perUnit?.valueUSD ?? null, 30_000_000, 'per-unit cost uses already attributable denominator without second ownership factor');

  const royalty = evaluateCostDisclosureForYear(cost({
    id: 'royalty',
    component: 'royalty',
    model: { type: 'percent_revenue', rate: { kind: 'point', value: 0.06 }, revenueScope: { type: 'total_metal_revenue' } },
  }), context());
  assertClose(royalty?.valueUSD ?? null, 7_758_000, '6% revenue royalty');

  const priceLinked = evaluateCostDisclosureForYear(cost({
    id: 'b2-style',
    model: {
      type: 'price_linked',
      referenceValue: { kind: 'point', value: 1_000 },
      output: {
        kind: 'per_unit', currency: 'USD',
        denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
      },
      sensitivities: [{ driverMetal: 'Au', referencePrice: 2_000, driverPriceUnit: 'USD_per_toz', slope: 0.12 }],
      sourcePriceDeckRef: 'source-deck',
    },
  }), context());
  assertClose(priceLinked?.valueUSD ?? null, 60_720_000, '100 USD/oz Au increase adds 12 USD/oz to a 1000 USD/oz cost over 60k oz');
  assert(/repriced from 2000/.test(priceLinked?.reasons.join(' ') ?? ''), 'price-linked repricing diagnostic');

  const reportedUnknownSpot = evaluateCostDisclosureForYear(cost({
    id: 'reported-unknown',
    model: {
      type: 'reported_total', amount: { kind: 'point', value: 12_000_000 }, currency: 'USD',
      sourcePriceDeckRef: 'r1', priceSensitivity: 'unknown',
    },
  }), context());
  assertEqual(reportedUnknownSpot?.valueUSD, null, 'unknown price-sensitive reported total cannot be called SPOT normalized');

  const reportedUnknownReported = evaluateCostDisclosureForYear(cost({
    id: 'reported-unknown',
    model: {
      type: 'reported_total', amount: { kind: 'point', value: 12_000_000 }, currency: 'USD',
      sourcePriceDeckRef: 'r1', priceSensitivity: 'unknown',
    },
  }), context({ priceMode: 'REPORTED', deck: reportedDeck }));
  assertClose(reportedUnknownReported?.valueUSD ?? null, 12_000_000, 'unknown price-sensitive reported total is available in matching REPORTED mode');
  assertEqual(reportedUnknownReported?.quality, 'reported_only', 'matching reported total remains clearly reported-only');

  const netByproduct = evaluateCostDisclosureForYear(cost({
    id: 'net-byproduct',
    model: {
      type: 'per_unit', amount: { kind: 'point', value: 900 }, currency: 'USD',
      denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
      netOfByproductCredits: true,
    },
  }), context());
  assertEqual(netByproduct?.valueUSD, null, 'net-of-byproduct per-unit cost blocked from canonical economics');
  assert(/by-product credits/.test(netByproduct?.reasons.join(' ') ?? ''), 'net-of-byproduct diagnostic');

  const multiYear = evaluateCostDisclosureForYear(cost({
    id: 'multi-year',
    period: { kind: 'year_range_average', startYear: 2030, endYear: 2033 },
  }), context());
  assertEqual(multiYear?.valueUSD, null, 'multi-year cost is not annualized silently');

  const workingCapital = evaluateCostDisclosureForYear(cost({
    id: 'wc',
    component: 'working_capital_delta',
    canonicalClassification: 'working_capital',
    model: { type: 'fixed_amount', amount: { kind: 'point', value: -5_000_000 }, currency: 'USD' },
  }), context());
  assertClose(workingCapital?.valueUSD ?? null, -5_000_000, 'negative working-capital delta is valid cash release');

  const accretion = evaluateCostDisclosureForYear(cost({
    id: 'accretion',
    component: 'reclamation_accretion',
    canonicalClassification: 'noncash',
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 1_000_000 }, currency: 'USD' },
  }), context());
  assertEqual(accretion?.quality, 'excluded', 'noncash reclamation accretion excluded');
  assertEqual(accretion?.valueUSD, 0, 'excluded noncash item contributes zero');

  const disclosures: CostDisclosure[] = [
    cost({ id: 'op', component: 'cash_operating_cost', canonicalClassification: 'operating', model: { type: 'fixed_amount', amount: { kind: 'point', value: 30 }, currency: 'USD' } }),
    cost({ id: 'roy', component: 'royalty', canonicalClassification: 'operating', model: { type: 'fixed_amount', amount: { kind: 'point', value: 5 }, currency: 'USD' } }),
    cost({ id: 'site', component: 'site_gna', canonicalClassification: 'operating', model: { type: 'fixed_amount', amount: { kind: 'point', value: 4 }, currency: 'USD' } }),
    cost({ id: 'sust', component: 'sustaining_capex', canonicalClassification: 'sustaining', model: { type: 'fixed_amount', amount: { kind: 'point', value: 10 }, currency: 'USD' } }),
    cost({ id: 'strip', component: 'deferred_stripping', canonicalClassification: 'sustaining', model: { type: 'fixed_amount', amount: { kind: 'point', value: 3 }, currency: 'USD' } }),
    cost({ id: 'tax', component: 'cash_income_tax', canonicalClassification: 'tax', model: { type: 'fixed_amount', amount: { kind: 'point', value: 8 }, currency: 'USD' } }),
    cost({ id: 'wc2', component: 'working_capital_delta', canonicalClassification: 'working_capital', model: { type: 'fixed_amount', amount: { kind: 'point', value: -2 }, currency: 'USD' } }),
    cost({ id: 'growth', component: 'growth_capex', canonicalClassification: 'growth', model: { type: 'fixed_amount', amount: { kind: 'point', value: 7 }, currency: 'USD' } }),
    cost({ id: 'explore', component: 'growth_exploration', canonicalClassification: 'growth', model: { type: 'fixed_amount', amount: { kind: 'point', value: 2 }, currency: 'USD' } }),
    cost({ id: 'noncash', component: 'reclamation_accretion', canonicalClassification: 'noncash', model: { type: 'fixed_amount', amount: { kind: 'point', value: 1 }, currency: 'USD' } }),
  ];
  const evaluations = disclosures.map((disclosure) => evaluateCostDisclosureForYear(disclosure, context())).filter((item) => item !== null);
  const buckets = aggregateCanonicalCostBuckets(disclosures, evaluations);
  assertEqual(buckets.values.cashOperatingCostsUSD, 30, 'operating cost bucket');
  assertEqual(buckets.values.royaltiesUSD, 5, 'royalty bucket');
  assertEqual(buckets.values.siteGnaUSD, 4, 'site G&A bucket');
  assertEqual(buckets.values.sustainingCapexUSD, 10, 'sustaining capex bucket');
  assertEqual(buckets.values.sustainingExplorationDevelopmentUSD, 3, 'deferred stripping sustaining bucket');
  assertEqual(buckets.values.cashTaxesUSD, 8, 'cash tax bucket');
  assertEqual(buckets.values.workingCapitalDeltaUSD, -2, 'working capital bucket');
  assertEqual(buckets.values.growthCapexUSD, 7, 'growth capex bucket');
  assertEqual(buckets.values.growthExplorationDevelopmentUSD, 2, 'growth exploration bucket');
  assertEqual(buckets.values.tcRcUSD, null, 'missing bucket stays null rather than silently becoming zero');
  assertEqual(buckets.qualityByBucket.tcRcUSD, 'missing', 'missing bucket quality explicit');

  const blockedDisclosure = cost({
    id: 'op-blocked',
    component: 'cash_operating_cost',
    canonicalClassification: 'operating',
    model: { type: 'reported_total', amount: { kind: 'point', value: 20 }, currency: 'USD', priceSensitivity: 'unknown' },
  });
  const mixedDisclosures = [disclosures[0], blockedDisclosure];
  const mixedEvaluations = mixedDisclosures.map((disclosure) => evaluateCostDisclosureForYear(disclosure, context())).filter((item) => item !== null);
  const blockedBuckets = aggregateCanonicalCostBuckets(mixedDisclosures, mixedEvaluations);
  assertEqual(blockedBuckets.values.cashOperatingCostsUSD, null, 'one unresolved disclosure blocks its canonical bucket instead of being ignored');
  assertEqual(blockedBuckets.qualityByBucket.cashOperatingCostsUSD, 'not_computable', 'blocked bucket quality');

  console.log('Mining Producer cost normalization tests passed');
})();
