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
  | "other";

export type CommodityExposureEvidence =
  | "manual_mapping"
  | "subsector_inference"
  | "sector_inference"
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
};
