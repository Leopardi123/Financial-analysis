export type MacroAssetBucket = "favored" | "neutral" | "underPressure";

type DriverRef = {
  id: string;
  title: string;
};

export type MacroAssetMapItem = {
  id: string;
  title: string;
  bucket: MacroAssetBucket;
  rationale: string;
  drivers: {
    regime: DriverRef[];
    overlays: DriverRef[];
  };
};

export type MacroAssetMap = {
  favored: MacroAssetMapItem[];
  neutral: MacroAssetMapItem[];
  underPressure: MacroAssetMapItem[];
  metadata: {
    primaryRegime: string;
    coherence: string;
    transitionRisk: string;
    timingState: string;
    riskPosture: string;
    actionBias: string;
  };
};

export type BuildMacroAssetMapInput = {
  primaryRegime: string;
  momentumDirection?: string | null;
  overlays?: {
    safeHavenRiskOffOverlay?: { score?: number | null };
    energyShockOverlay?: { score?: number | null };
    inflationCostShockOverlay?: { score?: number | null };
    localUnrestOverlay?: { score?: number | null };
    liquidityOverlay?: { score?: number | null };
    creditFundingOverlay?: { score?: number | null };
  };
  metadata?: {
    coherence?: string | null;
    transitionRisk?: string | null;
  };
};

const TITLES: Record<string, string> = {
  gold: "Gold",
  energy: "Energy",
  broadEquities: "Broad equities",
  durationAssets: "Duration assets",
  smallCaps: "Small caps",
  growthEquities: "Growth equities",
  industrials: "Industrials",
  copper: "Copper",
};

const REGIME_DRIVER_TITLES: Record<string, string> = {
  MonetaryDominance: "Monetary dominance regime",
  Balanced: "Balanced regime",
  FiscalPressureBuilding: "Fiscal pressure building regime",
  FiscalDominanceRisk: "Fiscal dominance risk regime",
  momentumWeakening: "Regime momentum is weakening/transitioning",
};

const OVERLAY_DRIVER_TITLES: Record<string, string> = {
  safeHavenRiskOffOverlay: "Safe-haven risk-off overlay",
  energyShockOverlay: "Energy shock overlay",
  inflationCostShockOverlay: "Inflation cost shock overlay",
  localUnrestOverlay: "Local unrest overlay",
  liquidityOverlay: "Liquidity contradiction overlay",
  creditFundingOverlay: "Credit/funding overlay",
};

