import type { CommodityExposure } from "./commodityExposureTypes";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function normalizeExposureWeights(exposures: CommodityExposure[]): CommodityExposure[] {
  const cleaned = exposures
    .map((exposure) => ({
      ...exposure,
      weight: clamp01(exposure.weight),
      confidence: clamp01(exposure.confidence),
    }))
    .filter((exposure) => exposure.weight > 0);

  const sum = cleaned.reduce((acc, exposure) => acc + exposure.weight, 0);
  if (sum <= 0) {
    return [];
  }

  return cleaned.map((exposure) => ({
    ...exposure,
    weight: exposure.weight / sum,
  }));
}
