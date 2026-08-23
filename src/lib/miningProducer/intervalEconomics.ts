import { resolveOwnershipForYear } from './ownership.ts';
import { isProjectIncludedInCase } from './production.ts';
import type { ResolvedProducerPriceDeck } from './priceDeck.ts';
import type {
  CostComponent,
  CostDisclosure,
  NumericClaim,
  ProducerCaseMode,
  ProducerJsonV1,
  ProducerProject,
  ProductionDisclosure,
} from './types.ts';

export type ProducerClosedRange = { low: number; high: number };
export type ProducerIntervalQuality = 'exact' | 'approximation' | 'range' | 'not_computable';
export type ProducerIntervalMetric = {
  range: ProducerClosedRange | null;
  quality: ProducerIntervalQuality;
  diagnostics: string[];
};

export type ProducerIntervalEconomics = {
  year: number;
  basis: 'attributable' | 'financial';
  auOz: ProducerIntervalMetric;
  auEqOz: ProducerIntervalMetric;
  revenueUSD: ProducerIntervalMetric;
  ebitdaUSD: ProducerIntervalMetric;
  fcffBeforeGrowthUSD: ProducerIntervalMetric;
  fcffAfterGrowthUSD: ProducerIntervalMetric;
  growthCapexUSD: ProducerIntervalMetric;
  diagnostics: string[];
};

type IntervalArgs = {
  producer: ProducerJsonV1;
  year: number;
  caseMode: ProducerCaseMode;
  deck: ResolvedProducerPriceDeck;
  basis: 'attributable' | 'financial';
  usdPerCurrencyUnitByCurrency?: Readonly<Record<string, number>>;
};

type ProjectQuantities = {
  produced: Record<string, ProducerClosedRange>;
  revenue: Record<string, ProducerClosedRange>;
  quality: ProducerIntervalQuality;
  diagnostics: string[];
};

type CostInterval = {
  disclosure: CostDisclosure;
  range: ProducerClosedRange | null;
  quality: ProducerIntervalQuality;
  diagnostics: string[];
};

const LB_PER_TONNE = 2204.6226218487757;

function range(low: number, high: number): ProducerClosedRange | null {
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) return null;
  return { low, high };
}

function claimRange(claim: NumericClaim): { range: ProducerClosedRange | null; quality: ProducerIntervalQuality; diagnostic?: string } {
  switch (claim.kind) {
    case 'point':
      return Number.isFinite(claim.value)
        ? { range: { low: claim.value, high: claim.value }, quality: 'exact' }
        : { range: null, quality: 'not_computable', diagnostic: 'Non-finite point claim' };
    case 'approximate':
      return Number.isFinite(claim.value)
        ? { range: { low: claim.value, high: claim.value }, quality: 'approximation' }
        : { range: null, quality: 'not_computable', diagnostic: 'Non-finite approximate claim' };
    case 'range': {
      const value = range(claim.low, claim.high);
      return value
        ? { range: value, quality: 'range' }
        : { range: null, quality: 'not_computable', diagnostic: 'Invalid closed range claim' };
    }
    case 'upper_bound':
    case 'lower_bound':
      return { range: null, quality: 'not_computable', diagnostic: `${claim.kind} is open-ended and cannot produce a closed economic interval` };
  }
}

function combineQuality(values: readonly ProducerIntervalQuality[]): ProducerIntervalQuality {
  if (values.includes('not_computable')) return 'not_computable';
  if (values.includes('range')) return 'range';
  if (values.includes('approximation')) return 'approximation';
  return 'exact';
}

function addRange(a: ProducerClosedRange, b: ProducerClosedRange): ProducerClosedRange {
  return { low: a.low + b.low, high: a.high + b.high };
}

function subtractRange(a: ProducerClosedRange, b: ProducerClosedRange): ProducerClosedRange {
  return { low: a.low - b.high, high: a.high - b.low };
}

function multiplyPositiveRanges(a: ProducerClosedRange, b: ProducerClosedRange): ProducerClosedRange {
  return { low: a.low * b.low, high: a.high * b.high };
}

function scaleRange(value: ProducerClosedRange, factor: number): ProducerClosedRange | null {
  if (!Number.isFinite(factor) || factor < 0) return null;
  return { low: value.low * factor, high: value.high * factor };
}

