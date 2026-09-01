import { convertMass, convertPreciousQuantity, type MassUnit, type PreciousQuantityUnit } from '../prices/units.ts';
import { TIER1_PRODUCTION_THRESHOLDS } from './config.ts';

export type Tier1ScaleQuantityUnit = 'toz' | 'lb' | 'tonne';

export type Tier1ScaleThreshold = {
  product: string;
  minimumAnnualQuantity: number;
  unit: Tier1ScaleQuantityUnit;
  label: string;
};

export type Tier1ScaleProductInput = {
  averageAnnualQuantity: number;
  unit: string;
};

export type Tier1ScaleProductResult = {
  product: string;
  averageAnnualQuantity: number;
  inputUnit: string;
  normalizedQuantity: number | null;
  normalizedUnit: Tier1ScaleQuantityUnit | null;
  threshold: number | null;
  thresholdUnit: Tier1ScaleQuantityUnit | null;
  equivalent: number | null;
  scored: boolean;
  reason: string;
};

export type Tier1ScaleAssessment = {
  products: Record<string, Tier1ScaleProductResult>;
  combinedEquivalent: number | null;
};

const LEGACY_SCALE_THRESHOLDS = Object.fromEntries(
  Object.entries(TIER1_PRODUCTION_THRESHOLDS).map(([product, row]) => [
    product,
    {
      product,
      minimumAnnualQuantity: row.minimumAnnualPayable,
      unit: row.unit,
      label: row.label,
    } satisfies Tier1ScaleThreshold,
  ]),
) as Record<string, Tier1ScaleThreshold>;

/**
 * Exact physical-product scale policy.
 *
 * The registry is intentionally separate from cost-benchmark support. A product
 * may contribute to physical scale without having a cost curve or even a live
 * price source. Product ids are exact: U is not U3O8, W is not WO3, and Fe is
 * not saleable iron-ore product.
 *
 * Mo=10 kt payable Mo/year is an accepted Instrumentbrädan scale policy from
 * the research foundation in PR #516. U3O8 and WO3 remain deliberately absent
 * until their research recommendations are explicitly accepted as policy.
 */
export const TIER1_SCALE_THRESHOLDS: Readonly<Record<string, Tier1ScaleThreshold>> = {
  ...LEGACY_SCALE_THRESHOLDS,
  Mo: {
    product: 'Mo',
    minimumAnnualQuantity: 10_000,
    unit: 'tonne',
    label: '10 kt Mo/år',
  },
};

export function getTier1ScaleThreshold(product: string): Tier1ScaleThreshold | null {
  return TIER1_SCALE_THRESHOLDS[product] ?? null;
}

export function hasTier1ScaleThreshold(product: string): boolean {
  return getTier1ScaleThreshold(product) !== null;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isMassUnit(unit: string): unit is MassUnit {
  return unit === 'tonne' || unit === 'short_ton' || unit === 'long_ton' || unit === 'lb' || unit === 'kg';
}

function isPreciousQuantityUnit(unit: string): unit is PreciousQuantityUnit {
  return unit === 'toz' || unit === 'g' || unit === 'kg';
}

/**
 * Unit normalization is purely dimensional. It never performs chemical or
 * product-basis conversions such as U -> U3O8, W -> WO3, contained Fe -> iron
 * ore product, or concentrate tonnes -> contained/recovered product tonnes.
 */
export function normalizeTier1ScaleQuantity(args: {
  product: string;
  value: number;
  fromUnit: string;
  toUnit: Tier1ScaleQuantityUnit;
}): number | null {
  if (!finiteNonNegative(args.value)) return null;
  if (args.fromUnit === args.toUnit) return args.value;

  if (args.toUnit === 'toz') {
    if (!isPreciousQuantityUnit(args.fromUnit)) return null;
    return convertPreciousQuantity(args.value, args.fromUnit, 'toz');
  }

  if (!isMassUnit(args.fromUnit)) return null;
  return convertMass(args.value, args.fromUnit, args.toUnit);
}

/**
 * Score all discovered physical products while preserving products that do not
 * yet have an enabled Tier scale policy. Only exact threshold matches can
 * contribute to combinedEquivalent.
 */
export function assessTier1ScaleProducts(
  averageAnnualByProduct: Record<string, Tier1ScaleProductInput>,
): Tier1ScaleAssessment {
  const products: Record<string, Tier1ScaleProductResult> = {};
  let combined = 0;
  let scoredCount = 0;

  for (const [product, input] of Object.entries(averageAnnualByProduct)) {
    const threshold = getTier1ScaleThreshold(product);
    if (!finiteNonNegative(input.averageAnnualQuantity)) {
      products[product] = {
        product,
        averageAnnualQuantity: input.averageAnnualQuantity,
        inputUnit: input.unit,
        normalizedQuantity: null,
        normalizedUnit: threshold?.unit ?? null,
        threshold: threshold?.minimumAnnualQuantity ?? null,
        thresholdUnit: threshold?.unit ?? null,
        equivalent: null,
        scored: false,
        reason: 'Ogiltig eller negativ fysisk produktionskvantitet.',
      };
      continue;
    }

    if (!threshold) {
      products[product] = {
        product,
        averageAnnualQuantity: input.averageAnnualQuantity,
        inputUnit: input.unit,
        normalizedQuantity: input.averageAnnualQuantity,
        normalizedUnit: null,
        threshold: null,
        thresholdUnit: null,
        equivalent: null,
        scored: false,
        reason: `Ingen aktiverad Tier-scale-policy för exakt product-id ${product}.`,
      };
      continue;
    }

    const normalized = normalizeTier1ScaleQuantity({
      product,
      value: input.averageAnnualQuantity,
      fromUnit: input.unit,
      toUnit: threshold.unit,
    });
    if (normalized === null) {
      products[product] = {
        product,
        averageAnnualQuantity: input.averageAnnualQuantity,
        inputUnit: input.unit,
        normalizedQuantity: null,
        normalizedUnit: threshold.unit,
        threshold: threshold.minimumAnnualQuantity,
        thresholdUnit: threshold.unit,
        equivalent: null,
        scored: false,
        reason: `Enheten ${input.unit} kan inte dimensionssäkert normaliseras till ${threshold.unit} för ${product}.`,
      };
      continue;
    }

    const equivalent = normalized / threshold.minimumAnnualQuantity;
    products[product] = {
      product,
      averageAnnualQuantity: input.averageAnnualQuantity,
      inputUnit: input.unit,
      normalizedQuantity: normalized,
      normalizedUnit: threshold.unit,
      threshold: threshold.minimumAnnualQuantity,
      thresholdUnit: threshold.unit,
      equivalent,
      scored: true,
      reason: `${product} ${equivalent.toFixed(2)}x mot ${threshold.label}.`,
    };
    combined += equivalent;
    scoredCount += 1;
  }

  return {
    products,
    combinedEquivalent: scoredCount > 0 ? combined : null,
  };
}
