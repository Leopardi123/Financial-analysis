import {
  aggregateCanonicalCostBuckets,
  evaluateCostDisclosureForYear,
  type CanonicalCostBucketName,
  type CostCalculationQuality,
  type EvaluatedCostDisclosure,
} from './costs.ts';
import { resolveProducerMarketValue, type ProducerMarketValueResult } from './marketValue.ts';
import { computeCanonicalProducerMetrics } from './metrics.ts';
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
import { computeProducerValuationMultiples } from './valuation.ts';
import type { CostDisclosure, ProducerJsonV1, ProducerProject, ProducerRunContext } from './types.ts';

export type ProducerMetricQuality = 'exact' | 'approximation' | 'reported_only' | 'not_computable';

export type ProducerNormalizedMetrics = {
  revenueUSD: number | null;
  ebitdaUSD: number | null;
  fcffBeforeGrowthUSD: number | null;
  fcffAfterGrowthUSD: number | null;
};

export type ProducerCompanyYearNormalization = {
  companyId: string;
  companyName: string;
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
  metrics: ProducerNormalizedMetrics;
  quality: {
    revenue: ProducerMetricQuality;
    physicalAuEq: ProducerMetricQuality;
    ebitda: ProducerMetricQuality;
    fcffBeforeGrowth: ProducerMetricQuality;
    fcffAfterGrowth: ProducerMetricQuality;
  };
  marketValue: ProducerMarketValueResult;
  multiples: {
    evToEbitda: number | null;
    evToFcffBeforeGrowth: number | null;
    evToFcffAfterGrowth: number | null;
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

const PROJECT_EBITDA_BUCKETS: readonly CanonicalCostBucketName[] = [
  'cashOperatingCostsUSD',
  'royaltiesUSD',
  'productionTaxesUSD',
  'tcRcUSD',
  'siteGnaUSD',
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

function bucketsAvailable(
  buckets: ReturnType<typeof aggregateCanonicalCostBuckets>,
  names: readonly CanonicalCostBucketName[],
): boolean {
  return names.every((name) => buckets.values[name] !== null);
}

function bucketValue(
  buckets: ReturnType<typeof aggregateCanonicalCostBuckets>,
  name: CanonicalCostBucketName,
): number {
  const value = buckets.values[name];
  if (value === null) throw new Error(`${name} unexpectedly missing after availability check`);
  return value;
}

function missingBucketDiagnostics(
  buckets: ReturnType<typeof aggregateCanonicalCostBuckets>,
  names: readonly CanonicalCostBucketName[],
  metric: string,
): string[] {
  return names
    .filter((name) => buckets.values[name] === null)
    .map((name) => `${metric}: ${name} is ${buckets.qualityByBucket[name]}; explicit zero is required when the economic amount is zero`);
}

function coverageBucket(disclosure: CostDisclosure): CanonicalCostBucketName | null {
  switch (disclosure.canonicalClassification) {
    case 'operating':
      switch (disclosure.component) {
        case 'cash_operating_cost': return 'cashOperatingCostsUSD';
        case 'royalty': return 'royaltiesUSD';
        case 'production_tax': return 'productionTaxesUSD';
        case 'tc_rc': return 'tcRcUSD';
        case 'site_gna': return 'siteGnaUSD';
        case 'corporate_gna': return 'corporateGnaUSD';
        default: return 'otherRecurringOperatingCashExpensesUSD';
      }
    case 'sustaining':
      if (disclosure.component === 'sustaining_capex') return 'sustainingCapexUSD';
      if (
        disclosure.component === 'sustaining_exploration'
        || disclosure.component === 'deferred_stripping'
        || disclosure.component === 'underground_development'
      ) return 'sustainingExplorationDevelopmentUSD';
      return 'otherRecurringNonEbitdaCashSpendUSD';
    case 'growth':
      return disclosure.component === 'growth_capex' ? 'growthCapexUSD' : 'growthExplorationDevelopmentUSD';
    case 'tax':
      return disclosure.component === 'cash_income_tax' ? 'cashTaxesUSD' : null;
    case 'working_capital':
      return disclosure.component === 'working_capital_delta' ? 'workingCapitalDeltaUSD' : null;
    case 'noncash':
    case 'excluded':
    case 'unknown':
      return null;
  }
}

function projectHasAnySelectedYearProductionDisclosure(project: ProducerProject, year: number): boolean {
  return project.production.some((item) => periodAppliesToYear(item.period, year));
}

function disclosureCoversBucket(disclosure: CostDisclosure, bucket: CanonicalCostBucketName, year: number): boolean {
  return periodAppliesToYear(disclosure.period, year) && coverageBucket(disclosure) === bucket;
}

function projectCostCoverage(args: {
  projects: readonly ProducerProject[];
  corporateCosts: readonly CostDisclosure[];
  year: number;
  buckets: readonly CanonicalCostBucketName[];
}): { complete: boolean; diagnostics: string[] } {
  const diagnostics: string[] = [];
  for (const bucket of args.buckets) {
    const companyLevelCoverage = args.corporateCosts.some((disclosure) => disclosureCoversBucket(disclosure, bucket, args.year));
    if (companyLevelCoverage) continue;

    for (const project of args.projects) {
      if (!projectHasAnySelectedYearProductionDisclosure(project, args.year)) continue;
      const projectCoverage = (project.costs ?? []).some((disclosure) => disclosureCoversBucket(disclosure, bucket, args.year));
      if (!projectCoverage) {
        diagnostics.push(`PROJECT_COST_COVERAGE_MISSING: ${project.id}/${bucket}; another project's cost must not stand in for this project`);
      }
    }
  }
  return { complete: diagnostics.length === 0, diagnostics };
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

function collectRequiredMetals(projects: readonly ProducerProject[], corporateCosts: readonly CostDisclosure[]): string[] {
  const metals = new Set<string>();
  const inspectCost = (cost: CostDisclosure) => {
    if (cost.model.type === 'per_unit') metals.add(cost.model.denominator.metal);
    if (cost.model.type === 'price_linked') {
      if (cost.model.output.kind === 'per_unit') metals.add(cost.model.output.denominator.metal);
      for (const sensitivity of cost.model.sensitivities) metals.add(sensitivity.driverMetal);
    }
    if (cost.model.type === 'percent_revenue' && cost.model.revenueScope.type === 'metal') {
      metals.add(cost.model.revenueScope.metal);
    }
  };
  for (const project of projects) {
    for (const item of project.production) metals.add(item.metal);
    for (const cost of project.costs ?? []) inspectCost(cost);
  }
  for (const cost of corporateCosts) inspectCost(cost);
  if (metals.size > 0) metals.add('Au');
  return [...metals].sort();
}

function numericRevenueMap(values: Record<string, number | null>): Record<string, number> | null {
  const output: Record<string, number> = {};
  for (const [metal, value] of Object.entries(values)) {
    if (value === null || !Number.isFinite(value)) return null;
    output[metal] = value;
  }
  return Object.keys(output).length > 0 ? output : null;
}

export async function normalizeProducerCompanyYear(
  args: NormalizeProducerCompanyYearArgs,
  deps: NonNullable<Parameters<typeof resolveProducerPriceDeck>[1]> = {},
): Promise<ProducerCompanyYearNormalization> {
  validateProducerJsonV1(args.producer);
  const context = validateProducerRunContext(args.context);
  if (args.producer.valuation.valuationDateUtc !== context.valuationDateUtc) {
    throw new Error(
      `Producer valuationDateUtc ${args.producer.valuation.valuationDateUtc} does not match run context ${context.valuationDateUtc}`,
    );
  }

  const includedProjects = args.producer.projects.filter((project) => isProjectIncludedInCase(project.statusAsOfValuationDate, context.caseMode));
  const corporateCosts = args.producer.corporateCosts ?? [];
  const metals = collectRequiredMetals(includedProjects, corporateCosts);
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

  const operatingCoverage = projectCostCoverage({
    projects: includedProjects,
    corporateCosts,
    year: context.selectedYear,
    buckets: PROJECT_EBITDA_BUCKETS,
  });
  const preGrowthCoverage = projectCostCoverage({
    projects: includedProjects,
    corporateCosts,
    year: context.selectedYear,
    buckets: PRE_GROWTH_BUCKETS,
  });
  const growthCoverage = projectCostCoverage({
    projects: includedProjects,
    corporateCosts,
    year: context.selectedYear,
    buckets: GROWTH_BUCKETS,
  });
  diagnostics.push(...operatingCoverage.diagnostics, ...preGrowthCoverage.diagnostics, ...growthCoverage.diagnostics);

  const revenueByMetalUSD = revenueQuality === 'not_computable'
    ? Object.fromEntries(metals.map((metal) => [metal, null]))
    : revenue.revenueByMetalUSD;
  const revenueMap = revenueQuality === 'not_computable' ? null : numericRevenueMap(revenueByMetalUSD);

  const ebitdaCostsAvailable = bucketsAvailable(costBuckets, EBITDA_BUCKETS) && operatingCoverage.complete;
  const preGrowthCostsAvailable = ebitdaCostsAvailable && bucketsAvailable(costBuckets, PRE_GROWTH_BUCKETS) && preGrowthCoverage.complete;
  const afterGrowthCostsAvailable = preGrowthCostsAvailable && bucketsAvailable(costBuckets, GROWTH_BUCKETS) && growthCoverage.complete;

  if (!bucketsAvailable(costBuckets, EBITDA_BUCKETS)) diagnostics.push(...missingBucketDiagnostics(costBuckets, EBITDA_BUCKETS, 'EBITDA'));
  if (!bucketsAvailable(costBuckets, PRE_GROWTH_BUCKETS)) diagnostics.push(...missingBucketDiagnostics(costBuckets, PRE_GROWTH_BUCKETS, 'FCFF before growth'));
  if (!bucketsAvailable(costBuckets, GROWTH_BUCKETS)) diagnostics.push(...missingBucketDiagnostics(costBuckets, GROWTH_BUCKETS, 'FCFF after growth'));

  const hasReportedAisc = args.producer.reportedMetrics?.some((metric) => metric.metric === 'aisc')
    || includedProjects.some((project) => project.reportedMetrics?.some((metric) => metric.metric === 'aisc'));
  if (hasReportedAisc && !ebitdaCostsAvailable) {
    diagnostics.push('AISC_ONLY_NOT_CANONICAL: reported AISC is retained as reported data but is not converted into canonical EBITDA/FCFF');
  }

  let metrics: ProducerNormalizedMetrics = {
    revenueUSD: revenueQuality === 'not_computable' ? null : revenue.totalRevenueUSD,
    ebitdaUSD: null,
    fcffBeforeGrowthUSD: null,
    fcffAfterGrowthUSD: null,
  };

  if (revenueMap && ebitdaCostsAvailable) {
    const calculated = computeCanonicalProducerMetrics({
      revenueByMetalUSD: revenueMap,
      cashOperatingCostsUSD: bucketValue(costBuckets, 'cashOperatingCostsUSD'),
      royaltiesUSD: bucketValue(costBuckets, 'royaltiesUSD'),
      productionTaxesUSD: bucketValue(costBuckets, 'productionTaxesUSD'),
      tcRcUSD: bucketValue(costBuckets, 'tcRcUSD'),
      siteGnaUSD: bucketValue(costBuckets, 'siteGnaUSD'),
      corporateGnaUSD: bucketValue(costBuckets, 'corporateGnaUSD'),
      otherRecurringOperatingCashExpensesUSD: bucketValue(costBuckets, 'otherRecurringOperatingCashExpensesUSD'),
      sustainingCapexUSD: preGrowthCostsAvailable ? bucketValue(costBuckets, 'sustainingCapexUSD') : null,
      sustainingExplorationDevelopmentUSD: preGrowthCostsAvailable ? bucketValue(costBuckets, 'sustainingExplorationDevelopmentUSD') : null,
      cashTaxesUSD: preGrowthCostsAvailable ? bucketValue(costBuckets, 'cashTaxesUSD') : null,
      workingCapitalDeltaUSD: preGrowthCostsAvailable ? bucketValue(costBuckets, 'workingCapitalDeltaUSD') : null,
      otherRecurringNonEbitdaCashSpendUSD: preGrowthCostsAvailable ? bucketValue(costBuckets, 'otherRecurringNonEbitdaCashSpendUSD') : null,
      growthCapexUSD: afterGrowthCostsAvailable ? bucketValue(costBuckets, 'growthCapexUSD') : null,
      growthExplorationDevelopmentUSD: afterGrowthCostsAvailable ? bucketValue(costBuckets, 'growthExplorationDevelopmentUSD') : null,
    });
    diagnostics.push(...calculated.diagnostics);
    metrics = {
      revenueUSD: calculated.revenueUSD,
      ebitdaUSD: calculated.ebitdaUSD,
      fcffBeforeGrowthUSD: preGrowthCostsAvailable ? calculated.fcffBeforeGrowthUSD : null,
      fcffAfterGrowthUSD: afterGrowthCostsAvailable ? calculated.fcffAfterGrowthUSD : null,
    };
  }

  const ebitdaQuality: ProducerMetricQuality = metrics.ebitdaUSD === null
    ? 'not_computable'
    : combineMetricQuality([revenueQuality, bucketQuality(costBuckets, EBITDA_BUCKETS)]);
  const fcffBeforeGrowthQuality: ProducerMetricQuality = metrics.fcffBeforeGrowthUSD === null
    ? 'not_computable'
    : combineMetricQuality([ebitdaQuality, bucketQuality(costBuckets, PRE_GROWTH_BUCKETS)]);
  const fcffAfterGrowthQuality: ProducerMetricQuality = metrics.fcffAfterGrowthUSD === null
    ? 'not_computable'
    : combineMetricQuality([fcffBeforeGrowthQuality, bucketQuality(costBuckets, GROWTH_BUCKETS)]);

  const marketValue = resolveProducerMarketValue({
    producer: args.producer,
    usdPerCurrencyUnitByCurrency,
  });
  diagnostics.push(...marketValue.diagnostics);
  const multiples = marketValue.enterpriseValueUSD === null
    ? { evToEbitda: null, evToFcffBeforeGrowth: null, evToFcffAfterGrowth: null }
    : computeProducerValuationMultiples({
        enterpriseValueUSD: marketValue.enterpriseValueUSD,
        ebitdaUSD: metrics.ebitdaUSD,
        fcffBeforeGrowthUSD: metrics.fcffBeforeGrowthUSD,
        fcffAfterGrowthUSD: metrics.fcffAfterGrowthUSD,
      });

  return {
    companyId: args.producer.company.id,
    companyName: args.producer.company.name,
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
    marketValue,
    multiples,
    diagnostics: unique(diagnostics),
  };
}