function periodIsExactYear(disclosure: { period: CostDisclosure['period'] }, year: number): boolean {
  return disclosure.period.kind === 'year' && disclosure.period.year === year;
}

function projectActive(project: ProducerProject, year: number, caseMode: ProducerCaseMode): boolean {
  if (!isProjectIncludedInCase(project.statusAsOfValuationDate, caseMode)) return false;
  const window = project.productionWindow;
  if (!window) return true;
  return year >= window.startYear && (window.endYear === undefined || year <= window.endYear);
}

function ownershipFactor(project: ProducerProject, year: number): { factor: number | null; diagnostic?: string } {
  const ownership = resolveOwnershipForYear(project.ownership, year);
  return ownership.status === 'exact'
    ? { factor: ownership.ownershipPct }
    : { factor: null, diagnostic: ownership.reason };
}

function financialFactor(project: ProducerProject, year: number): { factor: number | null; diagnostic?: string } {
  const consolidation = project.financialConsolidation;
  if (consolidation) {
    if (consolidation.method === 'full') return { factor: 1 };
    if (consolidation.method === 'equity_method') return { factor: 0 };
    if (Number.isFinite(consolidation.consolidationPct)) return { factor: consolidation.consolidationPct as number };
    return { factor: null, diagnostic: `${project.id}: proportionate financial consolidation requires consolidationPct` };
  }
  const ownership = ownershipFactor(project, year);
  if (ownership.factor === null) {
    return { factor: null, diagnostic: `${project.id}: financialConsolidation is absent and ownership fallback is unresolved (${ownership.diagnostic})` };
  }
  return { factor: ownership.factor, diagnostic: `${project.id}: financialConsolidation absent; financial interval conservatively falls back to ownershipPct` };
}

function quantityFactor(
  project: ProducerProject,
  disclosure: ProductionDisclosure,
  year: number,
  basis: 'attributable' | 'financial',
): { factor: number | null; diagnostic?: string } {
  if (basis === 'attributable') {
    if (disclosure.basis === 'attributable') return { factor: 1 };
    return ownershipFactor(project, year);
  }

  const financial = financialFactor(project, year);
  if (financial.factor === null) return financial;
  if (disclosure.basis === 'project_100pct') return financial;

  const ownership = ownershipFactor(project, year);
  if (ownership.factor === null || ownership.factor === 0) {
    return { factor: null, diagnostic: `${project.id}: cannot convert attributable production to financial basis without non-zero ownership` };
  }
  return { factor: financial.factor / ownership.factor };
}

function canonicalQuantityFactor(disclosure: ProductionDisclosure): number | null {
  if (disclosure.metal === 'Au' || disclosure.metal === 'Ag' || disclosure.metal === 'Pt' || disclosure.metal === 'Pd') {
    if (disclosure.unit === 'toz') return 1;
    if (disclosure.unit === 'koz') return 1_000;
    if (disclosure.unit === 'Moz') return 1_000_000;
    return null;
  }
  if (disclosure.unit === 'tonne') return 1;
  if (disclosure.unit === 'kt') return 1_000;
  if (disclosure.unit === 'lb') return 1 / LB_PER_TONNE;
  return null;
}

function exactYearCandidates(project: ProducerProject, year: number, metal: string, measure: ProductionDisclosure['measure']): ProductionDisclosure[] {
  return project.production.filter((item) =>
    item.metal === metal
    && item.measure === measure
    && item.period.kind === 'year'
    && item.period.year === year,
  );
}

function normalizeDisclosureRange(
  project: ProducerProject,
  disclosure: ProductionDisclosure,
  year: number,
  basis: 'attributable' | 'financial',
): { range: ProducerClosedRange | null; quality: ProducerIntervalQuality; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const raw = claimRange(disclosure.quantity);
  if (!raw.range) return { range: null, quality: 'not_computable', diagnostics: [raw.diagnostic ?? 'Production claim unavailable'] };
  const unitFactor = canonicalQuantityFactor(disclosure);
  if (unitFactor === null) return { range: null, quality: 'not_computable', diagnostics: [`${project.id}/${disclosure.id}: unsupported unit ${disclosure.unit} for ${disclosure.metal}`] };
  const basisFactor = quantityFactor(project, disclosure, year, basis);
  if (basisFactor.factor === null) return { range: null, quality: 'not_computable', diagnostics: [basisFactor.diagnostic ?? `${project.id}: quantity basis unresolved`] };
  if (basisFactor.diagnostic) diagnostics.push(basisFactor.diagnostic);
  const scaled = scaleRange(raw.range, unitFactor * basisFactor.factor);
  if (!scaled) return { range: null, quality: 'not_computable', diagnostics: [`${project.id}/${disclosure.id}: invalid quantity scaling`] };
  return { range: scaled, quality: raw.quality, diagnostics };
}

