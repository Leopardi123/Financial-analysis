import {
  inferCommodityExposureFromCanonical,
} from "./commodityExposureInference";
import type {
  CompanyCommodityExposureProfile,
  CommodityExposure,
  CommodityExposureEvidence,
  CommodityKey,
} from "./commodityExposureTypes";

type CompanyCanonicalMapping = {
  companyId: string;
  sectorId: string;
  subsectorId?: string | null;
  ticker?: string | null;
};

type ExposureComputationResult = {
  profile: CompanyCommodityExposureProfile;
  note?: string;
};

function resolvePrimaryCommodity(exposures: CommodityExposure[]): CommodityKey | undefined {
  if (exposures.length === 0) return undefined;
  const sorted = [...exposures].sort((a, b) => b.weight - a.weight);
  if (!sorted[0]) return undefined;
  if (sorted.length > 1 && sorted[0].weight === sorted[1].weight) return undefined;
  return sorted[0].commodity;
}

function resolveBasis(exposures: CommodityExposure[], fallbackBasis: CommodityExposureEvidence): CompanyCommodityExposureProfile["basis"] {
  if (exposures.length === 0) return fallbackBasis;
  const evidences = new Set(exposures.map((exposure) => exposure.evidence));
  if (evidences.size === 1) {
    return exposures[0]?.evidence ?? fallbackBasis;
  }
  return "mixed";
}

export function computeCompanyCommodityExposure(mapping: CompanyCanonicalMapping): ExposureComputationResult {
  const inference = inferCommodityExposureFromCanonical(mapping.sectorId, mapping.subsectorId);
  const exposures = inference.exposures;
  const primaryCommodity = resolvePrimaryCommodity(exposures);
  const hasDominantWeight = exposures.some((exposure) => exposure.weight >= 0.5);
  const isDiversified =
    mapping.subsectorId === "diversified_miners"
    || inference.lowConfidenceBasket === true
    || (exposures.length > 1 && !hasDominantWeight);

  return {
    profile: {
      companyId: mapping.companyId,
      exposures,
      primaryCommodity,
      isDiversified,
      basis: resolveBasis(exposures, inference.basis),
    },
    note: inference.note,
  };
}

export function computeCompanyCommodityExposureBatch(mappings: CompanyCanonicalMapping[]) {
  return mappings.map((mapping) => ({
    mapping,
    ...computeCompanyCommodityExposure(mapping),
  }));
}
