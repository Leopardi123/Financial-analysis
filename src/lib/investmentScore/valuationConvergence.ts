export type ValuationConvergence =
  | 'EXTREME'
  | 'VERY_STRONG'
  | 'STRONG'
  | 'MIXED'
  | 'CONTRADICTORY'
  | 'NOT_VERIFIED';

export type ValuationConvergenceAssessment = {
  classification: ValuationConvergence;
  pNav: number | null;
  peak6xVsPrice: number | null;
  reason: string;
};

export const VALUATION_CONVERGENCE_POLICY = Object.freeze({
  extreme: Object.freeze({ pNavMax: 0.15, peak6xVsPriceMin: 4.0 }),
  veryStrong: Object.freeze({ pNavMax: 0.25, peak6xVsPriceMin: 3.0 }),
  strong: Object.freeze({ pNavMax: 0.40, peak6xVsPriceMin: 2.0 }),
  contradictoryPeak6xVsPriceMax: 1.5,
});

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function assessValuationConvergence(args: {
  pNav: number | null;
  peak6xVsPrice: number | null;
}): ValuationConvergenceAssessment {
  const { pNav, peak6xVsPrice } = args;
  if (!finite(pNav) || pNav < 0 || !finite(peak6xVsPrice) || peak6xVsPrice < 0) {
    return {
      classification: 'NOT_VERIFIED',
      pNav: finite(pNav) ? pNav : null,
      peak6xVsPrice: finite(peak6xVsPrice) ? peak6xVsPrice : null,
      reason: 'Valuation convergence är Ej verifierad eftersom både P/NAV PF och Peak 6x / pris måste vara kanoniskt beräknade.',
    };
  }

  const p = VALUATION_CONVERGENCE_POLICY;
  if (pNav <= p.extreme.pNavMax && peak6xVsPrice >= p.extreme.peak6xVsPriceMin) {
    return {
      classification: 'EXTREME', pNav, peak6xVsPrice,
      reason: `Extreme convergence: P/NAV PF ${pNav.toFixed(3)}x ≤ ${p.extreme.pNavMax.toFixed(2)}x och Peak 6x / pris ${peak6xVsPrice.toFixed(2)}x ≥ ${p.extreme.peak6xVsPriceMin.toFixed(1)}x.`,
    };
  }
  if (pNav <= p.veryStrong.pNavMax && peak6xVsPrice >= p.veryStrong.peak6xVsPriceMin) {
    return {
      classification: 'VERY_STRONG', pNav, peak6xVsPrice,
      reason: `Very strong convergence: P/NAV PF ${pNav.toFixed(3)}x ≤ ${p.veryStrong.pNavMax.toFixed(2)}x och Peak 6x / pris ${peak6xVsPrice.toFixed(2)}x ≥ ${p.veryStrong.peak6xVsPriceMin.toFixed(1)}x.`,
    };
  }
  if (pNav <= p.strong.pNavMax && peak6xVsPrice >= p.strong.peak6xVsPriceMin) {
    return {
      classification: 'STRONG', pNav, peak6xVsPrice,
      reason: `Strong convergence: P/NAV PF ${pNav.toFixed(3)}x ≤ ${p.strong.pNavMax.toFixed(2)}x och Peak 6x / pris ${peak6xVsPrice.toFixed(2)}x ≥ ${p.strong.peak6xVsPriceMin.toFixed(1)}x.`,
    };
  }

  if (pNav <= p.strong.pNavMax && peak6xVsPrice < p.contradictoryPeak6xVsPriceMax) {
    return {
      classification: 'CONTRADICTORY', pNav, peak6xVsPrice,
      reason: `Valuation divergence: P/NAV PF ${pNav.toFixed(3)}x indikerar tydlig NAV-rabatt, men Peak 6x / pris ${peak6xVsPrice.toFixed(2)}x är under ${p.contradictoryPeak6xVsPriceMax.toFixed(1)}x. En andra värderingsmetod verifierar därför inte undervärderingen.`,
    };
  }

  const navPass = pNav <= p.strong.pNavMax;
  const earningsPass = peak6xVsPrice >= p.strong.peak6xVsPriceMin;
  return {
    classification: 'MIXED', pNav, peak6xVsPrice,
    reason: navPass !== earningsPass
      ? `Mixed convergence: endast ett av de två oberoende värderingsbenen når Strong-nivå (P/NAV PF ${pNav.toFixed(3)}x; Peak 6x / pris ${peak6xVsPrice.toFixed(2)}x).`
      : `Ingen Strong valuation convergence: P/NAV PF ${pNav.toFixed(3)}x och Peak 6x / pris ${peak6xVsPrice.toFixed(2)}x når inte samtidigt minimikraven.`,
  };
}

export function valuationConvergencePasses(
  actual: ValuationConvergence,
  required: 'EXTREME' | 'VERY_STRONG' | 'STRONG',
): boolean | null {
  if (actual === 'NOT_VERIFIED') return null;
  const rank: Record<Exclude<ValuationConvergence, 'NOT_VERIFIED'>, number> = {
    CONTRADICTORY: 0,
    MIXED: 0,
    STRONG: 1,
    VERY_STRONG: 2,
    EXTREME: 3,
  };
  const requiredRank = required === 'STRONG' ? 1 : required === 'VERY_STRONG' ? 2 : 3;
  return rank[actual] >= requiredRank;
}
