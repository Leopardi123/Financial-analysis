import { normalizeProducerCompanyYear, type ProducerCompanyYearNormalization, type ProducerMetricQuality } from './normalize.ts';
import { resolvePriceSeries } from '../prices/resolve.ts';
import type { ExplicitLongTermPriceDeck, ResolvedProducerPriceDeck } from './priceDeck.ts';
import type {
  NumericClaim,
  PeriodClaim,
  ProducerJsonV1,
  ProducerRunContext,
  ProductionDisclosure,
  ReportedMetric,
} from './types.ts';

export type ProducerProductionEvidence = {
  projectId: string;
  projectName: string;
  metal: string;
  measure: ProductionDisclosure['measure'];
  period: PeriodClaim;
  quantity: NumericClaim;
  unit: ProductionDisclosure['unit'];
  basis: ProductionDisclosure['basis'];
  estimateClass: string;
  sourceId: string;
  relevance: 'exact_year' | 'covers_selected_year' | 'not_periodized';
};

export type ProducerPeerRow = {
  companyId: string;
  companyName: string;
  selectedYear: number;
  priceDeckId: string;
  auOz: number | null;
  auEqOz: number | null;
  reportedProduction: ReportedMetric | null;
  reportedAuEq: ReportedMetric | null;
  reportedRevenue: ReportedMetric | null;
  reportedEbitda: ReportedMetric | null;
  reportedFcf: ReportedMetric | null;
  productionEvidence: ProducerProductionEvidence[];
  productionEstimateClasses: string[];
  productionQuality: ProducerMetricQuality;
  revenueUSD: number | null;
  canonicalCashOperatingCostPerAuEqUSD: number | null;
  reportedCashCost: ReportedMetric | null;
  reportedAisc: ReportedMetric | null;
  ebitdaUSD: number | null;
  fcffBeforeGrowthUSD: number | null;
  fcffAfterGrowthUSD: number | null;
  growthCapexUSD: number | null;
  marketCapUSD: number | null;
  enterpriseValueUSD: number | null;
  marketCapPerAuOzUSD: number | null;
  marketCapPerAuEqOzUSD: number | null;
  evToEbitda: number | null;
  evToFcffBeforeGrowth: number | null;
  evToFcffAfterGrowth: number | null;
  nonStandardMultiples: {
    marketCapToEbitda: number | null;
    marketCapToFcffBeforeGrowth: number | null;
    marketCapToFcffAfterGrowth: number | null;
    warning: string;
  };
  quality: ProducerCompanyYearNormalization['quality'];
  diagnostics: string[];
};

export type ProducerPeerTable = {
  valuationDateUtc: string;
  selectedYear: number;
  priceMode: ProducerRunContext['priceMode'];
  caseMode: ProducerRunContext['caseMode'];
  comparisonBasis: 'canonical_shared_deck' | 'reported_source_decks';
  priceDecksByCompanyId: Record<string, ResolvedProducerPriceDeck>;
  rows: ProducerPeerRow[];
  diagnostics: string[];
};

type PeerTableDeps = {
  resolvePriceSeriesFn?: typeof resolvePriceSeries;
};

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function createRunScopedPriceResolver(base: typeof resolvePriceSeries): typeof resolvePriceSeries {
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof resolvePriceSeries>>>>();
  return async (args, deps) => {
    const key = JSON.stringify({
      price_key: args.price_key,
      anchorDatesUtc: args.anchorDatesUtc,
      scenario: args.scenario,
      allowRefresh: args.allowRefresh,
    });
    let pending = cache.get(key);
    if (!pending) {
      pending = base(args, deps);
      cache.set(key, pending);
    }
    return pending;
  };
}

function metricScopeMatchesCompany(item: ReportedMetric): boolean {
  return item.scope?.type === 'company';
}

function metricScopeMatchesProject(item: ReportedMetric, projectId: string): boolean {
  return item.scope?.type === 'project' && item.scope.projectId === projectId;
}

function exactYearMetric(items: readonly ReportedMetric[], year: number): ReportedMetric[] {
  return items.filter((item) => item.period.kind === 'year' && item.period.year === year);
}

