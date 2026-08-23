import { resolveOwnershipForYear } from './ownership.ts';
import type { ResolvedProducerPriceDeck } from './priceDeck.ts';
import { isProjectIncludedInCase } from './production.ts';
import { isProducerEconomicProject } from './projectRole.ts';
import type {
  CostDisclosure,
  NumericClaim,
  ProducerCaseMode,
  ProducerJsonV1,
  ProducerProject,
  ProductionDisclosure,
} from './types.ts';
import type { ProducerClosedRange } from './intervalEconomics.ts';

export type ProducerCanonicalCashCostInterval = {
  cashOperatingCostsUSD: ProducerClosedRange | null;
  cashOperatingCostPerAuEqUSD: ProducerClosedRange | null;
  diagnostics: string[];
};

type Args = {
  producer: ProducerJsonV1;
  year: number;
  caseMode: ProducerCaseMode;
  deck: ResolvedProducerPriceDeck;
  financialAuEqOz: ProducerClosedRange | null;
  usdPerCurrencyUnitByCurrency?: Readonly<Record<string, number>>;
};

const LB_PER_TONNE = 2204.6226218487757;

function claimRange(claim: NumericClaim): ProducerClosedRange | null {
  if (claim.kind === 'point' || claim.kind === 'approximate') {
    return Number.isFinite(claim.value) && claim.value >= 0 ? { low: claim.value, high: claim.value } : null;
  }
  if (claim.kind === 'range') {
    return Number.isFinite(claim.low) && Number.isFinite(claim.high) && claim.low >= 0 && claim.high >= claim.low
      ? { low: claim.low, high: claim.high }
      : null;
  }
  return null;
}

function addRange(a: ProducerClosedRange, b: ProducerClosedRange): ProducerClosedRange {
  return { low: a.low + b.low, high: a.high + b.high };
}

function multiplyPositiveRanges(a: ProducerClosedRange, b: ProducerClosedRange): ProducerClosedRange {
  return { low: a.low * b.low, high: a.high * b.high };
}

function scaleRange(value: ProducerClosedRange, factor: number): ProducerClosedRange | null {
  if (!Number.isFinite(factor) || factor < 0) return null;
  return { low: value.low * factor, high: value.high * factor };
}

function currencyRangeToUsd(
  value: ProducerClosedRange,
  currency: string,
  fx: Readonly<Record<string, number>>,
): ProducerClosedRange | null {
  const ccy = currency.trim().toUpperCase();
  if (ccy === 'USD') return value;
  const rate = fx[ccy];
  return Number.isFinite(rate) && rate > 0 ? scaleRange(value, rate) : null;
}

function projectActive(project: ProducerProject, year: number, caseMode: ProducerCaseMode): boolean {
  if (!isProducerEconomicProject(project)) return false;
  if (!isProjectIncludedInCase(project.statusAsOfValuationDate, caseMode)) return false;
  const window = project.productionWindow;
  if (!window) return true;
  return year >= window.startYear && (window.endYear === undefined || year <= window.endYear);
}

function ownershipFactor(project: ProducerProject, year: number): number | null {
  const ownership = resolveOwnershipForYear(project.ownership, year);
  return ownership.status === 'exact' ? ownership.ownershipPct : null;
}

function exactYearCandidates(
  project: ProducerProject,
  year: number,
  metal: string,
  measure: ProductionDisclosure['measure'],
): ProductionDisclosure[] {
  return project.production.filter((item) =>
    item.period.kind === 'year'
    && item.period.year === year
    && item.metal === metal
    && item.measure === measure,
  );
}

function isPreciousMetal(metal: string): boolean {
  return metal === 'Au' || metal === 'Ag' || metal === 'Pt' || metal === 'Pd';
}

function canonicalQuantityRange(disclosure: ProductionDisclosure): ProducerClosedRange | null {
  const raw = claimRange(disclosure.quantity);
  if (!raw) return null;
  let factor: number | null = null;
  if (isPreciousMetal(disclosure.metal)) {
    if (disclosure.unit === 'toz') factor = 1;
    else if (disclosure.unit === 'koz') factor = 1_000;
    else if (disclosure.unit === 'Moz') factor = 1_000_000;
  } else {
    if (disclosure.unit === 'tonne') factor = 1;
    else if (disclosure.unit === 'kt') factor = 1_000;
    else if (disclosure.unit === 'lb') factor = 1 / LB_PER_TONNE;
  }
  return factor === null ? null : scaleRange(raw, factor);
}

