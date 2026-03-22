import { getMacroSectorUniverseNode, getSubsectorMacroRouting, macroSectorUniverse } from "./macroSectorUniverse.ts";

export type CoverageLevel = "high" | "medium" | "low" | "minimal";
export type InterpretationPath = "explicit_subsector" | "sector_fallback" | "bucket_fallback" | "neutral_default";

export type SubsectorDriverCoverage = {
  subsectorId: string;
  sectorId: string;
  explicitDrivers: string[];
  sectorFallbackDrivers: string[];
  macroBucketFallbackDrivers: string[];
  driverTypes: {
    regimeBlockInputs: string[];
    overlays: string[];
    marketAssetsAndThemes: string[];
  };
  fallbackOnly: {
    usesSectorFallback: boolean;
    usesMacroBucketFallback: boolean;
    routingCoverage: "explicit" | "limited";
  };
  interpretationPath: InterpretationPath;
  currentCoverageLevel: CoverageLevel;
  likelyBlindSpots: string[];
};

export type DifferentiationQuality =
  | "clearly differentiated"
  | "partially differentiated"
  | "weakly differentiated"
  | "not meaningfully differentiated";

export type SubsectorDifferentiationResult = {
  pair: [string, string];
  quality: DifferentiationQuality;
  overlapDrivers: string[];
  uniqueToLeft: string[];
  uniqueToRight: string[];
  note: string;
};

export type OverlayGapCandidate = {
  overlayId: string;
  priority: number;
  helpsSubsectors: string[];
  fillsBlindSpot: string;
  profile: "broad-system" | "thematic" | "subsector-heavy";
  evidence: {
    blindSpotHitCount: number;
    exampleSubsectors: string[];
  };
};

export type SubsectorCoverageAuditReport = {
  generatedAt: string;
  matrix: Record<string, SubsectorDriverCoverage>;
  differentiationChecks: SubsectorDifferentiationResult[];
  rankedOverlayGaps: OverlayGapCandidate[];
};

const OVERLAY_DRIVER_IDS = new Set([
  "liquidityOverlay",
  "creditFundingOverlay",
  "energyShockOverlay",
  "localUnrestOverlay",
  "safeHavenRiskOffOverlay",
  "inflationCostShockOverlay",
  "tradeSupplyChainStressOverlay",
  "growthOverlay",
  "stressOverlay",
  "hardAssetOverlay",
]);

const REGIME_INPUT_IDS = new Set([
  "MonetaryDominance",
  "Balanced",
  "FiscalPressureBuilding",
  "FiscalDominanceRisk",
  "fiscal",
  "monetary",
  "inflation",
  "credibility",
]);

const REQUIRED_DIFFERENTIATION_PAIRS: Array<[string, string]> = [
  ["gold_miners", "copper_miners"],
  ["oil_gas_producers", "refiners"],
  ["banks", "insurers"],
  ["semiconductors", "software"],
  ["uranium", "coal"],
  ["shipping", "airlines"],
  ["regulated_utilities", "reits_rate_sensitive"],
];

const OVERLAY_GAP_DEFINITIONS: Array<Omit<OverlayGapCandidate, "evidence"> & { blindSpotTags: string[] }> = [
  {
    overlayId: "maritimeTradeRouteStress",
    priority: 1,
    helpsSubsectors: ["shipping", "ports_infrastructure", "logistics", "airlines", "insurers", "refiners"],
    fillsBlindSpot: "Chokepoints, rerouting risk, freight dislocation, and war-risk insurance dynamics are not explicitly modeled.",
    profile: "thematic",
    blindSpotTags: ["maritime_routes", "trade_routes", "chokepoints"],
  },
  {
    overlayId: "energyAvailabilityPowerSufficiency",
    priority: 2,
    helpsSubsectors: ["uranium", "coal", "power_grid_utilities", "independent_power", "chemicals", "steel"],
    fillsBlindSpot: "Physical energy tightness and grid adequacy are weakly captured beyond price-sensitive overlays.",
    profile: "broad-system",
    blindSpotTags: ["energy_availability", "power_sufficiency", "grid_constraints"],
  },
  {
    overlayId: "futurePowerDemandElectrification",
    priority: 3,
    helpsSubsectors: ["uranium", "copper_miners", "electrical_equipment", "power_grid_utilities", "data_center_reits"],
    fillsBlindSpot: "Forward demand from electrification/AI power draw is not represented in current overlays.",
    profile: "thematic",
    blindSpotTags: ["electrification", "future_power_demand", "forward_capex_demand"],
  },
  {
    overlayId: "defenseSecurityCycle",
    priority: 4,
    helpsSubsectors: ["defense_contractors", "aerospace_defense", "cybersecurity", "shipping", "energy_equipment"],
    fillsBlindSpot: "Security procurement cycles and defense replenishment cadence are conflated into a single unrest signal.",
    profile: "thematic",
    blindSpotTags: ["defense_budget_cycle", "security_restocking", "procurement_cycle"],
  },
  {
    overlayId: "industrialCapexRebuild",
    priority: 5,
    helpsSubsectors: ["capital_goods", "machinery", "engineering_construction", "steel", "chemicals", "electrical_equipment"],
    fillsBlindSpot: "Industrial rebuild and re-shoring capex impulses are not directly distinguishable from generic cyclicality.",
    profile: "subsector-heavy",
    blindSpotTags: ["industrial_rebuild", "reshoring_capex", "infrastructure_cycle"],
  },
];

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function classifyDrivers(drivers: string[]) {
  const regimeBlockInputs: string[] = [];
  const overlays: string[] = [];
  const marketAssetsAndThemes: string[] = [];

  drivers.forEach((driverId) => {
    if (OVERLAY_DRIVER_IDS.has(driverId)) overlays.push(driverId);
    else if (REGIME_INPUT_IDS.has(driverId)) regimeBlockInputs.push(driverId);
    else marketAssetsAndThemes.push(driverId);
  });

  return {
    regimeBlockInputs: uniq(regimeBlockInputs),
    overlays: uniq(overlays),
    marketAssetsAndThemes: uniq(marketAssetsAndThemes),
  };
}

