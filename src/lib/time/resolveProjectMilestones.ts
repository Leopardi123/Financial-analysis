export type ProjectMilestonesV2 = {
  firstProductionPeriod: number;
  commercialProductionPeriod: number;
  valuationMilestonePeriod: number;
};

function asOptionalPeriod(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be null or an integer >= 0. Received ${String(value)}.`);
  }
  return value;
}

/**
 * Resolves the three distinct project timeline concepts used by valuation:
 * - firstProductionPeriod: first physical production / commissioning output;
 * - commercialProductionPeriod: declared commercial-production milestone;
 * - valuationMilestonePeriod: future target-price valuation anchor.
 *
 * Backward compatibility is deliberate: old project_json_v2 inputs that omit the
 * two optional milestones resolve both to productionStartPeriod and therefore
 * retain their existing semantics until explicitly upgraded.
 */
export function resolveProjectMilestonesV2(args: {
  masterN: number;
  productionStartPeriod: number;
  commercialProductionPeriod?: number | null;
  valuationMilestonePeriod?: number | null;
}): ProjectMilestonesV2 {
  if (!Number.isInteger(args.masterN) || args.masterN < 0) {
    throw new Error(`masterN must be an integer >= 0. Received ${String(args.masterN)}.`);
  }
  if (!Number.isInteger(args.productionStartPeriod) || args.productionStartPeriod < 0 || args.productionStartPeriod > args.masterN) {
    throw new Error(`productionStartPeriod must be an integer in [0, masterN]. Received ${String(args.productionStartPeriod)}.`);
  }

  const commercialExplicit = asOptionalPeriod(args.commercialProductionPeriod, 'commercialProductionPeriod');
  const commercialProductionPeriod = commercialExplicit ?? args.productionStartPeriod;
  if (commercialProductionPeriod < args.productionStartPeriod) {
    throw new Error(
      `commercialProductionPeriod must be >= productionStartPeriod. Received commercial=${commercialProductionPeriod}, production=${args.productionStartPeriod}.`,
    );
  }
  if (commercialProductionPeriod > args.masterN) {
    throw new Error(`commercialProductionPeriod must be <= masterN. Received commercial=${commercialProductionPeriod}, masterN=${args.masterN}.`);
  }

  const valuationExplicit = asOptionalPeriod(args.valuationMilestonePeriod, 'valuationMilestonePeriod');
  const valuationMilestonePeriod = valuationExplicit ?? commercialProductionPeriod;
  if (valuationMilestonePeriod < args.productionStartPeriod) {
    throw new Error(
      `valuationMilestonePeriod must be >= productionStartPeriod. Received valuation=${valuationMilestonePeriod}, production=${args.productionStartPeriod}.`,
    );
  }
  if (valuationMilestonePeriod > args.masterN) {
    throw new Error(`valuationMilestonePeriod must be <= masterN. Received valuation=${valuationMilestonePeriod}, masterN=${args.masterN}.`);
  }

  return {
    firstProductionPeriod: args.productionStartPeriod,
    commercialProductionPeriod,
    valuationMilestonePeriod,
  };
}
