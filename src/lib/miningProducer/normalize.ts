import {
  aggregateCanonicalCostBuckets,
  evaluateCostDisclosureForYear,
  type CanonicalCostBucketName,
  type CostCalculationQuality,
  type EvaluatedCostDisclosure,
} from './costs.ts';
import { computeCanonicalProducerMetrics, type CanonicalProducerMetrics } from './metrics.ts';
import {
  resolveProducerPriceDeck,
  type ExplicitLongTermPriceDeck,
  type ResolvedProducerPriceDeck,
} from './priceDeck.ts';
import {
  aggregateProducedByMetal,
  buildNormalizedCompanyProduction,
  computeMetalRevenueUSD,
  computePhysicalAuEqOz,
  isProjectIncludedInCase,
  normalizeProjectProductionForYear,
  selectRevenueQuantityByMetal,
  type CalculationQuality,
  type NormalizedProductionDisclosure,
  type ScalarQuantity,
} from './production.ts';
import { validateProducerJsonV1, validateProducerRunContext } from './schema.ts';
import type { CostDisclosure, ProducerJsonV1, ProducerProject, ProducerRunContext } from './types.ts';

export type ProducerMetricQuality = 'exact' | 'approximation' | 'reported_only' | 'not_computable';

export type ProducerCompanyYearNormalization = {
  companyId: string;
  selectedYear: number;
  context: ProducerRunContext;
  priceDeck: ResolvedProducerPriceDeck;
  includedProjectIds: string[];
  productionItems: NormalizedProductionDisclosure[];
  producedByMetal: Record<string, ScalarQuantity>;
  revenueQuantityByMetal: Record<string, ScalarQuantity>;
  revenueByMetalUSD: Record<string, number | null>;
  physicalAuEqOz: number | null;
  costEvaluations: EvaluatedCostDisclosure[];
  costBucketsUSD: Record<CanonicalCostBucketName, number | null>;
  metrics: CanonicalProducerMetrics;
  quality: {
    revenue: ProducerMetricQuality;
    physicalAuEq: ProducerMetricQuality;
    ebitda: ProducerMetricQuality;
    fcffBeforeGrowth: ProducerMetricQuality;
    fcffAfterGrowth: ProducerMetricQuality;
  };
  diagnostics: string[];
};

export type NormalizeProducerCompanyYearArgs = {
  producer: ProducerJsonV1;
  context: ProducerRunContext;
  ltDeck?: ExplicitLongTermPriceDeck;
  reportedPriceDeckId?: string;
  allowNonProductionReadySpotKeys?: boolean;
  usdPerCurrencyUnitByCurrency?: Readonly<Record<string, number>>;
};

const EBITDA_BUCKETS: readonly CanonicalCostBucketName[] = [
  'cashOperatingCostsUSD',
  'royaltiesUSD',
  'productionTaxesUSD',
  'tcRcUSD',
  'siteGnaUSD',
  'corporateGnaUSD',
  'otherRecurringOperatingCashExpensesUSD',
] as const;

const PRE_GROWTH_BUCKETS: readonly CanonicalCostBucketName[] = [
  'sustainingCapexUSD',
  'sustainingExplorationDevelopmentUSD',
  'cashTaxesUSD',
  'workingCapitalDeltaUSD',
  'otherRecurringNonEbitdaCashSpendUSD',
] as const;

const GROWTH_BUCKETS: readonly CanonicalCostBucketName[] = [
  'growthCapexUSD',
  'growthExplorationDevelopmentUSD',
] as const;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function periodAppliesToYear(period: CostDisclosure['period'] | ProducerProject['production'][number]['period'], year: number): boolean {
  if (period.kind === 'year') return period.year === year;
  return year >= period.startYear && year <= period.endYear;
}

function combineMetricQuality(values: readonly ProducerMetricQuality[]): ProducerMetricQuality {
  if (values.includes('not_computable')) return 'not_computable';
  if (values.includes('reported_only')) return 'reported_only';
  if (values.includes('approximation')) return 'approximation';
  return 'exact';
}

function calculationQualityToMetricQuality(value: CalculationQuality): ProducerMetricQuality {
  return value === 'not_computable' ? 'not_computable' : value;
}

function costQualityToMetricQuality(value: CostCalculationQuality | 'missing'): ProducerMetricQuality {
  if (value === 'missing' || value === 'excluded' || value === 'not_computable') return 'not_computable';
  return value;
}

function bucketQuality(
  buckets: ReturnType<typeof aggregateCanonicalCostBuckets>,
  names: readonly CanonicalCostBucketName[],
): ProducerMetricQuality {
  return combineMetricQuality(names.map((name) => costQualityToMetricQuality(buckets.qualityByBucket[name])));
}

