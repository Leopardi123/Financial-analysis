import { assessProducerFiveYearCoverageWithForecast } from '../forecastCalculability.ts';
import type { ProducerCompanyYearNormalization } from '../normalize.ts';
import { applicableReportedMetric, type ProducerPeerRow } from '../peerTable.ts';
import { applyAuthoritativeIntervalCompletenessToPeerRow } from '../peerRowCompleteness.ts';
import { validateProducerJsonV1 } from '../schema.ts';
import type { ProducerIntervalEconomics } from '../intervalEconomics.ts';
import type { ProducerJsonV1, Provenance, ReportedMetric } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

const provenance: Provenance = {
  sourceId: 'steppe-source',
  estimateClass: 'company_target',
  confidence: 'medium',
};
const actualProvenance: Provenance = {
  sourceId: 'steppe-source',
  estimateClass: 'actual',
  confidence: 'high',
};

function companyMetric(
  id: string,
  metric: ReportedMetric['metric'],
  period: ReportedMetric['period'],
  value: ReportedMetric['value'],
  unit: string,
): ReportedMetric {
  return {
    id,
    scope: { type: 'company' },
    period,
    metric,
    value,
    unit,
    provenance,
  };
}

const steppeShape: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: {
    id: 'stgo.to',
    name: 'Steppe Gold Ltd.',
    reportingCurrency: 'USD',
    primarySecurity: {
      ticker: 'STGO.TO',
      exchange: 'TSX',
      quoteCurrency: 'CAD',
      securityType: 'common',
    },
  },
  valuation: {
    valuationDateUtc: '2026-08-23',
    balanceSheet: {
      asOfDate: '2026-06-30',
      usability: 'current_as_of_date',
      cashAndEquivalents: { value: 19_889_000, currency: 'USD', asOfDate: '2026-06-30', provenance: actualProvenance },
      totalDebt: { value: 102_339_000, currency: 'USD', asOfDate: '2026-06-30', provenance: actualProvenance },
      leaseLiabilities: { value: 198_000, currency: 'USD', provenance: actualProvenance },
      nonOperatingInvestments: { value: 107_119_000, currency: 'USD', provenance: actualProvenance },
      otherEnterpriseAdjustments: [{
        id: 'stream-liability',
        amount: 72_169_000,
        currency: 'USD',
        treatment: 'add',
        description: 'Triple Flag stream liability',
        provenance: actualProvenance,
      }],
    },
  },
  projects: [
    {
      id: 'boroo_project',
      name: 'Boroo and Ulaanbulag (Boroo Project)',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      ownership: [{ effectiveFrom: '2024-08-01', ownershipPct: 1, provenance: actualProvenance }],
      financialConsolidation: { method: 'full', provenance: actualProvenance },
      production: [
        { id: 'boroo-2027', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2027 }, quantity: { kind: 'approximate', value: 54 }, unit: 'koz', basis: 'project_100pct', provenance },
        { id: 'boroo-2028', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2028 }, quantity: { kind: 'approximate', value: 47 }, unit: 'koz', basis: 'project_100pct', provenance },
        { id: 'boroo-2029', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2029 }, quantity: { kind: 'approximate', value: 51 }, unit: 'koz', basis: 'project_100pct', provenance },
        { id: 'boroo-2030', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'approximate', value: 49 }, unit: 'koz', basis: 'project_100pct', provenance },
        { id: 'boroo-2031', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2031 }, quantity: { kind: 'approximate', value: 31 }, unit: 'koz', basis: 'project_100pct', provenance },
      ],
      reportedMetrics: [{
        id: 'boroo-total',
        scope: { type: 'project', projectId: 'boroo_project' },
        period: { kind: 'year_range_total', startYear: 2025, endYear: 2031 },
        metric: 'production',
        value: { kind: 'approximate', value: 362.568 },
        unit: 'koz',
        provenance,
      }],
    },
    {
      id: 'ato',
      name: 'Altan Tsagaan Ovoo (ATO)',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      ownership: [{ effectiveFrom: '2017-09-15', ownershipPct: 1, provenance: actualProvenance }],
      financialConsolidation: { method: 'full', provenance: actualProvenance },
      production: [],
      costs: [],
      reportedMetrics: [
        {
          id: 'ato-aueq-2030',
          scope: { type: 'project', projectId: 'ato' },
          period: { kind: 'year', year: 2030 },
          metric: 'aueq',
          value: { kind: 'approximate', value: 103 },
          unit: 'koz',
          provenance,
        },
        {
          id: 'ato-aisc-average',
          scope: { type: 'project', projectId: 'ato' },
          period: { kind: 'year_range_average', startYear: 2026, endYear: 2038 },
          metric: 'aisc',
          value: { kind: 'approximate', value: 1465 },
          unit: 'USD_per_toz',
          provenance,
        },
      ],
    },
  ],
  corporateCosts: [],
  reportedMetrics: [
    companyMetric('company-2026', 'production', { kind: 'year', year: 2026 }, { kind: 'approximate', value: 68 }, 'koz'),
    companyMetric('company-aueq-2027', 'aueq', { kind: 'year', year: 2027 }, { kind: 'approximate', value: 73 }, 'koz'),
    companyMetric('company-aueq-2028', 'aueq', { kind: 'year', year: 2028 }, { kind: 'approximate', value: 167 }, 'koz'),
    companyMetric('company-aueq-2029', 'aueq', { kind: 'year', year: 2029 }, { kind: 'approximate', value: 146 }, 'koz'),
    companyMetric('company-aueq-2030', 'aueq', { kind: 'year', year: 2030 }, { kind: 'approximate', value: 152 }, 'koz'),
    companyMetric('company-h1-2026', 'ebitda', { kind: 'not_periodized', label: 'Six months ended June 30, 2026' }, { kind: 'point', value: 85_171_000 }, 'USD'),
    companyMetric('company-aisc-average', 'aisc', { kind: 'year_range_average', startYear: 2026, endYear: 2038 }, { kind: 'approximate', value: 1528 }, 'USD_per_toz'),
  ],
  sources: [{ id: 'steppe-source', sourceType: 'company_presentation', publisher: 'Steppe Gold Ltd.', title: 'Steppe compatibility fixture' }],
};

