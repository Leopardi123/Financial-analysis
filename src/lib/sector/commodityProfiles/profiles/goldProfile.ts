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
  CommodityScreeningAdjustment,
} from "../types";

const REQUIRED_INDICATORS: CommodityIndicatorKey[] = [
  "gold_usd",
  "gold_minus_real_yield_spread",
  "real_yield_10y_us",
  "usd_broad_index",
];

const OPTIONAL_INDICATORS: CommodityIndicatorKey[] = ["usd_yoy", "core_cpi_yoy_us", "breakeven_10y_us"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getIndicator(input: CommodityProfileInput, key: CommodityIndicatorKey): CommodityProfileInputIndicator | null {
  return input.indicators[key] ?? null;
}

function indicatorToSignal(indicator: CommodityProfileInputIndicator | null, inverse = false): number | null {
  if (!indicator || indicator.score === null) return null;
  const normalized = indicator.score / 2;
  return inverse ? normalized * -1 : normalized;
}

function avg(scores: Array<number | null>): number | null {
  const values = scores.filter((item): item is number => typeof item === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolvePhase(score: number | null): CommodityPhase {
  if (score === null) return "Unknown";
  if (score >= 0.7) return "Structural Bull";
  if (score >= 0.4) return "Late Cycle";
  if (score >= 0.15) return "Mid Cycle";
  if (score >= -0.1) return "Early Cycle";
  if (score >= -0.35) return "Compression";
  if (score >= -0.65) return "Late Cycle";
  return "Structural Bear";
}

function buildConfidence(args: {
  required: CommodityIndicatorKey[];
  optional: CommodityIndicatorKey[];
  indicatorDiagnostics: CommodityIndicatorDiagnostic[];
  blockScores: CommodityBlockScore[];
}): CommodityConfidence {
  const usedRequired = args.indicatorDiagnostics.filter((item) => item.used && args.required.includes(item.key)).length;
  const usedOptional = args.indicatorDiagnostics.filter((item) => item.used && args.optional.includes(item.key)).length;
  const dataCompleteness = (usedRequired + usedOptional * 0.5) / (args.required.length + args.optional.length * 0.5);

  const numericBlockScores = args.blockScores
    .map((block) => block.score)
    .filter((score): score is number => typeof score === "number");

  let signalCoherence = 0.5;
  if (numericBlockScores.length >= 2) {
    const mean = numericBlockScores.reduce((sum, value) => sum + value, 0) / numericBlockScores.length;
    const disagreement = numericBlockScores.reduce((sum, value) => sum + Math.abs(value - mean), 0) / numericBlockScores.length;
    signalCoherence = clamp(1 - disagreement, 0, 1);
  }

  const fallbackCount = args.indicatorDiagnostics.filter((item) => item.fallbackUsed).length;
  const fallbackPenalty = clamp(fallbackCount * 0.2, 0, 1);
  const score = clamp(dataCompleteness * 0.5 + signalCoherence * 0.4 - fallbackPenalty * 0.3, 0, 1);
  const tier = score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low";

  const reasons = [
    `Data completeness=${dataCompleteness.toFixed(2)} based on required/optional indicator coverage.`,
    `Signal coherence=${signalCoherence.toFixed(2)} from block score alignment.`,
    `Fallback penalty=${fallbackPenalty.toFixed(2)} from fallback usage count=${fallbackCount}.`,
  ];

  return {
    score,
    tier,
    breakdown: {
      dataCompleteness,
      signalCoherence,
      fallbackPenalty,
    },
    reasons,
  };
}

function buildScreeningAdjustment(phase: CommodityPhase, phaseScore: number | null): CommodityScreeningAdjustment {
  if (phaseScore === null) {
    return { bias: "caution", notes: ["Insufficient commodity signal strength."] };
  }
  if (phase === "Structural Bull" || phase === "Late Cycle") {
    return {
      bias: "supportive",
      notes: ["Gold macro backdrop supports defensive hard-asset exposure."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: 5, maxPositionSizeDeltaPct: 10 },
    };
  }
  if (phase === "Structural Bear" || phase === "Compression") {
    return {
      bias: "defensive",
      notes: ["Gold setup is weak; prefer higher quality and valuation discipline."],
      thresholdAdjustments: { valuationMultipleFloorDeltaPct: -5, maxPositionSizeDeltaPct: -10 },
    };
  }
  return { bias: "neutral", notes: ["No major screening tilt from gold profile."] };
}

export const goldCommodityProfile: CommodityProfile = {
  commodity: "gold",
  category: "monetary_store_of_value",
  requiredIndicators: REQUIRED_INDICATORS,
  optionalIndicators: OPTIONAL_INDICATORS,
  profileVersion: "gold-v1",
  compute(input: CommodityProfileInput) {
    const goldPrice = getIndicator(input, "gold_usd");
    const goldRealSpread = getIndicator(input, "gold_minus_real_yield_spread");
    const realYield = getIndicator(input, "real_yield_10y_us");
    const usdBroad = getIndicator(input, "usd_broad_index");
    const usdYoy = getIndicator(input, "usd_yoy");
    const coreCpi = getIndicator(input, "core_cpi_yoy_us");
    const breakeven = getIndicator(input, "breakeven_10y_us");

    const blockPriceTrendScore = avg([
      indicatorToSignal(goldPrice),
      goldPrice && goldPrice.change3m !== null ? clamp(goldPrice.change3m / 10, -1, 1) : null,
    ]);

    const blockMacroMonetaryScore = avg([
      indicatorToSignal(goldRealSpread),
      indicatorToSignal(realYield, true),
      indicatorToSignal(usdBroad, true),
      indicatorToSignal(usdYoy, true),
      indicatorToSignal(coreCpi),
      indicatorToSignal(breakeven),
    ]);

    const hardAssetOverlayScore = input.overlays.safeHavenRiskOffOverlay ?? input.overlays.globalUnrestOverlay ?? null;
    const blockPolicyNarrativeScore = typeof hardAssetOverlayScore === "number"
      ? clamp((hardAssetOverlayScore - 50) / 50, -1, 1)
      : null;

    const blockScores: CommodityBlockScore[] = [
      {
        blockId: "price_trend",
        label: "Price / Trend",
        score: blockPriceTrendScore,
        confidence: blockPriceTrendScore === null ? 0 : 0.85,
        status: blockPriceTrendScore === null ? "missing" : "used",
      },
      {
        blockId: "macro_monetary",
        label: "Macro / Monetary Context",
        score: blockMacroMonetaryScore,
        confidence: blockMacroMonetaryScore === null ? 0 : 0.9,
        status: blockMacroMonetaryScore === null ? "missing" : "used",
      },
      {
        blockId: "equity_confirmation",
        label: "Equity / Confirmation",
        score: null,
        confidence: 0,
        status: "not_used",
        notes: ["Not wired in phase 1. Reserved for miner equity/breadth confirmations."],
      },
      {
        blockId: "policy_narrative",
        label: "Policy / Narrative",
        score: blockPolicyNarrativeScore,
        confidence: blockPolicyNarrativeScore === null ? 0.2 : 0.6,
        status: blockPolicyNarrativeScore === null ? "missing" : "used",
        notes: blockPolicyNarrativeScore === null ? ["Overlay score missing."] : undefined,
      },
    ];

    const phaseScore = avg([
      blockPriceTrendScore,
      blockMacroMonetaryScore,
      blockPolicyNarrativeScore,
    ]);
    const phase = resolvePhase(phaseScore);

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
    });

    const dataCompleteness = confidence.breakdown.dataCompleteness;
    const usedIndicators = indicatorDiagnostics.filter((item) => item.used).map((item) => item.key);
    const missingIndicators = indicatorDiagnostics.filter((item) => item.missing).map((item) => item.key);
    const diagnostics: CommodityDiagnostics = {
      usedIndicators,
      missingIndicators,
      fallbackIndicators: [],
      confidenceReasons: confidence.reasons,
      phaseStrength: phaseScore === null ? "weak" : Math.abs(phaseScore) >= 0.5 ? "strong" : Math.abs(phaseScore) >= 0.25 ? "moderate" : "weak",
      notes: [
        "Gold profile is monetary/store-of-value oriented in phase 1.",
        "Optional equity confirmation block is intentionally inactive until dedicated data is integrated.",
      ],
    };

    const drivers = [
      {
        id: "gold_price_signal",
        label: "Gold spot/trend",
        signal: blockPriceTrendScore !== null && blockPriceTrendScore > 0.1 ? "bullish" : blockPriceTrendScore !== null && blockPriceTrendScore < -0.1 ? "bearish" : "neutral",
        weight: 0.4,
        note: goldPrice?.percentile10y !== null && goldPrice?.percentile10y !== undefined
          ? `10y percentile=${goldPrice.percentile10y.toFixed(1)}`
          : "Insufficient percentile history.",
      },
      {
        id: "macro_monetary_signal",
        label: "Real rates / USD / inflation credibility",
        signal: blockMacroMonetaryScore !== null && blockMacroMonetaryScore > 0.1 ? "bullish" : blockMacroMonetaryScore !== null && blockMacroMonetaryScore < -0.1 ? "bearish" : "neutral",
        weight: 0.45,
      },
      {
        id: "macro_overlay_context",
        label: "Macro overlay context",
        signal: blockPolicyNarrativeScore !== null && blockPolicyNarrativeScore > 0.1 ? "bullish" : blockPolicyNarrativeScore !== null && blockPolicyNarrativeScore < -0.1 ? "bearish" : "neutral",
        weight: 0.15,
        note: input.macroContext.hardAssetOverlay
          ? `Hard asset overlay=${input.macroContext.hardAssetOverlay}`
          : "No hard-asset overlay label available.",
      },
    ] as const;

    return {
      commodity: "gold",
      category: "monetary_store_of_value",
      phase,
      phaseScore,
      confidence,
      drivers: [...drivers],
      blockScores,
      indicatorDiagnostics,
      dataCompleteness,
      relevantOverlays: [
        { key: "safeHavenRiskOffOverlay", score: input.overlays.safeHavenRiskOffOverlay ?? null },
        { key: "globalUnrestOverlay", score: input.overlays.globalUnrestOverlay ?? null },
      ],
      screeningAdjustments: buildScreeningAdjustment(phase, phaseScore),
      profileVersion: "gold-v1",
      asOf: input.asOf,
      status: "partial",
      diagnostics,
    };
  },
};