export function buildMacroAssetMap(input: BuildMacroAssetMapInput): MacroAssetMap {
  const primaryRegime = String(input.primaryRegime || "Balanced");
  const momentumDirection = String(input.momentumDirection ?? "");
  const overlays = input.overlays ?? {};

  const favored: string[] = [];
  const neutral: string[] = [];
  const underPressure: string[] = [];

  const regimeDrivers = new Map<string, DriverRef[]>();
  const overlayDrivers = new Map<string, DriverRef[]>();

  const ensureDriver = (map: Map<string, DriverRef[]>, itemId: string, driver: DriverRef) => {
    const current = map.get(itemId) ?? [];
    if (!current.some((it) => it.id === driver.id)) current.push(driver);
    map.set(itemId, current);
  };

  const pushUnique = (list: string[], itemId: string) => {
    if (!itemId || list.includes(itemId)) return;
    list.push(itemId);
  };

  const moveItem = (from: string[], to: string[], itemId: string) => {
    const idx = from.indexOf(itemId);
    if (idx >= 0) from.splice(idx, 1);
    pushUnique(to, itemId);
  };

  const addRegimeDriver = (itemId: string, regimeId: string) => {
    ensureDriver(regimeDrivers, itemId, {
      id: regimeId,
      title: REGIME_DRIVER_TITLES[regimeId] ?? regimeId,
    });
  };

  const addOverlayDriver = (itemId: string, overlayId: string) => {
    ensureDriver(overlayDrivers, itemId, {
      id: overlayId,
      title: OVERLAY_DRIVER_TITLES[overlayId] ?? overlayId,
    });
  };

  if (primaryRegime === "FiscalPressureBuilding") {
    pushUnique(favored, "gold");
    pushUnique(favored, "energy");
    pushUnique(neutral, "broadEquities");
    pushUnique(underPressure, "durationAssets");
    pushUnique(underPressure, "smallCaps");
  } else if (primaryRegime === "MonetaryDominance") {
    pushUnique(favored, "durationAssets");
    pushUnique(favored, "growthEquities");
    pushUnique(neutral, "broadEquities");
    pushUnique(neutral, "industrials");
  } else if (primaryRegime === "FiscalDominanceRisk") {
    pushUnique(favored, "gold");
    pushUnique(favored, "energy");
    pushUnique(underPressure, "durationAssets");
    pushUnique(underPressure, "smallCaps");
    pushUnique(neutral, "broadEquities");
  } else {
    pushUnique(neutral, "broadEquities");
    pushUnique(neutral, "industrials");
    pushUnique(neutral, "durationAssets");
    pushUnique(neutral, "gold");
  }

  [...favored, ...neutral, ...underPressure].forEach((itemId) => addRegimeDriver(itemId, primaryRegime));

  if (momentumDirection === "weakening" || momentumDirection === "transitioning") {
    if (favored.includes("growthEquities")) {
      moveItem(favored, neutral, "growthEquities");
      addRegimeDriver("growthEquities", "momentumWeakening");
    }
    if (underPressure.includes("smallCaps")) {
      moveItem(underPressure, neutral, "smallCaps");
      addRegimeDriver("smallCaps", "momentumWeakening");
    }
  }

  const isSupportive = (score: number | null | undefined) => typeof score === "number" && score >= 60;
  const isContradicting = (score: number | null | undefined) => typeof score === "number" && score <= 40;

  if (isSupportive(overlays.safeHavenRiskOffOverlay?.score)) {
    pushUnique(favored, "gold");
    addOverlayDriver("gold", "safeHavenRiskOffOverlay");
  }

  const energyShockSupportive = isSupportive(overlays.energyShockOverlay?.score);
  const inflationCostShockSupportive = isSupportive(overlays.inflationCostShockOverlay?.score);
  if (energyShockSupportive || inflationCostShockSupportive) {
    pushUnique(favored, "energy");
    if (energyShockSupportive) addOverlayDriver("energy", "energyShockOverlay");
    if (inflationCostShockSupportive) addOverlayDriver("energy", "inflationCostShockOverlay");
  }
  if (energyShockSupportive && inflationCostShockSupportive) {
    pushUnique(favored, "copper");
    addOverlayDriver("copper", "energyShockOverlay");
    addOverlayDriver("copper", "inflationCostShockOverlay");
  }

  if (isSupportive(overlays.localUnrestOverlay?.score)) {
    pushUnique(favored, "gold");
    pushUnique(favored, "energy");
    addOverlayDriver("gold", "localUnrestOverlay");
    addOverlayDriver("energy", "localUnrestOverlay");
  }

  if (isContradicting(overlays.liquidityOverlay?.score)) {
    while (underPressure.length > 0 && neutral.length < 4) {
      const moved = underPressure.shift();
      if (moved) {
        pushUnique(neutral, moved);
        addOverlayDriver(moved, "liquidityOverlay");
      }
    }
  }

  if (isSupportive(overlays.creditFundingOverlay?.score) && underPressure.includes("smallCaps")) {
    moveItem(underPressure, neutral, "smallCaps");
    addOverlayDriver("smallCaps", "creditFundingOverlay");
  }

  const buildItem = (bucket: MacroAssetBucket, itemId: string): MacroAssetMapItem => {
    const regime = regimeDrivers.get(itemId) ?? [];
    const overlay = overlayDrivers.get(itemId) ?? [];
    const rationaleParts: string[] = [];
    if (regime.length) rationaleParts.push(`Regime: ${regime.map((d) => d.title).join(", ")}`);
    if (overlay.length) rationaleParts.push(`Overlay: ${overlay.map((d) => d.title).join(", ")}`);
    return {
      id: itemId,
      title: TITLES[itemId] ?? itemId,
      bucket,
      rationale: rationaleParts.join(". ") || "Position is neutral in current macro interpretation.",
      drivers: {
        regime,
        overlays: overlay,
      },
    };
  };

  const riskPosture = primaryRegime === "MonetaryDominance"
    ? "Pro-duration"
    : primaryRegime === "FiscalPressureBuilding" || primaryRegime === "FiscalDominanceRisk"
      ? "Defensive hard-asset tilt"
      : "Balanced";

  const actionBias = primaryRegime === "MonetaryDominance"
    ? "Lean duration/growth"
    : primaryRegime === "FiscalPressureBuilding" || primaryRegime === "FiscalDominanceRisk"
      ? "Lean hard assets/quality"
      : "Keep optionality";

  return {
    favored: favored.slice(0, 4).map((itemId) => buildItem("favored", itemId)),
    neutral: neutral.slice(0, 4).map((itemId) => buildItem("neutral", itemId)),
    underPressure: underPressure.slice(0, 4).map((itemId) => buildItem("underPressure", itemId)),
    metadata: {
      primaryRegime,
      coherence: String(input.metadata?.coherence ?? "Unknown"),
      transitionRisk: String(input.metadata?.transitionRisk ?? "Unknown"),
      timingState: momentumDirection || "stable",
      riskPosture,
      actionBias,
    },
  };
}
