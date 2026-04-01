export type CommodityKey =
  | "gold"
  | "silver"
  | "copper"
  | "uranium"
  | "nickel"
  | "zinc"
  | "lead"
  | "pgm"
  | "tin"
  | "tungsten"
  | "lithium"
  | "coal"
  | "iron_ore"
  | "oil"
  | "gas"
  | "vanadium"
  | "other";

export type CommodityExposureEvidence =
  | "manual_mapping"
  | "subsector_inference"
  | "sector_inference"
  | "manual_override"
  | "fallback";

export type CommodityExposure = {
  commodity: CommodityKey;
  weight: number;
  evidence: CommodityExposureEvidence;
  confidence: number;
  notes?: string;
};

export type CompanyCommodityExposureProfile = {
  companyId: string;
  exposures: CommodityExposure[];
  primaryCommodity?: CommodityKey;
  isDiversified: boolean;
  basis: CommodityExposureEvidence | "mixed";
  confidence: number;
  notes?: string;
  source?: string;
};

export type ManualCommodityOverride = {
  companyId: string;
  exposures: Array<{
    commodity: CommodityKey;
    weight: number;
  }>;
  source?: string;
  note?: string;
  updatedAt?: string;
};
