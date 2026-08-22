import type { NumericClaim, ProducerCaseMode, ProducerProject, ProductionDisclosure } from './types.ts';
import { applyOwnershipToProductionClaim, resolveOwnershipForYear } from './ownership.ts';
import type { ResolvedProducerPriceDeck } from './priceDeck.ts';

export type CanonicalProductionUnit = 'toz' | 'tonne';
export type CalculationQuality = 'exact' | 'approximation' | 'not_computable';

export type NormalizedProductionDisclosure = {
  projectId: string;
  disclosureId: string;
  metal: string;
  measure: ProductionDisclosure['measure'];
  claim: NumericClaim | null;
  unit: CanonicalProductionUnit | null;
  quality: CalculationQuality;
  reason?: string;
};

export type ScalarQuantity = {
  value: number | null;
  unit: CanonicalProductionUnit;
  quality: CalculationQuality;
  reasons: string[];
};

const PRECIOUS_METALS = new Set(['Au', 'Ag']);
const BASE_METALS = new Set(['Cu', 'Zn', 'Pb', 'Ni']);
const LB_PER_TONNE = 2204.6226218487757;

export function isProjectIncludedInCase(status: ProducerProject['statusAsOfValuationDate'], caseMode: ProducerCaseMode): boolean {
  const base = status === 'operating' || status === 'ramp_up' || status === 'construction' || status === 'sanctioned';
  if (base) return true;
  return caseMode === 'GROWTH' && (status === 'development' || status === 'study');
}

function canonicalUnitForMetal(metal: string): CanonicalProductionUnit | null {
  if (PRECIOUS_METALS.has(metal)) return 'toz';
  if (BASE_METALS.has(metal)) return 'tonne';
  return null;
}