function projectHasAnySelectedYearProductionDisclosure(project: ProducerProject, year: number): boolean {
  return project.production.some((item) => periodAppliesToYear(item.period, year));
}

function normalizeProjectRevenue(
  project: ProducerProject,
  year: number,
  deck: ResolvedProducerPriceDeck,
): {
  productionItems: NormalizedProductionDisclosure[];
  revenue: ReturnType<typeof computeMetalRevenueUSD>;
} {
  const productionItems = normalizeProjectProductionForYear(project, year);
  const revenueQuantity = selectRevenueQuantityByMetal(productionItems);
  return {
    productionItems,
    revenue: computeMetalRevenueUSD(revenueQuantity, deck),
  };
}

function evaluateProjectCosts(args: {
  project: ProducerProject;
  year: number;
  priceMode: ProducerRunContext['priceMode'];
  deck: ResolvedProducerPriceDeck;
  usdPerCurrencyUnitByCurrency: Readonly<Record<string, number>>;
}): { disclosures: CostDisclosure[]; evaluations: EvaluatedCostDisclosure[] } {
  const disclosures = args.project.costs ?? [];
  const projectNormalized = normalizeProjectRevenue(args.project, args.year, args.deck);
  const evaluations = disclosures
    .map((disclosure) => evaluateCostDisclosureForYear(disclosure, {
      year: args.year,
      priceMode: args.priceMode,
      deck: args.deck,
      productionItems: projectNormalized.productionItems,
      revenue: projectNormalized.revenue,
      usdPerCurrencyUnitByCurrency: args.usdPerCurrencyUnitByCurrency,
      project: args.project,
    }))
    .filter((evaluation): evaluation is EvaluatedCostDisclosure => evaluation !== null);
  return { disclosures, evaluations };
}

