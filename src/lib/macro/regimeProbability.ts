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
  if ((top1.weight - top2.weight) < 8 || (gapDelta < -2 && secondWeightDelta > 0)) direction = "transitioning";
  else if (primaryWeightDelta > 1.5 && gapDelta > 0) direction = "strengthening";
  else if (primaryWeightDelta < -1.5 || (gapDelta < -1 && secondWeightDelta > 0)) direction = "weakening";

  const momentumFactor = direction === "weakening" ? 0.88 : direction === "transitioning" ? 0.74 : 1;
  const decisiveness = clamp(baseDecisiveness * overlayConflictFactor * confidenceFactor * momentumFactor, 0, 100);
  const transitionLike = direction === "transitioning" || decisiveness < 12;

  const blockEntries = Object.entries(input.blockScores ?? {}).filter(([, v]) => typeof v === "number");
  const prevBlock = input.previous?.blockScores ?? {};
  const blockDelta = blockEntries
    .map(([k, v]) => ({ block: k, delta: typeof prevBlock[k] === "number" ? (v as number) - (prevBlock[k] as number) : 0 }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const supportingBlocks = blockEntries.sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k]) => k).slice(0, 2);
  const supportingOverlays = [input.growthOverlay, input.hardAssetOverlay].filter((x) => x && x !== "Neutral");
  const contradictingOverlays = [input.stressOverlay].filter((x) => x === "High" && (top1.regime === "MonetaryDominance" || top1.regime === "Balanced"));

  let structuralSummary = "partial_confirmation";
  if (top1.signal === "confirming" && contradictingOverlays.length === 0) structuralSummary = "overlay_supportive";
  else if (top1.signal === "contradicting") structuralSummary = "overlay_conflicted";
  else if (confidenceMultiplier < 0.6) structuralSummary = "structural_fragility";
  else if (input.stressOverlay === "High" && (input.hardAssetOverlay === "Strong" || input.hardAssetOverlay === "High")) structuralSummary = "cost_pressure_confirmation";
  else if (direction === "transitioning") structuralSummary = "defensive_uncertainty";

  const driftTowardRegime = direction === "weakening" || direction === "transitioning" ? top2.regime : null;
  const momentumScore = clamp((primaryWeightDelta * 2) + (scoreDelta * 0.6) + (gapDelta * 1.2), -100, 100);
  const primaryRegimeChange = direction === "strengthening" ? "improving" : direction === "weakening" ? "deteriorating" : "stable";

  const overlayNarrative = top1.signal === "confirming"
    ? "Current overlay mix confirms the leading regime."
    : top1.signal === "contradicting"
      ? "Overlay pattern conflicts with the leading regime and reduces conviction."
      : "Overlay pattern modulates interpretation without overturning score-distance ranking.";

  const momentumNarrative = direction === "strengthening"
    ? "Regimen stärks med ökande försprång mot nästa kandidat."
    : direction === "weakening"
      ? `Regimen försvagas och glider mot ${top2.regime}.`
      : direction === "transitioning"
        ? `Makroläget är i övergång med minskande gap mot ${top2.regime}.`
        : "Makroläget är relativt stabilt med begränsad riktningsdrift.";

  return {
    primaryRegime: top1.regime,
    primaryWeight: top1.weight,
    decisiveness,
    transitionLike,
    distribution: normalized.slice(0, 4).map((row) => ({ regime: row.regime, weight: row.weight })),
    narrative: {
      short: `${top1.regime} remains primary (${top1.weight.toFixed(1)}%). ${overlayNarrative}`,
      medium: `Top alternatives: ${normalized.slice(0, 3).map((d) => `${d.regime} ${d.weight.toFixed(1)}%`).join(" · ")}. ${momentumNarrative}`,
      long: `Decisiveness adjusted from ${baseDecisiveness.toFixed(1)} to ${decisiveness.toFixed(1)} using overlay/confidence/momentum factors. ${momentumNarrative}`,
    },
    structuralAdjustment: {
      summary: structuralSummary,
      multiplier: clamp(overlayConflictFactor * confidenceFactor, 0.7, 1),
      penalty: clamp(1 - (overlayConflictFactor * confidenceFactor), 0, 0.3),
    },
    supportingBlocks,
    supportingOverlays,
    contradictingOverlays,
    regimeMomentum: {
      direction,
      momentumScore,
      primaryRegimeChange,
      driftTowardRegime,
      changeDrivers: [
        ...blockDelta.slice(0, 2).map((row) => `${row.block}:${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)}`),
        ...supportingOverlays.slice(0, 1),
        ...contradictingOverlays.slice(0, 1),
      ].filter(Boolean),
      narrative: momentumNarrative,
    },
    overlayInfluence: {
      primarySignal: top1.signal,
      candidateSignals: normalized.slice(0, 4).map((row) => ({ regime: row.regime, signal: distribution.find((d) => d.regime === row.regime)?.signal ?? "modulating" })),
      summary: overlayNarrative,
    },
  };
}
