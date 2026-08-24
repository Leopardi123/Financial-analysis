const FORECAST_SUMMARY_RE = /FORECAST_RULE_APPLIED_SUMMARY:\s*(\d+)\s+forecast rules materialized(?:\s+for\s+(\d{4}))?/i;

export function producerForecastRuleCount(diagnostics: readonly string[]): number {
  for (const item of diagnostics) {
    const match = item.match(FORECAST_SUMMARY_RE);
    if (match) return Number(match[1]);
  }
  return 0;
}

export function producerModelLayerLabel(
  diagnostics: readonly string[],
  caseMode: 'BASE' | 'GROWTH',
): string | null {
  const count = producerForecastRuleCount(diagnostics);
  if (count <= 0) return null;
  return `Analyst ${caseMode} model · ${count} forecastregel${count === 1 ? '' : 'er'} materialiserade`;
}

type DiagnosticSummary = {
  summaries: string[];
  details: string[];
};

const OPERATING_BUCKETS = new Set([
  'cashOperatingCostsUSD',
  'royaltiesUSD',
  'productionTaxesUSD',
  'tcRcUSD',
  'siteGnaUSD',
  'corporateGnaUSD',
  'otherRecurringOperatingCashExpensesUSD',
]);

const PRE_GROWTH_BUCKETS = new Set([
  'sustainingCapexUSD',
  'sustainingExplorationDevelopmentUSD',
  'cashTaxesUSD',
  'workingCapitalDeltaUSD',
  'otherRecurringNonEbitdaCashSpendUSD',
]);

const GROWTH_BUCKETS = new Set([
  'growthCapexUSD',
  'growthExplorationDevelopmentUSD',
]);

function projectCoverage(items: readonly string[], buckets: Set<string>): { projects: Set<string>; fields: Set<string> } {
  const projects = new Set<string>();
  const fields = new Set<string>();
  for (const item of items) {
    const match = item.match(/^PROJECT_COST_COVERAGE_MISSING:\s*([^/]+)\/([^;]+);/);
    if (!match || !buckets.has(match[2])) continue;
    projects.add(match[1]);
    fields.add(match[2]);
  }
  return { projects, fields };
}

function bucketLabel(bucket: string): string {
  switch (bucket) {
    case 'cashOperatingCostsUSD': return 'cash operating cost';
    case 'royaltiesUSD': return 'royalty';
    case 'productionTaxesUSD': return 'production tax';
    case 'tcRcUSD': return 'TC/RC';
    case 'siteGnaUSD': return 'site G&A';
    case 'corporateGnaUSD': return 'corporate G&A';
    case 'otherRecurringOperatingCashExpensesUSD': return 'other operating';
    case 'sustainingCapexUSD': return 'sustaining CAPEX';
    case 'sustainingExplorationDevelopmentUSD': return 'sustaining exploration/development';
    case 'cashTaxesUSD': return 'cash tax';
    case 'workingCapitalDeltaUSD': return 'working capital';
    case 'otherRecurringNonEbitdaCashSpendUSD': return 'other recurring cash';
    case 'growthCapexUSD': return 'growth CAPEX';
    case 'growthExplorationDevelopmentUSD': return 'growth exploration';
    default: return bucket;
  }
}

function coverageSummary(prefix: string, coverage: ReturnType<typeof projectCoverage>): string | null {
  if (coverage.projects.size === 0 && coverage.fields.size === 0) return null;
  const projectText = coverage.projects.size > 0 ? ` för ${coverage.projects.size} projekt` : '';
  const fields = [...coverage.fields].map(bucketLabel).join(', ');
  return `${prefix}${projectText}: ${fields}.`;
}

function forecastSummary(item: string): string {
  const match = item.match(FORECAST_SUMMARY_RE);
  if (!match) return item.replace('FORECAST_RULE_APPLIED_SUMMARY:', 'Analystmodell:');
  const count = Number(match[1]);
  const year = match[2];
  return `Analystmodell: ${count} forecastregel${count === 1 ? '' : 'er'} materialiserade${year ? ` för ${year}` : ''}.`;
}

export function summarizeProducerDiagnostics(diagnostics: readonly string[]): DiagnosticSummary {
  const details = [...new Set(diagnostics)];
  const summaries: string[] = [];

  const forecast = details.find((item) => item.startsWith('FORECAST_RULE_APPLIED_SUMMARY:'));
  if (forecast) summaries.push(forecastSummary(forecast));

  const ev = details.find((item) => item.startsWith('Enterprise value unresolved:'));
  if (ev) summaries.push(ev);

  const operating = coverageSummary('Canonical EBITDA saknar cost coverage', projectCoverage(details, OPERATING_BUCKETS));
  if (operating) summaries.push(operating);

  const preGrowth = coverageSummary('Canonical FCFF före growth saknar coverage', projectCoverage(details, PRE_GROWTH_BUCKETS));
  if (preGrowth) summaries.push(preGrowth);

  const growth = coverageSummary('Canonical FCFF efter growth saknar coverage', projectCoverage(details, GROWTH_BUCKETS));
  if (growth) summaries.push(growth);

  if (details.some((item) => item.startsWith('PARTIAL_INTERVAL_FORBIDDEN:'))) {
    summaries.push('Partiell company-serie är blockerad eftersom minst ett aktivt projekt saknar full exact-year coverage.');
  }
  if (details.some((item) => item.startsWith('AISC_ONLY_NOT_CANONICAL:'))) {
    summaries.push('Rapporterad AISC visas som evidens men används inte som dold ersättning för canonical EBITDA/FCFF.');
  }
  const revenueProxy = details.find((item) => item.startsWith('REVENUE_QUANTITY_PROXY:'));
  if (revenueProxy) summaries.push(revenueProxy);

  if (summaries.length === 0 && details.length > 0) {
    summaries.push(...details.slice(0, 3));
  }

  return { summaries: [...new Set(summaries)], details };
}
