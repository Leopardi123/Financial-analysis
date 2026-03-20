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
type ThematicOverlaySnapshot = Record<string, { score?: number | null; signal?: string | null } | null | undefined>;

type OverlayEffect = "supporting" | "modulating" | "contradicting";
type OverlaySignal = "confirming" | "modulating" | "contradicting";

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function overlaySignalForRegime(regime: string, overlay: OverlaySnapshot): OverlaySignal {
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

const OVERLAY_KEYS = ["growthOverlay", "stressOverlay", "hardAssetOverlay"] as const;
type OverlayKey = typeof OVERLAY_KEYS[number];

function effectForOverlay(regime: string, overlayKey: OverlayKey, overlay: OverlaySnapshot): OverlayEffect {
  if (overlayKey === "growthOverlay") return classifyGrowthEffect(regime, overlay.growthOverlay);
  if (overlayKey === "stressOverlay") return classifyStressEffect(regime, overlay.stressOverlay);
  return classifyHardAssetEffect(regime, overlay.hardAssetOverlay);
}

function effectScore(effect: OverlayEffect): number {
  if (effect === "supporting") return 1;
  if (effect === "contradicting") return -1;
  return 0;
}

const THEMATIC_OVERLAY_KEYS = [
  "liquidityOverlay",
  "creditFundingOverlay",
  "energyShockOverlay",
  "localUnrestOverlay",
  "safeHavenRiskOffOverlay",
  "inflationCostShockOverlay",
  "tradeSupplyChainStressOverlay",
  "globalUnrestOverlay",
] as const;

function classifyThematicEffect(regime: string, overlayKey: string, score: number | null): OverlayEffect {
  if (score === null || !Number.isFinite(score)) return "modulating";
  const riskOffFamily = ["creditFundingOverlay", "energyShockOverlay", "localUnrestOverlay", "safeHavenRiskOffOverlay", "inflationCostShockOverlay", "tradeSupplyChainStressOverlay", "globalUnrestOverlay"];
  const isRiskOff = riskOffFamily.includes(overlayKey);
  const supportiveIfPositive = regime === "FiscalDominanceRisk" || regime === "FiscalPressureBuilding"
    ? isRiskOff
    : regime === "MonetaryDominance" || regime === "Balanced"
      ? overlayKey === "liquidityOverlay"
      : false;
  const directionalScore = supportiveIfPositive ? score : -score;
  if (directionalScore >= 15) return "supporting";
  if (directionalScore <= -15) return "contradicting";
  return "modulating";
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
  normalized: Array<{ regime: string; weight: number; signal: OverlaySignal }>,
  primaryRegime: string,
  momentumDirection: "strengthening" | "weakening" | "stable" | "transitioning",
  overlay: OverlaySnapshot,
  gapToSecond: number,
  blockDelta: Array<{ block: string; delta: number }>,
) {
  const alternatives = normalized.filter((row) => row.regime !== primaryRegime).slice(0, 3);
  if (alternatives.length === 0) return null;
  const primaryOverlay = overlayEffectForRegime(primaryRegime, overlay);
  const blockTiltForRegime = (regime: string) => {
    const map = Object.fromEntries(blockDelta.map((d) => [d.block, d.delta]));
    const a = map.A_FISCAL ?? 0;
    const b = map.B_LIQUIDITY ?? 0;
    const c = map.C_INFLATION ?? 0;
    const d = map.D_REAL_ECON ?? 0;
    if (regime === "MonetaryDominance") return (b * 0.9) + (d * 0.6) - (a * 0.5) - (c * 0.9);
    if (regime === "Balanced") return -Math.abs(a) * 0.2 - Math.abs(c) * 0.2 - Math.abs(b) * 0.1;
    if (regime === "FiscalPressureBuilding") return (a * 0.9) + (c * 0.8) - (b * 0.5) - (d * 0.2);
    if (regime === "FiscalDominanceRisk") return (a * 1.0) + (c * 1.0) - (b * 0.7) - (d * 0.6);
    return 0;
  };
  const ranked = alternatives
    .map((candidate) => {
      const candidateOverlay = overlayEffectForRegime(candidate.regime, overlay);
      const overlayTilt = candidateOverlay.score - primaryOverlay.score;
      const closeness = clamp(12 - (normalized[0].weight - candidate.weight), -12, 12);
      const momentumBias = momentumDirection === "weakening" || momentumDirection === "transitioning" ? 3 : -1;
      const blockTilt = blockTiltForRegime(candidate.regime);
      const score = (candidate.weight * 0.45) + closeness + (overlayTilt * 2.2) + (blockTilt * 1.6) + momentumBias;
      return { regime: candidate.regime, score, overlayTilt, blockTilt, weight: candidate.weight };
    })
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top) return null;
  const closeEnough = gapToSecond <= 12;
  const overlaySuggests = top.overlayTilt >= 1.2;
  const blockSuggests = top.blockTilt >= 0.8;
  const momentumSuggests = momentumDirection === "weakening" || momentumDirection === "transitioning";
  const scoreSuggests = top.score >= 24 && top.weight >= 22;
  const meaningfulDrift = scoreSuggests || (closeEnough && (overlaySuggests || blockSuggests || top.weight >= 28)) || (momentumSuggests && top.weight >= 30 && (overlaySuggests || blockSuggests));
  return meaningfulDrift ? top.regime : null;
}

