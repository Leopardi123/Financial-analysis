import { convertPriceToCanonical } from '../prices/units/convert.ts';
import { resolveOwnershipForYear } from './ownership.ts';
import type { ResolvedProducerPriceDeck } from './priceDeck.ts';
import type { CalculationQuality, NormalizedProductionDisclosure } from './production.ts';
import type {
  CostDenominator,
  CostDisclosure,
  NumericClaim,
  ProducerPriceMode,
  ProducerProject,
} from './types.ts';

export type CostCalculationQuality = CalculationQuality | 'reported_only' | 'excluded';

export type RevenueForCostEvaluation = {
  revenueByMetalUSD: Record<string, number | null>;
  totalRevenueUSD: number | null;
  quality: CalculationQuality;
  reasons: string[];
};

export type CostEvaluationContext = {
  year: number;
  priceMode: ProducerPriceMode;
  deck: ResolvedProducerPriceDeck;
  productionItems: readonly NormalizedProductionDisclosure[];
  revenue: RevenueForCostEvaluation;
  usdPerCurrencyUnitByCurrency: Readonly<Record<string, number>>;
  project?: ProducerProject;
};

export type EvaluatedCostDisclosure = {
  disclosureId: string;
  component: CostDisclosure['component'];
  canonicalClassification: CostDisclosure['canonicalClassification'];
  valueUSD: number | null;
  quality: CostCalculationQuality;
  reasons: string[];
};

export type CanonicalCostBucketName =
  | 'cashOperatingCostsUSD'
  | 'royaltiesUSD'
  | 'productionTaxesUSD'
  | 'tcRcUSD'
  | 'siteGnaUSD'
  | 'corporateGnaUSD'
  | 'otherRecurringOperatingCashExpensesUSD'
  | 'sustainingCapexUSD'
  | 'sustainingExplorationDevelopmentUSD'
  | 'cashTaxesUSD'
  | 'workingCapitalDeltaUSD'
  | 'otherRecurringNonEbitdaCashSpendUSD'
  | 'growthCapexUSD'
  | 'growthExplorationDevelopmentUSD';

export type CanonicalCostBuckets = {
  values: Record<CanonicalCostBucketName, number | null>;
  qualityByBucket: Record<CanonicalCostBucketName, CostCalculationQuality | 'missing'>;
  diagnostics: string[];
};

const ALL_BUCKETS: readonly CanonicalCostBucketName[] = [
  'cashOperatingCostsUSD',
  'royaltiesUSD',
  'productionTaxesUSD',
  'tcRcUSD',
  'siteGnaUSD',
  'corporateGnaUSD',
  'otherRecurringOperatingCashExpensesUSD',
  'sustainingCapexUSD',
  'sustainingExplorationDevelopmentUSD',
  'cashTaxesUSD',
  'workingCapitalDeltaUSD',
  'otherRecurringNonEbitdaCashSpendUSD',
  'growthCapexUSD',
  'growthExplorationDevelopmentUSD',
] as const;

const LB_PER_TONNE = 2204.6226218487757;

function periodResolution(disclosure: CostDisclosure, year: number): { applies: boolean; exactYear: boolean; reason?: string } {
  if (disclosure.period.kind === 'not_periodized') {
    return {
      applies: false,
      exactYear: false,
      reason: `not_periodized cost disclosure (${disclosure.period.label}) is evidence only and cannot be assigned to ${year}`,
    };
  }
  if (disclosure.period.kind === 'year') {
    return { applies: disclosure.period.year === year, exactYear: disclosure.period.year === year };
  }
  const inRange = year >= disclosure.period.startYear && year <= disclosure.period.endYear;
  if (!inRange) return { applies: false, exactYear: false };
  return {
    applies: true,
    exactYear: false,
    reason: `${disclosure.period.kind} cost disclosure ${disclosure.period.startYear}-${disclosure.period.endYear} must not be materialized as a precise ${year} value`,
  };
}

function scalarClaim(claim: NumericClaim): { value: number | null; quality: CalculationQuality; reason?: string } {
  if (claim.kind === 'point') {
    return Number.isFinite(claim.value)
      ? { value: claim.value, quality: 'exact' }
      : { value: null, quality: 'not_computable', reason: 'Point claim is non-finite' };
  }
  if (claim.kind === 'approximate') {
    return Number.isFinite(claim.value)
      ? { value: claim.value, quality: 'approximation' }
      : { value: null, quality: 'not_computable', reason: 'Approximate claim is non-finite' };
  }
  return {
    value: null,
    quality: 'not_computable',
    reason: `${claim.kind} cost claim must not be collapsed to a point estimate`,
  };
}

