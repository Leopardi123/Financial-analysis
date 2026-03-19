import type { MacroRegimeProbability, MacroRegimeSnapshot } from "./types";

const REGIME_CENTERS: Array<{ regime: string; center: number }> = [
  { regime: "MonetaryDominance", center: 25 },
  { regime: "Balanced", center: 50 },
  { regime: "FiscalPressureBuilding", center: 68 },
  { regime: "FiscalDominanceRisk", center: 85 },
];

type OverlaySnapshot = {
  growthOverlay: string;
  stressOverlay: string;
  hardAssetOverlay: string;
};

type OverlayEffect = "supporting" | "modulating" | "contradicting";

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function overlaySignalForRegime(regime: string, overlay: OverlaySnapshot): "confirming" | "modulating" | "contradicting" {
  const growthStrong = overlay.growthOverlay === "Strong" || overlay.growthOverlay === "High";
  const growthWeak = overlay.growthOverlay === "Weak" || overlay.growthOverlay === "Low";
  const stressHigh = overlay.stressOverlay === "High";
  const stressLow = overlay.stressOverlay === "Low";
  const hardStrong = overlay.hardAssetOverlay === "Strong" || overlay.hardAssetOverlay === "High";

  if (regime === "MonetaryDominance") {
    if ((growthStrong || stressLow) && !hardStrong) return "confirming";
    if (stressHigh || hardStrong) return "contradicting";
    return "modulating";
  }
  if (regime === "Balanced") {
    if (!stressHigh && !hardStrong) return "confirming";
    if (stressHigh && hardStrong) return "contradicting";
    return "modulating";
  }
  if (regime === "FiscalPressureBuilding") {
    if (hardStrong || overlay.stressOverlay === "Medium" || growthWeak) return "confirming";
    if (growthStrong && stressLow) return "contradicting";
    return "modulating";
  }
  if (regime === "FiscalDominanceRisk") {
    if (stressHigh || hardStrong) return "confirming";
    if (stressLow && growthStrong) return "contradicting";
    return "modulating";
  }
  return "modulating";
}

function overlayMultiplier(signal: "confirming" | "modulating" | "contradicting"): number {
  if (signal === "confirming") return 1.08;
  if (signal === "contradicting") return 0.92;
  return 1;
}

function classifyGrowthEffect(regime: string, growthOverlay: string): OverlayEffect {
  const growthStrong = growthOverlay === "Strong" || growthOverlay === "High";
  const growthWeak = growthOverlay === "Weak" || growthOverlay === "Low";
  if (!growthStrong && !growthWeak) return "modulating";
  if (regime === "MonetaryDominance") return growthStrong ? "supporting" : "contradicting";
  if (regime === "Balanced") return growthStrong ? "supporting" : "modulating";
  if (regime === "FiscalPressureBuilding") return growthWeak ? "supporting" : "contradicting";
  if (regime === "FiscalDominanceRisk") return growthWeak ? "supporting" : "contradicting";
  return "modulating";
}

function classifyStressEffect(regime: string, stressOverlay: string): OverlayEffect {
  const high = stressOverlay === "High";
  const low = stressOverlay === "Low";
  const medium = stressOverlay === "Medium";
  if (!high && !low && !medium) return "modulating";
  if (regime === "MonetaryDominance") return low ? "supporting" : high ? "contradicting" : "modulating";
  if (regime === "Balanced") return low ? "supporting" : high ? "contradicting" : "modulating";
  if (regime === "FiscalPressureBuilding") return high || medium ? "supporting" : "contradicting";
  if (regime === "FiscalDominanceRisk") return high ? "supporting" : low ? "contradicting" : "modulating";
  return "modulating";
}

function classifyHardAssetEffect(regime: string, hardAssetOverlay: string): OverlayEffect {
  const strong = hardAssetOverlay === "Strong" || hardAssetOverlay === "High";
  const weak = hardAssetOverlay === "Weak" || hardAssetOverlay === "Low";
  if (!strong && !weak) return "modulating";
  if (regime === "MonetaryDominance") return strong ? "contradicting" : "supporting";
  if (regime === "Balanced") return strong ? "modulating" : "supporting";
  if (regime === "FiscalPressureBuilding") return strong ? "supporting" : "modulating";
  if (regime === "FiscalDominanceRisk") return strong ? "supporting" : "contradicting";
  return "modulating";
}

