import {
  inferCommodityExposureFromCanonical,
} from "./commodityExposureInference";
import type {
  CompanyCommodityExposureProfile,
  ManualCommodityOverride,
  CommodityExposure,
  CommodityExposureEvidence,
  CommodityKey,
} from "./commodityExposureTypes";
import { normalizeExposureWeights } from "./normalizeExposureWeights";

type CompanyCanonicalMapping = {
  companyId: string;
  sectorId: string;
  subsectorId?: string | null;
  ticker?: string | null;
};

type ExposureComputationResult = {
  defaultProfile: CompanyCommodityExposureProfile;
  manualOverrideProfile?: CompanyCommodityExposureProfile;
  profile: CompanyCommodityExposureProfile;
  defaultNote?: string;
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

  const defaultProfile: CompanyCommodityExposureProfile = {
    companyId: mapping.companyId,
    exposures,
    primaryCommodity,
    isDiversified,
    basis: resolveBasis(exposures, inference.basis),
    confidence: exposures.length > 0
      ? exposures.reduce((acc, exposure) => acc + exposure.confidence, 0) / exposures.length
      : 0.2,
    notes: inference.note,
  };

  return {
    defaultProfile,
    profile: defaultProfile,
    defaultNote: inference.note,
  };
}

function manualOverrideToProfile(override: ManualCommodityOverride): CompanyCommodityExposureProfile {
  const normalized = normalizeExposureWeights(
    override.exposures.map((exposure) => ({
      commodity: exposure.commodity,
      weight: exposure.weight,
      evidence: "manual_override" as const,
      confidence: 0.95,
      notes: override.note,
    }))
  );
  const primaryCommodity = resolvePrimaryCommodity(normalized);
  const hasDominantWeight = normalized.some((exposure) => exposure.weight >= 0.5);
  return {
    companyId: override.companyId,
    exposures: normalized,
    primaryCommodity,
    isDiversified: normalized.length > 1 && !hasDominantWeight,
    basis: "manual_override",
    confidence: 0.95,
    notes: override.note,
    source: override.source,
  };
}

export function computeCompanyCommodityExposureBatch(
  mappings: CompanyCanonicalMapping[],
  manualOverridesByCompanyId?: Map<string, ManualCommodityOverride>
) {
  return mappings.map((mapping) => ({
    ...(() => {
      const base = computeCompanyCommodityExposure(mapping);
      const override = manualOverridesByCompanyId?.get(mapping.companyId);
      if (!override) {
        return { mapping, ...base };
      }
      const manualOverrideProfile = manualOverrideToProfile(override);
      return {
        mapping,
        ...base,
        manualOverrideProfile,
        profile: manualOverrideProfile,
      };
    })(),
  }));
}
