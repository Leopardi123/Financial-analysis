import type { MacroRegimeProbability, MacroRegimeSnapshot } from "./types";

const REGIME_CENTERS: Array<{ regime: string; center: number }> = [
  { regime: "MonetaryDominance", center: 25 },
  { regime: "Balanced", center: 50 },
  { regime: "FiscalPressureBuilding", center: 68 },
  { regime: "FiscalDominanceRisk", center: 85 },
];

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

export function buildMacroRegimeProbabilityFromSnapshot(input: {
  macroScoreTotal: number | null;
  macroConfidence: number;
  coreRegimeLabel: string;
  growthOverlay: string;
  stressOverlay: string;
  hardAssetOverlay: string;
  blockScores: MacroRegimeSnapshot["blockScores"];
}): MacroRegimeProbability | null {
  if (typeof input.macroScoreTotal !== "number") return null;

  const score = input.macroScoreTotal;
  const overlayPenalty = input.stressOverlay === "High" ? 0.12 : input.stressOverlay === "Medium" ? 0.06 : 0;
  const confidenceMultiplier = clamp((typeof input.macroConfidence === "number" ? input.macroConfidence : 0) / 100, 0.35, 1);

  const raw = REGIME_CENTERS.map((item) => {
    const distance = Math.abs(score - item.center);
    const gaussian = Math.exp(-distance / 16);
    const stressTilt = item.regime === "FiscalDominanceRisk" ? overlayPenalty : 0;
    return { regime: item.regime, value: Math.max(0.0001, gaussian + stressTilt) };
  });

  const total = raw.reduce((sum, r) => sum + r.value, 0) || 1;
  const distribution = raw
    .map((r) => ({ regime: r.regime, weight: clamp((r.value / total) * 100 * confidenceMultiplier, 0, 100) }))
    .sort((a, b) => b.weight - a.weight);

  const renormTotal = distribution.reduce((sum, r) => sum + r.weight, 0) || 1;
  const normalized = distribution.map((r) => ({ ...r, weight: clamp((r.weight / renormTotal) * 100, 0, 100) }));

  const top1 = normalized[0] ?? { regime: input.coreRegimeLabel, weight: 0 };
  const top2 = normalized[1] ?? { regime: "n/a", weight: 0 };
  const decisiveness = clamp(top1.weight - top2.weight, 0, 100);
  const transitionLike = decisiveness < 12;

  const blockRanking = Object.entries(input.blockScores ?? {})
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([k]) => k);

  return {
    primaryRegime: top1.regime,
    primaryWeight: top1.weight,
    decisiveness,
    transitionLike,
    distribution: normalized.slice(0, 4),
    narrative: {
      short: `Primary regime weight leans ${top1.regime} (${top1.weight.toFixed(1)}%).`,
      medium: `Top alternatives: ${normalized.slice(0, 3).map((d) => `${d.regime} ${d.weight.toFixed(1)}%`).join(" · ")}.`,
      long: `Decisiveness ${decisiveness.toFixed(1)}%. Transition-like=${transitionLike ? "yes" : "no"}.`,
    },
    structuralAdjustment: {
      summary: confidenceMultiplier < 0.6 ? "confidence_penalty_applied" : "none",
      multiplier: confidenceMultiplier,
      penalty: 1 - confidenceMultiplier,
    },
    supportingBlocks: blockRanking.slice(0, 2),
    supportingOverlays: [input.growthOverlay, input.hardAssetOverlay].filter((x) => x && x !== "Neutral"),
    contradictingOverlays: [input.stressOverlay].filter((x) => x === "High"),
  };
}