function projectQuantities(project: ProducerProject, year: number, basis: 'attributable' | 'financial'): ProjectQuantities {
  const diagnostics: string[] = [];
  const produced: Record<string, ProducerClosedRange> = {};
  const revenue: Record<string, ProducerClosedRange> = {};
  const qualities: ProducerIntervalQuality[] = [];
  const metals = [...new Set(project.production.filter((item) => item.period.kind === 'year' && item.period.year === year).map((item) => item.metal))];

  for (const metal of metals) {
    const producedCandidates = exactYearCandidates(project, year, metal, 'produced');
    if (producedCandidates.length === 1) {
      const normalized = normalizeDisclosureRange(project, producedCandidates[0], year, basis);
      diagnostics.push(...normalized.diagnostics);
      if (normalized.range) {
        produced[metal] = normalized.range;
        qualities.push(normalized.quality);
      }
    } else if (producedCandidates.length > 1) {
      diagnostics.push(`${project.id}/${metal}: multiple produced disclosures for ${year}; source precedence unresolved`);
    }

    let selected: ProductionDisclosure | null = null;
    for (const measure of ['payable', 'sold', 'produced'] as const) {
      const candidates = exactYearCandidates(project, year, metal, measure);
      if (candidates.length > 1) {
        diagnostics.push(`${project.id}/${metal}: multiple ${measure} disclosures for ${year}; revenue precedence unresolved`);
        selected = null;
        break;
      }
      if (candidates.length === 1) {
        selected = candidates[0];
        break;
      }
    }
    if (selected) {
      const normalized = normalizeDisclosureRange(project, selected, year, basis);
      diagnostics.push(...normalized.diagnostics);
      if (normalized.range) {
        revenue[metal] = normalized.range;
        qualities.push(normalized.quality);
        if (selected.measure === 'produced') diagnostics.push(`${project.id}/${metal}: produced used as revenue quantity proxy`);
      }
    }
  }

  return {
    produced,
    revenue,
    quality: qualities.length > 0 ? combineQuality(qualities) : 'not_computable',
    diagnostics,
  };
}

function priceRangeForMetal(deck: ResolvedProducerPriceDeck, metal: string): ProducerClosedRange | null {
  const price = deck.pricesByMetal[metal];
  if (!price || price.valueUSD === null || !Number.isFinite(price.valueUSD) || price.valueUSD < 0) return null;
  return { low: price.valueUSD, high: price.valueUSD };
}

function aggregateRangeMap(values: readonly Record<string, ProducerClosedRange>[]): Record<string, ProducerClosedRange> {
  const out: Record<string, ProducerClosedRange> = {};
  for (const map of values) {
    for (const [metal, value] of Object.entries(map)) {
      out[metal] = out[metal] ? addRange(out[metal], value) : value;
    }
  }
  return out;
}

function revenueFromQuantities(
  quantities: Record<string, ProducerClosedRange>,
  deck: ResolvedProducerPriceDeck,
): ProducerIntervalMetric & { byMetal: Record<string, ProducerClosedRange> } {
  const diagnostics: string[] = [];
  const byMetal: Record<string, ProducerClosedRange> = {};
  let total: ProducerClosedRange = { low: 0, high: 0 };
  const qualities: ProducerIntervalQuality[] = [];
  for (const [metal, quantity] of Object.entries(quantities)) {
    const price = priceRangeForMetal(deck, metal);
    if (!price) {
      diagnostics.push(`${metal}: selected deck lacks usable price for interval revenue`);
      return { range: null, quality: 'not_computable', diagnostics, byMetal };
    }
    const value = multiplyPositiveRanges(quantity, price);
    byMetal[metal] = value;
    total = addRange(total, value);
    qualities.push(quantity.low === quantity.high ? 'exact' : 'range');
  }
  if (Object.keys(quantities).length === 0) return { range: null, quality: 'not_computable', diagnostics: ['No exact-year revenue quantities available'], byMetal };
  return { range: total, quality: combineQuality(qualities), diagnostics, byMetal };
}

