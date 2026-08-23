import { resolveFxUSDToTarget } from '../../lib/prices/fx/resolveFx.ts';
import { resolvePriceSeries } from '../../lib/prices/resolve.ts';
import { materializeProducerForecastForYear } from '../../lib/miningProducer/forecast.ts';
import { assessProducerIntervalCompleteness } from '../../lib/miningProducer/intervalCompleteness.ts';
import {
  computeProducerIntervalEconomics,
  type ProducerIntervalEconomics,
} from '../../lib/miningProducer/intervalEconomics.ts';
import { buildProducerPeerTable, type ProducerPeerTable } from '../../lib/miningProducer/peerTable.ts';
import type { ExplicitLongTermPriceDeck } from '../../lib/miningProducer/priceDeck.ts';
import type { ProducerJsonV1, ProducerProject, ProducerRunContext } from '../../lib/miningProducer/types.ts';
import {
  fetchProducerQuoteFromCanonicalFmpPath,
  resolveLiveProducerMarketInputs,
  resolveProducerProviderSymbolFromCompanyMaster,
  type ProducerProviderSymbolResolution,
  type ProducerQuoteSnapshot,
} from './resolveLiveMarketInputs.ts';

export type LiveProducerPeerTableResult = {
  table: ProducerPeerTable;
  hydratedProducers: ProducerJsonV1[];
  liveDiagnosticsByCompanyId: Record<string, string[]>;
  usdPerCurrencyUnitByCurrency: Record<string, number>;
  intervalEconomicsByCompanyId: Record<string, {
    attributable: ProducerIntervalEconomics;
    financial: ProducerIntervalEconomics;
  }>;
};

