import { assessProducerFiveYearCoverageWithForecast } from '../forecastCalculability.ts';
import { materializeProducerForecastForYear } from '../forecast.ts';
import { validateProducerJsonV1 } from '../schema.ts';
import type { ProducerJsonV1, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const provenance: Provenance = {
  sourceId: 'source-1',
  estimateClass: 'actual',
  confidence: 'high',
};

const rawWithOmittedProduction = {
  version: 'producer_json_v1',
  company: {
    id: 'generic-producer',
    name: 'Generic Producer',
    primarySecurity: {
      ticker: 'GENERIC.TO',
      quoteCurrency: 'CAD',
      securityType: 'common',
    },
  },
  valuation: {
    valuationDateUtc: '2026-08-24',
  },
  projects: [
    {
      id: 'operating-project-with-reported-evidence-only',
      name: 'Operating Project',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
      financialConsolidation: { method: 'full', provenance },
      reportedMetrics: [{
        id: 'reported-aueq-2030',
        scope: { type: 'project', projectId: 'operating-project-with-reported-evidence-only' },
        period: { kind: 'year', year: 2030 },
        metric: 'aueq',
        value: { kind: 'approximate', value: 100 },
        unit: 'koz',
        provenance,
      }],
    },
  ],
  reportedMetrics: [{
    id: 'company-aueq-2030',
    scope: { type: 'company' },
    period: { kind: 'year', year: 2030 },
    metric: 'aueq',
    value: { kind: 'approximate', value: 100 },
    unit: 'koz',
    provenance,
  }],
  sources: [{
    id: 'source-1',
    sourceType: 'company_presentation',
    publisher: 'Generic Producer',
    title: 'Generic evidence source',
  }],
} as unknown as ProducerJsonV1;

validateProducerJsonV1(rawWithOmittedProduction);

const materialized = materializeProducerForecastForYear(rawWithOmittedProduction, 2030);
assert(Array.isArray(materialized.producer.projects[0].production), 'Forecast materialization must normalize omitted production to an empty evidence array');
assert(materialized.producer.projects[0].production.length === 0, 'Omitted production must remain missing evidence, not become synthetic production');

const coverage = assessProducerFiveYearCoverageWithForecast(rawWithOmittedProduction, 2030, 'BASE');
const au = coverage[0].metrics.find((metric) => metric.metric === 'Au/AuEq');
assert(au?.state === 'reported_only', 'Company-level reported AuEq should remain display evidence when canonical project production is omitted');
assert(au?.missing.some((item) => item.includes('projects[operating-project-with-reported-evidence-only].production')), 'Canonical production must remain explicitly missing');
assert(!coverage[0].metrics.some((metric) => metric.missing.some((item) => item.includes('project.production is not iterable'))), 'Omitted production must never surface as an iterable runtime error');

console.log('Mining Producer omitted production tests passed');