function combineQuality(a: CostCalculationQuality, b: CostCalculationQuality): CostCalculationQuality {
  if (a === 'not_computable' || b === 'not_computable') return 'not_computable';
  if (a === 'reported_only' || b === 'reported_only') return 'reported_only';
  if (a === 'approximation' || b === 'approximation') return 'approximation';
  if (a === 'excluded') return b;
  if (b === 'excluded') return a;
  return 'exact';
}

function currencyToUsd(
  amount: number,
  currency: string,
  usdPerCurrencyUnitByCurrency: Readonly<Record<string, number>>,
): { valueUSD: number | null; reason?: string } {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency === 'USD') return { valueUSD: amount };
  const rate = usdPerCurrencyUnitByCurrency[normalizedCurrency];
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      valueUSD: null,
      reason: `Missing explicit USD-per-${normalizedCurrency} FX rate; currency conversion must not be guessed`,
    };
  }
  return { valueUSD: amount * rate };
}

function absoluteBasisFactor(
  disclosure: CostDisclosure,
  context: CostEvaluationContext,
): { factor: number | null; reason?: string } {
  if (disclosure.economicBasis !== 'project_100pct') return { factor: 1 };
  if (!context.project) {
    return { factor: null, reason: 'project_100pct absolute cost requires a project ownership context' };
  }
  const ownership = resolveOwnershipForYear(context.project.ownership, context.year);
  if (ownership.status !== 'exact') return { factor: null, reason: ownership.reason };
  return { factor: ownership.ownershipPct };
}

function convertDenominatorQuantity(value: number, fromUnit: 'toz' | 'tonne', toUnit: CostDenominator['unit']): number | null {
  if (fromUnit === 'toz') return toUnit === 'toz' ? value : null;
  if (toUnit === 'tonne') return value;
  if (toUnit === 'lb') return value * LB_PER_TONNE;
  return null;
}

function productionItemScalar(item: NormalizedProductionDisclosure): { value: number | null; quality: CalculationQuality; reason?: string } {
  if (!item.claim || !item.unit || item.quality === 'not_computable') {
    return { value: null, quality: 'not_computable', reason: item.reason ?? 'Production denominator is not computable' };
  }
  if (item.claim.kind === 'point' || item.claim.kind === 'approximate') {
    return { value: item.claim.value, quality: item.quality };
  }
  return { value: null, quality: 'not_computable', reason: `${item.claim.kind} production denominator is not scalar` };
}

function resolveDenominator(
  denominator: CostDenominator,
  context: CostEvaluationContext,
): { value: number | null; quality: CalculationQuality; reasons: string[] } {
  const scopeItems = context.project
    ? context.productionItems.filter((item) => item.projectId === context.project?.id)
    : context.productionItems;
  const candidates = scopeItems.filter((item) => item.metal === denominator.metal && item.measure === denominator.measure);
  if (candidates.length === 0) {
    return {
      value: null,
      quality: 'not_computable',
      reasons: [`Missing ${denominator.metal} ${denominator.measure} denominator for cost model`],
    };
  }

  const byProject = new Map<string, NormalizedProductionDisclosure[]>();
  for (const candidate of candidates) {
    const list = byProject.get(candidate.projectId) ?? [];
    list.push(candidate);
    byProject.set(candidate.projectId, list);
  }

  let total = 0;
  let quality: CalculationQuality = 'exact';
  const reasons: string[] = [];
  for (const [projectId, items] of byProject.entries()) {
    if (items.length !== 1) {
      quality = 'not_computable';
      reasons.push(`${projectId}/${denominator.metal}: multiple ${denominator.measure} disclosures; denominator source precedence is unresolved`);
      continue;
    }
    const item = items[0];
    const scalar = productionItemScalar(item);
    if (scalar.value === null || !item.unit) {
      quality = 'not_computable';
      reasons.push(`${projectId}/${denominator.metal}: ${scalar.reason ?? 'denominator unavailable'}`);
      continue;
    }
    const converted = convertDenominatorQuantity(scalar.value, item.unit, denominator.unit);
    if (converted === null) {
      quality = 'not_computable';
      reasons.push(`${projectId}/${denominator.metal}: cannot convert ${item.unit} production to denominator unit ${denominator.unit}`);
      continue;
    }
    total += converted;
    if (scalar.quality === 'approximation' && quality === 'exact') quality = 'approximation';
  }

  return { value: quality === 'not_computable' ? null : total, quality, reasons };
}

