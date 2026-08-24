import { computeProducerIntervalEconomics } from '../intervalEconomics.ts';
import type { ResolvedProducerPriceDeck } from '../priceDeck.ts';
import type { CostDisclosure, ProducerJsonV1, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertRange(actual: { low: number; high: number } | null, low: number, high: number, message: string): void {
  if (!actual || Math.abs(actual.low - low) > 1e-9 || Math.abs(actual.high - high) > 1e-9) {
    throw new Error(`${message}. Expected ${low}-${high}, received ${actual ? `${actual.low}-${actual.high}` : 'null'}`);
  }
}

const provenance: Provenance = { sourceId: 'src', estimateClass: 'company_guidance' };

function zeroCost(
  id: string,
  component: CostDisclosure['component'],
  classification: CostDisclosure['canonicalClassification'],
): CostDisclosure {
  return {
    id,
    component,
    period: { kind: 'year', year: 2026 },
    economicBasis: 'project_100pct',
    canonicalClassification: classification,
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' },
    provenance,
  };
}

const producer: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: { id: 'RANGE', name: 'Range Producer' },
  valuation: { valuationDateUtc: '2026-08-23' },
  projects: [{
    id: 'mine',
    name: 'Mine',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    financialConsolidation: { method: 'full', provenance },
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 0.8, provenance }],
    production: [
      {
        id: 'prod', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2026 },
        quantity: { kind: 'range', low: 100, high: 120 }, unit: 'toz', basis: 'project_100pct', provenance,
      },
      {
        id: 'pay', metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2026 },
        quantity: { kind: 'range', low: 100, high: 120 }, unit: 'toz', basis: 'project_100pct', provenance,
      },
    ],
    costs: [
      {
        id: 'cash',
        component: 'cash_operating_cost',
        period: { kind: 'year', year: 2026 },
        economicBasis: 'project_100pct',
        canonicalClassification: 'operating',
        model: {
          type: 'per_unit',
          amount: { kind: 'range', low: 500, high: 600 },
          currency: 'USD',
          denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
          netOfByproductCredits: true,
        },
        provenance,
      },
      {
        id: 'composite',
        component: 'other_recurring_operating',
        period: { kind: 'year', year: 2026 },
        economicBasis: 'project_100pct',
        canonicalClassification: 'operating',
        model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' },
        definition: { includesComponents: ['royalty', 'production_tax'] },
        provenance,
      },
      zeroCost('tcrc', 'tc_rc', 'operating'),
      zeroCost('site', 'site_gna', 'operating'),
      zeroCost('sust', 'sustaining_capex', 'sustaining'),
      zeroCost('sust-explore', 'sustaining_exploration', 'sustaining'),
      zeroCost('tax', 'cash_income_tax', 'tax'),
      zeroCost('wc', 'working_capital_delta', 'working_capital'),
      zeroCost('other-cash', 'other_cash', 'sustaining'),
      zeroCost('growth', 'growth_capex', 'growth'),
      zeroCost('growth-explore', 'growth_exploration', 'growth'),
    ],
  }],
  corporateCosts: [{
    id: 'corp-gna',
    component: 'corporate_gna',
    period: { kind: 'year', year: 2026 },
    economicBasis: 'company',
    canonicalClassification: 'operating',
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' },
    provenance,
  }],
  sources: [{ id: 'src', sourceType: 'company_release', publisher: 'Issuer', title: 'Guidance' }],
};

const deck: ResolvedProducerPriceDeck = {
  id: 'spot',
  mode: 'SPOT',
  valuationDateUtc: '2026-08-23',
  pricesByMetal: {
    Au: { metal: 'Au', valueUSD: 2_000, unit: 'USD_per_toz', readiness: 'production_ready' },
  },
  warnings: [],
};

const attributable = computeProducerIntervalEconomics({
  producer,
  year: 2026,
  caseMode: 'BASE',
  deck,
  basis: 'attributable',
});
assertRange(attributable.auOz.range, 80, 96, 'Attributable Au interval');
assertRange(attributable.revenueUSD.range, 160_000, 192_000, 'Attributable revenue interval');

const financial = computeProducerIntervalEconomics({
  producer,
  year: 2026,
  caseMode: 'BASE',
  deck,
  basis: 'financial',
});
assertRange(financial.auOz.range, 100, 120, 'Financial-basis physical interval before UI chooses attributable Au');
assertRange(financial.revenueUSD.range, 200_000, 240_000, 'Financial consolidated revenue interval');
assertRange(financial.ebitdaUSD.range, 128_000, 190_000, 'Range-native EBITDA interval');
assertRange(financial.fcffBeforeGrowthUSD.range, 128_000, 190_000, 'Range-native FCFF before growth interval');
assertRange(financial.fcffAfterGrowthUSD.range, 128_000, 190_000, 'Range-native FCFF after growth interval');
assert(
  financial.diagnostics.some((item) => item.includes('net-of-byproduct per-unit cost retained')),
  'Net-of-byproduct cost is allowed when no separate byproduct revenue is modeled',
);
assert(!financial.diagnostics.some((item) => item.includes('missing royalty coverage')), 'Composite includesComponents satisfies royalty coverage');
assert(!financial.diagnostics.some((item) => item.includes('missing production_tax coverage')), 'Composite includesComponents satisfies production-tax coverage');

console.log('Mining Producer interval-economics tests passed');