validateProducerJsonV1(steppeShape);
const coverage = assessProducerFiveYearCoverageWithForecast(steppeShape, 2026, 'BASE');
const coverage2030 = coverage.find((item) => item.year === 2030);
assert(coverage2030, 'Steppe-shaped five-year calculability must return 2030 without throwing');
const au2030 = coverage2030!.metrics.find((item) => item.metric === 'Au/AuEq');
const revenue2030 = coverage2030!.metrics.find((item) => item.metric === 'Revenue');
const ebitda2030 = coverage2030!.metrics.find((item) => item.metric === 'EBITDA');
const ev2030 = coverage2030!.metrics.find((item) => item.metric === 'EV');
assertEqual(au2030?.state, 'reported_only', 'Company-level 152 koz AuEq should be reported-only when ATO lacks canonical physical production');
assert(au2030?.missing.some((item) => item.includes('projects[ato].production')), 'Steppe 2030 must retain the missing ATO canonical-production diagnostic');
assertEqual(revenue2030?.state, 'blocked', 'AuEq evidence must not fabricate shared-deck canonical Revenue');
assertEqual(ebitda2030?.state, 'blocked', 'Reported multi-year AISC must not fabricate canonical EBITDA');
assertEqual(ev2030?.state, 'calculable', 'Steppe EV checklist remains calculable from current debt/cash evidence');

const reportedMetricNormalizationStub = {
  selectedYear: 2030,
  includedProjectIds: ['boroo_project', 'ato'],
} as ProducerCompanyYearNormalization;
const reportedAisc2030 = applicableReportedMetric(steppeShape, reportedMetricNormalizationStub, 'aisc');
assertEqual(reportedAisc2030.value?.id, 'company-aisc-average', 'Company-level year-range-average AISC should remain visible as reported evidence in 2030');
assert(reportedAisc2030.diagnostic?.includes('not materialized into a precise annual canonical input'), 'Year-range-average AISC must explicitly retain non-canonical semantics');
const reportedAuEq2030 = applicableReportedMetric(steppeShape, reportedMetricNormalizationStub, 'aueq');
assertEqual(reportedAuEq2030.value?.id, 'company-aueq-2030', 'Exact-year reported AuEq should take precedence over broader evidence');

function nullMetric(): ProducerIntervalEconomics['auOz'] {
  return { range: null, quality: 'not_computable', diagnostics: ['missing project coverage'] };
}