function currencyRangeToUsd(
  value: ProducerClosedRange,
  currency: string,
  fx: Readonly<Record<string, number>>,
): { range: ProducerClosedRange | null; diagnostic?: string } {
  const ccy = currency.trim().toUpperCase();
  if (ccy === 'USD') return { range: value };
  const rate = fx[ccy];
  if (!Number.isFinite(rate) || rate <= 0) return { range: null, diagnostic: `Missing explicit USD-per-${ccy} FX rate` };
  return { range: scaleRange(value, rate) };
}

function costBasisFactor(project: ProducerProject | undefined, disclosure: CostDisclosure, year: number, basis: 'attributable' | 'financial'): { factor: number | null; diagnostic?: string } {
  if (disclosure.economicBasis === 'company' || disclosure.economicBasis === 'attributable') return { factor: 1 };
  if (!project) return { factor: null, diagnostic: `${disclosure.id}: project_100pct cost lacks project context` };
  return basis === 'financial' ? financialFactor(project, year) : ownershipFactor(project, year);
}

function rawProjectDenominator(
  project: ProducerProject,
  disclosure: CostDisclosure,
  year: number,
  metal: string,
  measure: ProductionDisclosure['measure'],
  unit: 'toz' | 'tonne' | 'lb',
  basis: 'attributable' | 'financial',
): { range: ProducerClosedRange | null; quality: ProducerIntervalQuality; diagnostics: string[] } {
  const candidates = exactYearCandidates(project, year, metal, measure);
  if (candidates.length !== 1) return { range: null, quality: 'not_computable', diagnostics: [`${project.id}/${metal}: requires exactly one ${measure} disclosure for ${year}`] };
  const source = candidates[0];
  const raw = claimRange(source.quantity);
  if (!raw.range) return { range: null, quality: 'not_computable', diagnostics: [raw.diagnostic ?? `${source.id}: denominator unavailable`] };
  const canonicalFactor = canonicalQuantityFactor(source);
  if (canonicalFactor === null) return { range: null, quality: 'not_computable', diagnostics: [`${source.id}: unsupported denominator unit ${source.unit}`] };

  let sourceToEconomicFactor = 1;
  if (disclosure.economicBasis === 'project_100pct') {
    if (source.basis !== 'project_100pct') return { range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: project_100pct per-unit cost requires project_100pct denominator disclosure; attributable inversion is not guessed`] };
  } else {
    const normalizedFactor = quantityFactor(project, source, year, basis);
    if (normalizedFactor.factor === null) return { range: null, quality: 'not_computable', diagnostics: [normalizedFactor.diagnostic ?? `${disclosure.id}: denominator basis unresolved`] };
    sourceToEconomicFactor = normalizedFactor.factor;
  }

  let conversion = canonicalFactor * sourceToEconomicFactor;
  if (unit === 'lb') conversion *= LB_PER_TONNE;
  else if (unit === 'toz' && metal !== 'Au' && metal !== 'Ag' && metal !== 'Pt' && metal !== 'Pd') return { range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: base-metal denominator cannot convert to toz`] };
  else if (unit === 'tonne' && (metal === 'Au' || metal === 'Ag' || metal === 'Pt' || metal === 'Pd')) return { range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: precious-metal denominator cannot convert to tonne`] };
  const scaled = scaleRange(raw.range, conversion);
  return scaled ? { range: scaled, quality: raw.quality, diagnostics: [] } : { range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: denominator scaling failed`] };
}

function projectHasSeparateByproductRevenue(project: ProducerProject, year: number, denominatorMetal: string): boolean {
  return project.production.some((item) =>
    item.period.kind === 'year'
    && item.period.year === year
    && item.metal !== denominatorMetal
    && (item.measure === 'payable' || item.measure === 'sold' || item.measure === 'produced'),
  );
}

