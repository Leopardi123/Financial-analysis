import { normalizeProducerCompanyYear } from '../normalize.ts';
import type { CostDisclosure, ProducerJsonV1, ProducerProject, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

const provenance: Provenance = { sourceId: 's1', estimateClass: 'company_guidance' };

function fixedCost(id: string, component: CostDisclosure['component'], classification: CostDisclosure['canonicalClassification'], value: number): CostDisclosure {
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

function project(id: string, includeCashOperatingCost: boolean): ProducerProject {
  const costs: CostDisclosure[] = [
    fixedCost(`${id}-royalty`, 'royalty', 'operating', 0),
    fixedCost(`${id}-prod-tax`, 'production_tax', 'operating', 0),
    fixedCost(`${id}-tcrc`, 'tc_rc', 'operating', 0),
    fixedCost(`${id}-site-gna`, 'site_gna', 'operating', 0),
    fixedCost(`${id}-other-op`, 'other_recurring_operating', 'operating', 0),
    fixedCost(`${id}-sust`, 'sustaining_capex', 'sustaining', 0),
    fixedCost(`${id}-sust-explore`, 'sustaining_exploration', 'sustaining', 0),
    fixedCost(`${id}-tax`, 'cash_income_tax', 'tax', 0),
    fixedCost(`${id}-wc`, 'working_capital_delta', 'working_capital', 0),
    fixedCost(`${id}-other-cash`, 'other_cash', 'sustaining', 0),
    fixedCost(`${id}-growth`, 'growth_capex', 'growth', 0),
    fixedCost(`${id}-growth-explore`, 'growth_exploration', 'growth', 0),
  ];
  if (includeCashOperatingCost) costs.unshift(fixedCost(`${id}-op`, 'cash_operating_cost', 'operating', 10_000));

  return {
    id,
    name: id,
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [
      { id: `${id}-prod`, metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
      { id: `${id}-pay`, metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
    ],
    costs,
  };
}

const producer: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: { id: 'coverage', name: 'Coverage Test' },
  valuation: { valuationDateUtc: '2026-08-22' },
  projects: [project('a', true), project('b', false)],
  corporateCosts: [fixedCost('corp-gna', 'corporate_gna', 'operating', 1_000)],
  sources: [{ id: 's1', sourceType: 'company_release', publisher: 'Issuer', title: 'Synthetic coverage fixture' }],
};

const fakeResolver = async () => ({ values: [2_000], warnings: [] as string[] });

async function run(): Promise<void> {
  const result = await normalizeProducerCompanyYear(
    {
      producer,
      context: { valuationDateUtc: '2026-08-22', selectedYear: 2030, priceMode: 'SPOT', caseMode: 'BASE' },
    },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );

  assertEqual(result.metrics.revenueUSD, 400_000, 'valid production still yields company revenue');
  assertEqual(result.metrics.ebitdaUSD, null, 'project B missing OPEX must block company EBITDA even though project A has OPEX');
  assertEqual(result.quality.ebitda, 'not_computable', 'project-level cost gap blocks EBITDA quality');
  assert(
    result.diagnostics.some((item) => item.includes('PROJECT_COST_COVERAGE_MISSING: b/cashOperatingCostsUSD')),
    'diagnostic identifies exact project and missing bucket',
  );

  console.log('Mining Producer project cost coverage tests passed');
}

void run();