function overlayLabel(overlayName: "growthOverlay" | "stressOverlay" | "hardAssetOverlay", value: string) {
  return `${overlayName}:${value}`;
}

function overlayEffectForRegime(regime: string, overlay: OverlaySnapshot) {
  const effects = [
    { key: "growthOverlay" as const, value: overlay.growthOverlay, effect: classifyGrowthEffect(regime, overlay.growthOverlay) },
    { key: "stressOverlay" as const, value: overlay.stressOverlay, effect: classifyStressEffect(regime, overlay.stressOverlay) },
    { key: "hardAssetOverlay" as const, value: overlay.hardAssetOverlay, effect: classifyHardAssetEffect(regime, overlay.hardAssetOverlay) },
  ];
  const supporting = effects.filter((item) => item.effect === "supporting").map((item) => overlayLabel(item.key, item.value));
  const modulating = effects.filter((item) => item.effect === "modulating").map((item) => overlayLabel(item.key, item.value));
  const contradicting = effects.filter((item) => item.effect === "contradicting").map((item) => overlayLabel(item.key, item.value));
  const score = supporting.length - contradicting.length;
  return { supporting, modulating, contradicting, score };
}

function topAlternativeRegime(
  normalized: Array<{ regime: string; weight: number; signal: "confirming" | "modulating" | "contradicting" }>,
  primaryRegime: string,
  momentumDirection: "strengthening" | "weakening" | "stable" | "transitioning",
  overlay: OverlaySnapshot,
  gapToSecond: number,
) {
  const alternatives = normalized.filter((row) => row.regime !== primaryRegime).slice(0, 3);
  if (alternatives.length === 0) return null;
  const primaryOverlay = overlayEffectForRegime(primaryRegime, overlay);
  const ranked = alternatives
    .map((candidate) => {
      const candidateOverlay = overlayEffectForRegime(candidate.regime, overlay);
      const overlayTilt = candidateOverlay.score - primaryOverlay.score;
      const closeness = clamp(12 - (normalized[0].weight - candidate.weight), -12, 12);
      const momentumBias = momentumDirection === "weakening" || momentumDirection === "transitioning" ? 4 : -1;
      const score = (candidate.weight * 0.35) + closeness + (overlayTilt * 2.2) + momentumBias;
      return { regime: candidate.regime, score, overlayTilt, weight: candidate.weight };
    })
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return null;
  const closeEnough = gapToSecond <= 10;
  const overlaySuggests = top.overlayTilt >= 1;
  const momentumSuggests = momentumDirection === "weakening" || momentumDirection === "transitioning";
  return closeEnough || overlaySuggests || momentumSuggests ? top.regime : null;
}