const partialRow = {
  companyId: 'stgo.to',
  companyName: 'Steppe Gold Ltd.',
  selectedYear: 2030,
  priceDeckId: 'spot',
  auOz: 49_000,
  auEqOz: 49_000,
  reportedProduction: null,
  reportedAuEq: companyMetric('row-aueq', 'aueq', { kind: 'year', year: 2030 }, { kind: 'approximate', value: 152 }, 'koz'),
  reportedRevenue: null,
  reportedEbitda: null,
  reportedFcf: null,
  productionEvidence: [],
  productionEstimateClasses: ['company_target'],
  productionQuality: 'approximation',
  revenueUSD: 230_000_000,
  canonicalCashOperatingCostPerAuEqUSD: 1000,
  reportedCashCost: null,
  reportedAisc: null,
  ebitdaUSD: 100_000_000,
  fcffBeforeGrowthUSD: 90_000_000,
  fcffAfterGrowthUSD: 80_000_000,
  growthCapexUSD: 10_000_000,
  marketCapUSD: 350_000_000,
  enterpriseValueUSD: 430_000_000,
  marketCapPerAuOzUSD: 7142,
  marketCapPerAuEqOzUSD: 7142,
  evToEbitda: 4.3,
  evToFcffBeforeGrowth: 4.78,
  evToFcffAfterGrowth: 5.38,
  nonStandardMultiples: {
    marketCapToEbitda: 3.5,
    marketCapToFcffBeforeGrowth: 3.89,
    marketCapToFcffAfterGrowth: 4.38,
    warning: 'test',
  },
  quality: {} as ProducerPeerRow['quality'],
  diagnostics: [],
} as ProducerPeerRow;

const incompleteIntervals: { attributable: ProducerIntervalEconomics; financial: ProducerIntervalEconomics } = {
  attributable: {
    year: 2030,
    basis: 'attributable',
    auOz: nullMetric(),
    auEqOz: nullMetric(),
    revenueUSD: nullMetric(),
    ebitdaUSD: nullMetric(),
    fcffBeforeGrowthUSD: nullMetric(),
    fcffAfterGrowthUSD: nullMetric(),
    growthCapexUSD: nullMetric(),
    diagnostics: [],
  },
  financial: {
    year: 2030,
    basis: 'financial',
    auOz: nullMetric(),
    auEqOz: nullMetric(),
    revenueUSD: nullMetric(),
    ebitdaUSD: nullMetric(),
    fcffBeforeGrowthUSD: nullMetric(),
    fcffAfterGrowthUSD: nullMetric(),
    growthCapexUSD: nullMetric(),
    diagnostics: [],
  },
};

applyAuthoritativeIntervalCompletenessToPeerRow(partialRow, incompleteIntervals);
assertEqual(partialRow.auOz, null, 'Partial Boroo-only 49 koz Au must be suppressed at company level');
assertEqual(partialRow.auEqOz, null, 'Partial canonical AuEq must be suppressed at company level');
assertEqual(partialRow.revenueUSD, null, 'Partial scalar Revenue must be suppressed');
assertEqual(partialRow.ebitdaUSD, null, 'Partial scalar EBITDA must be suppressed');
assertEqual(partialRow.fcffBeforeGrowthUSD, null, 'Partial scalar FCFF before growth must be suppressed');
assertEqual(partialRow.fcffAfterGrowthUSD, null, 'Partial scalar FCFF after growth must be suppressed');
assertEqual(partialRow.growthCapexUSD, null, 'Partial scalar growth CAPEX must be suppressed');
assertEqual(partialRow.marketCapPerAuOzUSD, null, 'MCap/Au must not use partial physical production');
assertEqual(partialRow.evToEbitda, null, 'EV/EBITDA must not use incomplete company EBITDA');
assertEqual(partialRow.productionQuality, 'reported_only', 'Reported AuEq remains visible when canonical company production is incomplete');
assert(partialRow.reportedAuEq !== null, 'Reported 152 koz AuEq evidence must remain available for display');
assert(partialRow.diagnostics.some((item) => item.startsWith('INTERVAL_COMPLETENESS_AUTHORITY')), 'Suppressed partial scalars must be diagnosed');

const malformedButSchemaAccepted = {
  ...steppeShape,
  reportedMetrics: [{
    id: 'malformed',
    metric: 'production',
    period: { kind: 'year', year: 2026 },
    value: { kind: 'point', value: 1 },
    unit: 'koz',
    provenance,
  }],
} as unknown as ProducerJsonV1;
validateProducerJsonV1(malformedButSchemaAccepted);
const failClosedCoverage = assessProducerFiveYearCoverageWithForecast(malformedButSchemaAccepted, 2026, 'BASE');
assert(failClosedCoverage[0].metrics.every((metric) => metric.state === 'blocked'), 'Editor calculability must fail closed rather than throw on an unexpected evidence shape');
assert(failClosedCoverage[0].metrics[0].missing[0].startsWith('CALCULABILITY_EVALUATION_FAILED'), 'Fail-closed editor coverage must expose the caught evaluation error');
const malformedReportedMetric = applicableReportedMetric(
  malformedButSchemaAccepted,
  { ...reportedMetricNormalizationStub, selectedYear: 2026 } as ProducerCompanyYearNormalization,
  'production',
);
assertEqual(malformedReportedMetric.value, null, 'Malformed reported metric scope must fail closed instead of crashing peer-table rendering');

console.log('Mining Producer Steppe compatibility tests passed');