function validateCostSign(disclosure: CostDisclosure, valueUSD: number): string | null {
  if (!Number.isFinite(valueUSD)) return 'Cost result is non-finite';
  if (disclosure.component === 'working_capital_delta') return null;
  return valueUSD < 0 ? 'Cost spend must be non-negative' : null;
}

function fixedAmountResult(
  disclosure: CostDisclosure,
  amount: NumericClaim,
  currency: string,
  context: CostEvaluationContext,
): EvaluatedCostDisclosure {
  const scalar = scalarClaim(amount);
  if (scalar.value === null) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [scalar.reason ?? 'Cost amount is not computable'],
    };
  }
  const converted = currencyToUsd(scalar.value, currency, context.usdPerCurrencyUnitByCurrency);
  if (converted.valueUSD === null) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [converted.reason ?? 'FX conversion failed'],
    };
  }
  const basis = absoluteBasisFactor(disclosure, context);
  if (basis.factor === null) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [basis.reason ?? 'Ownership basis unresolved'],
    };
  }
  const valueUSD = converted.valueUSD * basis.factor;
  const signIssue = validateCostSign(disclosure, valueUSD);
  if (signIssue) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [signIssue],
    };
  }
  return {
    disclosureId: disclosure.id,
    component: disclosure.component,
    canonicalClassification: disclosure.canonicalClassification,
    valueUSD,
    quality: scalar.quality,
    reasons: [],
  };
}

function perUnitResult(
  disclosure: CostDisclosure,
  amount: NumericClaim,
  currency: string,
  denominator: CostDenominator,
  netOfByproductCredits: boolean | undefined,
  context: CostEvaluationContext,
): EvaluatedCostDisclosure {
  if (netOfByproductCredits) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: ['Per-unit cost is net of by-product credits and cannot be used as canonical cost while by-product metal revenue is modeled separately'],
    };
  }
  const scalar = scalarClaim(amount);
  if (scalar.value === null || scalar.value < 0) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [scalar.reason ?? 'Per-unit cost must be non-negative scalar'],
    };
  }
  const rate = currencyToUsd(scalar.value, currency, context.usdPerCurrencyUnitByCurrency);
  if (rate.valueUSD === null) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [rate.reason ?? 'FX conversion failed'],
    };
  }
  const quantity = resolveDenominator(denominator, context);
  if (quantity.value === null) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: quantity.reasons,
    };
  }
  return {
    disclosureId: disclosure.id,
    component: disclosure.component,
    canonicalClassification: disclosure.canonicalClassification,
    valueUSD: rate.valueUSD * quantity.value,
    quality: combineQuality(scalar.quality, quantity.quality),
    reasons: quantity.reasons,
  };
}

function percentRevenueResult(
  disclosure: CostDisclosure,
  context: CostEvaluationContext,
): EvaluatedCostDisclosure {
  if (disclosure.model.type !== 'percent_revenue') throw new Error('percentRevenueResult requires percent_revenue model');
  const rate = scalarClaim(disclosure.model.rate);
  if (rate.value === null || rate.value < 0 || rate.value > 1) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [rate.reason ?? 'Percent-revenue rate must be a decimal fraction between 0 and 1'],
    };
  }
  const revenue = disclosure.model.revenueScope.type === 'total_metal_revenue'
    ? context.revenue.totalRevenueUSD
    : context.revenue.revenueByMetalUSD[disclosure.model.revenueScope.metal] ?? null;
  if (revenue === null || !Number.isFinite(revenue)) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [`Revenue base for ${disclosure.id} is not computable under selected price deck`],
    };
  }
  return {
    disclosureId: disclosure.id,
    component: disclosure.component,
    canonicalClassification: disclosure.canonicalClassification,
    valueUSD: revenue * rate.value,
    quality: combineQuality(rate.quality, context.revenue.quality),
    reasons: [...context.revenue.reasons],
  };
}