function unitFactor(disclosure: ProductionDisclosure, canonicalUnit: CanonicalProductionUnit): number | null {
  if (canonicalUnit === 'toz') {
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

function scaleClaim(claim: NumericClaim, factor: number): NumericClaim {
  switch (claim.kind) {
    case 'point':
    case 'approximate':
    case 'upper_bound':
    case 'lower_bound':
      return { ...claim, value: claim.value * factor };
    case 'range':
      return { ...claim, low: claim.low * factor, high: claim.high * factor };
  }
}

function periodResolution(disclosure: ProductionDisclosure, year: number): { applies: boolean; exactYear: boolean; reason?: string } {
  if (disclosure.period.kind === 'year') {
    return { applies: disclosure.period.year === year, exactYear: disclosure.period.year === year };
  }
  const inRange = year >= disclosure.period.startYear && year <= disclosure.period.endYear;
  if (!inRange) return { applies: false, exactYear: false };
  return {
    applies: true,
    exactYear: false,
    reason: `${disclosure.period.kind} disclosure ${disclosure.period.startYear}-${disclosure.period.endYear} must not be materialized as a precise ${year} value`,
  };
}

export function normalizeProductionDisclosureForYear(
  project: ProducerProject,
  disclosure: ProductionDisclosure,
  year: number,
): NormalizedProductionDisclosure | null {
  const period = periodResolution(disclosure, year);
  if (!period.applies) return null;
  if (!period.exactYear) {
    return {
      projectId: project.id,
      disclosureId: disclosure.id,
      metal: disclosure.metal,
      measure: disclosure.measure,
      claim: null,
      unit: canonicalUnitForMetal(disclosure.metal),
      quality: 'not_computable',
      reason: period.reason,
    };
  }

  const canonicalUnit = canonicalUnitForMetal(disclosure.metal);
  if (!canonicalUnit) {
    return {
      projectId: project.id,
      disclosureId: disclosure.id,
      metal: disclosure.metal,
      measure: disclosure.measure,
      claim: null,
      unit: null,
      quality: 'not_computable',
      reason: `Unsupported production metal ${disclosure.metal}; no canonical Producer quantity unit is registered`,
    };
  }

  const factor = unitFactor(disclosure, canonicalUnit);
  if (factor === null) {
    return {
      projectId: project.id,
      disclosureId: disclosure.id,
      metal: disclosure.metal,
      measure: disclosure.measure,
      claim: null,
      unit: canonicalUnit,
      quality: 'not_computable',
      reason: `Unit ${disclosure.unit} is incompatible with ${disclosure.metal} canonical unit ${canonicalUnit}`,
    };
  }

  const ownership = resolveOwnershipForYear(project.ownership, year);
  const owned = applyOwnershipToProductionClaim(disclosure, ownership);
  if (owned.status !== 'exact' || !owned.claim) {
    return {
      projectId: project.id,
      disclosureId: disclosure.id,
      metal: disclosure.metal,
      measure: disclosure.measure,
      claim: null,
      unit: canonicalUnit,
      quality: 'not_computable',
      reason: owned.reason,
    };
  }

  const claim = scaleClaim(owned.claim, factor);
  const quality: CalculationQuality = claim.kind === 'point' ? 'exact' : claim.kind === 'approximate' ? 'approximation' : 'not_computable';
  return {
    projectId: project.id,
    disclosureId: disclosure.id,
    metal: disclosure.metal,
    measure: disclosure.measure,
    claim,
    unit: canonicalUnit,
    quality,
    reason: quality === 'not_computable' ? `${claim.kind} production claim must not be collapsed to a point estimate` : undefined,
  };
}

export function normalizeProjectProductionForYear(project: ProducerProject, year: number): NormalizedProductionDisclosure[] {
  return project.production
    .map((disclosure) => normalizeProductionDisclosureForYear(project, disclosure, year))
    .filter((item): item is NormalizedProductionDisclosure => item !== null);
}

function claimScalar(item: NormalizedProductionDisclosure): { value: number | null; quality: CalculationQuality; reason?: string } {
  if (!item.claim || item.quality === 'not_computable') {
    return { value: null, quality: 'not_computable', reason: item.reason };
  }
  if (item.claim.kind === 'point' || item.claim.kind === 'approximate') {
    return { value: item.claim.value, quality: item.quality };
  }
  return { value: null, quality: 'not_computable', reason: `${item.claim.kind} claim is not scalar` };
}

function aggregateSingleMeasure(items: readonly NormalizedProductionDisclosure[], measure: ProductionDisclosure['measure']): Record<string, ScalarQuantity> {
  const output: Record<string, ScalarQuantity> = {};
  const metals = [...new Set(items.map((item) => item.metal))];

  for (const metal of metals) {
    const projectIds = [...new Set(items.filter((item) => item.metal === metal).map((item) => item.projectId))];
    const values: number[] = [];
    const reasons: string[] = [];
    let quality: CalculationQuality = 'exact';
    let unit: CanonicalProductionUnit = canonicalUnitForMetal(metal) ?? 'tonne';

    for (const projectId of projectIds) {
      const projectMetal = items.filter((item) => item.projectId === projectId && item.metal === metal);
      const candidates = projectMetal.filter((item) => item.measure === measure);
      if (candidates.length === 0) {
        reasons.push(`${projectId}/${metal}: missing ${measure} disclosure for selected year`);
        quality = 'not_computable';
        continue;
      }
      if (candidates.length > 1) {
        reasons.push(`${projectId}/${metal}: multiple ${measure} disclosures for selected year; source precedence is unresolved`);
        quality = 'not_computable';
        continue;
      }
      const candidate = candidates[0];
      if (candidate.unit) unit = candidate.unit;
      const scalar = claimScalar(candidate);
      if (scalar.value === null) {
        quality = 'not_computable';
        if (scalar.reason) reasons.push(`${projectId}/${metal}: ${scalar.reason}`);
        continue;
      }
      values.push(scalar.value);
      if (scalar.quality === 'approximation' && quality === 'exact') quality = 'approximation';
    }

    output[metal] = {
      value: quality === 'not_computable' ? null : values.reduce((sum, value) => sum + value, 0),
      unit,
      quality,
      reasons,
    };
  }

  return output;
}

export function aggregateProducedByMetal(items: readonly NormalizedProductionDisclosure[]): Record<string, ScalarQuantity> {
  return aggregateSingleMeasure(items, 'produced');
}

export function selectRevenueQuantityByMetal(items: readonly NormalizedProductionDisclosure[]): Record<string, ScalarQuantity> {
  const output: Record<string, ScalarQuantity> = {};
  const metals = [...new Set(items.map((item) => item.metal))];
  const preference: ProductionDisclosure['measure'][] = ['payable', 'sold', 'produced'];

  for (const metal of metals) {
    const projectIds = [...new Set(items.filter((item) => item.metal === metal).map((item) => item.projectId))];
    const values: number[] = [];
    const reasons: string[] = [];
    let quality: CalculationQuality = 'exact';
    let unit: CanonicalProductionUnit = canonicalUnitForMetal(metal) ?? 'tonne';

    for (const projectId of projectIds) {
      const projectMetal = items.filter((item) => item.projectId === projectId && item.metal === metal);
      let selected: NormalizedProductionDisclosure | null = null;
      let selectedMeasure: ProductionDisclosure['measure'] | null = null;
      for (const measure of preference) {
        const candidates = projectMetal.filter((item) => item.measure === measure);
        if (candidates.length > 1) {
          reasons.push(`${projectId}/${metal}: multiple ${measure} disclosures; source precedence is unresolved`);
          quality = 'not_computable';
          selected = null;
          selectedMeasure = null;
          break;
        }
        if (candidates.length === 1) {
          selected = candidates[0];
          selectedMeasure = measure;
          break;
        }
      }
      if (!selected || !selectedMeasure) {
        if (quality !== 'not_computable') {
          reasons.push(`${projectId}/${metal}: no payable, sold or produced revenue quantity is available`);
          quality = 'not_computable';
        }
        continue;
      }
      if (selected.unit) unit = selected.unit;
      const scalar = claimScalar(selected);
      if (scalar.value === null) {
        quality = 'not_computable';
        if (scalar.reason) reasons.push(`${projectId}/${metal}: ${scalar.reason}`);
        continue;
      }
      values.push(scalar.value);
      if (selectedMeasure === 'produced') {
        reasons.push(`${projectId}/${metal}: produced quantity used as revenue proxy because payable/sold quantity is unavailable`);
        if (quality === 'exact') quality = 'approximation';
      } else if (scalar.quality === 'approximation' && quality === 'exact') {
        quality = 'approximation';
      }
    }

    output[metal] = {
      value: quality === 'not_computable' ? null : values.reduce((sum, value) => sum + value, 0),
      unit,
      quality,
      reasons,
    };
  }

  return output;
}

export function buildNormalizedCompanyProduction(args: {
  projects: readonly ProducerProject[];
  year: number;
  caseMode: ProducerCaseMode;
}): NormalizedProductionDisclosure[] {
  return args.projects
    .filter((project) => isProjectIncludedInCase(project.statusAsOfValuationDate, args.caseMode))
    .flatMap((project) => normalizeProjectProductionForYear(project, args.year));
}

export function computeMetalRevenueUSD(
  quantitiesByMetal: Record<string, ScalarQuantity>,
  deck: ResolvedProducerPriceDeck,
): {
  revenueByMetalUSD: Record<string, number | null>;
  totalRevenueUSD: number | null;
  quality: CalculationQuality;
  reasons: string[];
} {
  const revenueByMetalUSD: Record<string, number | null> = {};
  const reasons: string[] = [];
  let quality: CalculationQuality = 'exact';
  let total = 0;

  for (const [metal, quantity] of Object.entries(quantitiesByMetal)) {
    const price = deck.pricesByMetal[metal];
    if (quantity.value === null || quantity.quality === 'not_computable') {
      revenueByMetalUSD[metal] = null;
      quality = 'not_computable';
      reasons.push(...quantity.reasons);
      continue;
    }
    if (!price || price.valueUSD === null) {
      revenueByMetalUSD[metal] = null;
      quality = 'not_computable';
      reasons.push(`${metal}: selected price deck has no usable price`);
      continue;
    }
    const expectedUnit = quantity.unit === 'toz' ? 'USD_per_toz' : 'USD_per_tonne';
    if (price.unit !== expectedUnit) {
      revenueByMetalUSD[metal] = null;
      quality = 'not_computable';
      reasons.push(`${metal}: quantity unit ${quantity.unit} is incompatible with price unit ${price.unit}`);
      continue;
    }
    const revenue = quantity.value * price.valueUSD;
    revenueByMetalUSD[metal] = revenue;
    total += revenue;
    if (quantity.quality === 'approximation' && quality === 'exact') quality = 'approximation';
    reasons.push(...quantity.reasons);
  }

  return {
    revenueByMetalUSD,
    totalRevenueUSD: quality === 'not_computable' ? null : total,
    quality,
    reasons,
  };
}

export function computePhysicalAuEqOz(
  producedByMetal: Record<string, ScalarQuantity>,
  deck: ResolvedProducerPriceDeck,
): { value: number | null; quality: CalculationQuality; reasons: string[] } {
  const goldPrice = deck.pricesByMetal.Au;
  if (!goldPrice || goldPrice.valueUSD === null || goldPrice.unit !== 'USD_per_toz') {
    return { value: null, quality: 'not_computable', reasons: ['Au price is required to compute physical AuEq'] };
  }
  const revenue = computeMetalRevenueUSD(producedByMetal, deck);
  if (revenue.totalRevenueUSD === null) {
    return { value: null, quality: 'not_computable', reasons: revenue.reasons };
  }
  return {
    value: revenue.totalRevenueUSD / goldPrice.valueUSD,
    quality: revenue.quality,
    reasons: revenue.reasons,
  };
}