export function buildMacroRegimeProbabilityFromSnapshot(input: {
  macroScoreTotal: number | null;
  macroConfidence: number;
  coreRegimeLabel: string;
  growthOverlay: string;
  stressOverlay: string;
  hardAssetOverlay: string;
  blockScores: MacroRegimeSnapshot["blockScores"];
  thematicOverlays?: ThematicOverlaySnapshot | null;
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
  const topAlternatives = normalized.filter((row) => row.regime !== top1.regime).slice(0, 2).map((row) => row.regime);
  const supportingOverlays: string[] = [];
  const modulatingOverlays: string[] = [];
  const contradictingOverlays: string[] = [];
  OVERLAY_KEYS.forEach((overlayKey) => {
    const primaryEffect = effectForOverlay(top1.regime, overlayKey, overlayState);
    const primaryScore = effectScore(primaryEffect);
    const alternativeScores = topAlternatives.map((regime) => effectScore(effectForOverlay(regime, overlayKey, overlayState)));
    const strongestAlternative = alternativeScores.length ? Math.max(...alternativeScores) : 0;
    const weakestAlternative = alternativeScores.length ? Math.min(...alternativeScores) : 0;

    if (primaryScore >= 1 && strongestAlternative <= 0) supportingOverlays.push(overlayKey);
    else if (primaryScore <= -1 && strongestAlternative >= 0) contradictingOverlays.push(overlayKey);
    else if ((strongestAlternative - primaryScore) >= 1) contradictingOverlays.push(overlayKey);
    else if ((primaryScore - weakestAlternative) >= 1) supportingOverlays.push(overlayKey);
    else modulatingOverlays.push(overlayKey);
  });
  const thematicAvailable = Object.entries(input.thematicOverlays ?? {})
    .filter(([key, value]) => THEMATIC_OVERLAY_KEYS.includes(key as any) && value && typeof value === "object")
    .map(([key, value]) => ({ key, score: typeof value?.score === "number" ? value.score : null }));
  const thematicUnavailable = THEMATIC_OVERLAY_KEYS.filter((key) => !thematicAvailable.some((row) => row.key === key));
  thematicAvailable.forEach(({ key, score }) => {
    const primaryEffect = classifyThematicEffect(top1.regime, key, score);
    const primaryScore = effectScore(primaryEffect);
    const alternativeScores = topAlternatives.map((regime) => effectScore(classifyThematicEffect(regime, key, score)));
    const strongestAlternative = alternativeScores.length ? Math.max(...alternativeScores) : 0;
    const weakestAlternative = alternativeScores.length ? Math.min(...alternativeScores) : 0;
    const themedId = `thematic:${key}`;
    if (primaryScore >= 1 && strongestAlternative <= 0) supportingOverlays.push(themedId);
    else if (primaryScore <= -1 && strongestAlternative >= 0) contradictingOverlays.push(themedId);
    else if ((strongestAlternative - primaryScore) >= 1) contradictingOverlays.push(themedId);
    else if ((primaryScore - weakestAlternative) >= 1) supportingOverlays.push(themedId);
    else modulatingOverlays.push(themedId);
  });
  const normalizedSupportingOverlays = supportingOverlays.map((id) => id.includes(":") ? id : `legacy:${id}`);
  const normalizedModulatingOverlays = modulatingOverlays.map((id) => id.includes(":") ? id : `legacy:${id}`);
  const normalizedContradictingOverlays = contradictingOverlays.map((id) => id.includes(":") ? id : `legacy:${id}`);

  let structuralSummary = "partial_confirmation";
  if (top1.signal === "confirming" && normalizedContradictingOverlays.length === 0) structuralSummary = "overlay_supportive";
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
    blockDelta,
  );
  const overlayPressure = overlayForPrimary.supporting.length - overlayForPrimary.contradicting.length;
  const momentumScore = clamp((primaryWeightDelta * 2.2) + (scoreDelta * 0.7) + (gapDelta * 1.4) + (overlayPressure * 3), -100, 100);
  const primaryRegimeChange = direction === "strengthening" ? "improving" : direction === "weakening" ? "deteriorating" : "stable";

  const overlayNarrative = (() => {
    const leadAlternative = normalized.find((row) => row.regime !== top1.regime)?.regime ?? null;
    const supportText = normalizedSupportingOverlays.length > 0
      ? `${normalizedSupportingOverlays.join(", ")} reinforce ${top1.regime}`
      : `No overlay gives clean one-way reinforcement to ${top1.regime}`;
    const modVerb = normalizedModulatingOverlays.length > 1 ? "are" : "is";
    const modulationText = normalizedModulatingOverlays.length > 0
      ? `${normalizedModulatingOverlays.join(", ")} ${modVerb} mixed and keeps conviction moderate`
      : "little mixed-signal modulation is present";
    const contradictionText = normalizedContradictingOverlays.length > 0
      ? `${normalizedContradictingOverlays.join(", ")} lean against the primary regime${leadAlternative ? ` and keep ${leadAlternative} in play` : ""}`
      : "no overlay contradiction is broad enough to overturn the primary read";
    const availabilityText = `Commentary inputs used: legacy=${OVERLAY_KEYS.join(", ")}; thematic=${thematicAvailable.map((row) => row.key).join(", ") || "none"}. Unavailable thematic=${thematicUnavailable.join(", ") || "none"}.`;
    return `${supportText}; ${modulationText}; ${contradictionText}. ${availabilityText}`;
  })();

  const momentumNarrative = direction === "strengthening"
    ? `Primary regime is strengthening with a wider lead${driftTowardRegime ? `, though residual drift still points to ${driftTowardRegime}` : ""}.`
    : direction === "weakening"
      ? `Primary regime is weakening${driftTowardRegime ? ` with drift pressure toward ${driftTowardRegime}` : ""}.`
      : direction === "transitioning"
        ? `Macro state is transitioning${driftTowardRegime ? ` toward ${driftTowardRegime}` : ""} as the top-gap compresses.`
        : "Macro state is stable with limited directional drift.";

  const strongestPositiveBlock = blockDelta.find((row) => row.delta > 0);
  const strongestNegativeBlock = blockDelta.find((row) => row.delta < 0);
  const directionDriver = direction === "stable"
    ? "top-gap remains broadly stable"
    : direction === "strengthening"
      ? "top-gap is widening in favor of primary"
      : direction === "weakening"
        ? "top-gap is narrowing against primary"
        : "top regimes are compressing into transition";
  const changeDrivers = [
    directionDriver,
    strongestPositiveBlock ? `${strongestPositiveBlock.block} strengthening (${strongestPositiveBlock.delta >= 0 ? "+" : ""}${strongestPositiveBlock.delta.toFixed(1)})` : null,
    strongestNegativeBlock ? `${strongestNegativeBlock.block} fading (${strongestNegativeBlock.delta >= 0 ? "+" : ""}${strongestNegativeBlock.delta.toFixed(1)})` : null,
    normalizedSupportingOverlays[0] ? `${normalizedSupportingOverlays[0]} reinforcing ${top1.regime}` : null,
    normalizedModulatingOverlays[0] ? `${normalizedModulatingOverlays[0]} mixed, limiting conviction` : null,
    normalizedContradictingOverlays[0] ? `${normalizedContradictingOverlays[0]} leaning against ${top1.regime}` : null,
    driftTowardRegime ? `drift pressure building toward ${driftTowardRegime}` : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 6);

  return {
    primaryRegime: top1.regime,
    primaryWeight: top1.weight,
    decisiveness,
    transitionLike,
    distribution: normalized.slice(0, 4).map((row) => ({ regime: row.regime, weight: row.weight })),
    narrative: {
      short: `${top1.regime} remains primary (${top1.weight.toFixed(1)}%). ${overlayNarrative}`,
      medium: `Primary regime is ${top1.regime} (${top1.weight.toFixed(1)}%), with alternatives ${normalized.slice(1, 3).map((d) => `${d.regime} ${d.weight.toFixed(1)}%`).join(" · ") || "not meaningful"}. It leads on block mix (${supportingBlocks.join(", ") || "none"}) and current overlay structure: supporting ${normalizedSupportingOverlays.join(", ") || "none"}, modulating ${normalizedModulatingOverlays.join(", ") || "none"}, contradicting ${normalizedContradictingOverlays.join(", ") || "none"}. Momentum is ${direction} (score ${momentumScore.toFixed(1)}). ${driftTowardRegime ? `Drift risk is currently toward ${driftTowardRegime}.` : "No meaningful drift candidate is active."} Structural caveat: ${structuralSummary}.`,
      long: `Primary regime ${top1.regime} leads at ${top1.weight.toFixed(1)}% versus ${top2.regime} at ${top2.weight.toFixed(1)}% (gap ${(top1.weight - top2.weight).toFixed(1)}), with next alternatives ${normalized.slice(1, 4).map((d) => `${d.regime} ${d.weight.toFixed(1)}%`).join(", ")}. The lead is sustained mainly by block ranking (${supportingBlocks.join(", ") || "none"}) and recent block-direction shifts (${blockDelta.slice(0, 3).map((b) => `${b.block} ${b.delta >= 0 ? "+" : ""}${b.delta.toFixed(1)}`).join(", ") || "none"}). Overlay decomposition is explicit: supporting ${normalizedSupportingOverlays.join(", ") || "none"}; modulating ${normalizedModulatingOverlays.join(", ") || "none"}; contradicting ${normalizedContradictingOverlays.join(", ") || "none"}. ${overlayNarrative} Momentum state is ${direction} with score ${momentumScore.toFixed(1)} and primary change ${primaryRegimeChange}. ${driftTowardRegime ? `Current drift points to ${driftTowardRegime}.` : "No meaningful drift toward an alternative regime is detected."} Structural caveat remains ${structuralSummary}.`,
    },
    structuralAdjustment: {
      summary: structuralSummary,
      multiplier: clamp(overlayConflictFactor * confidenceFactor, 0.7, 1),
      penalty: clamp(1 - (overlayConflictFactor * confidenceFactor), 0, 0.3),
    },
    supportingBlocks,
    supportingOverlays: normalizedSupportingOverlays,
    modulatingOverlays: normalizedModulatingOverlays,
    contradictingOverlays: normalizedContradictingOverlays,
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