function evaluateCost(
  disclosure: CostDisclosure,
  project: ProducerProject | undefined,
  args: IntervalArgs,
  projectRevenue: ProducerClosedRange | null,
  companyRevenue: ProducerClosedRange | null,
): CostInterval {
  if (!periodIsExactYear(disclosure, args.year)) return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: interval economics require exact-year cost disclosure`] };
  const diagnostics: string[] = [];
  const model = disclosure.model;
  const basisFactor = costBasisFactor(project, disclosure, args.year, args.basis);
  if (basisFactor.factor === null) return { disclosure, range: null, quality: 'not_computable', diagnostics: [basisFactor.diagnostic ?? `${disclosure.id}: cost basis unresolved`] };
  if (basisFactor.diagnostic) diagnostics.push(basisFactor.diagnostic);

  const moneyAmount = (claim: NumericClaim, currency: string): { value: ProducerClosedRange | null; quality: ProducerIntervalQuality; diagnostics: string[] } => {
    const raw = claimRange(claim);
    if (!raw.range) return { value: null, quality: 'not_computable', diagnostics: [raw.diagnostic ?? `${disclosure.id}: cost claim unavailable`] };
    const converted = currencyRangeToUsd(raw.range, currency, args.usdPerCurrencyUnitByCurrency ?? {});
    if (!converted.range) return { value: null, quality: 'not_computable', diagnostics: [converted.diagnostic ?? `${disclosure.id}: FX conversion failed`] };
    const scaled = scaleRange(converted.range, basisFactor.factor as number);
    return scaled ? { value: scaled, quality: raw.quality, diagnostics: [] } : { value: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: basis scaling failed`] };
  };

  if (model.type === 'fixed_amount' || model.type === 'reported_total') {
    const result = moneyAmount(model.amount, model.currency);
    return { disclosure, range: result.value, quality: result.quality, diagnostics: [...diagnostics, ...result.diagnostics] };
  }

  if (model.type === 'per_unit') {
    const rateRaw = claimRange(model.amount);
    if (!rateRaw.range) return { disclosure, range: null, quality: 'not_computable', diagnostics: [rateRaw.diagnostic ?? `${disclosure.id}: per-unit rate unavailable`] };
    const rateUsd = currencyRangeToUsd(rateRaw.range, model.currency, args.usdPerCurrencyUnitByCurrency ?? {});
    if (!rateUsd.range) return { disclosure, range: null, quality: 'not_computable', diagnostics: [rateUsd.diagnostic ?? `${disclosure.id}: rate FX unavailable`] };
    if (!project) return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: company-level per-unit interval cost is not implemented without an explicit aggregate denominator`] };
    if (model.netOfByproductCredits) {
      if (projectHasSeparateByproductRevenue(project, args.year, model.denominator.metal)) {
        return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: net-of-byproduct cost would double count separately modeled byproduct production/revenue`] };
      }
      diagnostics.push(`${disclosure.id}: net-of-byproduct per-unit cost retained because no separate byproduct production/revenue is modeled for ${args.year}; byproduct price repricing is therefore not performed.`);
    }
    const denominator = rawProjectDenominator(project, disclosure, args.year, model.denominator.metal, model.denominator.measure, model.denominator.unit, args.basis);
    if (!denominator.range) return { disclosure, range: null, quality: 'not_computable', diagnostics: [...diagnostics, ...denominator.diagnostics] };
    const spend100 = multiplyPositiveRanges(rateUsd.range, denominator.range);
    const scaled = scaleRange(spend100, disclosure.economicBasis === 'project_100pct' ? basisFactor.factor : 1);
    return scaled
      ? { disclosure, range: scaled, quality: combineQuality([rateRaw.quality, denominator.quality]), diagnostics: [...diagnostics, ...denominator.diagnostics] }
      : { disclosure, range: null, quality: 'not_computable', diagnostics: [...diagnostics, `${disclosure.id}: per-unit spend scaling failed`] };
  }

  if (model.type === 'percent_revenue') {
    const rateRaw = claimRange(model.rate);
    if (!rateRaw.range || rateRaw.range.high > 1) return { disclosure, range: null, quality: 'not_computable', diagnostics: [rateRaw.diagnostic ?? `${disclosure.id}: invalid percent-revenue rate`] };
    const base = disclosure.economicBasis === 'company' ? companyRevenue : projectRevenue;
    if (!base) return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: revenue base unavailable`] };
    return { disclosure, range: multiplyPositiveRanges(base, rateRaw.range), quality: combineQuality([rateRaw.quality, base.low === base.high ? 'exact' : 'range']), diagnostics };
  }

  if (model.type === 'price_linked') {
    const reference = claimRange(model.referenceValue);
    if (!reference.range) return { disclosure, range: null, quality: 'not_computable', diagnostics: [reference.diagnostic ?? `${disclosure.id}: price-linked reference unavailable`] };
    let adjusted = reference.range;
    for (const sensitivity of model.sensitivities) {
      const selected = args.deck.pricesByMetal[sensitivity.driverMetal];
      if (!selected || selected.valueUSD === null) return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: selected ${sensitivity.driverMetal} price unavailable`] };
      const shift = (selected.valueUSD - sensitivity.referencePrice) * sensitivity.slope;
      adjusted = { low: adjusted.low + shift, high: adjusted.high + shift };
    }
    if (adjusted.low < 0) return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: repriced cost interval becomes negative`] };
    const output = model.output;
    if (output.kind === 'fixed_amount') {
      const converted = currencyRangeToUsd(adjusted, output.currency, args.usdPerCurrencyUnitByCurrency ?? {});
      const scaled = converted.range ? scaleRange(converted.range, basisFactor.factor) : null;
      return scaled ? { disclosure, range: scaled, quality: reference.quality, diagnostics } : { disclosure, range: null, quality: 'not_computable', diagnostics: [converted.diagnostic ?? `${disclosure.id}: fixed price-linked conversion failed`] };
    }
    if (!project) return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: price-linked per-unit output lacks project context`] };
    if (output.netOfByproductCredits && projectHasSeparateByproductRevenue(project, args.year, output.denominator.metal)) {
      return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: net-of-byproduct price-linked cost would double count separately modeled byproduct revenue`] };
    }
    const rateUsd = currencyRangeToUsd(adjusted, output.currency, args.usdPerCurrencyUnitByCurrency ?? {});
    if (!rateUsd.range) return { disclosure, range: null, quality: 'not_computable', diagnostics: [rateUsd.diagnostic ?? `${disclosure.id}: price-linked rate FX failed`] };
    const denominator = rawProjectDenominator(project, disclosure, args.year, output.denominator.metal, output.denominator.measure, output.denominator.unit, args.basis);
    if (!denominator.range) return { disclosure, range: null, quality: 'not_computable', diagnostics: denominator.diagnostics };
    const spend100 = multiplyPositiveRanges(rateUsd.range, denominator.range);
    const scaled = scaleRange(spend100, disclosure.economicBasis === 'project_100pct' ? basisFactor.factor : 1);
    return scaled ? { disclosure, range: scaled, quality: combineQuality([reference.quality, denominator.quality]), diagnostics } : { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: price-linked spend scaling failed`] };
  }

  return { disclosure, range: null, quality: 'not_computable', diagnostics: [`${disclosure.id}: derived interval cost requires an explicit implemented derivation; method=${model.method}`] };
}

