import type {
  CommodityBlockScore,
  CommodityConfidence,
  CommodityDiagnostics,
  CommodityIndicatorDiagnostic,
  CommodityIndicatorKey,
  CommodityProfile,
  CommodityProfileInput,
  CommodityProfileInputIndicator,
  CommodityPhase,
  CommodityRegimeDriver,
  CommodityScreeningAdjustment,
} from "../types";

const REQUIRED_INDICATORS: CommodityIndicatorKey[] = [
  "gold_usd",
  "real_yield_10y_us",
  "usd_broad_index",
  "gold_minus_real_yield_spread",
];

const OPTIONAL_INDICATORS: CommodityIndicatorKey[] = ["usd_yoy", "core_cpi_yoy_us", "breakeven_10y_us"];

const GOLD_RELEVANT_OVERLAYS = [
  "inflationCostShockOverlay",
  "liquidityOverlay",
  "creditFundingOverlay",
  "safeHavenRiskOffOverlay",
  "globalUnrestOverlay",
] as const;

type OverlayAgreement = "supportive" | "neutral" | "conflicting" | "unavailable";
type RegimeAgreementWithPrice = "confirming" | "diverging" | "neutral";
type LayerDirection = "supportive" | "neutral" | "opposing";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function avg(scores: Array<number | null>): number | null {
  const values = scores.filter((item): item is number => typeof item === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getIndicator(input: CommodityProfileInput, key: CommodityIndicatorKey): CommodityProfileInputIndicator | null {
  return input.indicators[key] ?? null;
}

function scoreToNormalized(indicator: CommodityProfileInputIndicator | null, inverse = false): number | null {
  if (!indicator || indicator.score === null) return null;
  const normalized = clamp(indicator.score / 2, -1, 1);
  return inverse ? normalized * -1 : normalized;
}

function percentileSignal(percentile10y: number | null): number | null {
  if (percentile10y === null || !Number.isFinite(percentile10y)) return null;
  return clamp((percentile10y - 50) / 50, -1, 1);
}

function momentumSignal(momentum12m: number | null): number | null {
  if (momentum12m === null || !Number.isFinite(momentum12m)) return null;
  return clamp(momentum12m / 25, -1, 1);
}

function deviationSignal(deviationFromMeanZ: number | null): number | null {
  if (deviationFromMeanZ === null || !Number.isFinite(deviationFromMeanZ)) return null;
  return clamp(deviationFromMeanZ / 2.5, -1, 1);
}

function macroRegimeSignal(coreRegimeLabel: string | null): number | null {
  if (!coreRegimeLabel) return null;
  if (coreRegimeLabel === "FiscalDominanceRisk") return 0.9;
  if (coreRegimeLabel === "FiscalPressureBuilding") return 0.6;
  if (coreRegimeLabel === "Balanced") return 0;
  if (coreRegimeLabel === "PolicySupportCyclical") return -0.35;
  if (coreRegimeLabel === "DisinflationaryProductivity") return -0.25;
  return 0;
}

function overlayScore(input: CommodityProfileInput, key: string): number | null {
  const value = input.overlays[key];
  if (typeof value !== "number") return null;
  return clamp((value - 50) / 50, -1, 1);
}

function summarizeOverlays(input: CommodityProfileInput) {
  const usedOverlays: string[] = [];
  const missingOverlays: string[] = [];
  for (const key of GOLD_RELEVANT_OVERLAYS) {
    if (typeof input.overlays[key] === "number") usedOverlays.push(key);
    else missingOverlays.push(key);
  }
  const ignoredOverlays = Object.keys(input.overlays).filter((key) => !GOLD_RELEVANT_OVERLAYS.includes(key as (typeof GOLD_RELEVANT_OVERLAYS)[number]));

  const policyNarrativeScore = avg([
    overlayScore(input, "safeHavenRiskOffOverlay"),
    overlayScore(input, "globalUnrestOverlay"),
    overlayScore(input, "creditFundingOverlay"),
  ]);
  const macroOverlayScore = avg([
    overlayScore(input, "inflationCostShockOverlay"),
    overlayScore(input, "liquidityOverlay"),
  ]);

  return {
    usedOverlays,
    missingOverlays,
    ignoredOverlays,
    policyNarrativeScore,
    macroOverlayScore,
  };
}

function resolveOverlayAgreement(priceTrendScore: number | null, overlayCompositeScore: number | null): {
  agreement: OverlayAgreement;
  contribution: { score: number | null; classification: OverlayAgreement; note: string };
  conflicts: string[];
} {
  if (overlayCompositeScore === null) {
    return {
      agreement: "unavailable",
      contribution: { score: null, classification: "unavailable", note: "No usable gold-relevant overlays were available." },
      conflicts: [],
    };
  }

  if (priceTrendScore === null) {
    return {
      agreement: "neutral",
      contribution: { score: overlayCompositeScore, classification: "neutral", note: "Overlay layer available, but price/trend baseline is missing." },
      conflicts: [],
    };
  }

  const sameDirection = Math.sign(priceTrendScore) === Math.sign(overlayCompositeScore) || Math.abs(overlayCompositeScore) < 0.1;
  const conflict = Math.sign(priceTrendScore) !== 0 && Math.sign(overlayCompositeScore) !== 0 && Math.sign(priceTrendScore) !== Math.sign(overlayCompositeScore);

  if (sameDirection && Math.abs(overlayCompositeScore) >= 0.15) {
    return {
      agreement: "supportive",
      contribution: { score: overlayCompositeScore, classification: "supportive", note: "Overlays confirm price/trend direction." },
      conflicts: [],
    };
  }

  if (conflict) {
    return {
      agreement: "conflicting",
      contribution: { score: overlayCompositeScore, classification: "conflicting", note: "Overlays conflict with price/trend direction." },
      conflicts: ["Price/Trend and overlay layer point in opposite directions."],
    };
  }

  return {
    agreement: "neutral",
    contribution: { score: overlayCompositeScore, classification: "neutral", note: "Overlay influence is weak/mixed relative to price/trend." },
    conflicts: [],
  };
}

function toLayerDirection(score: number | null): LayerDirection {
  if (score === null) return "neutral";
  if (score >= 0.15) return "supportive";
  if (score <= -0.15) return "opposing";
  return "neutral";
}

function buildGoldMonetaryStressOverlay(input: CommodityProfileInput) {
  const goldSpread = getIndicator(input, "gold_minus_real_yield_spread");
  const realYield = getIndicator(input, "real_yield_10y_us");
  const usdTrend = getIndicator(input, "usd_yoy") ?? getIndicator(input, "usd_broad_index");
  const spreadSignal = scoreToNormalized(goldSpread);
  const realRateSignal = scoreToNormalized(realYield, true);
  const usdSignal = scoreToNormalized(usdTrend, true);
  const score = avg([spreadSignal, realRateSignal, usdSignal]);
  const confidence = clamp([spreadSignal, realRateSignal, usdSignal].filter((item) => item !== null).length / 3, 0, 1);
  return {
    score,
    direction: toLayerDirection(score),
    confidence,
    notes: [
      `spread=${spreadSignal === null ? "n/a" : spreadSignal.toFixed(2)}`,
      `realRate=${realRateSignal === null ? "n/a" : realRateSignal.toFixed(2)}`,
      `usd=${usdSignal === null ? "n/a" : usdSignal.toFixed(2)}`,
    ],
  };
}

function buildMarketRiskOffOverlay(input: CommodityProfileInput) {
  const vix = getIndicator(input, "vix_index");
  const hySpread = getIndicator(input, "hy_spread_us");
  const fci = getIndicator(input, "financial_conditions_index");
  const vixSignal = scoreToNormalized(vix);
  const hySignal = scoreToNormalized(hySpread);
  const fciSignal = scoreToNormalized(fci);
  const score = avg([vixSignal, hySignal, fciSignal]);
  const confidence = clamp([vixSignal, hySignal, fciSignal].filter((item) => item !== null).length / 3, 0, 1);
  return {
    score,
    direction: toLayerDirection(score),
    confidence,
    notes: [
      `vix=${vixSignal === null ? "n/a" : vixSignal.toFixed(2)}`,
      `hy=${hySignal === null ? "n/a" : hySignal.toFixed(2)}`,
      `fci=${fciSignal === null ? "n/a" : fciSignal.toFixed(2)}`,
    ],
  };
}

function classifyGoldRegime(
  input: CommodityProfileInput,
  monetaryStressOverlay: { score: number | null; direction: LayerDirection; confidence: number },
  marketRiskOffOverlay: { score: number | null; direction: LayerDirection; confidence: number },
): {
  regime: "Monetary Stress" | "Disinflation / Real Yield Rising" | "Risk-Off (deflationary)" | "Neutral / Competing Assets";
  regimeConfidence: number;
  regimeDrivers: CommodityRegimeDriver[];
} {
  const realYield = getIndicator(input, "real_yield_10y_us");
  const usdYoy = getIndicator(input, "usd_yoy");
  const usdBroad = getIndicator(input, "usd_broad_index");
  const breakeven = getIndicator(input, "breakeven_10y_us");
  const goldSpread = getIndicator(input, "gold_minus_real_yield_spread");
  const gold = getIndicator(input, "gold_usd");

  const realYieldDown = (realYield?.change3m ?? 0) < 0 || (realYield?.valueLatest ?? 999) < 0;
  const realYieldUp = (realYield?.change3m ?? 0) > 0;
  const usdUp = (usdYoy?.yoy ?? usdYoy?.change3m ?? usdBroad?.change3m ?? 0) > 0;
  const inflationUp = (breakeven?.change3m ?? 0) > 0;
  const inflationDownOrFlat = (breakeven?.change3m ?? 0) <= 0.05;
  const goldUp = (gold?.momentum12m ?? gold?.yoy ?? 0) > 0;
  const spreadUp = (goldSpread?.change3m ?? 0) > 0 || (goldSpread?.score ?? 0) > 0;

  const regimeDrivers: CommodityRegimeDriver[] = [
    {
      id: "real_rates",
      label: "Real rates",
      signal: realYieldDown ? "supportive" : realYieldUp ? "headwind" : "neutral",
      note: `change3m=${realYield?.change3m ?? "n/a"}, latest=${realYield?.valueLatest ?? "n/a"}`,
    },
    {
      id: "usd_trend",
      label: "USD trend",
      signal: usdUp ? "headwind" : "supportive",
      note: `usd signal=${usdYoy?.yoy ?? usdYoy?.change3m ?? usdBroad?.change3m ?? "n/a"}`,
    },
    {
      id: "inflation_expectations",
      label: "Inflation expectations",
      signal: inflationUp ? "supportive" : inflationDownOrFlat ? "headwind" : "neutral",
      note: `breakeven change3m=${breakeven?.change3m ?? "n/a"}`,
    },
    {
      id: "gold_real_rate_spread",
      label: "Gold vs real-rate spread",
      signal: spreadUp ? "supportive" : "neutral",
      note: `spread change3m=${goldSpread?.change3m ?? "n/a"}, score=${goldSpread?.score ?? "n/a"}`,
    },
  ];

  regimeDrivers.push({
    id: "gold_monetary_stress_overlay",
    label: "Gold Monetary Stress Overlay",
    signal: monetaryStressOverlay.direction === "supportive" ? "supportive" : monetaryStressOverlay.direction === "opposing" ? "headwind" : "neutral",
    note: `score=${monetaryStressOverlay.score === null ? "n/a" : monetaryStressOverlay.score.toFixed(2)}, confidence=${monetaryStressOverlay.confidence.toFixed(2)}`,
  });
  regimeDrivers.push({
    id: "market_risk_off_overlay",
    label: "Market Risk-Off Overlay",
    signal: marketRiskOffOverlay.direction === "supportive" ? "supportive" : marketRiskOffOverlay.direction === "opposing" ? "headwind" : "neutral",
    note: `score=${marketRiskOffOverlay.score === null ? "n/a" : marketRiskOffOverlay.score.toFixed(2)}, confidence=${marketRiskOffOverlay.confidence.toFixed(2)}`,
  });

  const availableSignals = [realYield, usdYoy ?? usdBroad, breakeven, goldSpread].filter(Boolean).length;
  const regimeConfidence = clamp(availableSignals / 4 * 0.7 + ((monetaryStressOverlay.confidence + marketRiskOffOverlay.confidence) / 2) * 0.3, 0, 1);

  if ((realYieldDown && inflationUp) || (monetaryStressOverlay.score ?? 0) >= 0.35) {
    return { regime: "Monetary Stress", regimeConfidence, regimeDrivers };
  }
  if (realYieldUp && inflationDownOrFlat && (monetaryStressOverlay.score ?? 0) <= 0.1) {
    return { regime: "Disinflation / Real Yield Rising", regimeConfidence, regimeDrivers };
  }
  if ((usdUp && realYieldDown && goldUp) || (marketRiskOffOverlay.score ?? 0) >= 0.35) {
    return { regime: "Risk-Off (deflationary)", regimeConfidence, regimeDrivers };
  }
  return { regime: "Neutral / Competing Assets", regimeConfidence, regimeDrivers };
}

function resolveRegimeAgreementWithPrice(args: {
  phase: CommodityPhase;
  phaseScore: number | null;
  regime: "Monetary Stress" | "Disinflation / Real Yield Rising" | "Risk-Off (deflationary)" | "Neutral / Competing Assets";
}): RegimeAgreementWithPrice {
  const pricePositive = (args.phaseScore ?? 0) > 0.15;
  if (!pricePositive) return "neutral";
  if (args.regime === "Monetary Stress" || args.regime === "Risk-Off (deflationary)") return "confirming";
  if (args.regime === "Disinflation / Real Yield Rising") return "diverging";
  if (args.phase === "Late Cycle" && args.regime === "Neutral / Competing Assets") return "diverging";
  return "neutral";
}

function buildConfidence(args: {
  required: CommodityIndicatorKey[];
  optional: CommodityIndicatorKey[];
  indicatorDiagnostics: CommodityIndicatorDiagnostic[];
  blockScores: CommodityBlockScore[];
  overlayAgreement: OverlayAgreement;
  regimeAgreementWithPrice: RegimeAgreementWithPrice;
  overlaysDiverging: boolean;
}): CommodityConfidence {
  const usedRequired = args.indicatorDiagnostics.filter((item) => item.used && args.required.includes(item.key)).length;
  const usedOptional = args.indicatorDiagnostics.filter((item) => item.used && args.optional.includes(item.key)).length;
  const dataCompleteness = (usedRequired + usedOptional * 0.5) / (args.required.length + args.optional.length * 0.5);

  const activeBlocks = args.blockScores
    .filter((block) => block.status === "used")
    .map((block) => block.score)
    .filter((score): score is number => typeof score === "number");
  let signalCoherence = 0.45;
  if (activeBlocks.length >= 2) {
    const mean = activeBlocks.reduce((sum, value) => sum + value, 0) / activeBlocks.length;
    const divergence = activeBlocks.reduce((sum, value) => sum + Math.abs(value - mean), 0) / activeBlocks.length;
    signalCoherence = clamp(1 - divergence, 0, 1);
  }

  if (args.overlayAgreement === "supportive") signalCoherence = clamp(signalCoherence + 0.08, 0, 1);
  if (args.overlayAgreement === "conflicting") signalCoherence = clamp(signalCoherence - 0.12, 0, 1);
  if (args.overlaysDiverging) signalCoherence = clamp(signalCoherence - 0.08, 0, 1);
  if (args.regimeAgreementWithPrice === "confirming") signalCoherence = clamp(signalCoherence + 0.06, 0, 1);
  if (args.regimeAgreementWithPrice === "diverging") signalCoherence = clamp(signalCoherence - 0.1, 0, 1);

  const fallbackCount = args.indicatorDiagnostics.filter((item) => item.fallbackUsed).length;
  const fallbackPenalty = clamp(fallbackCount * 0.2, 0, 1);

  const score = clamp(dataCompleteness * 0.55 + signalCoherence * 0.35 - fallbackPenalty * 0.25, 0, 1);
  const tier = score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low";
  const reasons = [
    `Data completeness=${dataCompleteness.toFixed(2)} from required/optional coverage.`,
    `Signal coherence=${signalCoherence.toFixed(2)} including overlay effect (${args.overlayAgreement}), overlay divergence=${String(args.overlaysDiverging)}, and regime/price agreement (${args.regimeAgreementWithPrice}).`,
    `Fallback penalty=${fallbackPenalty.toFixed(2)} (fallback count=${fallbackCount}).`,
  ];

  return {
    score,
    tier,
    breakdown: { dataCompleteness, signalCoherence, fallbackPenalty },
    confidenceComponents: { dataCompleteness, signalCoherence, fallbackPenalty },
    reasons,
  };
}

function resolveGoldPhase(args: {
  percentile: number | null;
  momentum12m: number | null;
  macroScore: number | null;
  overlayAgreement: OverlayAgreement;
  overlayContributionScore: number | null;
  phaseScore: number | null;
}): { phase: CommodityPhase; reasoning: string[] } {
  const reasoning: string[] = [];
  const p = args.percentile;
  const m = args.momentum12m;
  const macro = args.macroScore;

  if (p === null || m === null || macro === null || args.phaseScore === null) {
    reasoning.push("Missing one or more core phase inputs (percentile, momentum12m, macroScore). Returning Unknown.");
    return { phase: "Unknown", reasoning };
  }

  const macroImproving = macro >= 0.15;
  const macroWeak = macro <= -0.15;
  const monetaryStress = macro >= 0.5;

  if (p >= 75 && monetaryStress) {
    reasoning.push("High percentile + monetary stress => Structural Bull.");
    if (args.overlayAgreement === "supportive") reasoning.push("Overlays are supportive, reinforcing Structural Bull.");
    if (args.overlayAgreement === "conflicting") reasoning.push("Overlays are conflicting; conviction reduced despite Structural Bull classification.");
    return { phase: "Structural Bull", reasoning };
  }
  if (p <= 35 && macroImproving) {
    reasoning.push("Low percentile + improving macro backdrop => Early Cycle.");
    if (args.overlayAgreement === "supportive") reasoning.push("Overlays support early turn in backdrop.");
    return { phase: "Early Cycle", reasoning };
  }
  if (p >= 70 && m >= 8) {
    reasoning.push("High percentile + strong 12M momentum => Late Cycle.");
    if (args.overlayAgreement === "neutral") reasoning.push("Late Cycle driven mainly by price/trend; overlays only weakly supportive.");
    if (args.overlayAgreement === "conflicting") reasoning.push("Price suggests Late Cycle but overlays are conflicting.");
    return { phase: "Late Cycle", reasoning };
  }
  if (p <= 35 && macroWeak) {
    reasoning.push("Low percentile + weak macro/monetary context => Compression.");
    return { phase: "Compression", reasoning };
  }

  if (args.phaseScore >= 0.55) {
    reasoning.push("Aggregate phase score strongly positive => Structural Bull.");
    return { phase: "Structural Bull", reasoning };
  }
  if (args.phaseScore <= -0.55) {
    reasoning.push("Aggregate phase score strongly negative => Structural Bear.");
    return { phase: "Structural Bear", reasoning };
  }
  if (args.phaseScore >= 0.2) {
    reasoning.push("Aggregate phase score moderately positive => Mid Cycle.");
    if (typeof args.overlayContributionScore === "number" && args.overlayContributionScore > 0.2) {
      reasoning.push("Overlay layer contributes positively to Mid Cycle signal.");
    }
    return { phase: "Mid Cycle", reasoning };
  }
  if (args.phaseScore <= -0.2) {
    reasoning.push("Aggregate phase score moderately negative => Compression.");
    return { phase: "Compression", reasoning };
  }

  reasoning.push("Signals mixed and near-neutral => Early Cycle.");
  return { phase: "Early Cycle", reasoning };
}

function buildScreeningAdjustment(
  phase: CommodityPhase,
  regime: "Monetary Stress" | "Disinflation / Real Yield Rising" | "Risk-Off (deflationary)" | "Neutral / Competing Assets",
  regimeAgreementWithPrice: RegimeAgreementWithPrice,
): CommodityScreeningAdjustment {
  if (phase === "Late Cycle" && regime === "Monetary Stress") {
    return {
      bias: "supportive",
      notes: ["Late Cycle price action is confirmed by Monetary Stress regime."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: 4, maxPositionSizeDeltaPct: 8 },
    };
  }
  if (phase === "Late Cycle" && regimeAgreementWithPrice === "diverging") {
    return {
      bias: "caution",
      notes: ["Late Cycle price signal diverges from macro regime; reduce conviction."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: -4, maxPositionSizeDeltaPct: -6 },
    };
  }
  if (phase === "Structural Bull") {
    return {
      bias: "supportive",
      notes: ["Monetary stress + gold strength favors hard-asset exposure."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: 6, maxPositionSizeDeltaPct: 10 },
    };
  }
  if (phase === "Late Cycle") {
    return {
      bias: "supportive",
      notes: ["Trend still favorable; keep quality filters but allow constructive stance."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: 3, maxPositionSizeDeltaPct: 5 },
    };
  }
  if (phase === "Compression") {
    return {
      bias: "defensive",
      notes: ["Compression regime: require stronger balance sheet/valuation quality."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: -5, maxPositionSizeDeltaPct: -8 },
    };
  }
  if (phase === "Structural Bear") {
    return {
      bias: "caution",
      notes: ["Structural headwind for gold-sensitive screens."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: -8, maxPositionSizeDeltaPct: -12 },
    };
  }
  return { bias: "neutral", notes: ["No strong screening tilt from gold profile."] };
}

export const goldCommodityProfile: CommodityProfile = {
  commodity: "gold",
  category: "monetary_store_of_value",
  requiredIndicators: REQUIRED_INDICATORS,
  optionalIndicators: OPTIONAL_INDICATORS,
  profileVersion: "gold-v4",
  compute(input: CommodityProfileInput) {
    const gold = getIndicator(input, "gold_usd");
    const goldRealSpread = getIndicator(input, "gold_minus_real_yield_spread");
    const realYield = getIndicator(input, "real_yield_10y_us");
    const usdBroad = getIndicator(input, "usd_broad_index");
    const usdYoy = getIndicator(input, "usd_yoy");
    const coreCpi = getIndicator(input, "core_cpi_yoy_us");
    const breakeven = getIndicator(input, "breakeven_10y_us");

    const overlaySummary = summarizeOverlays(input);
    const goldMonetaryStressOverlay = buildGoldMonetaryStressOverlay(input);
    const marketRiskOffOverlay = buildMarketRiskOffOverlay(input);
    const overlaysDiverging = goldMonetaryStressOverlay.score !== null
      && marketRiskOffOverlay.score !== null
      && Math.sign(goldMonetaryStressOverlay.score) !== 0
      && Math.sign(marketRiskOffOverlay.score) !== 0
      && Math.sign(goldMonetaryStressOverlay.score) !== Math.sign(marketRiskOffOverlay.score);
    const primaryOverlayDriver = Math.abs((goldMonetaryStressOverlay.score ?? 0) * goldMonetaryStressOverlay.confidence) >= Math.abs((marketRiskOffOverlay.score ?? 0) * marketRiskOffOverlay.confidence)
      ? "goldMonetaryStressOverlay"
      : "marketRiskOffOverlay";

    const blockAPercentile = percentileSignal(gold?.percentile10y ?? null);
    const blockAMomentum = momentumSignal(gold?.momentum12m ?? gold?.yoy ?? null);
    const blockADeviation = deviationSignal(gold?.deviationFromMeanZ ?? null);
    const blockAScore = avg([blockAPercentile, blockAMomentum, blockADeviation]);

    const macroRegimeScore = macroRegimeSignal(input.macroContext.coreRegimeLabel);
    const blockBScore = avg([
      scoreToNormalized(realYield, true),
      scoreToNormalized(usdBroad, true),
      scoreToNormalized(usdYoy, true),
      scoreToNormalized(goldRealSpread),
      scoreToNormalized(coreCpi),
      scoreToNormalized(breakeven),
      macroRegimeScore,
      goldMonetaryStressOverlay.score,
    ]);

    const blockDScore = marketRiskOffOverlay.score;

    const overlayCompositeScore = avg([goldMonetaryStressOverlay.score, marketRiskOffOverlay.score]);
    const overlayResolution = resolveOverlayAgreement(blockAScore, overlayCompositeScore);

    const blockScores: CommodityBlockScore[] = [
      {
        blockId: "price_trend",
        label: "Price / Trend",
        score: blockAScore,
        confidence: blockAScore === null ? 0 : 0.9,
        status: blockAScore === null ? "missing" : "used",
        notes: [
          `Percentile signal=${blockAPercentile === null ? "n/a" : blockAPercentile.toFixed(2)}`,
          `Momentum12m signal=${blockAMomentum === null ? "n/a" : blockAMomentum.toFixed(2)}`,
          `Deviation-from-mean signal=${blockADeviation === null ? "n/a" : blockADeviation.toFixed(2)}`,
        ],
      },
      {
        blockId: "macro_monetary",
        label: "Macro / Monetary Context",
        score: blockBScore,
        confidence: blockBScore === null ? 0 : 0.9,
        status: blockBScore === null ? "missing" : "used",
        notes: [
          "Uses real rates, dollar pressure, macro regime and macro-relevant overlays.",
          `Macro regime=${input.macroContext.coreRegimeLabel ?? "n/a"} (${macroRegimeScore === null ? "n/a" : macroRegimeScore.toFixed(2)})`,
          `Gold Monetary Stress Overlay=${goldMonetaryStressOverlay.score === null ? "n/a" : goldMonetaryStressOverlay.score.toFixed(2)} (${goldMonetaryStressOverlay.direction})`,
        ],
      },
      {
        blockId: "equity_confirmation",
        label: "Equity / Confirmation",
        score: null,
        confidence: 0,
        status: "not_used",
        notes: ["Not used in phase 3 yet (equity breadth/relative-strength feed missing)."],
      },
      {
        blockId: "policy_narrative",
        label: "Policy / Narrative",
        score: blockDScore,
        confidence: blockDScore === null ? 0 : 0.7,
        status: blockDScore === null ? "not_used" : "used",
        notes: blockDScore === null
          ? ["Market Risk-Off overlay missing -> block kept as not_used."]
          : [`Built from market risk-off inputs (VIX/credit/equity stress): ${marketRiskOffOverlay.notes.join(", ")}`],
      },
    ];

    const phaseScore = avg([blockAScore, blockBScore, blockDScore]);
    const phaseResolution = resolveGoldPhase({
      percentile: gold?.percentile10y ?? null,
      momentum12m: gold?.momentum12m ?? gold?.yoy ?? null,
      macroScore: blockBScore,
      overlayAgreement: overlayResolution.agreement,
      overlayContributionScore: overlayResolution.contribution.score,
      phaseScore,
    });
    const regimeClassification = classifyGoldRegime(input, goldMonetaryStressOverlay, marketRiskOffOverlay);
    const regimeAgreementWithPrice = resolveRegimeAgreementWithPrice({
      phase: phaseResolution.phase,
      phaseScore,
      regime: regimeClassification.regime,
    });
    if (regimeAgreementWithPrice === "diverging") {
      phaseResolution.reasoning.push("Macro regime diverges from current price phase and lowers conviction.");
    } else if (regimeAgreementWithPrice === "confirming") {
      phaseResolution.reasoning.push("Macro regime confirms the current price phase.");
    }

    const indicatorDiagnostics: CommodityIndicatorDiagnostic[] = [...REQUIRED_INDICATORS, ...OPTIONAL_INDICATORS].map((key) => {
      const indicator = getIndicator(input, key);
      return {
        key,
        used: Boolean(indicator && indicator.score !== null),
        missing: !indicator || indicator.score === null,
        fallbackUsed: false,
        score: indicator?.score ?? null,
        valueLatest: indicator?.valueLatest ?? null,
        percentile10y: indicator?.percentile10y ?? null,
        asOf: indicator?.asOf ?? null,
        note: indicator?.score === null ? "Indicator present but not scoreable." : undefined,
      };
    });

    const confidence = buildConfidence({
      required: REQUIRED_INDICATORS,
      optional: OPTIONAL_INDICATORS,
      indicatorDiagnostics,
      blockScores,
      overlayAgreement: overlayResolution.agreement,
      regimeAgreementWithPrice,
      overlaysDiverging,
    });

    const dataCompleteness = confidence.breakdown.dataCompleteness;
    const usedIndicators = indicatorDiagnostics.filter((item) => item.used).map((item) => item.key);
    const missingIndicators = indicatorDiagnostics.filter((item) => item.missing).map((item) => item.key);

    const diagnostics: CommodityDiagnostics = {
      usedIndicators,
      missingIndicators,
      fallbackIndicators: [],
      usedOverlays: overlaySummary.usedOverlays,
      missingOverlays: overlaySummary.missingOverlays,
      ignoredOverlays: overlaySummary.ignoredOverlays,
      overlayContribution: overlayResolution.contribution,
      overlayAgreement: overlayResolution.agreement,
      overlayConflict: overlayResolution.conflicts,
      overlayLayerDiagnostics: {
        goldMonetaryStressOverlay: {
          score: goldMonetaryStressOverlay.score,
          direction: goldMonetaryStressOverlay.direction,
          confidence: goldMonetaryStressOverlay.confidence,
        },
        marketRiskOffOverlay: {
          score: marketRiskOffOverlay.score,
          direction: marketRiskOffOverlay.direction,
          confidence: marketRiskOffOverlay.confidence,
        },
        primaryDecisionDriver: primaryOverlayDriver,
        overlaysDiverging,
      },
      confidenceReasons: confidence.reasons,
      phaseStrength: phaseScore === null ? "weak" : Math.abs(phaseScore) >= 0.5 ? "strong" : Math.abs(phaseScore) >= 0.25 ? "moderate" : "weak",
      phaseReasoning: phaseResolution.reasoning,
      notes: [
        "Gold profile is monetary/store-of-value centered.",
        "Snapshot separates indicator-layer and overlay-layer contributions explicitly.",
        "Missing overlay data does not create synthetic proxies; it reduces agreement/coherence instead.",
        `Gold regime=${regimeClassification.regime}; agreementWithPrice=${regimeAgreementWithPrice}.`,
        `Primary overlay driver=${primaryOverlayDriver}; overlaysDiverging=${String(overlaysDiverging)}.`,
      ],
    };

    const drivers = [
      {
        id: "gold_price_trend",
        label: "Gold percentile + momentum",
        signal: blockAScore !== null && blockAScore > 0.1 ? "bullish" : blockAScore !== null && blockAScore < -0.1 ? "bearish" : "neutral",
        weight: 0.45,
        note: `percentile=${gold?.percentile10y ?? "n/a"}, momentum12m=${gold?.momentum12m ?? gold?.yoy ?? "n/a"}`,
      },
      {
        id: "macro_monetary_context",
        label: "Real rates / dollar / regime",
        signal: blockBScore !== null && blockBScore > 0.1 ? "bullish" : blockBScore !== null && blockBScore < -0.1 ? "bearish" : "neutral",
        weight: 0.4,
        note: `regime=${input.macroContext.coreRegimeLabel ?? "n/a"}`,
      },
      {
        id: "overlay_layer",
        label: "Overlay decision layer",
        signal: overlayResolution.contribution.score !== null && overlayResolution.contribution.score > 0.1
          ? "bullish"
          : overlayResolution.contribution.score !== null && overlayResolution.contribution.score < -0.1
            ? "bearish"
            : "neutral",
        weight: 0.15,
        note: `${overlayResolution.agreement}: ${overlayResolution.contribution.note}`,
      },
    ] as const;

    return {
      commodity: "gold",
      category: "monetary_store_of_value",
      phase: phaseResolution.phase,
      phaseScore,
      confidence,
      drivers: [...drivers],
      blockScores,
      indicatorDiagnostics,
      dataCompleteness,
      relevantOverlays: GOLD_RELEVANT_OVERLAYS.map((key) => ({ key, score: input.overlays[key] ?? null })),
      screeningAdjustments: buildScreeningAdjustment(phaseResolution.phase, regimeClassification.regime, regimeAgreementWithPrice),
      profileVersion: "gold-v4",
      asOf: input.asOf,
      status: "partial",
      diagnostics,
      goldRegime: regimeClassification.regime,
      regimeConfidence: regimeClassification.regimeConfidence,
      regimeDrivers: regimeClassification.regimeDrivers,
      regimeAgreementWithPrice,
    };
  },
};