function coveringAverageMetric(items: readonly ReportedMetric[], year: number): ReportedMetric[] {
  return items.filter((item) =>
    item.period.kind === 'year_range_average'
    && item.period.startYear <= year
    && year <= item.period.endYear,
  );
}

function reportedAverageDiagnostic(metric: ReportedMetric['metric'], item: ReportedMetric, year: number): string {
  if (item.period.kind !== 'year_range_average') return '';
  return `${metric}: reported ${item.period.startYear}-${item.period.endYear} average is shown as source evidence for ${year}; it is not materialized into a precise annual canonical input`;
}

export function applicableReportedMetric(
  producer: ProducerJsonV1,
  normalized: ProducerCompanyYearNormalization,
  metric: ReportedMetric['metric'],
): { value: ReportedMetric | null; diagnostic?: string } {
  const companyPool = (producer.reportedMetrics ?? []).filter((item) =>
    item.metric === metric && metricScopeMatchesCompany(item),
  );
  const companyExact = exactYearMetric(companyPool, normalized.selectedYear);
  if (companyExact.length === 1) return { value: companyExact[0] };
  if (companyExact.length > 1) {
    return { value: null, diagnostic: `${metric}: multiple company-level exact-year reported metrics exist for ${normalized.selectedYear}` };
  }

  const companyAverages = coveringAverageMetric(companyPool, normalized.selectedYear);
  if (companyAverages.length === 1) {
    return {
      value: companyAverages[0],
      diagnostic: reportedAverageDiagnostic(metric, companyAverages[0], normalized.selectedYear),
    };
  }
  if (companyAverages.length > 1) {
    return { value: null, diagnostic: `${metric}: multiple company-level year-range averages cover ${normalized.selectedYear}` };
  }

  const projectPools = normalized.includedProjectIds.map((projectId) => {
    const project = producer.projects.find((candidate) => candidate.id === projectId);
    return {
      projectId,
      metrics: (project?.reportedMetrics ?? []).filter((item) =>
        item.metric === metric && metricScopeMatchesProject(item, projectId),
      ),
    };
  });

  const projectExact = projectPools.flatMap(({ metrics }) => exactYearMetric(metrics, normalized.selectedYear));
  if (normalized.includedProjectIds.length === 1 && projectExact.length === 1) return { value: projectExact[0] };
  if (projectExact.length > 0) {
    return {
      value: null,
      diagnostic: `${metric}: multiple/project-level exact-year values are not silently aggregated into a company metric`,
    };
  }

  const projectAverages = projectPools.flatMap(({ metrics }) => coveringAverageMetric(metrics, normalized.selectedYear));
  if (normalized.includedProjectIds.length === 1 && projectAverages.length === 1) {
    return {
      value: projectAverages[0],
      diagnostic: reportedAverageDiagnostic(metric, projectAverages[0], normalized.selectedYear),
    };
  }
  if (projectAverages.length > 0) {
    return {
      value: null,
      diagnostic: `${metric}: multiple/project-level year-range averages are not silently aggregated into a company metric`,
    };
  }
  return { value: null };
}

function productionEvidenceRelevance(period: PeriodClaim, year: number): ProducerProductionEvidence['relevance'] | null {
  if (period.kind === 'year') return period.year === year ? 'exact_year' : null;
  if (period.kind === 'year_range_average' || period.kind === 'year_range_total') {
    return year >= period.startYear && year <= period.endYear ? 'covers_selected_year' : null;
  }
  return 'not_periodized';
}

function productionEvidenceForYear(
  producer: ProducerJsonV1,
  normalized: ProducerCompanyYearNormalization,
): ProducerProductionEvidence[] {
  const output: ProducerProductionEvidence[] = [];
  for (const projectId of normalized.includedProjectIds) {
    const project = producer.projects.find((candidate) => candidate.id === projectId);
    if (!project) continue;
    for (const disclosure of project.production ?? []) {
      const relevance = productionEvidenceRelevance(disclosure.period, normalized.selectedYear);
      if (!relevance) continue;
      output.push({
        projectId,
        projectName: project.name,
        metal: disclosure.metal,
        measure: disclosure.measure,
        period: disclosure.period,
        quantity: disclosure.quantity,
        unit: disclosure.unit,
        basis: disclosure.basis,
        estimateClass: disclosure.provenance.estimateClass,
        sourceId: disclosure.provenance.sourceId,
        relevance,
      });
    }
  }
  const rank: Record<ProducerProductionEvidence['relevance'], number> = {
    exact_year: 0,
    covers_selected_year: 1,
    not_periodized: 2,
  };
  return output.sort((a, b) => rank[a.relevance] - rank[b.relevance] || a.projectName.localeCompare(b.projectName));
}