function coveredComponents(disclosure: CostDisclosure): Set<CostComponent> {
  return new Set([disclosure.component, ...(disclosure.definition?.includesComponents ?? [])]);
}

function hasCoverage(
  producer: ProducerJsonV1,
  project: ProducerProject,
  component: CostComponent,
  year: number,
): boolean {
  const corporate = (producer.corporateCosts ?? []).some((cost) => periodIsExactYear(cost, year) && coveredComponents(cost).has(component));
  if (corporate) return true;
  return (project.costs ?? []).some((cost) => periodIsExactYear(cost, year) && coveredComponents(cost).has(component));
}

function missingOperatingCoverage(producer: ProducerJsonV1, projects: ProducerProject[], year: number): string[] {
  const required: CostComponent[] = ['cash_operating_cost', 'royalty', 'production_tax', 'tc_rc', 'site_gna', 'other_recurring_operating'];
  const missing: string[] = [];
  for (const project of projects) {
    for (const component of required) {
      if (!hasCoverage(producer, project, component, year)) missing.push(`${project.id}: missing ${component} coverage for ${year}`);
    }
  }
  const corpGna = (producer.corporateCosts ?? []).some((cost) => periodIsExactYear(cost, year) && coveredComponents(cost).has('corporate_gna'));
  if (!corpGna) missing.push(`company: missing corporate_gna coverage for ${year}`);
  return missing;
}

