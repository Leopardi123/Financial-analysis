import type { PriceScenarioSet } from './types.ts';

export type ScenarioPresetConfig = {
  masterN: number;
  lowMultiplier: number;
  highMultiplier: number;
  perMetal?: Record<string, { low?: number; high?: number } | null> | null;
  roundTo?: number | null;
};

function assertValidMultiplier(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than 0`);
  }
}

function roundValue(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildPriceScenarioSetFromSpot(
  spotPriceUSDByMetal: Record<string, (number | null)[]>,
  config: ScenarioPresetConfig,
): PriceScenarioSet {
  const { masterN, lowMultiplier, highMultiplier, perMetal = null, roundTo = null } = config;

  if (!Number.isInteger(masterN) || masterN < 0) {
    throw new Error('masterN must be an integer greater than or equal to 0');
  }

  assertValidMultiplier(lowMultiplier, 'lowMultiplier');
  assertValidMultiplier(highMultiplier, 'highMultiplier');

  let roundDigits: number | null = null;

  if (roundTo !== null && roundTo !== undefined) {
    if (!Number.isInteger(roundTo) || roundTo < 0) {
      throw new Error('roundTo must be null or an integer greater than or equal to 0');
    }

    roundDigits = roundTo;
  }

  const expectedLength = masterN + 1;
  const spotOutput: Record<string, (number | null)[]> = {};
  const lowOutput: Record<string, (number | null)[]> = {};
  const highOutput: Record<string, (number | null)[]> = {};

  for (const [metal, series] of Object.entries(spotPriceUSDByMetal)) {
    if (series.length !== expectedLength) {
      throw new Error(
        `spot series length mismatch for metal ${metal}: got ${series.length}, expected ${expectedLength}`,
      );
    }

    const metalOverride = perMetal?.[metal] ?? null;
    const effectiveLowMultiplier = metalOverride?.low ?? lowMultiplier;
    const effectiveHighMultiplier = metalOverride?.high ?? highMultiplier;

    assertValidMultiplier(effectiveLowMultiplier, `perMetal.${metal}.low`);
    assertValidMultiplier(effectiveHighMultiplier, `perMetal.${metal}.high`);

    const spotSeries: (number | null)[] = new Array(expectedLength);
    const lowSeries: (number | null)[] = new Array(expectedLength);
    const highSeries: (number | null)[] = new Array(expectedLength);

    for (let i = 0; i < expectedLength; i += 1) {
      const spot = series[i];

      if (spot === null || !Number.isFinite(spot)) {
        spotSeries[i] = null;
        lowSeries[i] = null;
        highSeries[i] = null;
        continue;
      }

      if (spot < 0) {
        throw new Error(`spot price cannot be negative for metal ${metal} at index ${i}`);
      }

      const spotValue = roundDigits === null ? spot : roundValue(spot, roundDigits);
      const lowValueRaw = spot * effectiveLowMultiplier;
      const highValueRaw = spot * effectiveHighMultiplier;

      spotSeries[i] = spotValue;
      lowSeries[i] = roundDigits === null ? lowValueRaw : roundValue(lowValueRaw, roundDigits);
      highSeries[i] = roundDigits === null ? highValueRaw : roundValue(highValueRaw, roundDigits);
    }

    spotOutput[metal] = spotSeries;
    lowOutput[metal] = lowSeries;
    highOutput[metal] = highSeries;
  }

  return {
    SPOT: spotOutput,
    LOW: lowOutput,
    HIGH: highOutput,
  };
}