function normalizedFinancialQuantityRange(
  project: ProducerProject,
  disclosure: ProductionDisclosure,
  year: number,
): ProducerClosedRange | null {
  const raw = canonicalQuantityRange(disclosure);
  if (!raw) return null;
  if (disclosure.basis === 'attributable') return raw;
  const factor = ownershipFactor(project, year);
  return factor === null ? null : scaleRange(raw, factor);
}

function denominatorRange(
  project: ProducerProject,
  disclosure: CostDisclosure,
  year: number,
  denominator: { metal: string; unit: 'toz' | 'tonne' | 'lb'; measure: ProductionDisclosure['measure'] },
): ProducerClosedRange | null {
  const candidates = exactYearCandidates(project, year, denominator.metal, denominator.measure);
  if (candidates.length !== 1) return null;
  const source = candidates[0];
  let canonical: ProducerClosedRange | null;
  if (disclosure.economicBasis === 'project_100pct') {
    if (source.basis !== 'project_100pct') return null;
    canonical = canonicalQuantityRange(source);
  } else {
    canonical = normalizedFinancialQuantityRange(project, source, year);
  }
  if (!canonical) return null;

  if (denominator.unit === 'toz') return isPreciousMetal(denominator.metal) ? canonical : null;
  if (denominator.unit === 'tonne') return isPreciousMetal(denominator.metal) ? null : canonical;
  return isPreciousMetal(denominator.metal) ? null : scaleRange(canonical, LB_PER_TONNE);
}