export async function normalizeProducerCompanyYear(
  args: NormalizeProducerCompanyYearArgs,
  deps: { resolvePriceSeriesFn?: Parameters<typeof resolveProducerPriceDeck>[1]['resolvePriceSeriesFn'] } = {},
): Promise<ProducerCompanyYearNormalization> {
  validateProducerJsonV1(args.producer);
  const context = validateProducerRunContext(args.context);
  if (args.producer.valuation.valuationDateUtc !== context.valuationDateUtc) {
    throw new Error(
      `Producer valuationDateUtc ${args.producer.valuation.valuationDateUtc} does not match run context ${context.valuationDateUtc}`,
    );
  }

  const includedProjects = args.producer.projects.filter((project) => isProjectIncludedInCase(project.statusAsOfValuationDate, context.caseMode));
  const metals = unique(includedProjects.flatMap((project) => project.production.map((item) => item.metal))).sort();
  const priceDeck = await resolveProducerPriceDeck({
    producer: args.producer,
    context,
    metals,
    ltDeck: args.ltDeck,
    reportedPriceDeckId: args.reportedPriceDeckId,
    allowNonProductionReadySpotKeys: args.allowNonProductionReadySpotKeys,
  }, deps);

  const diagnostics: string[] = [...priceDeck.warnings];
  const missingProductionProjects = includedProjects
    .filter((project) => !projectHasAnySelectedYearProductionDisclosure(project, context.selectedYear))
    .map((project) => project.id);
  diagnostics.push(...missingProductionProjects.map((projectId) => `${projectId}: no production disclosure covers ${context.selectedYear}; zero production is not assumed`));

  const productionItems = buildNormalizedCompanyProduction({
    projects: args.producer.projects,
    year: context.selectedYear,
    caseMode: context.caseMode,
  });
  const producedByMetal = aggregateProducedByMetal(productionItems);
  const revenueQuantityByMetal = selectRevenueQuantityByMetal(productionItems);
  const revenue = computeMetalRevenueUSD(revenueQuantityByMetal, priceDeck);
  diagnostics.push(...revenue.reasons);

  let revenueQuality: ProducerMetricQuality = calculationQualityToMetricQuality(revenue.quality);
  let physicalAuEq = computePhysicalAuEqOz(producedByMetal, priceDeck);
  if (missingProductionProjects.length > 0 || metals.length === 0) {
    revenueQuality = 'not_computable';
    physicalAuEq = {
      value: null,
      quality: 'not_computable',
      reasons: missingProductionProjects.length > 0
        ? missingProductionProjects.map((projectId) => `${projectId}: production completeness is unresolved`)
        : ['No production metals are available for the selected year/case'],
    };
  }
  diagnostics.push(...physicalAuEq.reasons);

  const usdPerCurrencyUnitByCurrency = args.usdPerCurrencyUnitByCurrency ?? {};
  const allCostDisclosures: CostDisclosure[] = [];
  const costEvaluations: EvaluatedCostDisclosure[] = [];

  for (const project of includedProjects) {
    const evaluated = evaluateProjectCosts({
      project,
      year: context.selectedYear,
      priceMode: context.priceMode,
      deck: priceDeck,
      usdPerCurrencyUnitByCurrency,
    });
    allCostDisclosures.push(...evaluated.disclosures);
    costEvaluations.push(...evaluated.evaluations);
  }

  const corporateCosts = args.producer.corporateCosts ?? [];
  allCostDisclosures.push(...corporateCosts);
  for (const disclosure of corporateCosts) {
    const evaluation = evaluateCostDisclosureForYear(disclosure, {
      year: context.selectedYear,
      priceMode: context.priceMode,
      deck: priceDeck,
      productionItems,
      revenue,
      usdPerCurrencyUnitByCurrency,
    });
    if (evaluation) costEvaluations.push(evaluation);
  }

  const costBuckets = aggregateCanonicalCostBuckets(allCostDisclosures, costEvaluations);
  diagnostics.push(...costBuckets.diagnostics);

  const revenueByMetalUSD = revenueQuality === 'not_computable'
    ? Object.fromEntries(metals.map((metal) => [metal, null]))
    : revenue.revenueByMetalUSD;

  const metrics = metals.length === 0
    ? {
        revenueUSD: null,
        ebitdaUSD: null,
        fcffBeforeGrowthUSD: null,
        fcffAfterGrowthUSD: null,
        diagnostics: ['NO_SELECTED_YEAR_PRODUCTION'],
      }
    : computeCanonicalProducerMetrics({
        revenueByMetalUSD,
        cashOperatingCostsUSD: costBuckets.values.cashOperatingCostsUSD,
        royaltiesUSD: costBuckets.values.royaltiesUSD,
        productionTaxesUSD: costBuckets.values.productionTaxesUSD,
        tcRcUSD: costBuckets.values.tcRcUSD,
        siteGnaUSD: costBuckets.values.siteGnaUSD,
        corporateGnaUSD: costBuckets.values.corporateGnaUSD,
        otherRecurringOperatingCashExpensesUSD: costBuckets.values.otherRecurringOperatingCashExpensesUSD,
        sustainingCapexUSD: costBuckets.values.sustainingCapexUSD,
        sustainingExplorationDevelopmentUSD: costBuckets.values.sustainingExplorationDevelopmentUSD,
        cashTaxesUSD: costBuckets.values.cashTaxesUSD,
        workingCapitalDeltaUSD: costBuckets.values.workingCapitalDeltaUSD,
        otherRecurringNonEbitdaCashSpendUSD: costBuckets.values.otherRecurringNonEbitdaCashSpendUSD,
        growthCapexUSD: costBuckets.values.growthCapexUSD,
        growthExplorationDevelopmentUSD: costBuckets.values.growthExplorationDevelopmentUSD,
      });
  diagnostics.push(...metrics.diagnostics);

  const ebitdaQuality = metrics.ebitdaUSD === null
    ? 'not_computable'
    : combineMetricQuality([revenueQuality, bucketQuality(costBuckets, EBITDA_BUCKETS)]);
  const fcffBeforeGrowthQuality = metrics.fcffBeforeGrowthUSD === null
    ? 'not_computable'
    : combineMetricQuality([ebitdaQuality, bucketQuality(costBuckets, PRE_GROWTH_BUCKETS)]);
  const fcffAfterGrowthQuality = metrics.fcffAfterGrowthUSD === null
    ? 'not_computable'
    : combineMetricQuality([fcffBeforeGrowthQuality, bucketQuality(costBuckets, GROWTH_BUCKETS)]);

  return {
    companyId: args.producer.company.id,
    selectedYear: context.selectedYear,
    context,
    priceDeck,
    includedProjectIds: includedProjects.map((project) => project.id),
    productionItems,
    producedByMetal,
    revenueQuantityByMetal,
    revenueByMetalUSD,
    physicalAuEqOz: physicalAuEq.value,
    costEvaluations,
    costBucketsUSD: costBuckets.values,
    metrics,
    quality: {
      revenue: revenueQuality,
      physicalAuEq: calculationQualityToMetricQuality(physicalAuEq.quality),
      ebitda: ebitdaQuality,
      fcffBeforeGrowth: fcffBeforeGrowthQuality,
      fcffAfterGrowth: fcffAfterGrowthQuality,
    },
    diagnostics: unique(diagnostics),
  };
}