function computeInterpretationPath(item: SubsectorDriverCoverage): InterpretationPath {
  if (item.explicitDrivers.length > 0 && item.fallbackOnly.routingCoverage === "explicit") return "explicit_subsector";
  if (item.sectorFallbackDrivers.length > 0) return "sector_fallback";
  if (item.macroBucketFallbackDrivers.length > 0) return "bucket_fallback";
  return "neutral_default";
}

function computeCoverageLevel(item: SubsectorDriverCoverage): CoverageLevel {
  const explicitCount = item.explicitDrivers.length;
  const overlayCount = item.driverTypes.overlays.length;
  const regimeCount = item.driverTypes.regimeBlockInputs.length;

  if (item.interpretationPath === "neutral_default") return "minimal";
  if (item.fallbackOnly.routingCoverage === "limited") return item.macroBucketFallbackDrivers.length > 0 ? "low" : "minimal";

  if (explicitCount >= 3 && overlayCount >= 2) return "high";
  if (explicitCount >= 2 && (overlayCount >= 1 || regimeCount >= 1)) return "medium";
  if (explicitCount >= 1) return "low";
  return "minimal";
}

function deriveBlindSpots(item: SubsectorDriverCoverage): string[] {
  const blindSpots: string[] = [];
  const drivers = new Set(uniq([...item.explicitDrivers, ...item.sectorFallbackDrivers, ...item.macroBucketFallbackDrivers]));

  if (item.fallbackOnly.routingCoverage === "limited") blindSpots.push("no_explicit_subsector_routing");
  if (item.driverTypes.overlays.length === 0) blindSpots.push("no_overlay_linkage");
  if (item.driverTypes.regimeBlockInputs.length === 0) blindSpots.push("no_direct_regime_block_input");

  if (drivers.has("shipping") || item.subsectorId === "shipping" || item.subsectorId === "ports_infrastructure") {
    if (!drivers.has("tradeSupplyChainStressOverlay")) blindSpots.push("maritime_routes");
  }

  if (["uranium", "coal", "power_grid_utilities", "independent_power"].includes(item.subsectorId)) {
    blindSpots.push("energy_availability");
    if (!drivers.has("inflationCostShockOverlay")) blindSpots.push("power_sufficiency");
  }

  if (["defense_contractors", "aerospace_defense", "cybersecurity"].includes(item.subsectorId)) {
    blindSpots.push("defense_budget_cycle");
  }

  if (["capital_goods", "machinery", "engineering_construction", "electrical_equipment", "steel"].includes(item.subsectorId)) {
    blindSpots.push("industrial_rebuild");
  }

  if (["copper_miners", "uranium", "power_grid_utilities", "data_center_reits"].includes(item.subsectorId)) {
    blindSpots.push("future_power_demand");
  }

  if (["banks", "regional_banks", "specialty_finance"].includes(item.subsectorId) && !drivers.has("creditFundingOverlay")) {
    blindSpots.push("credit_transmission_depth");
  }

  return uniq(blindSpots);
}

