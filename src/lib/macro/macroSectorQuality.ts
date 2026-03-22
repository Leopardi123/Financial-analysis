import type { MacroSectorMap, MacroSectorMapItem } from "./macroSectorMap";

export type MacroSignalQuality = "coherent" | "mixed" | "contested" | "fragile";

export type RegimeCoherenceLevel = "high" | "medium" | "low";
export type TransitionRiskLevel = "low" | "elevated" | "high";

export type MacroSectorQualityContext = {
  regimeCoherence: RegimeCoherenceLevel;
  transitionRisk: TransitionRiskLevel;
  contradictingOverlays?: string[];
  modulatingOverlays?: string[];
  sectorOverlayAttribution?: Partial<Record<string, { contradictingOverlays?: string[]; modulatingOverlays?: string[] }>>;
};

export type MacroSectorWithQuality = MacroSectorMapItem & {
  bucket: "favored" | "neutral" | "underPressure";
  quality: MacroSignalQuality;
};

export type MacroSectorQualityMap = {
  favored: MacroSectorWithQuality[];
  neutral: MacroSectorWithQuality[];
  underPressure: MacroSectorWithQuality[];
  metadata: MacroSectorMap["metadata"] & { qualityLayer: "read_only_v1" };
};

function chooseQuality(
  item: MacroSectorMapItem,
  bucket: MacroSectorWithQuality["bucket"],
  context: MacroSectorQualityContext
): { quality: MacroSignalQuality; rationale: string } {
  const macroContradicting = Array.isArray(context.contradictingOverlays) ? context.contradictingOverlays : [];
  const macroModulating = Array.isArray(context.modulatingOverlays) ? context.modulatingOverlays : [];
  const attributed = context.sectorOverlayAttribution?.[item.id];
  const contradicting = Array.isArray(attributed?.contradictingOverlays)
    ? attributed.contradictingOverlays
    : macroContradicting;
  const modulating = Array.isArray(attributed?.modulatingOverlays)
    ? attributed.modulatingOverlays
    : macroModulating;

  const contradictionCount = contradicting.length;
  const modulationCount = modulating.length;
  const directionClear = bucket !== "neutral";
  const lowCoherence = context.regimeCoherence === "low";
  const elevatedTransitionRisk = context.transitionRisk === "elevated" || context.transitionRisk === "high";

  if (lowCoherence || elevatedTransitionRisk) {
    return {
      quality: "fragile",
      rationale: lowCoherence
        ? "Low regime coherence weakens persistence of the macro signal."
        : "Elevated regime transition risk can quickly unwind sector direction.",
    };
  }

  if (directionClear && contradictionCount > 0) {
    return {
      quality: "contested",
      rationale: `${contradictionCount} contradicting overlay${contradictionCount > 1 ? "s" : ""} challenge the sector direction.`,
    };
  }

  if (bucket === "neutral" || modulationCount >= 2) {
    const mixedReason = bucket === "neutral"
      ? "Neutral bucket indicates no strong one-way macro push."
      : `${modulationCount} modulating overlays dampen one-way conviction.`;
    return {
      quality: "mixed",
      rationale: mixedReason,
    };
  }

  return {
    quality: "coherent",
    rationale: "Direction is clear with limited contradiction from overlays.",
  };
}

function withQuality(
  items: MacroSectorMapItem[],
  bucket: MacroSectorWithQuality["bucket"],
  context: MacroSectorQualityContext
): MacroSectorWithQuality[] {
  return items.map((item) => {
    const interpreted = chooseQuality(item, bucket, context);
    return {
      ...item,
      bucket,
      quality: interpreted.quality,
      rationale: `${item.rationale} | ${interpreted.rationale}`,
    };
  });
}

export function buildMacroSectorQualityMap(
  sectorMap: MacroSectorMap,
  context: MacroSectorQualityContext
): MacroSectorQualityMap {
  return {
    favored: withQuality(sectorMap.favored, "favored", context),
    neutral: withQuality(sectorMap.neutral, "neutral", context),
    underPressure: withQuality(sectorMap.underPressure, "underPressure", context),
    metadata: {
      ...sectorMap.metadata,
      qualityLayer: "read_only_v1",
    },
  };
}
