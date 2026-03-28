import assert from "node:assert/strict";
import { buildGoldInterpretation } from "../goldInterpretation.ts";

const snapshot = {
  phase: "Late Cycle",
  phaseScore: 0.62,
  confidence: { score: 0.66, tier: "medium" as const },
  goldRegime: "Monetary Stress" as const,
  regimeAgreementWithPrice: "diverging" as const,
  trendSignal: {
    structure: "bullish_aligned",
    expansion: "expanding",
    completeness: "full" as const,
    score: 0.85,
  },
  regimeDrivers: [
    { id: "real_rates", label: "Real rates", signal: "headwind" as const, note: "up" },
    { id: "usd_trend", label: "USD trend", signal: "supportive" as const, note: "down" },
    { id: "inflation_expectations", label: "Inflation expectations", signal: "supportive" as const, note: "up" },
    { id: "gold_real_rate_spread", label: "Gold vs real-rate spread", signal: "supportive" as const, note: "up" },
    { id: "gold_monetary_stress_overlay", label: "Gold Monetary Stress Overlay", signal: "supportive" as const, note: "up" },
  ],
  diagnostics: {
    phaseReasoning: ["Macro regime diverges from current price phase and lowers conviction."],
    trendInfluence: {
      trendInfluenceOnPhase: "trendVsMacro=confirming",
      trendInfluenceOnConfidence: "trendCompleteness=full; trendVsMacro=confirming",
    },
  },
};

const interpretation = buildGoldInterpretation(snapshot);

assert.ok(interpretation.interpretationText.startsWith("Guldpriset"));
assert.ok(interpretation.interpretationText.includes("Drivkrafter:"));
assert.ok(interpretation.interpretationText.includes("Stigande realräntor utgör en motvind"));
assert.ok(interpretation.debug.primaryHeadwind === "real_rates");
assert.ok(interpretation.debug.divergenceType === "real_rates_vs_price");
assert.ok(interpretation.phaseReasoningHuman[0].includes("Priset ligger i övre percentilen"));

console.log("goldInterpretation.test.ts passed");
