import type {
  CommodityBlockScore,
  CommodityConfidence,
  CommodityDiagnostics,
  CommodityIndicatorDiagnostic,
  CommodityIndicatorKey,
  CommodityPhase,
  CommodityProfile,
  CommodityProfileInput,
  CommodityProfileInputIndicator,
  CommodityScreeningAdjustment,
} from "../types";
import { deriveTrendSignal, type TrendDataCompleteness } from "../trendSignal.js";

type OverlayAgreement = "supportive" | "partial_support" | "neutral" | "partial_conflict" | "conflict" | "unavailable";
type RegimeAgreementWithPrice = "confirming" | "diverging" | "neutral";
type CopperRegime = "Demand expansion" | "Demand contraction" | "Supply tightness" | "Supply expansion";
type DemandState = "expansion_strong" | "expansion" | "contraction" | "weakening";
type PriceState = "high" | "mid" | "low";
type DivergenceType = "bearish_divergence" | "bullish_recovery" | "none";
type CopperPhase = CommodityPhase | "Recession";
type TrendPhaseEffect = "none" | "late_softened_by_trend" | "late_reinforced_by_breakdown" | "early_promoted_to_mid" | "unstable_late_cycle" | "late_cycle_softening";

const REQUIRED_INDICATORS: CommodityIndicatorKey[] = ["copper_usd", "china_cli"];
const OPTIONAL_INDICATORS: CommodityIndicatorKey[] = ["pmi_us", "copper_lme_inventory", "copper_capex_proxy"];
const COPPER_RELEVANT_OVERLAYS = ["pmiDemandOverlay", "copperSupplyOverlay"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function avg(values: Array<number | null>): number | null {
  const valid = values.filter((item): item is number => typeof item === "number");
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function getIndicator(input: CommodityProfileInput, key: CommodityIndicatorKey): CommodityProfileInputIndicator | null {
  return input.indicators[key] ?? null;
}

function percentileSignal(percentile10y: number | null): number | null {
  if (percentile10y === null || !Number.isFinite(percentile10y)) return null;
  return clamp((percentile10y - 50) / 50, -1, 1);
}

function momentumSignal(value: number | null, scale = 25): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return clamp(value / scale, -1, 1);
}

function scoreToNormalized(indicator: CommodityProfileInputIndicator | null, inverse = false): number | null {
  if (!indicator || indicator.score === null || !Number.isFinite(indicator.score)) return null;
  const normalized = clamp(indicator.score / 2, -1, 1);
  return inverse ? normalized * -1 : normalized;
}

function overlayScore(input: CommodityProfileInput, key: string): number | null {
  const raw = input.overlays[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return clamp((raw - 50) / 50, -1, 1);
}

function resolveOverlayAgreement(priceScore: number | null, overlayCompositeScore: number | null): {
  agreement: OverlayAgreement;
  contribution: CommodityDiagnostics["overlayContribution"];
  conflicts: string[];
} {
  if (overlayCompositeScore === null) {
    return {
      agreement: "unavailable",
      contribution: { score: null, classification: "unavailable", note: "No copper-relevant overlays were available." },
      conflicts: [],
    };
  }

  if (priceScore === null) {
    return {
      agreement: "neutral",
      contribution: { score: overlayCompositeScore, classification: "neutral", note: "Overlay layer is available but price baseline is missing." },
      conflicts: [],
    };
  }

  const sameDirection = Math.sign(priceScore) === Math.sign(overlayCompositeScore) || Math.abs(overlayCompositeScore) < 0.1;
  const oppositeDirection = Math.sign(priceScore) !== 0 && Math.sign(overlayCompositeScore) !== 0 && Math.sign(priceScore) !== Math.sign(overlayCompositeScore);

  if (sameDirection && Math.abs(overlayCompositeScore) >= 0.15) {
    if (Math.abs(overlayCompositeScore) >= 0.35) {
      return {
        agreement: "supportive",
        contribution: { score: overlayCompositeScore, classification: "supportive", note: "Demand/supply overlays confirm copper price trend." },
        conflicts: [],
      };
    }
    return {
      agreement: "partial_support",
      contribution: { score: overlayCompositeScore, classification: "partial_support", note: "Overlays support direction but with moderate strength." },
      conflicts: [],
    };
  }

  if (oppositeDirection) {
    if (Math.abs(overlayCompositeScore) >= 0.35) {
      return {
        agreement: "conflict",
        contribution: { score: overlayCompositeScore, classification: "conflict", note: "Demand/supply overlays oppose current copper price trend." },
        conflicts: ["Price trend and copper overlays are directionally opposite."],
      };
    }
    return {
      agreement: "partial_conflict",
      contribution: { score: overlayCompositeScore, classification: "partial_conflict", note: "Overlays partially conflict with price trend." },
      conflicts: ["Price trend and copper overlays show moderate disagreement."],
    };
  }

  return {
    agreement: "neutral",
    contribution: { score: overlayCompositeScore, classification: "neutral", note: "Overlay effect is weak/mixed for copper." },
    conflicts: [],
  };
}

function resolveDemandState(cliLevel: number, cliChange3m: number): DemandState {
  if (cliLevel < 100) return "contraction";
  if (cliLevel >= 101 && cliChange3m > 0) return "expansion_strong";
  if (cliLevel >= 100 && cliChange3m >= 0) return "expansion";
  return "weakening";
}

function resolvePriceState(percentile10y: number | null): PriceState {
  // Copper tends to overshoot late-cycle; tighter thresholds reduce false "high" labels.
  if (percentile10y !== null && percentile10y > 90) return "high";
  if (percentile10y !== null && percentile10y < 25) return "low";
  return "mid";
}

function resolveCopperChinaCli(input: CommodityProfileInput): { indicator: CommodityProfileInputIndicator | null; source: "china_cli" | "missing" } {
  const chinaCli = getIndicator(input, "china_cli");
  if (chinaCli && typeof chinaCli.valueLatest === "number" && typeof (chinaCli.change3m ?? chinaCli.change1m) === "number") {
    return { indicator: chinaCli, source: "china_cli" };
  }
  return { indicator: null, source: "missing" };
}

function classifyCopperRegime(input: CommodityProfileInput): {
  regime: CopperRegime;
  score: number;
  drivers: string[];
} {
  const chinaCli = getIndicator(input, "china_cli");
  const inventory = getIndicator(input, "copper_lme_inventory");

  const cliChange = chinaCli?.change3m ?? chinaCli?.change1m ?? null;
  const cliLevel = chinaCli?.valueLatest ?? null;
  const inventoryTrend = scoreToNormalized(inventory, true);

  const demandUp = cliLevel !== null && cliLevel > 100 && (cliChange ?? 0) > 0;
  const demandDown = cliLevel !== null && cliLevel < 100 && (cliChange ?? 0) < 0;

  if ((inventoryTrend ?? 0) >= 0.35) {
    const inventoryScore = inventoryTrend ?? 0;
    return {
      regime: "Supply tightness",
      score: 0.7,
      drivers: [
        `Inventory pressure=${inventoryScore.toFixed(2)} (tight).`,
        `China CLI level=${cliLevel ?? "n/a"}, change3m=${cliChange ?? "n/a"}.`,
      ],
    };
  }

  if ((inventoryTrend ?? 0) <= -0.35) {
    const inventoryScore = inventoryTrend ?? 0;
    return {
      regime: "Supply expansion",
      score: -0.45,
      drivers: [
        `Inventory pressure=${inventoryScore.toFixed(2)} (expanding supply).`,
        `China CLI level=${cliLevel ?? "n/a"}, change3m=${cliChange ?? "n/a"}.`,
      ],
    };
  }

  if (demandUp) {
    return {
      regime: "Demand expansion",
      score: 0.55,
      drivers: [
        `China CLI supports demand expansion: level=${cliLevel ?? "n/a"}, change3m=${cliChange ?? "n/a"}.`,
      ],
    };
  }

  if (demandDown) {
    return {
      regime: "Demand contraction",
      score: -0.55,
      drivers: [
        `China CLI supports demand contraction: level=${cliLevel ?? "n/a"}, change3m=${cliChange ?? "n/a"}.`,
      ],
    };
  }

  return {
    regime: "Demand contraction",
    score: -0.2,
    drivers: ["No strong demand/supply signal available; defaults to soft demand contraction bias."],
  };
}

function resolveCopperPhase(args: {
  percentile: number | null;
  cliLevel: number | null;
  cliChange3m: number | null;
  capexMomentum: number | null;
}): {
  phase: CopperPhase;
  demandState: DemandState | null;
  priceState: PriceState;
  divergence: boolean;
  divergenceType: DivergenceType;
  overrideApplied: boolean;
  overrideReason: string | null;
  reasoning: string[];
} {
  const reasoning: string[] = [];

  const priceState = resolvePriceState(args.percentile);

  if (args.cliLevel === null || args.cliChange3m === null) {
    reasoning.push("China CLI level or 3m change missing; returning Unknown.");
    return { phase: "Unknown", demandState: null, priceState, divergence: false, divergenceType: "none", overrideApplied: false, overrideReason: null, reasoning };
  }

  const demandState = resolveDemandState(args.cliLevel, args.cliChange3m);
  const divergenceType: DivergenceType = priceState === "high" && args.cliChange3m < 0
    ? "bearish_divergence"
    : (priceState === "low" || priceState === "mid") && args.cliLevel < 100 && args.cliChange3m > 0
      ? "bullish_recovery"
      : "none";
  const divergence = divergenceType !== "none";
  const chinaOverride = args.cliLevel < 100 && priceState === "high";
  if (chinaOverride) {
    reasoning.push("China CLI override: china_cli < 100 while price_state=high prevents any Early/Mid classification.");
  }

  if (priceState === "low" && (demandState === "expansion" || demandState === "expansion_strong")) {
    reasoning.push("price_state=low + demand_state=expansion => Early Cycle.");
    return { phase: "Early Cycle", demandState, priceState, divergence, divergenceType, overrideApplied: chinaOverride, overrideReason: chinaOverride ? "china_cli<100 with high price blocks Early/Mid." : null, reasoning };
  }

  if (priceState === "mid" && (demandState === "expansion" || demandState === "expansion_strong")) {
    reasoning.push("price_state=mid + demand_state=expansion => Mid Cycle.");
    return { phase: "Mid Cycle", demandState, priceState, divergence, divergenceType, overrideApplied: chinaOverride, overrideReason: chinaOverride ? "china_cli<100 with high price blocks Early/Mid." : null, reasoning };
  }

  if (priceState === "high" && (demandState === "weakening" || demandState === "contraction")) {
    reasoning.push("price_state=high + demand_state=weakening/contraction => Late Cycle.");
    if (divergenceType === "bearish_divergence") reasoning.push("Bearish divergence: high price percentile while China CLI change is negative.");
    return { phase: "Late Cycle", demandState, priceState, divergence, divergenceType, overrideApplied: chinaOverride, overrideReason: chinaOverride ? "china_cli<100 with high price blocks Early/Mid." : null, reasoning };
  }

  if (demandState === "contraction") {
    reasoning.push("demand_state=contraction => Recession.");
    return { phase: "Recession", demandState, priceState, divergence, divergenceType, overrideApplied: chinaOverride, overrideReason: chinaOverride ? "china_cli<100 with high price blocks Early/Mid." : null, reasoning };
  }

  if (priceState === "high" && (args.capexMomentum ?? 0) > 0.15 && demandState === "expansion_strong") {
    reasoning.push("high percentile + capex expansion with strong demand => Late Cycle.");
    return { phase: "Late Cycle", demandState, priceState, divergence, divergenceType, overrideApplied: chinaOverride, overrideReason: chinaOverride ? "china_cli<100 with high price blocks Early/Mid." : null, reasoning };
  }

  reasoning.push("No deterministic phase mapping matched; returning Unknown.");
  return { phase: "Unknown", demandState, priceState, divergence, divergenceType, overrideApplied: chinaOverride, overrideReason: chinaOverride ? "china_cli<100 with high price blocks Early/Mid." : null, reasoning };
}

function resolveRegimeAgreementWithPrice(phase: CommodityPhase, regime: CopperRegime): RegimeAgreementWithPrice {
  if (phase === "Mid Cycle" && regime === "Demand expansion") return "confirming";
  if (phase === "Late Cycle" && (regime === "Demand expansion" || regime === "Supply tightness")) return "confirming";
  if (phase === "Compression" && (regime === "Demand contraction" || regime === "Supply expansion")) return "confirming";
  if (phase === "Early Cycle" && regime === "Demand expansion") return "confirming";
  if (phase === "Compression" && regime === "Supply tightness") return "diverging";
  if (phase === "Late Cycle" && regime === "Demand contraction") return "diverging";
  return "neutral";
}

function applyTrendToPhase(args: {
  phase: CopperPhase;
  priceState: PriceState;
  demandState: DemandState | null;
  trendScore: number | null;
  trendExpansionState: string | null | undefined;
  trendMomentumState: string | null | undefined;
  priceTrendScore: number | null;
}): {
  phase: CopperPhase;
  effect: TrendPhaseEffect;
  notes: string[];
} {
  const notes: string[] = [];
  const trendStrong = args.trendScore !== null && args.trendScore >= 0.6;
  const trendBreaking = args.trendScore !== null && args.trendScore <= -0.6;
  const trendCompressing = args.trendExpansionState === "narrowing";
  const trendDecelerating = args.trendMomentumState === "decelerating";
  const demandWeak = args.demandState === "weakening" || args.demandState === "contraction";
  const demandImproving = args.demandState === "expansion" || args.demandState === "expansion_strong";
  const priceRising = (args.priceTrendScore ?? 0) > 0.15;

  if (args.phase === "Late Cycle" && trendDecelerating) {
    notes.push("Late Cycle with decelerating momentum indicates late-cycle softening.");
    return { phase: args.phase, effect: "late_cycle_softening", notes };
  }

  if (args.priceState === "high" && demandWeak && trendStrong && args.phase === "Late Cycle") {
    notes.push("Late Cycle retained: price is high and demand is weak, but trend still supportive.");
    return { phase: "Late Cycle", effect: "late_softened_by_trend", notes };
  }

  if (args.priceState === "high" && demandWeak && trendBreaking) {
    notes.push("trend breakdown reinforces Late-cycle pressure.");
    return { phase: args.phase === "Compression" ? "Compression" : "Late Cycle", effect: "late_reinforced_by_breakdown", notes };
  }

  if (args.phase === "Early Cycle" && priceRising && demandImproving && trendStrong) {
    notes.push("price rising + improving demand + strong trend allows Early → Mid transition.");
    return { phase: "Mid Cycle", effect: "early_promoted_to_mid", notes };
  }

  if (args.priceState === "high" && trendCompressing) {
    notes.push("high price with narrowing trend spread indicates unstable late cycle.");
    return { phase: args.phase, effect: "unstable_late_cycle", notes };
  }

  return { phase: args.phase, effect: "none", notes };
}

function buildConfidence(args: {
  dataCompleteness: number;
  overlayAgreement: OverlayAgreement;
  regimeAgreement: RegimeAgreementWithPrice;
  fallbackCount: number;
  phaseScore: number | null;
  overlaysDiverging: boolean;
  trendScore: number | null;
  trendCompleteness: TrendDataCompleteness;
  trendAgreementWithPrice: "confirming" | "diverging" | "neutral" | "unavailable";
}): CommodityConfidence {
  const fallbackPenalty = clamp(args.fallbackCount * 0.08, 0, 0.35);
  let signalCoherence = args.phaseScore === null ? 0.35 : clamp(Math.abs(args.phaseScore), 0.25, 0.9);

  if (args.overlayAgreement === "supportive") signalCoherence = clamp(signalCoherence + 0.08, 0, 1);
  if (args.overlayAgreement === "partial_support") signalCoherence = clamp(signalCoherence + 0.04, 0, 1);
  if (args.overlayAgreement === "partial_conflict") signalCoherence = clamp(signalCoherence - 0.07, 0, 1);
  if (args.overlayAgreement === "conflict") signalCoherence = clamp(signalCoherence - 0.12, 0, 1);
  if (args.regimeAgreement === "confirming") signalCoherence = clamp(signalCoherence + 0.06, 0, 1);
  if (args.regimeAgreement === "diverging") signalCoherence = clamp(signalCoherence - 0.1, 0, 1);
  if (args.overlaysDiverging) signalCoherence = clamp(signalCoherence - 0.05, 0, 1);
  if (args.trendAgreementWithPrice === "confirming") signalCoherence = clamp(signalCoherence + 0.08, 0, 1);
  if (args.trendAgreementWithPrice === "diverging") signalCoherence = clamp(signalCoherence - 0.1, 0, 1);
  if (args.trendScore !== null && Math.abs(args.trendScore) < 0.2) signalCoherence = clamp(signalCoherence - 0.02, 0, 1);
  if (args.trendCompleteness === "partial") signalCoherence = clamp(signalCoherence - 0.04, 0, 1);
  if (args.trendCompleteness === "insufficient") signalCoherence = clamp(signalCoherence - 0.08, 0, 1);

  const score = clamp(args.dataCompleteness * 0.5 + signalCoherence * 0.4 - fallbackPenalty * 0.1, 0, 1);
  const tier: CommodityConfidence["tier"] = score >= 0.72 ? "high" : score >= 0.5 ? "medium" : "low";

  return {
    score,
    tier,
    breakdown: {
      dataCompleteness: args.dataCompleteness,
      signalCoherence,
      fallbackPenalty,
    },
    confidenceComponents: {
      dataCompleteness: args.dataCompleteness,
      signalCoherence,
      fallbackPenalty,
    },
    reasons: [
      `Data completeness=${args.dataCompleteness.toFixed(2)}.`,
      `Signal coherence=${signalCoherence.toFixed(2)} (overlay=${args.overlayAgreement}, regimeAgreement=${args.regimeAgreement}, trendAgreement=${args.trendAgreementWithPrice}, trendCompleteness=${args.trendCompleteness}).`,
      `Fallback penalty=${fallbackPenalty.toFixed(2)} for ${args.fallbackCount} fallback signals.`,
    ],
  };
}

function buildScreeningAdjustment(phase: CopperPhase, trendAgreementWithPrice: "confirming" | "diverging" | "neutral" | "unavailable", trendScore: number | null): CommodityScreeningAdjustment {
  const trendFragile = trendAgreementWithPrice === "diverging" || trendScore !== null && trendScore <= -0.5;
  const trendSupportive = trendAgreementWithPrice === "confirming" && trendScore !== null && trendScore >= 0.5;
  if (phase === "Early Cycle") {
    return {
      bias: trendFragile ? "neutral" : "supportive",
      notes: [trendFragile
        ? "Early-cycle setup exists, but weakening trend lowers conviction."
        : "Early-cycle copper setup: allow selective cyclical risk."],
      thresholdAdjustments: { maxPositionSizeDeltaPct: trendFragile ? 0 : 5 },
    };
  }
  if (phase === "Mid Cycle") {
    return {
      bias: trendFragile ? "caution" : "supportive",
      notes: [trendFragile
        ? "Mid-cycle backdrop but trend divergence suggests fragile distribution risk."
        : "Demand expansion: favor operating leverage and volume exposure."],
      thresholdAdjustments: { maxPositionSizeDeltaPct: trendFragile ? 2 : 8, valuationMultipleFloorDeltaPct: trendFragile ? 0 : -5 },
    };
  }
  if (phase === "Late Cycle") {
    return {
      bias: "caution",
      notes: [trendSupportive
        ? "Late Cycle with supportive trend: stay cautious but avoid maximum defensiveness."
        : "Capex expansion phase: prioritize balance sheet and cost curve resilience."],
      thresholdAdjustments: { maxPositionSizeDeltaPct: trendSupportive ? -2 : -5 },
    };
  }
  if (phase === "Recession" || phase === "Compression") {
    return {
      bias: "defensive",
      notes: ["Weak demand phase: tighten risk limits for copper-linked screens."],
      thresholdAdjustments: { maxPositionSizeDeltaPct: -10, valuationMultipleFloorDeltaPct: 8 },
    };
  }
  return { bias: "neutral", notes: ["No strong screening tilt from copper profile."] };
}

export const copperCommodityProfile: CommodityProfile = {
  commodity: "copper",
  category: "industrial",
  requiredIndicators: REQUIRED_INDICATORS,
  optionalIndicators: OPTIONAL_INDICATORS,
  profileVersion: "copper-v1",
  compute(input) {
    const copper = getIndicator(input, "copper_usd");
    const cliResolution = resolveCopperChinaCli(input);
    const chinaCli = cliResolution.indicator;
    const pmiUsSupplemental = getIndicator(input, "pmi_us");
    const inventory = getIndicator(input, "copper_lme_inventory");
    const capex = getIndicator(input, "copper_capex_proxy");

    const usedOverlays: string[] = [];
    const missingOverlays: string[] = [];
    for (const key of COPPER_RELEVANT_OVERLAYS) {
      if (typeof input.overlays[key] === "number") usedOverlays.push(key);
      else missingOverlays.push(key);
    }
    const ignoredOverlays = Object.keys(input.overlays).filter((key) => !COPPER_RELEVANT_OVERLAYS.includes(key as (typeof COPPER_RELEVANT_OVERLAYS)[number]));

    const priceTrendScore = avg([
      percentileSignal(copper?.percentile10y ?? null),
      momentumSignal(copper?.momentum12m ?? copper?.yoy ?? null),
    ]);

    const cliChange3m = chinaCli?.change3m ?? chinaCli?.change1m ?? null;
    const demandScore = avg([
      momentumSignal(cliChange3m, 3),
      chinaCli?.valueLatest === null || chinaCli?.valueLatest === undefined ? null : clamp((chinaCli.valueLatest - 100) / 2, -1, 1),
    ]);

    const supplyScore = avg([
      scoreToNormalized(inventory, true),
      scoreToNormalized(capex, true),
    ]);

    const demandOverlay = overlayScore(input, "pmiDemandOverlay");
    const supplyOverlay = overlayScore(input, "copperSupplyOverlay");
    const overlayCompositeScore = avg([demandOverlay, supplyOverlay]);
    const overlayResolution = resolveOverlayAgreement(priceTrendScore, overlayCompositeScore);
    const overlaysDiverging = demandOverlay !== null && supplyOverlay !== null && Math.sign(demandOverlay) !== Math.sign(supplyOverlay) && Math.sign(demandOverlay) !== 0;

    const blockScores: CommodityBlockScore[] = [
      {
        blockId: "price_trend",
        label: "Copper price trend",
        score: priceTrendScore,
        confidence: [copper?.percentile10y, copper?.momentum12m ?? copper?.yoy].filter((v) => typeof v === "number").length / 2,
        status: priceTrendScore === null ? "missing" : "used",
        notes: [
          `percentile=${copper?.percentile10y ?? "n/a"}`,
          `momentum12m=${copper?.momentum12m ?? copper?.yoy ?? "n/a"}`,
        ],
      },
      {
        blockId: "macro_monetary",
        label: "Industrial demand",
        score: demandScore,
        confidence: [chinaCli?.valueLatest, chinaCli?.change3m ?? chinaCli?.change1m].filter((v) => typeof v === "number").length / 2,
        status: demandScore === null ? "missing" : "used",
        notes: [
          "Uses China CLI level + short-term China CLI trend.",
          `china_cli=${chinaCli?.valueLatest ?? "n/a"}, change3m=${chinaCli?.change3m ?? chinaCli?.change1m ?? "n/a"}`,
        ],
      },
      {
        blockId: "equity_confirmation",
        label: "Mining equity confirmation",
        score: null,
        confidence: 0,
        status: "not_used",
        notes: ["Not used in v1 (no dedicated copper equity breadth feed)."],
      },
      {
        blockId: "policy_narrative",
        label: "Supply/cycle overlays",
        score: overlayCompositeScore,
        confidence: [demandOverlay, supplyOverlay].filter((v) => v !== null).length / 2,
        status: overlayCompositeScore === null ? "missing" : "used",
        notes: [
          `demandOverlay=${demandOverlay === null ? "n/a" : demandOverlay.toFixed(2)}`,
          `supplyOverlay=${supplyOverlay === null ? "n/a" : supplyOverlay.toFixed(2)}`,
        ],
      },
    ];

    const phaseScore = avg([priceTrendScore, demandScore, overlayCompositeScore]);
    const phaseResolution = resolveCopperPhase({
      percentile: copper?.percentile10y ?? null,
      cliLevel: chinaCli?.valueLatest ?? null,
      cliChange3m,
      capexMomentum: scoreToNormalized(capex),
    });
    const trendStructureState = input.trendSignal?.structure ?? null;
    const trendExpansionState = input.trendSignal?.expansion ?? null;
    const trendMomentumState = input.trendSignal?.momentumState ?? null;
    const longTrendDirection = input.trendSignal?.longTrendDirection ?? "insufficient";
    const shortTrendMomentum = input.trendSignal?.shortTrendMomentum ?? "insufficient";
    const trendCombinedInterpretation = input.trendSignal?.trendCombinedInterpretation
      ?? "Trendbilden är otillräcklig för att separera långsiktig riktning och kortsiktig momentum.";
    const trendSignal = deriveTrendSignal({
      structure: trendStructureState,
      expansion: trendExpansionState,
      completeness: input.trendSignal?.completeness ?? null,
      explicitScore: input.trendSignal?.score ?? null,
    });
    const trendCompleteness = trendSignal.trendDataCompleteness;
    const trendScore = trendSignal.trendScore;
    const trendAgreementWithPrice: "confirming" | "diverging" | "neutral" | "unavailable" = trendScore === null || priceTrendScore === null
      ? "unavailable"
      : Math.sign(trendScore) === Math.sign(priceTrendScore) || Math.abs(trendScore) < 0.15
        ? "confirming"
        : "diverging";
    const trendAdjustment = applyTrendToPhase({
      phase: phaseResolution.phase,
      priceState: phaseResolution.priceState,
      demandState: phaseResolution.demandState,
      trendScore,
      trendExpansionState,
      trendMomentumState,
      priceTrendScore,
    });
    const longShortReasoning = longTrendDirection === "up" && shortTrendMomentum === "decelerating"
      ? "Lång trend upp, men kort momentum avtar, vilket är förenligt med en sen cykelfas."
      : longTrendDirection === "up" && shortTrendMomentum === "accelerating"
        ? "Lång trend upp och kort momentum accelererar, vilket stödjer fortsatt expansionsfas."
        : null;
    if (longShortReasoning) trendAdjustment.notes.push(longShortReasoning);
    const adjustedPhase = trendAdjustment.phase;

    const regimeClassification = classifyCopperRegime(input);
    const normalizedPhaseForFramework: CommodityPhase = adjustedPhase === "Recession" ? "Compression" : adjustedPhase;
    const regimeAgreementWithPrice = resolveRegimeAgreementWithPrice(normalizedPhaseForFramework, regimeClassification.regime);

    const usedIndicatorCount = [
      copper?.percentile10y,
      copper?.momentum12m ?? copper?.yoy,
      chinaCli?.valueLatest,
      chinaCli?.change3m ?? chinaCli?.change1m,
      inventory?.score,
      capex?.score,
    ].filter((value) => typeof value === "number").length;
    const dataCompleteness = clamp(usedIndicatorCount / 6, 0, 1);
    const pmiCompleteness = chinaCli?.valueLatest !== null && chinaCli?.valueLatest !== undefined && cliChange3m !== null ? 1 : 0;
    const coherencePenalty = phaseResolution.divergenceType === "bearish_divergence" ? 0.24 : phaseResolution.divergenceType === "bullish_recovery" ? 0.04 : 0;

    const diagnosticKeys: CommodityIndicatorKey[] = [
      "copper_usd",
      "china_cli",
      "pmi_us",
      "copper_lme_inventory",
      "copper_capex_proxy",
    ];

    const indicatorDiagnostics: CommodityIndicatorDiagnostic[] = diagnosticKeys.map((key) => {
      const indicator = getIndicator(input, key);
      return {
        key,
        used: Boolean(indicator && (typeof indicator.percentile10y === "number" || typeof indicator.score === "number" || typeof indicator.valueLatest === "number")),
        missing: !indicator,
        fallbackUsed: false,
        score: indicator?.score ?? null,
        valueLatest: indicator?.valueLatest ?? null,
        percentile10y: indicator?.percentile10y ?? null,
        asOf: indicator?.asOf ?? null,
      };
    });

    const fallbackCount = indicatorDiagnostics.filter((item) => item.missing).length;
    const confidence = buildConfidence({
      dataCompleteness: clamp(dataCompleteness * 0.6 + pmiCompleteness * 0.4, 0, 1),
      overlayAgreement: overlayResolution.agreement,
      regimeAgreement: regimeAgreementWithPrice,
      fallbackCount,
      phaseScore: phaseScore === null ? null : clamp(phaseScore - coherencePenalty, -1, 1),
      overlaysDiverging,
      trendScore,
      trendCompleteness,
      trendAgreementWithPrice,
    });

    const diagnostics: CommodityDiagnostics = {
      usedIndicators: indicatorDiagnostics.filter((item) => item.used).map((item) => item.key),
      missingIndicators: indicatorDiagnostics.filter((item) => item.missing).map((item) => item.key),
      fallbackIndicators: [],
      usedOverlays,
      missingOverlays,
      ignoredOverlays,
      overlayContribution: overlayResolution.contribution,
      overlayAgreement: overlayResolution.agreement,
      overlayConflict: overlayResolution.conflicts,
      confidenceReasons: confidence.reasons,
      phaseStrength: phaseScore === null ? "weak" : Math.abs(phaseScore) >= 0.5 ? "strong" : Math.abs(phaseScore) >= 0.25 ? "moderate" : "weak",
      phaseReasoning: phaseResolution.reasoning,
      notes: [
        "Copper profile is industrial-cycle centered (demand, supply, capex).",
        "Monetary overlays are intentionally ignored for copper.",
        "China demand signal uses OECD China CLI (FRED: CHNLOLITOAASTSAM) as the verified primary proxy.",
        `demand_signal_source=${cliResolution.source}.`,
        `china_cli=${chinaCli?.valueLatest ?? "n/a"}, china_cli_change_3m=${cliChange3m ?? "n/a"} (China-led proxy, not PMI).`,
        `pmi_us_supplemental=${pmiUsSupplemental?.valueLatest ?? "n/a"} (supplemental/global context only, does not drive phase).`,
        `demand_state=${phaseResolution.demandState ?? "n/a"}, price_state=${phaseResolution.priceState}.`,
        `trend_signal structure=${trendStructureState ?? "insufficient"}, expansion=${trendExpansionState ?? "insufficient"}, momentum=${trendMomentumState ?? "insufficient"}, completeness=${trendCompleteness}, trend_score=${trendScore ?? "n/a"}, trendAgreementWithPrice=${trendAgreementWithPrice}.`,
        `trend_synthesis long=${longTrendDirection}, short=${shortTrendMomentum}, combined="${trendCombinedInterpretation}"`,
        `trend_phase_effect=${trendAdjustment.effect}.`,
        `divergence=${String(phaseResolution.divergence)}, divergenceType=${phaseResolution.divergenceType}.`,
        `overrideApplied=${String(phaseResolution.overrideApplied)}, overrideReason=${phaseResolution.overrideReason ?? "none"}.`,
        `Regime=${regimeClassification.regime}; agreementWithPrice=${regimeAgreementWithPrice}.`,
        ...(trendAgreementWithPrice === "confirming" ? ["trend confirms price"] : []),
        ...(trendAgreementWithPrice === "diverging" ? ["trend diverges from price"] : []),
        ...(trendExpansionState === "narrowing" ? ["trend weakening"] : []),
        ...(trendExpansionState === "negative_short_spread" ? ["trend breakdown"] : []),
        ...(trendMomentumState === "decelerating" ? ["trend momentum decelerating"] : []),
        ...trendAdjustment.notes,
      ],
      trendInfluence: {
        trendStructureState: trendStructureState ?? "insufficient",
        trendExpansionState: trendExpansionState ?? "insufficient",
        trendMomentumState: trendMomentumState ?? "insufficient",
        longTrendDirection,
        shortTrendMomentum,
        trendCombinedInterpretation,
        trendDataCompleteness: trendCompleteness,
        trendScore,
        trendInfluenceOnPhase: trendAdjustment.effect,
        trendInfluenceOnConfidence: `trendAgreementWithPrice=${trendAgreementWithPrice}; trendCompleteness=${trendCompleteness}`,
      },
    };
    diagnostics.phaseReasoning = [...phaseResolution.reasoning, ...trendAdjustment.notes];

    return {
      commodity: "copper",
      category: "industrial",
      phase: adjustedPhase as CommodityPhase,
      phaseScore,
      confidence,
      drivers: [
        {
          id: "copper_price_trend",
          label: "Price percentile and momentum",
          signal: (priceTrendScore ?? 0) > 0.1 ? "bullish" : (priceTrendScore ?? 0) < -0.1 ? "bearish" : "neutral",
          weight: 0.4,
          note: `percentile=${copper?.percentile10y ?? "n/a"}, momentum12m=${copper?.momentum12m ?? copper?.yoy ?? "n/a"}`,
        },
        {
          id: "copper_industrial_demand",
          label: "Industrial demand (China CLI proxy)",
          signal: (demandScore ?? 0) > 0.1 ? "bullish" : (demandScore ?? 0) < -0.1 ? "bearish" : "neutral",
          weight: 0.35,
          note: `source=${cliResolution.source}, china_cli=${chinaCli?.valueLatest ?? "n/a"}, change3m=${cliChange3m ?? "n/a"}, demand_state=${phaseResolution.demandState ?? "n/a"}`,
        },
        {
          id: "copper_supply_capex",
          label: "Supply/capex cycle",
          signal: (supplyScore ?? 0) > 0.1 ? "bullish" : (supplyScore ?? 0) < -0.1 ? "bearish" : "neutral",
          weight: 0.25,
          note: `inventory=${inventory?.score ?? "n/a"}, capex=${capex?.score ?? "n/a"}`,
        },
      ],
      blockScores,
      indicatorDiagnostics,
      dataCompleteness,
      relevantOverlays: COPPER_RELEVANT_OVERLAYS.map((key) => ({ key, score: input.overlays[key] ?? null })),
      screeningAdjustments: buildScreeningAdjustment(adjustedPhase, trendAgreementWithPrice, trendScore),
      profileVersion: "copper-v1",
      asOf: input.asOf,
      status: "partial",
      diagnostics,
      regimeAgreementWithPrice,
      copperRegime: regimeClassification.regime,
      trendSignal: {
        structure: trendStructureState ?? "insufficient",
        expansion: trendExpansionState ?? "insufficient",
        momentumState: trendMomentumState ?? "insufficient",
        longTrendDirection,
        shortTrendMomentum,
        trendCombinedInterpretation,
        completeness: trendCompleteness,
        score: trendScore,
      },
    };
  },
};
