import { assessProducerFiveYearCoverage, assessProducerYearCalculability } from '../calculability.ts';
import { validateProducerJsonV1 } from '../schema.ts';
import type { ProducerJsonV1, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const provenance: Provenance = { sourceId: 'src', estimateClass: 'company_guidance' };

const producer: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: {
    id: 'TEST',
    name: 'Test Producer',
    primarySecurity: { ticker: 'TEST.TO', quoteCurrency: 'CAD' },
  },
  valuation: {
    valuationDateUtc: '2026-08-23',
    balanceSheet: {
      asOfDate: '2026-06-30',
      cashAndEquivalents: { value: 100, currency: 'USD', provenance },
      totalDebt: { value: 50, currency: 'USD', provenance },
    },
  },
  projects: [
    {
      id: 'mine',
      name: 'Mine',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      financialConsolidation: { method: 'full', provenance },
      ownership: [{ effectiveFrom: '2025-01-01', ownershipPct: 0.8, provenance }],
      production: [{
        id: 'prod-2026',
        metal: 'Au',
        measure: 'produced',
        period: { kind: 'year', year: 2026 },
        quantity: { kind: 'range', low: 100, high: 120 },
        unit: 'koz',
        basis: 'project_100pct',
        provenance,
      }],
      costs: [],
    },
    {
      id: 'future',
      name: 'Future Mine',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'sanctioned',
      productionWindow: { startYear: 2028, provenance },
      ownership: [{ effectiveFrom: '2025-01-01', ownershipPct: 1, provenance }],
      production: [{
        id: 'future-2028',
        metal: 'Au',
        measure: 'produced',
        period: { kind: 'year', year: 2028 },
        quantity: { kind: 'point', value: 50 },
        unit: 'koz',
        basis: 'project_100pct',
        provenance,
      }],
    },
  ],
  reportedMetrics: [{
    id: 'company-prod',
    scope: { type: 'company' },
    period: { kind: 'year', year: 2026 },
    metric: 'production',
    value: { kind: 'range', low: 100, high: 120 },
    unit: 'koz',
    provenance,
  }],
  sources: [{ id: 'src', sourceType: 'company_release', publisher: 'Issuer', title: 'Guidance' }],
};

validateProducerJsonV1(producer);

const year2026 = assessProducerYearCalculability(producer, 2026, 'BASE');
const au = year2026.metrics.find((item) => item.metric === 'Au/AuEq');
const ebitda = year2026.metrics.find((item) => item.metric === 'EBITDA');
const ev = year2026.metrics.find((item) => item.metric === 'EV');
assert(au?.state === 'range_only', '2026 range production should be recognized as interval-capable rather than absent');
assert(!au?.missing.some((item) => item.includes('future')), 'pre-production project outside explicit productionWindow must not block 2026');
assert(ebitda?.state === 'blocked', 'EBITDA should remain blocked without required cost bridge');
assert((ebitda?.missing.length ?? 0) > 0, 'EBITDA blockage must enumerate missing JSON inputs');
assert(ev?.state === 'calculable', 'EV input checklist should pass with current debt and cash evidence');

const fiveYears = assessProducerFiveYearCoverage(producer, 2026, 'BASE');
assert(fiveYears.length === 5, 'five-year coverage must return exactly five calendar years');
assert(fiveYears[4].year === 2030, 'five-year coverage should cover 2026-2030 inclusive');

console.log('Mining Producer calculability tests passed');
