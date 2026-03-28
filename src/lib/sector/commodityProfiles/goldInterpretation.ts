type GoldSnapshot = {
  phase: string;
  phaseScore: number | null;
  confidence: { score: number; tier: "high" | "medium" | "low" };
  goldRegime?: "Monetary Stress" | "Disinflation / Real Yield Rising" | "Risk-Off (deflationary)" | "Neutral / Competing Assets";
  regimeAgreementWithPrice?: "confirming" | "diverging" | "neutral";
  trendSignal?: {
    structure: string;
    expansion: string;
    momentumState?: string;
    longTrendDirection?: string;
    shortTrendMomentum?: string;
    trendCombinedInterpretation?: string;
    completeness: "full" | "partial" | "insufficient";
    score: number | null;
  };
  regimeDrivers?: Array<{ id: string; label: string; signal: "supportive" | "headwind" | "neutral"; note: string }>;
  diagnostics: {
    phaseReasoning: string[];
    trendInfluence?: {
      trendInfluenceOnPhase: string;
      trendInfluenceOnConfidence: string;
      longTrendDirection?: string;
      shortTrendMomentum?: string;
      trendCombinedInterpretation?: string;
    };
  };
};

type GoldInterpretation = {
  interpretationText: string;
  summarySentences: string[];
  phaseReasoningHuman: string[];
  debug: {
    primaryHeadwind: "real_rates" | "usd" | "inflation_expectations" | "gold_real_rate_spread" | "overlays" | "none";
    primarySupport: "real_rates" | "usd" | "inflation_expectations" | "gold_real_rate_spread" | "overlays" | "none";
    divergenceType: "real_rates_vs_price" | "split_drivers" | "none";
    driverSummary: string;
    divergenceExplanation: string;
    trendExplanation: string;
  };
};

function driverDirection(snapshot: GoldSnapshot, id: string): "supportive" | "headwind" | "neutral" {
  const driver = (snapshot.regimeDrivers ?? []).find((item) => item.id === id);
  return driver?.signal ?? "neutral";
}

function humanDirection(direction: "supportive" | "headwind" | "neutral"): string {
  if (direction === "supportive") return "stöd";
  if (direction === "headwind") return "motvind";
  return "neutral";
}

function isPriceBullish(snapshot: GoldSnapshot): boolean {
  return (snapshot.phaseScore ?? 0) >= 0.2 || ["Late Cycle", "Mid Cycle", "Structural Bull"].includes(snapshot.phase);
}

function goldDriverSummary(snapshot: GoldSnapshot): string {
  const realRates = humanDirection(driverDirection(snapshot, "real_rates"));
  const usd = humanDirection(driverDirection(snapshot, "usd_trend"));
  const inflation = humanDirection(driverDirection(snapshot, "inflation_expectations"));
  const spread = humanDirection(driverDirection(snapshot, "gold_real_rate_spread"));
  const monetaryOverlay = humanDirection(driverDirection(snapshot, "gold_monetary_stress_overlay"));
  return `Drivkrafter: realräntor (${realRates}), USD (${usd}), inflationsförväntningar (${inflation}), guld vs realräntespread (${spread}), monetär stress (${monetaryOverlay}).`;
}

function goldDivergenceExplanation(snapshot: GoldSnapshot): { divergenceType: GoldInterpretation["debug"]["divergenceType"]; text: string } {
  const realRatesDirection = driverDirection(snapshot, "real_rates");
  const usdDirection = driverDirection(snapshot, "usd_trend");
  const inflationDirection = driverDirection(snapshot, "inflation_expectations");
  const spreadDirection = driverDirection(snapshot, "gold_real_rate_spread");
  const overlayDirection = driverDirection(snapshot, "gold_monetary_stress_overlay");

  if (realRatesDirection === "headwind" && isPriceBullish(snapshot)) {
    return {
      divergenceType: "real_rates_vs_price",
      text: "Stigande realräntor utgör en motvind för guld, men priset fortsätter upp, vilket skapar en divergens mellan fundamenta och marknadsbeteende.",
    };
  }

  const supports = [usdDirection, inflationDirection, spreadDirection, overlayDirection].filter((item) => item === "supportive").length;
  const headwinds = [realRatesDirection, usdDirection, inflationDirection, spreadDirection, overlayDirection].filter((item) => item === "headwind").length;
  if (supports > 0 && headwinds > 0) {
    return {
      divergenceType: "split_drivers",
      text: "Drivkrafterna är splittrade: realräntor verkar dämpande medan USD, inflation och overlay-signaler inte pekar i samma riktning.",
    };
  }

  return { divergenceType: "none", text: "Drivkrafterna pekar i huvudsak åt samma håll utan tydlig fundamenta-prisdiskrepans." };
}