function cachedProviderSymbolResolver(
  base: (producer: ProducerJsonV1) => Promise<ProducerProviderSymbolResolution>,
): (producer: ProducerJsonV1) => Promise<ProducerProviderSymbolResolution> {
  const cache = new Map<string, Promise<ProducerProviderSymbolResolution>>();
  return async (producer) => {
    const key = `${producer.company.id}|${producer.company.primarySecurity?.ticker ?? ''}|${producer.company.primarySecurity?.exchange ?? ''}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = base(producer);
      cache.set(key, pending);
    }
    return pending;
  };
}

function cachedQuoteFetcher(
  base: (symbol: string) => Promise<ProducerQuoteSnapshot>,
): (symbol: string) => Promise<ProducerQuoteSnapshot> {
  const cache = new Map<string, Promise<ProducerQuoteSnapshot>>();
  return async (symbol) => {
    let pending = cache.get(symbol);
    if (!pending) {
      pending = base(symbol);
      cache.set(symbol, pending);
    }
    return pending;
  };
}

function cachedFxResolver(base: typeof resolveFxUSDToTarget): typeof resolveFxUSDToTarget {
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof resolveFxUSDToTarget>>>>();
  return async (args, deps) => {
    const key = JSON.stringify(args);
    let pending = cache.get(key);
    if (!pending) {
      pending = base(args, deps);
      cache.set(key, pending);
    }
    return pending;
  };
}

function projectInsideExplicitProductionWindow(project: ProducerProject, year: number): boolean {
  const window = project.productionWindow;
  if (!window) return true;
  if (year < window.startYear) return false;
  if (window.endYear !== undefined && year > window.endYear) return false;
  return true;
}

function applyProductionWindowForRun(producer: ProducerJsonV1, year: number): ProducerJsonV1 {
  return {
    ...producer,
    projects: producer.projects.filter((project) => projectInsideExplicitProductionWindow(project, year)),
  };
}

function financialConsolidationFactor(project: ProducerProject): number | null {
  const consolidation = project.financialConsolidation;
  if (!consolidation) return null;
  if (consolidation.method === 'full') return 1;
  if (consolidation.method === 'equity_method') return 0;
  return consolidation.consolidationPct ?? null;
}

/**
 * The core normalizer historically uses project ownership to scale project_100pct
 * production/cost disclosures. For enterprise economics that is not always the
 * correct basis: a fully consolidated 80%-owned mine contributes 100% of revenue
 * and EBITDA, while NCI belongs in EV. This runtime copy substitutes the verified
 * financial-consolidation factor only for the financial normalization pass.
 * The attributable pass remains untouched and continues to drive Au/AuEq and
 * Market Cap / attributable-production metrics.
 */
function applyFinancialConsolidationForRun(producer: ProducerJsonV1, year: number): ProducerJsonV1 {
  return {
    ...producer,
    projects: producer.projects.map((project) => {
      const factor = financialConsolidationFactor(project);
      if (factor === null) return project;
      return {
        ...project,
        ownership: [{
          effectiveFrom: `${year}-01-01`,
          effectiveTo: `${year}-12-31`,
          ownershipPct: factor,
          provenance: project.financialConsolidation!.provenance,
        }],
      };
    }),
  };
}

function mergeFinancialEconomics(
  attributable: ProducerPeerTable,
  financial: ProducerPeerTable,
): ProducerPeerTable {
  const financialById = new Map(financial.rows.map((row) => [row.companyId, row]));
  for (const row of attributable.rows) {
    const financeRow = financialById.get(row.companyId);
    if (!financeRow) continue;
    row.revenueUSD = financeRow.revenueUSD;
    row.ebitdaUSD = financeRow.ebitdaUSD;
    row.fcffBeforeGrowthUSD = financeRow.fcffBeforeGrowthUSD;
    row.fcffAfterGrowthUSD = financeRow.fcffAfterGrowthUSD;
    row.growthCapexUSD = financeRow.growthCapexUSD;
    row.evToEbitda = financeRow.evToEbitda;
    row.evToFcffBeforeGrowth = financeRow.evToFcffBeforeGrowth;
    row.evToFcffAfterGrowth = financeRow.evToFcffAfterGrowth;
    row.nonStandardMultiples = financeRow.nonStandardMultiples;
    row.quality = {
      ...row.quality,
      revenue: financeRow.quality.revenue,
      ebitda: financeRow.quality.ebitda,
      fcffBeforeGrowth: financeRow.quality.fcffBeforeGrowth,
      fcffAfterGrowth: financeRow.quality.fcffAfterGrowth,
    };
    row.diagnostics = [...new Set([
      ...row.diagnostics,
      ...financeRow.diagnostics,
      'FINANCIAL_CONSOLIDATION_ROUTE: Au/AuEq remain attributable; Revenue/EBITDA/FCFF use verified project financialConsolidation where supplied.',
    ])];
  }
  return attributable;
}

function enforceIntervalCompleteness(
  interval: ProducerIntervalEconomics,
  completeness: ReturnType<typeof assessProducerIntervalCompleteness>,
): ProducerIntervalEconomics {
  const diagnostics = [...new Set([...interval.diagnostics, ...completeness.diagnostics])];
  if (!completeness.productionComplete) {
    interval.auOz = {
      range: null,
      quality: 'not_computable',
      diagnostics: [...interval.auOz.diagnostics, ...completeness.diagnostics],
    };
    interval.auEqOz = {
      range: null,
      quality: 'not_computable',
      diagnostics: [...interval.auEqOz.diagnostics, ...completeness.diagnostics],
    };
  }
  if (!completeness.revenueComplete) {
    const reason = 'PARTIAL_INTERVAL_FORBIDDEN: company interval suppressed because at least one active project/revenue quantity is unresolved.';
    interval.revenueUSD = { range: null, quality: 'not_computable', diagnostics: [...interval.revenueUSD.diagnostics, reason, ...completeness.diagnostics] };
    interval.ebitdaUSD = { range: null, quality: 'not_computable', diagnostics: [...interval.ebitdaUSD.diagnostics, reason, ...completeness.diagnostics] };
    interval.fcffBeforeGrowthUSD = { range: null, quality: 'not_computable', diagnostics: [...interval.fcffBeforeGrowthUSD.diagnostics, reason, ...completeness.diagnostics] };
    interval.fcffAfterGrowthUSD = { range: null, quality: 'not_computable', diagnostics: [...interval.fcffAfterGrowthUSD.diagnostics, reason, ...completeness.diagnostics] };
    diagnostics.push(reason);
  }
  interval.diagnostics = diagnostics;
  return interval;
}

export async function buildLiveProducerPeerTable(
  args: {
    producers: readonly ProducerJsonV1[];
    context: ProducerRunContext;
    ltDeck?: ExplicitLongTermPriceDeck;
    reportedPriceDeckIdByCompanyId?: Readonly<Record<string, string>>;
    allowNonProductionReadySpotKeys?: boolean;
  },
  deps: {
    resolveProviderSymbolFn?: (producer: ProducerJsonV1) => Promise<ProducerProviderSymbolResolution>;
    fetchQuoteFn?: (symbol: string) => Promise<ProducerQuoteSnapshot>;
    resolveFxFn?: typeof resolveFxUSDToTarget;
    resolvePriceSeriesFn?: typeof resolvePriceSeries;
    todayUtcFn?: () => string;
  } = {},
): Promise<LiveProducerPeerTableResult> {
  const resolveProviderSymbolFn = cachedProviderSymbolResolver(
    deps.resolveProviderSymbolFn ?? resolveProducerProviderSymbolFromCompanyMaster,
  );
  const fetchQuoteFn = cachedQuoteFetcher(
    deps.fetchQuoteFn ?? fetchProducerQuoteFromCanonicalFmpPath,
  );
  const resolveFxFn = cachedFxResolver(deps.resolveFxFn ?? resolveFxUSDToTarget);

  const live = await Promise.all(args.producers.map((producer) => resolveLiveProducerMarketInputs(producer, {
    resolveProviderSymbolFn,
    fetchQuoteFn,
    resolveFxFn,
    todayUtcFn: deps.todayUtcFn,
  })));

  const usdPerCurrencyUnitByCurrency: Record<string, number> = {};
  const liveDiagnosticsByCompanyId: Record<string, string[]> = {};

  for (let index = 0; index < live.length; index += 1) {
    const companyId = args.producers[index].company.id;
    liveDiagnosticsByCompanyId[companyId] = live[index].diagnostics;
    for (const [currency, value] of Object.entries(live[index].usdPerCurrencyUnitByCurrency)) {
      const existing = usdPerCurrencyUnitByCurrency[currency];
      if (existing !== undefined && Math.abs(existing - value) > 1e-12) {
        throw new Error(`Live Producer peer run resolved conflicting ${currency}->USD FX values: ${existing} vs ${value}`);
      }
      usdPerCurrencyUnitByCurrency[currency] = value;
    }
  }

  const hydratedProducers = live.map((item) => item.producer);
  const forecastDiagnosticsByCompanyId: Record<string, string[]> = {};
  const forecastedProducers = hydratedProducers.map((producer) => {
    const materialized = materializeProducerForecastForYear(producer, args.context.selectedYear);
    forecastDiagnosticsByCompanyId[producer.company.id] = materialized.diagnostics;
    return materialized.producer;
  });
  const attributableProducers = forecastedProducers.map((producer) => applyProductionWindowForRun(producer, args.context.selectedYear));
  const commonBuildArgs = {
    context: args.context,
    ltDeck: args.ltDeck,
    reportedPriceDeckIdByCompanyId: args.reportedPriceDeckIdByCompanyId,
    usdPerCurrencyUnitByCurrency,
    allowNonProductionReadySpotKeys: args.allowNonProductionReadySpotKeys,
  };

  const attributableTable = await buildProducerPeerTable({
    producers: attributableProducers,
    ...commonBuildArgs,
  }, {
    resolvePriceSeriesFn: deps.resolvePriceSeriesFn,
  });

  const hasExplicitConsolidation = attributableProducers.some((producer) =>
    producer.projects.some((project) => project.financialConsolidation !== undefined),
  );

  let table = attributableTable;
  if (hasExplicitConsolidation) {
    const financialProducers = attributableProducers.map((producer) => applyFinancialConsolidationForRun(producer, args.context.selectedYear));
    const financialTable = await buildProducerPeerTable({
      producers: financialProducers,
      ...commonBuildArgs,
    }, {
      resolvePriceSeriesFn: deps.resolvePriceSeriesFn,
    });
    table = mergeFinancialEconomics(attributableTable, financialTable);
  }

  const intervalEconomicsByCompanyId: LiveProducerPeerTableResult['intervalEconomicsByCompanyId'] = {};
  for (const producer of attributableProducers) {
    const deck = table.priceDecksByCompanyId[producer.company.id];
    if (!deck) continue;
    const attributableCompleteness = assessProducerIntervalCompleteness({
      producer,
      year: args.context.selectedYear,
      caseMode: args.context.caseMode,
      basis: 'attributable',
    });
    const financialCompleteness = assessProducerIntervalCompleteness({
      producer,
      year: args.context.selectedYear,
      caseMode: args.context.caseMode,
      basis: 'financial',
    });
    intervalEconomicsByCompanyId[producer.company.id] = {
      attributable: enforceIntervalCompleteness(computeProducerIntervalEconomics({
        producer,
        year: args.context.selectedYear,
        caseMode: args.context.caseMode,
        deck,
        basis: 'attributable',
        usdPerCurrencyUnitByCurrency,
      }), attributableCompleteness),
      financial: enforceIntervalCompleteness(computeProducerIntervalEconomics({
        producer,
        year: args.context.selectedYear,
        caseMode: args.context.caseMode,
        deck,
        basis: 'financial',
        usdPerCurrencyUnitByCurrency,
      }), financialCompleteness),
    };
  }

  for (const row of table.rows) {
    const liveDiagnostics = liveDiagnosticsByCompanyId[row.companyId] ?? [];
    const forecastDiagnostics = forecastDiagnosticsByCompanyId[row.companyId] ?? [];
    const intervals = intervalEconomicsByCompanyId[row.companyId];
    const intervalDiagnostics = intervals
      ? [...intervals.attributable.diagnostics, ...intervals.financial.diagnostics]
      : [];
    row.diagnostics = [...new Set([...liveDiagnostics, ...forecastDiagnostics, ...row.diagnostics, ...intervalDiagnostics])];
  }

  return {
    table,
    hydratedProducers,
    liveDiagnosticsByCompanyId,
    usdPerCurrencyUnitByCurrency,
    intervalEconomicsByCompanyId,
  };
}