function selectedDriverPrice(
  driverMetal: string,
  driverPriceUnit: string,
  deck: ResolvedProducerPriceDeck,
): { value: number | null; reason?: string } {
  const price = deck.pricesByMetal[driverMetal];
  if (!price || price.valueUSD === null) {
    return { value: null, reason: `${driverMetal}: selected deck has no usable price for price-linked cost` };
  }
  try {
    return {
      value: convertPriceToCanonical({
        value: price.valueUSD,
        fromUnit: price.unit,
        canonicalUnit: driverPriceUnit,
      }),
    };
  } catch (error) {
    return {
      value: null,
      reason: error instanceof Error ? `${driverMetal}: ${error.message}` : `${driverMetal}: driver price conversion failed`,
    };
  }
}

function priceLinkedResult(
  disclosure: CostDisclosure,
  context: CostEvaluationContext,
): EvaluatedCostDisclosure {
  if (disclosure.model.type !== 'price_linked') throw new Error('priceLinkedResult requires price_linked model');
  const reference = scalarClaim(disclosure.model.referenceValue);
  if (reference.value === null) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [reference.reason ?? 'Price-linked reference value is not computable'],
    };
  }

  let adjusted = reference.value;
  const reasons: string[] = [];
  for (const sensitivity of disclosure.model.sensitivities) {
    if (!Number.isFinite(sensitivity.referencePrice) || !Number.isFinite(sensitivity.slope)) {
      return {
        disclosureId: disclosure.id,
        component: disclosure.component,
        canonicalClassification: disclosure.canonicalClassification,
        valueUSD: null,
        quality: 'not_computable',
        reasons: [`${sensitivity.driverMetal}: price-linked reference price and slope must be finite`],
      };
    }
    const driver = selectedDriverPrice(sensitivity.driverMetal, sensitivity.driverPriceUnit, context.deck);
    if (driver.value === null) {
      return {
        disclosureId: disclosure.id,
        component: disclosure.component,
        canonicalClassification: disclosure.canonicalClassification,
        valueUSD: null,
        quality: 'not_computable',
        reasons: [driver.reason ?? `${sensitivity.driverMetal}: price unavailable`],
      };
    }
    adjusted += (driver.value - sensitivity.referencePrice) * sensitivity.slope;
    reasons.push(`${sensitivity.driverMetal}: repriced from ${sensitivity.referencePrice} ${sensitivity.driverPriceUnit}`);
  }

  if (!Number.isFinite(adjusted) || (disclosure.component !== 'working_capital_delta' && adjusted < 0)) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: ['Price-linked cost result is non-finite or negative'],
    };
  }

  if (disclosure.model.output.kind === 'per_unit') {
    const result = perUnitResult(
      disclosure,
      { kind: reference.quality === 'approximation' ? 'approximate' : 'point', value: adjusted },
      disclosure.model.output.currency,
      disclosure.model.output.denominator,
      disclosure.model.output.netOfByproductCredits,
      context,
    );
    return { ...result, reasons: [...reasons, ...result.reasons] };
  }

  const result = fixedAmountResult(
    disclosure,
    { kind: reference.quality === 'approximation' ? 'approximate' : 'point', value: adjusted },
    disclosure.model.output.currency,
    context,
  );
  return { ...result, reasons: [...reasons, ...result.reasons] };
}

function reportedTotalResult(
  disclosure: CostDisclosure,
  context: CostEvaluationContext,
): EvaluatedCostDisclosure {
  if (disclosure.model.type !== 'reported_total') throw new Error('reportedTotalResult requires reported_total model');
  if (disclosure.model.priceSensitivity === 'unknown') {
    if (context.priceMode !== 'REPORTED') {
      return {
        disclosureId: disclosure.id,
        component: disclosure.component,
        canonicalClassification: disclosure.canonicalClassification,
        valueUSD: null,
        quality: 'not_computable',
        reasons: ['Reported total has unknown price sensitivity and cannot be presented as SPOT/LT-normalized cost'],
      };
    }
    if (disclosure.model.sourcePriceDeckRef && context.deck.sourceReportedDeckId !== disclosure.model.sourcePriceDeckRef) {
      return {
        disclosureId: disclosure.id,
        component: disclosure.component,
        canonicalClassification: disclosure.canonicalClassification,
        valueUSD: null,
        quality: 'not_computable',
        reasons: [`Reported total belongs to price deck ${disclosure.model.sourcePriceDeckRef}, not selected deck ${context.deck.sourceReportedDeckId ?? 'unknown'}`],
      };
    }
  }

  const result = fixedAmountResult(disclosure, disclosure.model.amount, disclosure.model.currency, context);
  if (result.quality === 'not_computable') return result;
  return {
    ...result,
    quality: disclosure.model.priceSensitivity === 'unknown' ? 'reported_only' : result.quality,
  };
}