function goldTrendExplanation(snapshot: GoldSnapshot): string {
  const longTrendDirection = snapshot.trendSignal?.longTrendDirection ?? snapshot.diagnostics.trendInfluence?.longTrendDirection ?? "insufficient";
  const shortTrendMomentum = snapshot.trendSignal?.shortTrendMomentum ?? snapshot.diagnostics.trendInfluence?.shortTrendMomentum ?? "insufficient";
  const trendCombined = snapshot.trendSignal?.trendCombinedInterpretation ?? snapshot.diagnostics.trendInfluence?.trendCombinedInterpretation ?? null;
  const trendPhaseEffect = snapshot.diagnostics.trendInfluence?.trendInfluenceOnPhase ?? "none";

  if (trendCombined) {
    return `${trendCombined} (lång trend: ${longTrendDirection}, kort momentum: ${shortTrendMomentum}).`;
  }
  if (trendPhaseEffect.includes("diverging") || trendPhaseEffect.includes("fragile") || (longTrendDirection === "up" && shortTrendMomentum === "decelerating")) {
    return "Trenden håller emot fundamenta, vilket gör rörelsen mer sårbar.";
  }
  if (longTrendDirection === "up" && shortTrendMomentum === "accelerating") {
    return "Lång trend upp och kort momentum accelererar, vilket stödjer fortsatt expansionsfas.";
  }
  return "Trendsyntes saknas eller är otillräcklig för tydlig lång/kort-separation.";
}

function resolvePrimaryAxes(snapshot: GoldSnapshot): {
  primaryHeadwind: GoldInterpretation["debug"]["primaryHeadwind"];
  primarySupport: GoldInterpretation["debug"]["primarySupport"];
} {
  const ordered: Array<GoldInterpretation["debug"]["primaryHeadwind"]> = ["real_rates", "usd", "inflation_expectations", "gold_real_rate_spread", "overlays"];
  const byId: Record<string, "supportive" | "headwind" | "neutral"> = {
    real_rates: driverDirection(snapshot, "real_rates"),
    usd: driverDirection(snapshot, "usd_trend"),
    inflation_expectations: driverDirection(snapshot, "inflation_expectations"),
    gold_real_rate_spread: driverDirection(snapshot, "gold_real_rate_spread"),
    overlays: driverDirection(snapshot, "gold_monetary_stress_overlay"),
  };

  const primaryHeadwind = ordered.find((id) => byId[id] === "headwind") ?? "none";
  const primarySupport = ordered.find((id) => byId[id] === "supportive") ?? "none";
  return { primaryHeadwind, primarySupport };
}

function goldSummary(snapshot: GoldSnapshot, divergenceText: string, trendText: string): string[] {
  return [
    `Guld ${isPriceBullish(snapshot) ? "stöds fortfarande av" : "saknar tydligt stöd från"} makrobilden, men signalbilden är inte entydig.`,
    divergenceText,
    trendText,
  ];
}

export function buildGoldInterpretation(snapshot: GoldSnapshot): GoldInterpretation {
  const driverSummary = goldDriverSummary(snapshot);
  const divergence = goldDivergenceExplanation(snapshot);
  const trendExplanation = goldTrendExplanation(snapshot);
  const { primaryHeadwind, primarySupport } = resolvePrimaryAxes(snapshot);

  const interpretationText = [
    `Guldpriset är ${isPriceBullish(snapshot) ? "fortsatt starkt" : "mer avvaktande"}.`,
    driverSummary,
    divergence.text,
    trendExplanation,
    `Sammantaget är övertygelsen ${snapshot.confidence.tier === "high" ? "hög" : snapshot.confidence.tier === "medium" ? "balanserad" : "försiktig"} och riskbilden bör vägas mot att primär motvind är ${primaryHeadwind}.`,
  ].join(" ");

  const phaseReasoningHuman = snapshot.diagnostics.phaseReasoning.map((line) => {
    if (line.includes("Macro regime diverges from current price phase and lowers conviction.")) {
      return "Priset ligger i övre percentilen samtidigt som realräntor stiger, vilket normalt skulle pressa guld. Denna konflikt sänker övertygelsen i fasbedömningen.";
    }
    if (line.includes("Macro favorable, market not fully confirming trend.")) {
      return "Makrobilden är stödjande, men trendstrukturen visar inte samma styrka vilket gör uppgången mer sårbar.";
    }
    return line;
  });

  return {
    interpretationText,
    summarySentences: goldSummary(snapshot, divergence.text, trendExplanation),
    phaseReasoningHuman,
    debug: {
      primaryHeadwind,
      primarySupport,
      divergenceType: divergence.divergenceType,
      driverSummary,
      divergenceExplanation: divergence.text,
      trendExplanation,
    },
  };
}
