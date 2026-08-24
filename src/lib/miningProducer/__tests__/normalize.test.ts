import { normalizeProducerCompanyYear } from '../normalize.ts';
import type { CostDisclosure, ProducerJsonV1, ProducerProject, Provenance } from '../types.ts';

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

function fixedCost(
  id: string,
  component: CostDisclosure['component'],
  classification: CostDisclosure['canonicalClassification'],
  value: number,
): CostDisclosure {
  return {
    id,
    component,
    period: { kind: 'year', year: 2030 },
    economicBasis: 'attributable',
    canonicalClassification: classification,
    model: { type: 'fixed_amount', amount: { kind: 'point', value }, currency: 'USD' },
    provenance,
  };
}

function fullProjectCosts(): CostDisclosure[] {
  return [
    {
      id: 'cash-cost',
      component: 'cash_operating_cost',
      period: { kind: 'year', year: 2030 },
      economicBasis: 'project_100pct',
      canonicalClassification: 'operating',
      model: {
        type: 'per_unit', amount: { kind: 'point', value: 500 }, currency: 'USD',
        denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
      },
      provenance,
    },
    {
      id: 'royalty',
      component: 'royalty',
      period: { kind: 'year', year: 2030 },
      economicBasis: 'attributable',
      canonicalClassification: 'operating',
      model: { type: 'percent_revenue', rate: { kind: 'point', value: 0.05 }, revenueScope: { type: 'total_metal_revenue' } },
      provenance,
    },
    fixedCost('prod-tax-zero', 'production_tax', 'operating', 0),
    fixedCost('tcrc-zero', 'tc_rc', 'operating', 0),
    fixedCost('site-gna', 'site_gna', 'operating', 10_000),
    fixedCost('other-op-zero', 'other_recurring_operating', 'operating', 0),
    fixedCost('sust-capex', 'sustaining_capex', 'sustaining', 10_000),
    fixedCost('sust-explore-zero', 'sustaining_exploration', 'sustaining', 0),
    fixedCost('cash-tax', 'cash_income_tax', 'tax', 20_000),
    fixedCost('wc', 'working_capital_delta', 'working_capital', 5_000),
    fixedCost('other-cash-zero', 'reclamation_cash', 'sustaining', 0),
    fixedCost('growth-capex', 'growth_capex', 'growth', 15_000),
    fixedCost('growth-explore-zero', 'growth_exploration', 'growth', 0),
  ];
}

function mine(costs: CostDisclosure[] = fullProjectCosts()): ProducerProject {
  return {
    id: 'mine',
    name: 'Mine',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 0.5, provenance }],
    production: [
      { id: 'au-prod', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 200 }, unit: 'toz', basis: 'project_100pct', provenance },
      { id: 'au-pay', metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 200 }, unit: 'toz', basis: 'project_100pct', provenance },
      { id: 'ag-prod', metal: 'Ag', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 2_000 }, unit: 'toz', basis: 'project_100pct', provenance },
      { id: 'ag-pay', metal: 'Ag', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 2_000 }, unit: 'toz', basis: 'project_100pct', provenance },
    ],
    costs,
  };
}

function producer(projects: ProducerProject[] = [mine()], corporateCosts: CostDisclosure[] = [fixedCost('corp-gna', 'corporate_gna', 'operating', 5_000)]): ProducerJsonV1 {
  return {
    version: 'producer_json_v1',
    company: { id: 'producer', name: 'Producer' },
    valuation: { valuationDateUtc: '2026-08-22' },
    projects,
    corporateCosts,
    sources: [{ id: 's1', sourceType: 'company_release', publisher: 'Issuer', title: '2030 guidance' }],
  };
}

const context = {
  valuationDateUtc: '2026-08-22',
  selectedYear: 2030,
  priceMode: 'SPOT' as const,
  caseMode: 'BASE' as const,
};

const fakeResolver = async (args: { price_key: string }) => ({
  values: [args.price_key === 'XAU_USD_TOZ' ? 2_000 : args.price_key === 'XAG_USD_TOZ' ? 20 : null],
  warnings: [] as string[],
});

