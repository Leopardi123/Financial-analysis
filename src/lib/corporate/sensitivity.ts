export const CORPORATE_METAL_PRICE_MULTIPLIERS = [0.75, 0.85, 0.95, 1, 1.05, 1.15, 1.25] as const;
export type CorporateMetalPriceMultiplier = typeof CORPORATE_METAL_PRICE_MULTIPLIERS[number];
export type CorporateScenarioStatus = 'COMPUTABLE' | 'PARTIAL' | 'NOT_COMPUTABLE';

export function corporateScenarioLabel(multiplier: CorporateMetalPriceMultiplier): string {
  if (multiplier === 1) return 'Spot';
  const delta = Math.round((multiplier - 1) * 100);
  return `Spot ${delta < 0 ? '−' : '+'}${Math.abs(delta)} %`;
}

/** Creates an isolated request which is re-run by the normal project/corporate pipeline. */
export function createCorporateMetalPriceScenarioRequest<T extends Record<string, unknown>>(
  baseRequest: T,
  multiplier: CorporateMetalPriceMultiplier,
): T {
  return {
    ...baseRequest,
    scenario: { mode: 'spot', spotPriceMultiplier: multiplier },
    fx: typeof baseRequest.fx === 'object' && baseRequest.fx !== null
      ? { ...(baseRequest.fx as Record<string, unknown>) }
      : baseRequest.fx,
  };
}

export function classifyCorporateScenario(diagnostics: { errors?: string[]; warnings?: string[] } | null | undefined): CorporateScenarioStatus {
  if (diagnostics?.errors?.length) return 'NOT_COMPUTABLE';
  if (diagnostics?.warnings?.some((warning) => /missing|null|invalid|incomplete|unsupported/i.test(warning))) return 'PARTIAL';
  return 'COMPUTABLE';
}