function missingPreGrowthCoverage(producer: ProducerJsonV1, projects: ProducerProject[], year: number): string[] {
  const missing: string[] = [];
  for (const project of projects) {
    if (!hasCoverage(producer, project, 'sustaining_capex', year)) missing.push(`${project.id}: missing sustaining_capex coverage for ${year}`);
    const hasSustainingDevelopment = ['sustaining_exploration', 'deferred_stripping', 'underground_development'].some((component) => hasCoverage(producer, project, component as CostComponent, year));
    if (!hasSustainingDevelopment) missing.push(`${project.id}: missing sustaining exploration/development coverage for ${year}`);
    if (!hasCoverage(producer, project, 'cash_income_tax', year)) missing.push(`${project.id}: missing cash_income_tax coverage for ${year}`);
    if (!hasCoverage(producer, project, 'working_capital_delta', year)) missing.push(`${project.id}: missing working_capital_delta coverage for ${year}`);
    if (!hasCoverage(producer, project, 'other_cash', year)) missing.push(`${project.id}: missing other_cash/non-EBITDA recurring cash coverage for ${year}`);
  }
  return missing;
}

function missingGrowthCoverage(producer: ProducerJsonV1, projects: ProducerProject[], year: number): string[] {
  const missing: string[] = [];
  for (const project of projects) {
    if (!hasCoverage(producer, project, 'growth_capex', year)) missing.push(`${project.id}: missing growth_capex coverage for ${year}`);
    if (!hasCoverage(producer, project, 'growth_exploration', year)) missing.push(`${project.id}: missing growth_exploration coverage for ${year}`);
  }
  return missing;
}

function sumCostRanges(costs: CostInterval[], classification: CostDisclosure['canonicalClassification']): ProducerIntervalMetric {
  const relevant = costs.filter((cost) => cost.disclosure.canonicalClassification === classification);
  const diagnostics = relevant.flatMap((cost) => cost.diagnostics);
  if (relevant.some((cost) => !cost.range)) return { range: null, quality: 'not_computable', diagnostics };
  let total: ProducerClosedRange = { low: 0, high: 0 };
  for (const cost of relevant) total = addRange(total, cost.range as ProducerClosedRange);
  return {
    range: total,
    quality: combineQuality(relevant.map((cost) => cost.quality)),
    diagnostics,
  };
}

