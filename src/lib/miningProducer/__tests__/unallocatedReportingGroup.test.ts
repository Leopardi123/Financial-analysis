import { assessProducerYearCalculability } from '../calculability.ts';
import { assessProducerIntervalCompleteness } from '../intervalCompleteness.ts';
import { normalizeProducerCompanyYear } from '../normalize.ts';
import { validateProducerJsonV1 } from '../schema.ts';
import type { ProducerJsonV1, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const source: Provenance = { sourceId: 'src', estimateClass: 'company_guidance' };
const actual: Provenance = { sourceId: 'src', estimateClass: 'actual' };

const producer = {
  version: 'producer_json_v1',
  company: { id: 'b2', name: 'B2 pattern' },
  valuation: { valuationDateUtc: '2026-08-23' },
  projects: [
    {
      id: 'combined-group',
      name: 'Combined mine + regional guidance group',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      calculationRole: 'evidence_only_unallocated',
      ownership: [],
      production: [{
        id: 'combined-2026',
        metal: 'Au',
        measure: 'produced',
        period: { kind: 'year', year: 2026 },
        quantity: { kind: 'range', low: 390, high: 420 },
        unit: 'koz',
        basis: 'project_100pct',
        provenance: source,
      }],
    },
    {
      id: 'economic-mine',
      name: 'Economic mine',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      ownership: [{ effectiveFrom: '2026-01-01', ownershipPct: 1, provenance: actual }],
      production: [
        {
          id: 'mine-2026',
          metal: 'Au',
          measure: 'produced',
          period: { kind: 'year', year: 2026 },
          quantity: { kind: 'point', value: 100 },
          unit: 'koz',
          basis: 'project_100pct',
          provenance: source,
        },
        {
          id: 'mine-2030',
          metal: 'Au',
          measure: 'produced',
          period: { kind: 'year', year: 2030 },
          quantity: { kind: 'point', value: 120 },
          unit: 'koz',
          basis: 'project_100pct',
          provenance: source,
        },
      ],
    },
  ],
  reportedMetrics: [{
    id: 'company-production-2026',
    scope: { type: 'company' },
    period: { kind: 'year', year: 2026 },
    metric: 'production',
    value: { kind: 'range', low: 490, high: 520 },
    unit: 'koz',
    provenance: source,
  }],
  sources: [{ id: 'src', sourceType: 'company_release', publisher: 'Issuer', title: 'Guidance' }],
} as unknown as ProducerJsonV1;

async function run(): Promise<void> {
  validateProducerJsonV1(producer);

  const calc2026 = assessProducerYearCalculability(producer, 2026, 'BASE');
  const au2026 = calc2026.metrics.find((item) => item.metric === 'Au/AuEq');
  assert(au2026?.state === 'reported_only', '2026 unallocated group blocks false canonical Au but preserves company reported production route');
  assert(au2026?.missing.some((item) => item.includes('evidence_only_unallocated')), '2026 calculability names the unallocated grouping as the blocker');

  const complete2026 = assessProducerIntervalCompleteness({ producer, year: 2026, caseMode: 'BASE', basis: 'attributable' });
  assert(!complete2026.productionComplete && !complete2026.revenueComplete, '2026 interval completeness blocks partial company interval');

  const normalized2026 = await normalizeProducerCompanyYear({
    producer,
    context: { valuationDateUtc: '2026-08-23', selectedYear: 2026, priceMode: 'SPOT', caseMode: 'BASE' },
    allowNonProductionReadySpotKeys: true,
  }, {
    resolvePriceSeriesFn: (async () => ({ values: [2_000], warnings: [] })) as typeof import('../../prices/resolve.ts').resolvePriceSeries,
  });
  assert(normalized2026.producedByMetal.Au?.value === 100_000, 'unallocated group ounces are never added to canonical production');
  assert(normalized2026.physicalAuEqOz === null, 'partial canonical company AuEq is suppressed for exact-year unallocated group evidence');
  assert(normalized2026.metrics.revenueUSD === null, 'partial canonical company revenue is suppressed for exact-year unallocated group evidence');

  const calc2030 = assessProducerYearCalculability(producer, 2030, 'BASE');
  const au2030 = calc2030.metrics.find((item) => item.metric === 'Au/AuEq');
  assert(au2030?.state === 'calculable', 'old unallocated 2026 grouping does not block a later year it does not cover');

  const complete2030 = assessProducerIntervalCompleteness({ producer, year: 2030, caseMode: 'BASE', basis: 'attributable' });
  assert(complete2030.productionComplete && complete2030.revenueComplete, '2030 economic project can be complete once the unallocated group has no exact-year claim');

  let rejectedForecast = false;
  const invalid = structuredClone(producer) as unknown as Record<string, unknown>;
  const projects = invalid.projects as Array<Record<string, unknown>>;
  projects[0].forecastAssumptions = {
    production: [{
      id: 'bad-forward',
      method: 'carry_forward',
      sourceDisclosureId: 'combined-2026',
      appliesTo: { startYear: 2027, endYear: 2030 },
      annualChangePct: 0,
      provenance: { sourceId: 'src', estimateClass: 'scenario' },
    }],
  };
  try {
    validateProducerJsonV1(invalid as unknown as ProducerJsonV1);
  } catch (error) {
    rejectedForecast = String(error).includes('must not contain production forecastAssumptions');
  }
  assert(rejectedForecast, 'schema prevents forecasting an unallocated evidence group instead of decomposing it');

  console.log('Mining Producer unallocated reporting-group tests passed');
}

void run();