function productionEstimateClasses(evidence: readonly ProducerProductionEvidence[]): string[] {
  return [...new Set(evidence.map((item) => item.estimateClass))].sort();
}

function rowFromNormalization(
  producer: ProducerJsonV1,
  normalized: ProducerCompanyYearNormalization,
): ProducerPeerRow {
  const au = normalized.producedByMetal.Au;
  const auOz = au?.value ?? null;
  const auEqOz = normalized.physicalAuEqOz;
  const reportedProduction = applicableReportedMetric(producer, normalized, 'production');
  const reportedAuEq = applicableReportedMetric(producer, normalized, 'aueq');
  const reportedRevenue = applicableReportedMetric(producer, normalized, 'revenue');
  const reportedEbitda = applicableReportedMetric(producer, normalized, 'ebitda');
  const reportedFcf = applicableReportedMetric(producer, normalized, 'fcf');
  const cashCost = applicableReportedMetric(producer, normalized, 'cash_cost');
  const aisc = applicableReportedMetric(producer, normalized, 'aisc');
  const evidence = productionEvidenceForYear(producer, normalized);
  const diagnostics = [...normalized.diagnostics];
  for (const candidate of [reportedProduction, reportedAuEq, reportedRevenue, reportedEbitda, reportedFcf, cashCost, aisc]) {
    if (candidate.diagnostic) diagnostics.push(candidate.diagnostic);
  }

  const marketCapUSD = normalized.marketValue.marketCapUSD;
  const enterpriseValueUSD = normalized.marketValue.enterpriseValueUSD;
  const ebitdaUSD = normalized.metrics.ebitdaUSD;
  const fcffBeforeGrowthUSD = normalized.metrics.fcffBeforeGrowthUSD;
  const fcffAfterGrowthUSD = normalized.metrics.fcffAfterGrowthUSD;
  const hasVisibleProductionEvidence = reportedProduction.value !== null || evidence.some((item) => item.metal === 'Au');
  const productionQuality: ProducerMetricQuality = normalized.quality.physicalAuEq === 'not_computable' && hasVisibleProductionEvidence
    ? 'reported_only'
    : normalized.quality.physicalAuEq;

  if (auOz === null && hasVisibleProductionEvidence) {
    diagnostics.push('PRODUCTION_EVIDENCE_NOT_AGGREGATED: source production evidence is shown in the peer table, but is not collapsed into a false canonical point value.');
  }

  return {
    companyId: normalized.companyId,
    companyName: normalized.companyName,
    selectedYear: normalized.selectedYear,
    priceDeckId: normalized.priceDeck.id,
    auOz,
    auEqOz,
    reportedProduction: reportedProduction.value,
    reportedAuEq: reportedAuEq.value,
    reportedRevenue: reportedRevenue.value,
    reportedEbitda: reportedEbitda.value,
    reportedFcf: reportedFcf.value,
    productionEvidence: evidence,
    productionEstimateClasses: productionEstimateClasses(evidence),
    productionQuality,
    revenueUSD: normalized.metrics.revenueUSD,
    canonicalCashOperatingCostPerAuEqUSD: safeRatio(normalized.costBucketsUSD.cashOperatingCostsUSD, auEqOz),
    reportedCashCost: cashCost.value,
    reportedAisc: aisc.value,
    ebitdaUSD,
    fcffBeforeGrowthUSD,
    fcffAfterGrowthUSD,
    growthCapexUSD: normalized.costBucketsUSD.growthCapexUSD,
    marketCapUSD,
    enterpriseValueUSD,
    marketCapPerAuOzUSD: safeRatio(marketCapUSD, auOz),
    marketCapPerAuEqOzUSD: safeRatio(marketCapUSD, auEqOz),
    evToEbitda: normalized.multiples.evToEbitda,
    evToFcffBeforeGrowth: normalized.multiples.evToFcffBeforeGrowth,
    evToFcffAfterGrowth: normalized.multiples.evToFcffAfterGrowth,
    nonStandardMultiples: {
      marketCapToEbitda: safeRatio(marketCapUSD, ebitdaUSD),
      marketCapToFcffBeforeGrowth: safeRatio(marketCapUSD, fcffBeforeGrowthUSD),
      marketCapToFcffAfterGrowth: safeRatio(marketCapUSD, fcffAfterGrowthUSD),
      warning: 'Market Cap/EBITDA and Market Cap/FCFF are non-standard because EBITDA/FCFF are enterprise/unlevered measures; EV-based multiples are canonical.',
    },
    quality: normalized.quality,
    diagnostics: [...new Set(diagnostics)],
  };
}

