import { normalizeProducerCompanyYear, type ProducerCompanyYearNormalization, type ProducerMetricQuality } from './normalize.ts';
import { resolvePriceSeries } from '../prices/resolve.ts';
import type { ExplicitLongTermPriceDeck, ResolvedProducerPriceDeck } from './priceDeck.ts';
import type { ProducerJsonV1, ProducerRunContext, ReportedMetric } from './types.ts';

export type ProducerPeerRow = {
  companyId: string;
  companyName: string;
  selectedYear: number;
  priceDeckId: string;
  auOz: number | null;
  auEqOz: number | null;
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

function applicableReportedMetric(
  producer: ProducerJsonV1,
  normalized: ProducerCompanyYearNormalization,
  metric: 'cash_cost' | 'aisc',
): { value: ReportedMetric | null; diagnostic?: string } {
  const companyMetrics = (producer.reportedMetrics ?? []).filter((item) =>
    item.metric === metric
    && item.scope.type === 'company'
    && item.period.kind === 'year'
    && item.period.year === normalized.selectedYear,
  );
  if (companyMetrics.length === 1) return { value: companyMetrics[0] };
  if (companyMetrics.length > 1) {
    return { value: null, diagnostic: `${metric}: multiple company-level reported metrics exist for ${normalized.selectedYear}` };
  }

  const projectMetrics = normalized.includedProjectIds.flatMap((projectId) => {
    const project = producer.projects.find((candidate) => candidate.id === projectId);
    return (project?.reportedMetrics ?? []).filter((item) =>
      item.metric === metric
      && item.scope.type === 'project'
      && item.scope.projectId === projectId
      && item.period.kind === 'year'
      && item.period.year === normalized.selectedYear,
    );
  });
  if (normalized.includedProjectIds.length === 1 && projectMetrics.length === 1) return { value: projectMetrics[0] };
  if (projectMetrics.length > 0) {
    return {
      value: null,
      diagnostic: `${metric}: multiple/project-level values are not silently aggregated into a company metric`,
    };
  }
  return { value: null };
}

function productionEstimateClasses(
  producer: ProducerJsonV1,
  normalized: ProducerCompanyYearNormalization,
): string[] {
  const classes = normalized.productionItems.flatMap((item) => {
    const project = producer.projects.find((candidate) => candidate.id === item.projectId);
    const source = project?.production.find((candidate) => candidate.id === item.disclosureId);
    return source ? [source.provenance.estimateClass] : [];
  });
  return [...new Set(classes)].sort();
}

function rowFromNormalization(
  producer: ProducerJsonV1,
  normalized: ProducerCompanyYearNormalization,
): ProducerPeerRow {
  const au = normalized.producedByMetal.Au;
  const auOz = au?.value ?? null;
  const auEqOz = normalized.physicalAuEqOz;
  const cashCost = applicableReportedMetric(producer, normalized, 'cash_cost');
  const aisc = applicableReportedMetric(producer, normalized, 'aisc');
  const diagnostics = [...normalized.diagnostics];
  if (cashCost.diagnostic) diagnostics.push(cashCost.diagnostic);
  if (aisc.diagnostic) diagnostics.push(aisc.diagnostic);

  const marketCapUSD = normalized.marketValue.marketCapUSD;
  const enterpriseValueUSD = normalized.marketValue.enterpriseValueUSD;
  const ebitdaUSD = normalized.metrics.ebitdaUSD;
  const fcffBeforeGrowthUSD = normalized.metrics.fcffBeforeGrowthUSD;
  const fcffAfterGrowthUSD = normalized.metrics.fcffAfterGrowthUSD;

  return {
    companyId: normalized.companyId,
    companyName: normalized.companyName,
    selectedYear: normalized.selectedYear,
    priceDeckId: normalized.priceDeck.id,
    auOz,
    auEqOz,
    productionEstimateClasses: productionEstimateClasses(producer, normalized),
    productionQuality: normalized.quality.physicalAuEq,
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