export function computeProducerIntervalEconomics(args: IntervalArgs): ProducerIntervalEconomics {
  const diagnostics: string[] = [];
  const activeProjects = args.producer.projects.filter((project) => projectActive(project, args.year, args.caseMode));
  const projectQuantityRows = activeProjects.map((project) => ({ project, quantities: projectQuantities(project, args.year, args.basis) }));
  diagnostics.push(...projectQuantityRows.flatMap((item) => item.quantities.diagnostics));

  const producedByMetal = aggregateRangeMap(projectQuantityRows.map((item) => item.quantities.produced));
  const revenueQtyByMetal = aggregateRangeMap(projectQuantityRows.map((item) => item.quantities.revenue));
  const productionQuality = combineQuality(projectQuantityRows.map((item) => item.quantities.quality));

  const auRange = producedByMetal.Au ?? null;
  const auOz: ProducerIntervalMetric = auRange
    ? { range: auRange, quality: productionQuality, diagnostics: [] }
    : { range: null, quality: 'not_computable', diagnostics: ['No closed exact-year Au production interval available'] };

  const revenue = revenueFromQuantities(revenueQtyByMetal, args.deck);
  diagnostics.push(...revenue.diagnostics);

  const goldPrice = priceRangeForMetal(args.deck, 'Au');
  let auEq: ProducerIntervalMetric = { range: null, quality: 'not_computable', diagnostics: ['Au price/revenue unavailable for AuEq interval'] };
  if (goldPrice && revenue.range && goldPrice.low > 0) {
    auEq = {
      range: { low: revenue.range.low / goldPrice.high, high: revenue.range.high / goldPrice.low },
      quality: revenue.quality,
      diagnostics: [],
    };
  }

  const companyRevenue = revenue.range;
  const costIntervals: CostInterval[] = [];
  for (const { project, quantities } of projectQuantityRows) {
    const projectRevenue = revenueFromQuantities(quantities.revenue, args.deck).range;
    for (const disclosure of project.costs ?? []) {
      if (!periodIsExactYear(disclosure, args.year)) continue;
      costIntervals.push(evaluateCost(disclosure, project, args, projectRevenue, companyRevenue));
    }
  }
  for (const disclosure of args.producer.corporateCosts ?? []) {
    if (!periodIsExactYear(disclosure, args.year)) continue;
    costIntervals.push(evaluateCost(disclosure, undefined, args, null, companyRevenue));
  }
  diagnostics.push(...costIntervals.flatMap((cost) => cost.diagnostics));

  const operatingMissing = missingOperatingCoverage(args.producer, activeProjects, args.year);
  const preGrowthMissing = missingPreGrowthCoverage(args.producer, activeProjects, args.year);
  const growthMissing = missingGrowthCoverage(args.producer, activeProjects, args.year);

  const operatingCosts = sumCostRanges(costIntervals, 'operating');
  let ebitda: ProducerIntervalMetric = { range: null, quality: 'not_computable', diagnostics: [...operatingMissing, ...operatingCosts.diagnostics] };
  if (revenue.range && operatingCosts.range && operatingMissing.length === 0) {
    ebitda = {
      range: subtractRange(revenue.range, operatingCosts.range),
      quality: combineQuality([revenue.quality, operatingCosts.quality]),
      diagnostics: operatingCosts.diagnostics,
    };
  }

  const sustaining = sumCostRanges(costIntervals, 'sustaining');
  const tax = sumCostRanges(costIntervals, 'tax');
  const wc = sumCostRanges(costIntervals, 'working_capital');
  let preGrowthCash: ProducerClosedRange | null = null;
  const preGrowthDiagnostics = [...preGrowthMissing, ...sustaining.diagnostics, ...tax.diagnostics, ...wc.diagnostics];
  if (ebitda.range && sustaining.range && tax.range && wc.range && preGrowthMissing.length === 0) {
    preGrowthCash = subtractRange(subtractRange(subtractRange(ebitda.range, sustaining.range), tax.range), wc.range);
  }
  const fcffBeforeGrowth: ProducerIntervalMetric = preGrowthCash
    ? { range: preGrowthCash, quality: combineQuality([ebitda.quality, sustaining.quality, tax.quality, wc.quality]), diagnostics: preGrowthDiagnostics }
    : { range: null, quality: 'not_computable', diagnostics: preGrowthDiagnostics };

  const growth = sumCostRanges(costIntervals, 'growth');
  const growthCapexRows = costIntervals.filter((cost) => cost.disclosure.canonicalClassification === 'growth' && cost.disclosure.component === 'growth_capex');
  const growthCapex = growthCapexRows.length > 0 ? sumCostRanges(growthCapexRows, 'growth') : { range: null, quality: 'not_computable' as const, diagnostics: [] };
  const afterGrowthDiagnostics = [...growthMissing, ...growth.diagnostics];
  const fcffAfterGrowth: ProducerIntervalMetric = fcffBeforeGrowth.range && growth.range && growthMissing.length === 0
    ? { range: subtractRange(fcffBeforeGrowth.range, growth.range), quality: combineQuality([fcffBeforeGrowth.quality, growth.quality]), diagnostics: afterGrowthDiagnostics }
    : { range: null, quality: 'not_computable', diagnostics: afterGrowthDiagnostics };

  return {
    year: args.year,
    basis: args.basis,
    auOz,
    auEqOz: auEq,
    revenueUSD: { range: revenue.range, quality: revenue.quality, diagnostics: revenue.diagnostics },
    ebitdaUSD: ebitda,
    fcffBeforeGrowthUSD: fcffBeforeGrowth,
    fcffAfterGrowthUSD: fcffAfterGrowth,
    growthCapexUSD: growthCapex,
    diagnostics: [...new Set(diagnostics)],
  };
}