export function evaluateCostDisclosureForYear(
  disclosure: CostDisclosure,
  context: CostEvaluationContext,
): EvaluatedCostDisclosure | null {
  const period = periodResolution(disclosure, context.year);
  if (!period.applies) return null;
  if (!period.exactYear) {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: [period.reason ?? 'Cost period is not an exact selected year'],
    };
  }

  if (disclosure.canonicalClassification === 'excluded' || disclosure.canonicalClassification === 'noncash') {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: 0,
      quality: 'excluded',
      reasons: [],
    };
  }
  if (disclosure.canonicalClassification === 'unknown') {
    return {
      disclosureId: disclosure.id,
      component: disclosure.component,
      canonicalClassification: disclosure.canonicalClassification,
      valueUSD: null,
      quality: 'not_computable',
      reasons: ['Canonical cost classification is unknown'],
    };
  }

  switch (disclosure.model.type) {
    case 'fixed_amount':
      return fixedAmountResult(disclosure, disclosure.model.amount, disclosure.model.currency, context);
    case 'per_unit':
      return perUnitResult(
        disclosure,
        disclosure.model.amount,
        disclosure.model.currency,
        disclosure.model.denominator,
        disclosure.model.netOfByproductCredits,
        context,
      );
    case 'percent_revenue':
      return percentRevenueResult(disclosure, context);
    case 'price_linked':
      return priceLinkedResult(disclosure, context);
    case 'reported_total':
      return reportedTotalResult(disclosure, context);
    case 'derived':
      return {
        disclosureId: disclosure.id,
        component: disclosure.component,
        canonicalClassification: disclosure.canonicalClassification,
        valueUSD: null,
        quality: 'not_computable',
        reasons: [`Derived cost method ${disclosure.model.method} requires an explicit implementation; generic evaluation is forbidden`],
      };
  }
}

function bucketForDisclosure(disclosure: CostDisclosure): CanonicalCostBucketName | null {
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
      if (disclosure.component === 'growth_capex') return 'growthCapexUSD';
      return 'growthExplorationDevelopmentUSD';
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

export function aggregateCanonicalCostBuckets(
  disclosures: readonly CostDisclosure[],
  evaluations: readonly EvaluatedCostDisclosure[],
): CanonicalCostBuckets {
  const values = Object.fromEntries(ALL_BUCKETS.map((bucket) => [bucket, null])) as Record<CanonicalCostBucketName, number | null>;
  const qualityByBucket = Object.fromEntries(ALL_BUCKETS.map((bucket) => [bucket, 'missing'])) as Record<CanonicalCostBucketName, CostCalculationQuality | 'missing'>;
  const diagnostics: string[] = [];
  const blockedBuckets = new Set<CanonicalCostBucketName>();
  const disclosureById = new Map(disclosures.map((disclosure) => [disclosure.id, disclosure]));

  for (const evaluation of evaluations) {
    const disclosure = disclosureById.get(evaluation.disclosureId);
    if (!disclosure) {
      diagnostics.push(`Missing source disclosure for evaluation ${evaluation.disclosureId}`);
      continue;
    }
    if (evaluation.quality === 'excluded') continue;
    const bucket = bucketForDisclosure(disclosure);
    if (!bucket) {
      diagnostics.push(`${disclosure.id}: classification/component pair cannot be mapped to a canonical cost bucket`);
      continue;
    }
    if (evaluation.valueUSD === null || evaluation.quality === 'not_computable') {
      values[bucket] = null;
      qualityByBucket[bucket] = 'not_computable';
      blockedBuckets.add(bucket);
      diagnostics.push(...evaluation.reasons.map((reason) => `${disclosure.id}: ${reason}`));
      continue;
    }
    if (blockedBuckets.has(bucket)) continue;

    const previous = values[bucket] ?? 0;
    values[bucket] = previous + evaluation.valueUSD;
    const previousQuality = qualityByBucket[bucket];
    qualityByBucket[bucket] = previousQuality === 'missing'
      ? evaluation.quality
      : combineQuality(previousQuality as CostCalculationQuality, evaluation.quality);
    diagnostics.push(...evaluation.reasons.map((reason) => `${disclosure.id}: ${reason}`));
  }

  return { values, qualityByBucket, diagnostics };
}
