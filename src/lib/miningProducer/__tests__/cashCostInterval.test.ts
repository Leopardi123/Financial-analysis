import { computeCanonicalCashCostInterval } from '../cashCostInterval.ts';
import type { ResolvedProducerPriceDeck } from '../priceDeck.ts';
import type { ProducerJsonV1, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number | undefined, expected: number, message: string): void {
  if (actual === undefined || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${message}: expected ${expected}, received ${String(actual)}`);
  }
}

const provenance: Provenance = { sourceId: 'src', estimateClass: 'scenario' };

const producer: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: { id: 'cash-cost-test', name: 'Cash Cost Test' },
  valuation: { valuationDateUtc: '2026-08-23' },
  projects: [{
    id: 'mine',
    name: 'Mine',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2030-01-01', effectiveTo: '2030-12-31', ownershipPct: 1, provenance }],
    production: [{
      id: 'mine-au-2030',
      metal: 'Au',
      measure: 'produced',
      period: { kind: 'year', year: 2030 },
      quantity: { kind: 'point', value: 100 },
      unit: 'koz',
      basis: 'project_100pct',
      provenance,
    }],
    costs: [{
      id: 'mine-cash-cost-2030',
      component: 'cash_operating_cost',
      period: { kind: 'year', year: 2030 },
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
    }],
  }],
  sources: [{ id: 'src', sourceType: 'other', publisher: 'Test', title: 'Test' }],
};

const deck: ResolvedProducerPriceDeck = {
  id: 'spot',
  mode: 'SPOT',
  valuationDateUtc: '2026-08-23',
  pricesByMetal: {
    Au: { metal: 'Au', valueUSD: 4_000, unit: 'USD_per_toz', readiness: 'production_ready' },
  },
  warnings: [],
};

const result = computeCanonicalCashCostInterval({
  producer,
  year: 2030,
  caseMode: 'BASE',
  deck,
  financialAuEqOz: { low: 100_000, high: 100_000 },
});

assert(result.cashOperatingCostsUSD !== null, 'cash operating spend interval should be computable');
assert(result.cashOperatingCostPerAuEqUSD !== null, 'cash cost/AuEq interval should be computable');
assertClose(result.cashOperatingCostsUSD?.low, 50_000_000, 'cash operating spend low');
assertClose(result.cashOperatingCostsUSD?.high, 60_000_000, 'cash operating spend high');
assertClose(result.cashOperatingCostPerAuEqUSD?.low, 500, 'cash cost/AuEq low');
assertClose(result.cashOperatingCostPerAuEqUSD?.high, 600, 'cash cost/AuEq high');
assert(result.diagnostics.length === 0, 'no diagnostics expected for complete cash-cost interval');

console.log('Producer canonical cash-cost interval tests passed');
