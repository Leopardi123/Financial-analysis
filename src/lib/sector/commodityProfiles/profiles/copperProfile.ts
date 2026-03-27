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

type OverlayAgreement = "supportive" | "partial_support" | "neutral" | "partial_conflict" | "conflict" | "unavailable";
type RegimeAgreementWithPrice = "confirming" | "diverging" | "neutral";
type CopperRegime = "Demand expansion" | "Demand contraction" | "Supply tightness" | "Supply expansion";
type DemandState = "expansion_strong" | "expansion" | "contraction" | "weakening";
type PriceState = "high" | "mid" | "low";
type DivergenceType = "bearish_divergence" | "bullish_recovery" | "none";
type CopperPhase = CommodityPhase | "Recession";

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
  const pmi = getIndicator(input, "china_cli");
  const inventory = getIndicator(input, "copper_lme_inventory");

  const pmiChange = pmi?.change3m ?? pmi?.change1m ?? null;
  const pmiLevel = pmi?.valueLatest ?? null;
  const inventoryTrend = scoreToNormalized(inventory, true);

  const demandUp = (pmiLevel !== null && pmiLevel >= 50 && (pmiChange ?? 0) > 0) || (pmiChange ?? 0) >= 0.8;
  const demandDown = (pmiLevel !== null && pmiLevel < 50 && (pmiChange ?? 0) < 0) || (pmiChange ?? 0) <= -0.8;

  if ((inventoryTrend ?? 0) >= 0.35) {
    const inventoryScore = inventoryTrend ?? 0;
    return {
      regime: "Supply tightness",
      score: 0.7,
      drivers: [
        `Inventory pressure=${inventoryScore.toFixed(2)} (tight).`,
        `PMI level=${pmiLevel ?? "n/a"}, change3m=${pmiChange ?? "n/a"}.`,
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
        `PMI level=${pmiLevel ?? "n/a"}, change3m=${pmiChange ?? "n/a"}.`,
      ],
    };
  }

  if (demandUp) {
    return {
      regime: "Demand expansion",
      score: 0.55,
      drivers: [
        `PMI supports demand expansion: level=${pmiLevel ?? "n/a"}, change3m=${pmiChange ?? "n/a"}.`,
      ],
    };
  }

  if (demandDown) {
    return {
      regime: "Demand contraction",
      score: -0.55,
      drivers: [
        `PMI supports demand contraction: level=${pmiLevel ?? "n/a"}, change3m=${pmiChange ?? "n/a"}.`,
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
  pmiLevel: number | null;
  pmiChange3m: number | null;
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

  if (args.pmiLevel === null || args.pmiChange3m === null) {
    reasoning.push("China CLI level or 3m change missing; returning Unknown.");
    return { phase: "Unknown", demandState: null, priceState, divergence: false, divergenceType: "none", overrideApplied: false, overrideReason: null, reasoning };
  }

  const demandState = resolveDemandState(args.pmiLevel, args.pmiChange3m);
  const divergenceType: DivergenceType = priceState === "high" && args.pmiChange3m < 0
    ? "bearish_divergence"
    : (priceState === "low" || priceState === "mid") && args.pmiLevel < 100 && args.pmiChange3m > 0
      ? "bullish_recovery"
      : "none";
  const divergence = divergenceType !== "none";
  const chinaOverride = args.pmiLevel < 100 && priceState === "high";
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

function buildConfidence(args: {
  dataCompleteness: number;
  overlayAgreement: OverlayAgreement;
  regimeAgreement: RegimeAgreementWithPrice;
  fallbackCount: number;
  phaseScore: number | null;
  overlaysDiverging: boolean;
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
      `Signal coherence=${signalCoherence.toFixed(2)} (overlay=${args.overlayAgreement}, regimeAgreement=${args.regimeAgreement}).`,
      `Fallback penalty=${fallbackPenalty.toFixed(2)} for ${args.fallbackCount} fallback signals.`,
    ],
  };
}

function buildScreeningAdjustment(phase: CopperPhase): CommodityScreeningAdjustment {
  if (phase === "Early Cycle") {
    return {
      bias: "supportive",
      notes: ["Early-cycle copper setup: allow selective cyclical risk."],
      thresholdAdjustments: { maxPositionSizeDeltaPct: 5 },
    };
  }
  if (phase === "Mid Cycle") {
    return {
      bias: "supportive",
      notes: ["Demand expansion: favor operating leverage and volume exposure."],
      thresholdAdjustments: { maxPositionSizeDeltaPct: 8, valuationMultipleFloorDeltaPct: -5 },
    };
  }
  if (phase === "Late Cycle") {
    return {
      bias: "caution",
      notes: ["Capex expansion phase: prioritize balance sheet and cost curve resilience."],
      thresholdAdjustments: { maxPositionSizeDeltaPct: -5 },
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
    const pmiResolution = resolveCopperChinaCli(input);
    const pmi = pmiResolution.indicator;
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

    const pmiChange3m = pmi?.change3m ?? pmi?.change1m ?? null;
    const demandScore = avg([
      momentumSignal(pmiChange3m, 3),
      pmi?.valueLatest === null || pmi?.valueLatest === undefined ? null : clamp((pmi.valueLatest - 50) / 5, -1, 1),
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
        confidence: [pmi?.valueLatest, pmi?.change3m ?? pmi?.change1m].filter((v) => typeof v === "number").length / 2,
        status: demandScore === null ? "missing" : "used",
        notes: [
          "Uses China CLI level + short-term China CLI trend.",
          `china_cli=${pmi?.valueLatest ?? "n/a"}, change3m=${pmi?.change3m ?? pmi?.change1m ?? "n/a"}`,
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
      pmiLevel: pmi?.valueLatest ?? null,
      pmiChange3m,
      capexMomentum: scoreToNormalized(capex),
    });

    const regimeClassification = classifyCopperRegime(input);
    const normalizedPhaseForFramework: CommodityPhase = phaseResolution.phase === "Recession" ? "Compression" : phaseResolution.phase;
    const regimeAgreementWithPrice = resolveRegimeAgreementWithPrice(normalizedPhaseForFramework, regimeClassification.regime);

    const usedIndicatorCount = [
      copper?.percentile10y,
      copper?.momentum12m ?? copper?.yoy,
      pmi?.valueLatest,
      pmi?.change3m ?? pmi?.change1m,
      inventory?.score,
      capex?.score,
    ].filter((value) => typeof value === "number").length;
    const dataCompleteness = clamp(usedIndicatorCount / 6, 0, 1);
    const pmiCompleteness = pmi?.valueLatest !== null && pmi?.valueLatest !== undefined && pmiChange3m !== null ? 1 : 0;
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
        "China PMI via FRED is intentionally disabled in current pipeline; China CLI is the verified China-led proxy.",
        `demand_signal_source=${pmiResolution.source}.`,
        `china_cli=${pmi?.valueLatest ?? "n/a"}, china_cli_change_3m=${pmiChange3m ?? "n/a"} (China-led proxy, not PMI).`,
        `pmi_us_supplemental=${pmiUsSupplemental?.valueLatest ?? "n/a"} (supplemental/global context only, does not drive phase).`,
        `demand_state=${phaseResolution.demandState ?? "n/a"}, price_state=${phaseResolution.priceState}.`,
        `divergence=${String(phaseResolution.divergence)}, divergenceType=${phaseResolution.divergenceType}.`,
        `overrideApplied=${String(phaseResolution.overrideApplied)}, overrideReason=${phaseResolution.overrideReason ?? "none"}.`,
        `Regime=${regimeClassification.regime}; agreementWithPrice=${regimeAgreementWithPrice}.`,
      ],
    };

    return {
      commodity: "copper",
      category: "industrial",
      phase: phaseResolution.phase as CommodityPhase,
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
          note: `source=${pmiResolution.source}, china_cli=${pmi?.valueLatest ?? "n/a"}, change3m=${pmiChange3m ?? "n/a"}, demand_state=${phaseResolution.demandState ?? "n/a"}`,
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
      screeningAdjustments: buildScreeningAdjustment(phaseResolution.phase),
      profileVersion: "copper-v1",
      asOf: input.asOf,
      status: "partial",
      diagnostics,
      regimeAgreementWithPrice,
      copperRegime: regimeClassification.regime,
    };
  },
};