function assertSharedCanonicalPrices(rows: readonly ProducerCompanyYearNormalization[]): void {
  const deckIds = [...new Set(rows.map((row) => row.priceDeck.id))];
  if (deckIds.length > 1) {
    throw new Error(`Canonical peer comparison requires one shared price deck id; received ${deckIds.join(', ')}`);
  }

  const seenByMetal = new Map<string, string>();
  for (const row of rows) {
    for (const [metal, price] of Object.entries(row.priceDeck.pricesByMetal)) {
      if (price.valueUSD === null) continue;
      const signature = `${price.valueUSD}|${price.unit}`;
      const existing = seenByMetal.get(metal);
      if (existing !== undefined && existing !== signature) {
        throw new Error(`Canonical peer comparison price mismatch for ${metal}: ${existing} vs ${signature}`);
      }
      seenByMetal.set(metal, signature);
    }
  }
}

export async function buildProducerPeerTable(
  args: {
    producers: readonly ProducerJsonV1[];
    context: ProducerRunContext;
    ltDeck?: ExplicitLongTermPriceDeck;
    reportedPriceDeckIdByCompanyId?: Readonly<Record<string, string>>;
    usdPerCurrencyUnitByCurrency?: Readonly<Record<string, number>>;
    allowNonProductionReadySpotKeys?: boolean;
  },
  deps: PeerTableDeps = {},
): Promise<ProducerPeerTable> {
  const baseResolver = deps.resolvePriceSeriesFn ?? resolvePriceSeries;
  const runScopedResolver = createRunScopedPriceResolver(baseResolver);

  const normalized = await Promise.all(args.producers.map((producer) => normalizeProducerCompanyYear({
    producer,
    context: args.context,
    ltDeck: args.ltDeck,
    reportedPriceDeckId: args.reportedPriceDeckIdByCompanyId?.[producer.company.id],
    usdPerCurrencyUnitByCurrency: args.usdPerCurrencyUnitByCurrency,
    allowNonProductionReadySpotKeys: args.allowNonProductionReadySpotKeys,
  }, { resolvePriceSeriesFn: runScopedResolver })));

  const diagnostics: string[] = [];
  if (args.context.priceMode === 'SPOT' || args.context.priceMode === 'LT') {
    assertSharedCanonicalPrices(normalized);
  } else {
    diagnostics.push('REPORTED mode intentionally preserves source-specific price decks and is not an apples-to-apples canonical price comparison.');
  }

  return {
    valuationDateUtc: args.context.valuationDateUtc,
    selectedYear: args.context.selectedYear,
    priceMode: args.context.priceMode,
    caseMode: args.context.caseMode,
    comparisonBasis: args.context.priceMode === 'REPORTED' ? 'reported_source_decks' : 'canonical_shared_deck',
    priceDecksByCompanyId: Object.fromEntries(normalized.map((item) => [item.companyId, item.priceDeck])),
    rows: args.producers.map((producer, index) => rowFromNormalization(producer, normalized[index])),
    diagnostics,
  };
}