async function run(): Promise<void> {
  const normalized = await normalizeProducerCompanyYear(
    { producer: producer(), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );

  assertClose(normalized.producedByMetal.Au.value, 100, 'company attributable Au production');
  assertClose(normalized.producedByMetal.Ag.value, 1_000, 'company attributable Ag production');
  assertClose(normalized.physicalAuEqOz, 110, 'company physical AuEq on selected deck');
  assertClose(normalized.revenueByMetalUSD.Au, 200_000, 'Au revenue');
  assertClose(normalized.revenueByMetalUSD.Ag, 20_000, 'Ag revenue');
  assertClose(normalized.metrics.revenueUSD, 220_000, 'canonical company revenue');
  assertClose(normalized.costBucketsUSD.cashOperatingCostsUSD, 50_000, 'per-unit cash cost uses attributable denominator');
  assertClose(normalized.costBucketsUSD.royaltiesUSD, 11_000, 'project revenue royalty');
  assertClose(normalized.metrics.ebitdaUSD, 144_000, 'end-to-end canonical EBITDA');
  assertClose(normalized.metrics.fcffBeforeGrowthUSD, 109_000, 'end-to-end FCFF before growth');
  assertClose(normalized.metrics.fcffAfterGrowthUSD, 94_000, 'end-to-end FCFF after growth');
  assertEqual(normalized.quality.revenue, 'exact', 'revenue quality exact');
  assertEqual(normalized.quality.ebitda, 'exact', 'EBITDA quality exact');
  assertEqual(normalized.quality.fcffBeforeGrowth, 'exact', 'FCFF before growth quality exact');
  assertEqual(normalized.quality.fcffAfterGrowth, 'exact', 'FCFF after growth quality exact');

  const withoutTcrc = fullProjectCosts().filter((item) => item.component !== 'tc_rc');
  const missingOperating = await normalizeProducerCompanyYear(
    { producer: producer([mine(withoutTcrc)]), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertClose(missingOperating.metrics.revenueUSD, 220_000, 'missing operating component does not block revenue');
  assertEqual(missingOperating.metrics.ebitdaUSD, null, 'missing TC/RC is not silently assumed zero');
  assertEqual(missingOperating.quality.ebitda, 'not_computable', 'missing TC/RC blocks EBITDA quality');
  assert(missingOperating.diagnostics.some((item) => item.includes('tcRcUSD') && item.includes('explicit zero')), 'missing TC/RC diagnostic');

  const withoutGrowth = fullProjectCosts().filter((item) => item.canonicalClassification !== 'growth');
  const missingGrowth = await normalizeProducerCompanyYear(
    { producer: producer([mine(withoutGrowth)]), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertClose(missingGrowth.metrics.ebitdaUSD, 144_000, 'missing growth disclosure does not block EBITDA');
  assertClose(missingGrowth.metrics.fcffBeforeGrowthUSD, 109_000, 'missing growth disclosure does not block FCFF before growth');
  assertEqual(missingGrowth.metrics.fcffAfterGrowthUSD, null, 'missing growth disclosure blocks only FCFF after growth');

  const secondMissingProject: ProducerProject = {
    id: 'missing-project',
    name: 'Missing Project',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [{ id: '2029-only', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2029 }, quantity: { kind: 'point', value: 10 }, unit: 'toz', basis: 'attributable', provenance }],
    costs: [],
  };
  const incompleteProduction = await normalizeProducerCompanyYear(
    { producer: producer([mine(), secondMissingProject]), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(incompleteProduction.metrics.revenueUSD, null, 'missing selected-year production for an included project blocks partial company revenue');
  assertEqual(incompleteProduction.quality.revenue, 'not_computable', 'partial company production is not presented as exact revenue');
  assert(incompleteProduction.diagnostics.some((item) => item.includes('zero production is not assumed')), 'missing project production diagnostic');

  const development = mine();
  development.id = 'dev';
  development.statusAsOfValuationDate = 'development';
  const baseCase = await normalizeProducerCompanyYear(
    { producer: producer([development]), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(baseCase.includedProjectIds.length, 0, 'development project excluded from BASE end-to-end');
  assertEqual(baseCase.metrics.revenueUSD, null, 'BASE with no included production is not zero revenue');

  const growthCase = await normalizeProducerCompanyYear(
    { producer: producer([development]), context: { ...context, caseMode: 'GROWTH' } },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(growthCase.includedProjectIds[0], 'dev', 'development project included in GROWTH end-to-end');
  assertClose(growthCase.metrics.revenueUSD, 220_000, 'GROWTH case uses explicit development-project production scenario');

  console.log('Mining Producer company-year normalization tests passed');
}

void run();