function compareDifferentiation(
  matrix: Record<string, SubsectorDriverCoverage>,
  leftId: string,
  rightId: string
): SubsectorDifferentiationResult {
  const left = matrix[leftId];
  const right = matrix[rightId];

  const leftDrivers = uniq([
    ...left.explicitDrivers,
    ...left.sectorFallbackDrivers,
    ...left.macroBucketFallbackDrivers,
  ]);
  const rightDrivers = uniq([
    ...right.explicitDrivers,
    ...right.sectorFallbackDrivers,
    ...right.macroBucketFallbackDrivers,
  ]);

  const overlapDrivers = leftDrivers.filter((driver) => rightDrivers.includes(driver));
  const uniqueToLeft = leftDrivers.filter((driver) => !rightDrivers.includes(driver));
  const uniqueToRight = rightDrivers.filter((driver) => !leftDrivers.includes(driver));

  const overlapRatio = overlapDrivers.length / Math.max(1, Math.max(leftDrivers.length, rightDrivers.length));
  const totalUnique = uniqueToLeft.length + uniqueToRight.length;
  let quality: DifferentiationQuality = "not meaningfully differentiated";

  if (totalUnique >= 3 && overlapRatio <= 0.5) quality = "clearly differentiated";
  else if (totalUnique >= 2 && overlapRatio <= 0.75) quality = "partially differentiated";
  else if (totalUnique >= 1) quality = "weakly differentiated";

  const note = quality === "not meaningfully differentiated"
    ? "Pair relies on highly overlapping driver stacks and fallback inheritance."
    : quality === "weakly differentiated"
      ? "Some unique drivers exist, but overlap remains dominant."
      : quality === "partially differentiated"
        ? "There is meaningful differentiation, but substantial shared macro plumbing remains."
        : "Distinct explicit + fallback stacks create robust macro differentiation.";

  return {
    pair: [leftId, rightId],
    quality,
    overlapDrivers,
    uniqueToLeft,
    uniqueToRight,
    note,
  };
}

function rankOverlayGaps(matrix: Record<string, SubsectorDriverCoverage>): OverlayGapCandidate[] {
  return OVERLAY_GAP_DEFINITIONS.map((candidate) => {
    const impacted = Object.values(matrix).filter((item) =>
      item.likelyBlindSpots.some((blindSpot) => candidate.blindSpotTags.includes(blindSpot))
      || candidate.helpsSubsectors.includes(item.subsectorId)
    );

    return {
      overlayId: candidate.overlayId,
      priority: candidate.priority,
      helpsSubsectors: candidate.helpsSubsectors,
      fillsBlindSpot: candidate.fillsBlindSpot,
      profile: candidate.profile,
      evidence: {
        blindSpotHitCount: impacted.length,
        exampleSubsectors: impacted.slice(0, 8).map((item) => item.subsectorId),
      },
    };
  }).sort((a, b) => a.priority - b.priority);
}

export function buildSubsectorDriverCoverageMatrix(): Record<string, SubsectorDriverCoverage> {
  const subsectors = macroSectorUniverse.sectors.filter((item) => item.category === "subsector");

  return subsectors.reduce<Record<string, SubsectorDriverCoverage>>((acc, subsector) => {
    const sectorId = subsector.parentId ?? "";
    const routing = getSubsectorMacroRouting(sectorId, subsector.id);
    const sectorNode = getMacroSectorUniverseNode(sectorId);

    const bucketFallbackDrivers = routing.macroBucketFallbackIds.flatMap((bucketId) => {
      const bucket = getMacroSectorUniverseNode(bucketId);
      return bucket?.assetDrivers ?? [];
    });

    const baseItem: SubsectorDriverCoverage = {
      subsectorId: subsector.id,
      sectorId,
      explicitDrivers: uniq(subsector.assetDrivers),
      sectorFallbackDrivers: uniq(sectorNode?.assetDrivers ?? []),
      macroBucketFallbackDrivers: uniq(bucketFallbackDrivers),
      driverTypes: classifyDrivers([
        ...subsector.assetDrivers,
        ...(sectorNode?.assetDrivers ?? []),
        ...bucketFallbackDrivers,
      ]),
      fallbackOnly: {
        usesSectorFallback: Boolean(sectorNode?.assetDrivers?.length),
        usesMacroBucketFallback: routing.macroBucketFallbackIds.length > 0,
        routingCoverage: routing.coverage,
      },
      interpretationPath: "neutral_default",
      currentCoverageLevel: "minimal",
      likelyBlindSpots: [],
    };

    baseItem.interpretationPath = computeInterpretationPath(baseItem);
    baseItem.currentCoverageLevel = computeCoverageLevel(baseItem);
    baseItem.likelyBlindSpots = deriveBlindSpots(baseItem);

    acc[subsector.id] = baseItem;
    return acc;
  }, {});
}

export function buildSubsectorCoverageAuditReport(nowIso: string = new Date().toISOString()): SubsectorCoverageAuditReport {
  const matrix = buildSubsectorDriverCoverageMatrix();
  const differentiationChecks = REQUIRED_DIFFERENTIATION_PAIRS.map(([left, right]) => compareDifferentiation(matrix, left, right));
  const rankedOverlayGaps = rankOverlayGaps(matrix);

  return {
    generatedAt: nowIso,
    matrix,
    differentiationChecks,
    rankedOverlayGaps,
  };
}