function selectedRevenueQuantity(project: ProducerProject, year: number, metal: string): ProductionDisclosure | null {
  for (const measure of ['payable', 'sold', 'produced'] as const) {
    const candidates = exactYearCandidates(project, year, metal, measure);
    if (candidates.length > 1) return null;
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

function projectRevenueRange(project: ProducerProject, args: Args): ProducerClosedRange | null {
  const metals = [...new Set(project.production
    .filter((item) => item.period.kind === 'year' && item.period.year === args.year)
    .map((item) => item.metal))];
  if (metals.length === 0) return null;
  let total: ProducerClosedRange = { low: 0, high: 0 };
  for (const metal of metals) {
    const disclosure = selectedRevenueQuantity(project, args.year, metal);
    if (!disclosure) return null;
    const quantity = normalizedFinancialQuantityRange(project, disclosure, args.year);
    const price = args.deck.pricesByMetal[metal];
    if (!quantity || !price || price.valueUSD === null || !Number.isFinite(price.valueUSD) || price.valueUSD < 0) return null;
    total = addRange(total, multiplyPositiveRanges(quantity, { low: price.valueUSD, high: price.valueUSD }));
  }
  return total;
}

function projectHasSeparateByproductRevenue(project: ProducerProject, year: number, denominatorMetal: string): boolean {
  return project.production.some((item) =>
    item.period.kind === 'year'
    && item.period.year === year
    && item.metal !== denominatorMetal
    && (item.measure === 'payable' || item.measure === 'sold' || item.measure === 'produced'),
  );
}

function basisFactor(project: ProducerProject | undefined, disclosure: CostDisclosure, year: number): number | null {
  if (disclosure.economicBasis === 'company' || disclosure.economicBasis === 'attributable') return 1;
  return project ? ownershipFactor(project, year) : null;
}

function evaluateCashOperatingCost(
  disclosure: CostDisclosure,
  project: ProducerProject | undefined,
  args: Args,
  projectRevenue: ProducerClosedRange | null,
  companyRevenue: ProducerClosedRange | null,
): ProducerClosedRange | null {
  if (disclosure.period.kind !== 'year' || disclosure.period.year !== args.year) return null;
  if (disclosure.component !== 'cash_operating_cost') return null;
  const factor = basisFactor(project, disclosure, args.year);
  if (factor === null) return null;
  const fx = args.usdPerCurrencyUnitByCurrency ?? {};
  const model = disclosure.model;

  if (model.type === 'fixed_amount' || model.type === 'reported_total') {
    const amount = claimRange(model.amount);
    const usd = amount ? currencyRangeToUsd(amount, model.currency, fx) : null;
    return usd ? scaleRange(usd, factor) : null;
  }

  if (model.type === 'per_unit') {
    if (!project) return null;
    if (model.netOfByproductCredits && projectHasSeparateByproductRevenue(project, args.year, model.denominator.metal)) return null;
    const rate = claimRange(model.amount);
    const rateUsd = rate ? currencyRangeToUsd(rate, model.currency, fx) : null;
    const denominator = denominatorRange(project, disclosure, args.year, model.denominator);
    if (!rateUsd || !denominator) return null;
    const spend = multiplyPositiveRanges(rateUsd, denominator);
    return disclosure.economicBasis === 'project_100pct' ? scaleRange(spend, factor) : spend;
  }

  if (model.type === 'percent_revenue') {
    const rate = claimRange(model.rate);
    if (!rate || rate.high > 1) return null;
    const base = disclosure.economicBasis === 'company' ? companyRevenue : projectRevenue;
    return base ? multiplyPositiveRanges(base, rate) : null;
  }

  if (model.type === 'price_linked') {
    let adjusted = claimRange(model.referenceValue);
    if (!adjusted) return null;
    for (const sensitivity of model.sensitivities) {
      const selected = args.deck.pricesByMetal[sensitivity.driverMetal];
      if (!selected || selected.valueUSD === null) return null;
      const shift = (selected.valueUSD - sensitivity.referencePrice) * sensitivity.slope;
      adjusted = { low: adjusted.low + shift, high: adjusted.high + shift };
    }
    if (adjusted.low < 0) return null;
    if (model.output.kind === 'fixed_amount') {
      const usd = currencyRangeToUsd(adjusted, model.output.currency, fx);
      return usd ? scaleRange(usd, factor) : null;
    }
    if (!project) return null;
    if (model.output.netOfByproductCredits && projectHasSeparateByproductRevenue(project, args.year, model.output.denominator.metal)) return null;
    const rateUsd = currencyRangeToUsd(adjusted, model.output.currency, fx);
    const denominator = denominatorRange(project, disclosure, args.year, model.output.denominator);
    if (!rateUsd || !denominator) return null;
    const spend = multiplyPositiveRanges(rateUsd, denominator);
    return disclosure.economicBasis === 'project_100pct' ? scaleRange(spend, factor) : spend;
  }

  return null;
}

export function computeCanonicalCashCostInterval(args: Args): ProducerCanonicalCashCostInterval {
  const diagnostics: string[] = [];
  const projects = args.producer.projects.filter((project) => projectActive(project, args.year, args.caseMode));
  const projectRevenue = new Map<string, ProducerClosedRange | null>();
  let companyRevenue: ProducerClosedRange = { low: 0, high: 0 };
  for (const project of projects) {
    const revenue = projectRevenueRange(project, args);
    projectRevenue.set(project.id, revenue);
    if (!revenue) {
      diagnostics.push(`${project.id}: cash-cost interval cannot resolve financial revenue quantities for ${args.year}`);
      return { cashOperatingCostsUSD: null, cashOperatingCostPerAuEqUSD: null, diagnostics };
    }
    companyRevenue = addRange(companyRevenue, revenue);
  }

  let total: ProducerClosedRange = { low: 0, high: 0 };
  for (const project of projects) {
    const disclosures = (project.costs ?? []).filter((cost) =>
      cost.component === 'cash_operating_cost'
      && cost.period.kind === 'year'
      && cost.period.year === args.year,
    );
    if (disclosures.length === 0) {
      diagnostics.push(`${project.id}: missing cash_operating_cost coverage for canonical cash-cost interval in ${args.year}`);
      return { cashOperatingCostsUSD: null, cashOperatingCostPerAuEqUSD: null, diagnostics };
    }
    for (const disclosure of disclosures) {
      const value = evaluateCashOperatingCost(disclosure, project, args, projectRevenue.get(project.id) ?? null, companyRevenue);
      if (!value) {
        diagnostics.push(`${project.id}/${disclosure.id}: cash_operating_cost is not interval-computable`);
        return { cashOperatingCostsUSD: null, cashOperatingCostPerAuEqUSD: null, diagnostics };
      }
      total = addRange(total, value);
    }
  }

  for (const disclosure of args.producer.corporateCosts ?? []) {
    if (disclosure.component !== 'cash_operating_cost' || disclosure.period.kind !== 'year' || disclosure.period.year !== args.year) continue;
    const value = evaluateCashOperatingCost(disclosure, undefined, args, null, companyRevenue);
    if (!value) {
      diagnostics.push(`company/${disclosure.id}: cash_operating_cost is not interval-computable`);
      return { cashOperatingCostsUSD: null, cashOperatingCostPerAuEqUSD: null, diagnostics };
    }
    total = addRange(total, value);
  }

  const auEq = args.financialAuEqOz;
  if (!auEq || auEq.low <= 0 || auEq.high <= 0) {
    diagnostics.push(`Cash cost/AuEq unavailable because financial AuEq interval is unresolved for ${args.year}`);
    return { cashOperatingCostsUSD: total, cashOperatingCostPerAuEqUSD: null, diagnostics };
  }

  return {
    cashOperatingCostsUSD: total,
    cashOperatingCostPerAuEqUSD: {
      low: total.low / auEq.high,
      high: total.high / auEq.low,
    },
    diagnostics,
  };
}