export function buildMacroRegimeProbabilityFromSnapshot(input: {
  macroScoreTotal: number | null;
  macroConfidence: number;
  coreRegimeLabel: string;
  growthOverlay: string;
  stressOverlay: string;
  hardAssetOverlay: string;
  blockScores: MacroRegimeSnapshot["blockScores"];
  previous?: {
    macroScoreTotal: number | null;
    primaryRegime?: string | null;
    primaryWeight?: number | null;
    decisiveness?: number | null;
    distribution?: Array<{ regime: string; weight: number }>;
    blockScores?: Record<string, number | null>;
  } | null;
}): MacroRegimeProbability | null {
  if (typeof input.macroScoreTotal !== "number") return null;

  const score = input.macroScoreTotal;
  const overlayState: OverlaySnapshot = {
    growthOverlay: input.growthOverlay,
    stressOverlay: input.stressOverlay,
    hardAssetOverlay: input.hardAssetOverlay,
  };

  const confidenceMultiplier = clamp((typeof input.macroConfidence === "number" ? input.macroConfidence : 0) / 100, 0.35, 1);

  const raw = REGIME_CENTERS.map((item) => {
    const distance = Math.abs(score - item.center);
    const base = Math.exp(-distance / 16);
    const signal = overlaySignalForRegime(item.regime, overlayState);
    const withOverlay = base * overlayMultiplier(signal);
    return { regime: item.regime, value: Math.max(0.0001, withOverlay), signal };
  });

  const total = raw.reduce((sum, r) => sum + r.value, 0) || 1;
  const distribution = raw
    .map((r) => ({ regime: r.regime, weight: clamp((r.value / total) * 100 * confidenceMultiplier, 0, 100), signal: r.signal }))
    .sort((a, b) => b.weight - a.weight);

  const renormTotal = distribution.reduce((sum, r) => sum + r.weight, 0) || 1;
  const normalized = distribution.map((r) => ({ ...r, weight: clamp((r.weight / renormTotal) * 100, 0, 100) }));

  const top1 = normalized[0] ?? { regime: input.coreRegimeLabel, weight: 0, signal: "modulating" as const };
  const top2 = normalized[1] ?? { regime: "n/a", weight: 0, signal: "modulating" as const };
  const baseDecisiveness = clamp(top1.weight - top2.weight, 0, 100);

  const overlayConflictFactor = top1.signal === "contradicting" ? 0.78 : top1.signal === "modulating" ? 0.92 : 1;
  const confidenceFactor = confidenceMultiplier < 0.6 ? 0.82 : confidenceMultiplier < 0.75 ? 0.9 : 1;

  const previousDist = Array.isArray(input.previous?.distribution) ? input.previous?.distribution : [];
  const previousTopWeight = typeof input.previous?.primaryWeight === "number"
    ? input.previous?.primaryWeight
    : previousDist.find((d) => d.regime === top1.regime)?.weight ?? null;
  const previousSecondWeight = previousDist.find((d) => d.regime === top2.regime)?.weight ?? null;

  const primaryWeightDelta = previousTopWeight === null ? 0 : top1.weight - previousTopWeight;
  const secondWeightDelta = previousSecondWeight === null ? 0 : top2.weight - previousSecondWeight;
  const scoreDelta = typeof input.previous?.macroScoreTotal === "number" ? score - input.previous.macroScoreTotal : 0;
  const gapDelta = previousTopWeight !== null && previousSecondWeight !== null
    ? (top1.weight - top2.weight) - (previousTopWeight - previousSecondWeight)
    : 0;

  let direction: "strengthening" | "weakening" | "stable" | "transitioning" = "stable";
  if ((top1.weight - top2.weight) < 7 || (gapDelta < -2 && secondWeightDelta > 0)) direction = "transitioning";
  else if ((primaryWeightDelta > 1.2 && gapDelta > 0) || (scoreDelta > 2 && top1.signal === "confirming")) direction = "strengthening";
  else if ((primaryWeightDelta < -1.2) || (gapDelta < -1 && secondWeightDelta > 0) || top1.signal === "contradicting") direction = "weakening";

  const momentumFactor = direction === "weakening" ? 0.88 : direction === "transitioning" ? 0.74 : 1;
  const decisiveness = clamp(baseDecisiveness * overlayConflictFactor * confidenceFactor * momentumFactor, 0, 100);
  const transitionLike = direction === "transitioning" || decisiveness < 12;

  const blockEntries = Object.entries(input.blockScores ?? {}).filter(([, v]) => typeof v === "number");
  const prevBlock = input.previous?.blockScores ?? {};
  const blockDelta = blockEntries
    .map(([k, v]) => ({ block: k, delta: typeof prevBlock[k] === "number" ? (v as number) - (prevBlock[k] as number) : 0 }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const supportingBlocks = blockEntries.sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k]) => k).slice(0, 2);
  const overlayForPrimary = overlayEffectForRegime(top1.regime, overlayState);
  const supportingOverlays = overlayForPrimary.supporting;
  const modulatingOverlays = overlayForPrimary.modulating;
  const contradictingOverlays = overlayForPrimary.contradicting;

  let structuralSummary = "partial_confirmation";
  if (top1.signal === "confirming" && contradictingOverlays.length === 0) structuralSummary = "overlay_supportive";
  else if (top1.signal === "contradicting") structuralSummary = "overlay_conflicted";
  else if (confidenceMultiplier < 0.6) structuralSummary = "structural_fragility";
  else if (input.stressOverlay === "High" && (input.hardAssetOverlay === "Strong" || input.hardAssetOverlay === "High")) structuralSummary = "cost_pressure_confirmation";
  else if (direction === "transitioning") structuralSummary = "defensive_uncertainty";

  const driftTowardRegime = topAlternativeRegime(
    normalized,
    top1.regime,
    direction,
    overlayState,
    top1.weight - top2.weight,
  );
  const overlayPressure = overlayForPrimary.supporting.length - overlayForPrimary.contradicting.length;
  const momentumScore = clamp((primaryWeightDelta * 2.2) + (scoreDelta * 0.7) + (gapDelta * 1.4) + (overlayPressure * 3), -100, 100);
  const primaryRegimeChange = direction === "strengthening" ? "improving" : direction === "weakening" ? "deteriorating" : "stable";

  const overlayNarrative = (() => {
    const supportText = supportingOverlays.length > 0 ? `Support from ${supportingOverlays.join(", ")}` : "No strong supportive overlay confirmation";
    const modText = modulatingOverlays.length > 0 ? `modulated by ${modulatingOverlays.join(", ")}` : "limited modulation";
    const contraText = contradictingOverlays.length > 0 ? `while ${contradictingOverlays.join(", ")} contradicts the primary read` : "and no major overlay contradiction";
    return `${supportText}, ${modText}, ${contraText}.`;
  })();

  const momentumNarrative = direction === "strengthening"
    ? "Regimen stärks med ökande försprång mot nästa kandidat."
    : direction === "weakening"
      ? `Regimen försvagas${driftTowardRegime ? ` och glider mot ${driftTowardRegime}` : ""}.`
      : direction === "transitioning"
        ? `Makroläget är i övergång${driftTowardRegime ? ` mot ${driftTowardRegime}` : ""} med minskande gap i toppfördelningen.`
        : "Makroläget är relativt stabilt med begränsad riktningsdrift.";

  const changeDrivers = [
    ...blockDelta.slice(0, 2).map((row) => {
      const sign = row.delta >= 0 ? "strengthening" : "cooling";
      return `${row.block} ${sign} (${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)})`;
    }),
    supportingOverlays[0] ? `${supportingOverlays[0]} supports primary` : null,
    contradictingOverlays[0] ? `${contradictingOverlays[0]} challenges primary` : null,
    driftTowardRegime ? `distribution drift pressure toward ${driftTowardRegime}` : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 5);

  return {
    primaryRegime: top1.regime,
    primaryWeight: top1.weight,
    decisiveness,
    transitionLike,
    distribution: normalized.slice(0, 4).map((row) => ({ regime: row.regime, weight: row.weight })),
    narrative: {
      short: `${top1.regime} remains primary (${top1.weight.toFixed(1)}%). ${overlayNarrative}`,
      medium: `Primary ${top1.regime}; alternatives ${normalized.slice(1, 3).map((d) => `${d.regime} ${d.weight.toFixed(1)}%`).join(" · ") || "insufficient alternatives"}. Blocks supporting: ${supportingBlocks.join(", ") || "none"}. ${overlayNarrative} ${momentumNarrative}`,
      long: `Primary regime ${top1.regime} leads with ${top1.weight.toFixed(1)}% vs ${top2.regime} ${top2.weight.toFixed(1)}% (gap ${(top1.weight - top2.weight).toFixed(1)}). Blocks supporting baseline: ${supportingBlocks.join(", ") || "none"}. Overlay classification => supporting: ${supportingOverlays.join(", ") || "none"}; modulating: ${modulatingOverlays.join(", ") || "none"}; contradicting: ${contradictingOverlays.join(", ") || "none"}. Momentum: ${direction} (score ${momentumScore.toFixed(1)}). ${driftTowardRegime ? `Drift points toward ${driftTowardRegime}.` : "No material drift candidate."} Structural state: ${structuralSummary}.`,
    },
    structuralAdjustment: {
      summary: structuralSummary,
      multiplier: clamp(overlayConflictFactor * confidenceFactor, 0.7, 1),
      penalty: clamp(1 - (overlayConflictFactor * confidenceFactor), 0, 0.3),
    },
    supportingBlocks,
    supportingOverlays,
    modulatingOverlays,
    contradictingOverlays,
    regimeMomentum: {
      direction,
      momentumScore,
      primaryRegimeChange,
      driftTowardRegime,
      changeDrivers,
      narrative: momentumNarrative,
    },
    overlayInfluence: {
      primarySignal: top1.signal,
      candidateSignals: normalized.slice(0, 4).map((row) => ({ regime: row.regime, signal: distribution.find((d) => d.regime === row.regime)?.signal ?? "modulating" })),
      summary: overlayNarrative,
    },
  };
}
