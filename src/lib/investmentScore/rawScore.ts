import { aggregateManagementRating, aggregateOptionalityRating } from './manualEvidence.ts';
import type { InvestmentScoreInputs, ManagementRating, OptionalityRating } from './types.ts';

export type ProvisionalRawScoreResult = {
  rawScore: number | null;
  components: {
    assetQuality: number | null;
    valuation: number | null;
    rerating: number | null;
    management: number | null;
    optionalityAdjustment: number | null;
  };
  diagnostics: string[];
};

const ASSET_QUALITY: Record<1 | 2 | 3, number> = { 1: 2, 2: 4.5, 3: 7.5 };
const MANAGEMENT: Record<Exclude<ManagementRating, 'unassessed'>, number> = {
  weak: 9,
  adequate: 5.5,
  strong: 3,
  exceptional: 1.5,
};
const OPTIONALITY_BONUS: Record<Exclude<OptionalityRating, 'unassessed'>, number> = {
  none: 0,
  some: -0.15,
  strong: -0.35,
  exceptional: -0.6,
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function interpolate(value: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (value <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

function valuationFromPNav(pNav: number | null): number | null {
  if (!finite(pNav) || pNav < 0) return null;
  return interpolate(pNav, [
    [0, 1], [0.15, 1.5], [0.25, 2.5], [0.40, 4], [0.70, 6], [1.00, 8], [1.30, 9.5], [2.00, 10],
  ]);
}

function reratingFromPeak6x(peak6xVsPrice: number | null): number | null {
  if (!finite(peak6xVsPrice) || peak6xVsPrice < 0) return null;
  return interpolate(peak6xVsPrice, [
    [0, 10], [0.5, 10], [1, 8], [1.5, 6], [2, 4.5], [3, 3], [4, 2], [5, 1.5], [8, 1],
  ]);
}

/**
 * Calibration-only v0 continuous score. Lower is better.
 * Weights follow the agreed conceptual split: asset quality 30 %, valuation
 * 30 %, rerating 25 %, management 15 %. Optionality is a positive-only bonus.
 * All breakpoints are deliberately provisional until calibrated against real JSON.
 */
export function computeProvisionalRawScoreV0(input: InvestmentScoreInputs): ProvisionalRawScoreResult {
  const diagnostics: string[] = [];
  const assetQuality = input.tier === null ? null : ASSET_QUALITY[input.tier];
  const valuation = valuationFromPNav(input.pNav);
  const rerating = reratingFromPeak6x(input.peak6xVsPrice);
  const managementRating = aggregateManagementRating(input.management);
  const optionalityRating = aggregateOptionalityRating(input.optionality);
  const management = managementRating && managementRating !== 'unassessed' ? MANAGEMENT[managementRating] : null;
  const optionalityAdjustment = optionalityRating && optionalityRating !== 'unassessed'
    ? OPTIONALITY_BONUS[optionalityRating]
    : null;

  if (assetQuality === null) diagnostics.push('Raw score: Tier saknas.');
  if (valuation === null) diagnostics.push('Raw score: P/NAV PF saknas.');
  if (rerating === null) diagnostics.push('Raw score: Peak 6x / pris saknas.');
  if (management === null) diagnostics.push('Raw score: management är Ej verifierad.');
  if (optionalityAdjustment === null) diagnostics.push('Raw score: optionality är Ej bedömd; ingen bonus tillämpas.');

  if (assetQuality === null || valuation === null || rerating === null || management === null) {
    return {
      rawScore: null,
      components: { assetQuality, valuation, rerating, management, optionalityAdjustment },
      diagnostics,
    };
  }

  const bonus = optionalityAdjustment ?? 0;
  const raw = 0.30 * assetQuality + 0.30 * valuation + 0.25 * rerating + 0.15 * management + bonus;
  return {
    rawScore: Math.max(1, Math.min(10, raw)),
    components: { assetQuality, valuation, rerating, management, optionalityAdjustment },
    diagnostics: [
      ...diagnostics,
      'v0 calibration: raw score weights/breakpoints are provisional and must be recalibrated against real project JSON.',
    ],
  };
}
