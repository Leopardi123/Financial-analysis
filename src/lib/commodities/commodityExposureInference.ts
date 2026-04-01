import type {
  CommodityExposure,
  CommodityExposureEvidence,
  CommodityKey,
} from "./commodityExposureTypes";
import { normalizeExposureWeights } from "./normalizeExposureWeights";

type InferenceResult = {
  exposures: CommodityExposure[];
  basis: CommodityExposureEvidence;
  note?: string;
  lowConfidenceBasket?: boolean;
};

type ExposureSeed = {
  commodity: CommodityKey;
  weight: number;
  confidence: number;
  notes?: string;
};

function fromSeed(seeds: ExposureSeed[], evidence: CommodityExposureEvidence): CommodityExposure[] {
  return normalizeExposureWeights(
    seeds.map((seed) => ({
      commodity: seed.commodity,
      weight: seed.weight,
      evidence,
      confidence: seed.confidence,
      notes: seed.notes,
    }))
  );
}

const MANUAL_SUBSECTOR_MAPPING: Record<string, ExposureSeed[] | null> = {
  gold_miners: [{ commodity: "gold", weight: 1, confidence: 0.95 }],
  silver_miners: [{ commodity: "silver", weight: 1, confidence: 0.95 }],
  copper_miners: [{ commodity: "copper", weight: 1, confidence: 0.95 }],
  uranium_miners: [{ commodity: "uranium", weight: 1, confidence: 0.95 }],
  lithium_miners: [{ commodity: "lithium", weight: 1, confidence: 0.95 }],
  diversified_miners: null,
};

const SUBSECTOR_BASKET_MAPPING: Record<string, ExposureSeed[] | null> = {
  precious_metals: [
    { commodity: "gold", weight: 0.5, confidence: 0.4, notes: "Basket approximation in v1." },
    { commodity: "silver", weight: 0.5, confidence: 0.4, notes: "Basket approximation in v1." },
  ],
  base_metals: [
    { commodity: "copper", weight: 0.34, confidence: 0.35, notes: "Low-confidence base-metals basket in v1." },
    { commodity: "zinc", weight: 0.33, confidence: 0.35, notes: "Low-confidence base-metals basket in v1." },
    { commodity: "lead", weight: 0.33, confidence: 0.35, notes: "Low-confidence base-metals basket in v1." },
  ],
  steel: [
    { commodity: "iron_ore", weight: 0.5, confidence: 0.3, notes: "Low-confidence steel input basket in v1." },
    { commodity: "coal", weight: 0.5, confidence: 0.3, notes: "Low-confidence steel input basket in v1." },
  ],
  chemicals: null,
  fertilizers: null,
  construction_materials: null,
  paper_packaging: null,
};

export function inferCommodityExposureFromCanonical(sectorId: string, subsectorId?: string | null): InferenceResult {
  if (subsectorId && Object.prototype.hasOwnProperty.call(MANUAL_SUBSECTOR_MAPPING, subsectorId)) {
    const mapped = MANUAL_SUBSECTOR_MAPPING[subsectorId];
    if (!mapped || mapped.length === 0) {
      return {
        exposures: [],
        basis: "manual_mapping",
        note: "Subsector is diversified; v1 avoids assumed commodity weights.",
      };
    }
    return {
      exposures: fromSeed(mapped, "manual_mapping"),
      basis: "manual_mapping",
    };
  }

  if (subsectorId && Object.prototype.hasOwnProperty.call(SUBSECTOR_BASKET_MAPPING, subsectorId)) {
    const inferred = SUBSECTOR_BASKET_MAPPING[subsectorId];
    if (!inferred || inferred.length === 0) {
      return {
        exposures: [],
        basis: "subsector_inference",
        note: "No safe subsector-level commodity inference in v1.",
      };
    }
    return {
      exposures: fromSeed(inferred, "subsector_inference"),
      basis: "subsector_inference",
      note: "Low-confidence subsector basket approximation.",
      lowConfidenceBasket: true,
    };
  }

  if (sectorId === "materials") {
    return {
      exposures: [],
      basis: "sector_inference",
      note: "Materials sector fallback is intentionally non-precise in v1.",
    };
  }

  return {
    exposures: [],
    basis: "fallback",
    note: "No safe commodity exposure inference available from canonical mapping.",
  };
}
