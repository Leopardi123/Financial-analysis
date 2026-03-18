import { GLOBAL_MACRO_TEMPLATE } from "./template";
import type { MacroExplanation } from "./explanationLayer";

export type RegimeId = "MonetaryDominance" | "Balanced" | "FiscalPressureBuilding" | "FiscalDominanceRisk";

type RegimeDistributionRow = {
  regimeId: RegimeId;
  weight: number;
  rank: number;
  supportingBlocks: string[];
  supportingOverlays: string[];
  contradictingOverlays: string[];
  modulatingOverlays: string[];
  opposingFactors: string[];
  narrative: string;
};

export type MacroRegimeProbability = {
  primaryRegime: RegimeId;
  primaryWeight: number;
  decisiveness: number;
  transitionLike: boolean;
  distribution: RegimeDistributionRow[];
  structuralAdjustment: {
    baseConfidence: number;
    adjustedConfidence: number;
    flatteningFactor: number;
    notes: string[];
  };
  narrative: {
    short: string;
    medium: string;
    long: string;
  };
};

const ORDERED_REGIMES: RegimeId[] = ["MonetaryDominance", "Balanced", "FiscalPressureBuilding", "FiscalDominanceRisk"];

const REGIME_CENTERS: Record<RegimeId, number> = {
  MonetaryDominance: GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.monetaryDominanceMax / 2,
  Balanced: (GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.monetaryDominanceMax + GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.balancedMax) / 2,
  FiscalPressureBuilding: (GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.balancedMax + GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.fiscalPressureMax) / 2,
  FiscalDominanceRisk: (GLOBAL_MACRO_TEMPLATE.thresholds.coreRegime.fiscalPressureMax + 100) / 2,
};

function normalize(values: number[]) {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 1e-6));
  const sum = safe.reduce((a, b) => a + b, 0) || 1;
  return safe.map((v) => v / sum);
}

function classifyOverlayRole(regimeId: RegimeId, overlayId: string, score: number | null, label: string) {
  const normalized = overlayId.toLowerCase();
  const l = label.toLowerCase();
  const high = l.includes("high") || l.includes("strong") || (typeof score === "number" && score >= 60);
  const low = l.includes("low") || l.includes("weak") || (typeof score === "number" && score <= 40);

  const inflationOverlay = normalized.includes("energy") || normalized.includes("inflation") || normalized.includes("trade");
  const liquidityOverlay = normalized.includes("liquidity");
  const riskOffOverlay = normalized.includes("safehaven") || normalized.includes("credit") || normalized.includes("unrest");

  if (regimeId === "MonetaryDominance") {
    if (liquidityOverlay && high) return "confirm";
    if (inflationOverlay && high) return "contradict";
    if (riskOffOverlay && high) return "modulate";
  }
  if (regimeId === "Balanced") {
    if (high && (inflationOverlay || riskOffOverlay)) return "modulate";
    if (low && liquidityOverlay) return "contradict";
    return "confirm";
  }
  if (regimeId === "FiscalPressureBuilding") {
    if (inflationOverlay && high) return "confirm";
    if (liquidityOverlay && high) return "modulate";
    if (inflationOverlay && low) return "contradict";
  }
  if (regimeId === "FiscalDominanceRisk") {
    if ((inflationOverlay || riskOffOverlay) && high) return "confirm";
    if (liquidityOverlay && high) return "contradict";
    if ((inflationOverlay || riskOffOverlay) && low) return "contradict";
  }
  return "modulate";
}

function applyTemperature(weights: number[], flatteningFactor: number) {
  const transformed = weights.map((w) => Math.pow(w, 1 / flatteningFactor));
  return normalize(transformed);
}

export function buildMacroRegimeProbability(input: {
  region: string;
  asOfDate: string;
  macroScore: number | null;
  macroRegimeLabel: string;
  macroExplanation: MacroExplanation | null;
}): MacroRegimeProbability {
  const macroScore = typeof input.macroScore === "number" ? input.macroScore : 50;
  const explanation = input.macroExplanation;

  // Step 1: score-distance raw weights
  const distanceWeights = ORDERED_REGIMES.map((regimeId) => {
    const distance = Math.abs(macroScore - REGIME_CENTERS[regimeId]);
    return 1 / (1 + distance);
  });

  // Step 2: block + overlay adjustment
  const blockMap = new Map((explanation?.blockBreakdown ?? []).map((b) => [b.blockId, b]));
  const overlayRows = explanation?.overlayBreakdown ?? [];

  const adjusted = ORDERED_REGIMES.map((regimeId, idx) => {
    let weight = distanceWeights[idx];
    const supportingBlocks: string[] = [];
    const opposingFactors: string[] = [];

    const a = blockMap.get("A_FISCAL")?.blockScore ?? null;
    const b = blockMap.get("B_MONETARY")?.blockScore ?? null;
    const c = blockMap.get("C_INFLATION")?.blockScore ?? null;
    const d = blockMap.get("D_CREDIBILITY")?.blockScore ?? null;

    if (regimeId === "MonetaryDominance") {
      if ((b ?? 50) >= 55) { weight *= 1.06; supportingBlocks.push("B_MONETARY"); }
      if ((c ?? 50) >= 60) { weight *= 0.94; opposingFactors.push("C_INFLATION elevated"); }
      if ((a ?? 50) >= 60) { weight *= 0.95; opposingFactors.push("A_FISCAL elevated"); }
    }
    if (regimeId === "Balanced") {
      const spread = Math.max(...[a, b, c, d].map((x) => typeof x === "number" ? x : 50)) - Math.min(...[a, b, c, d].map((x) => typeof x === "number" ? x : 50));
      if (spread <= 15) { weight *= 1.07; supportingBlocks.push("cross-block balance"); }
      if (spread >= 30) { weight *= 0.93; opposingFactors.push("high cross-block dispersion"); }
    }
    if (regimeId === "FiscalPressureBuilding") {
      if ((a ?? 50) >= 55) { weight *= 1.06; supportingBlocks.push("A_FISCAL"); }
      if ((c ?? 50) >= 55) { weight *= 1.06; supportingBlocks.push("C_INFLATION"); }
      if ((b ?? 50) >= 60) { weight *= 0.96; opposingFactors.push("B_MONETARY offset"); }
    }
    if (regimeId === "FiscalDominanceRisk") {
      if ((a ?? 50) >= 60) { weight *= 1.08; supportingBlocks.push("A_FISCAL"); }
      if ((c ?? 50) >= 60) { weight *= 1.06; supportingBlocks.push("C_INFLATION"); }
      if ((d ?? 50) >= 60) { weight *= 1.04; supportingBlocks.push("D_CREDIBILITY stress"); }
      if ((b ?? 50) >= 60) { weight *= 0.95; opposingFactors.push("B_MONETARY support"); }
    }

    const supportingOverlays: string[] = [];
    const contradictingOverlays: string[] = [];
    const modulatingOverlays: string[] = [];
    for (const overlay of overlayRows) {
      const role = classifyOverlayRole(regimeId, overlay.overlayId, overlay.score, overlay.label);
      if (role === "confirm") {
        weight *= 1.025;
        supportingOverlays.push(overlay.overlayId);
      } else if (role === "contradict") {
        weight *= 0.975;
        contradictingOverlays.push(overlay.overlayId);
      } else {
        modulatingOverlays.push(overlay.overlayId);
      }
    }

    return {
      regimeId,
      rawWeight: weight,
      supportingBlocks,
      supportingOverlays,
      contradictingOverlays,
      modulatingOverlays,
      opposingFactors,
    };
  });

  // Step 3 normalize
  const normalizedBase = normalize(adjusted.map((x) => x.rawWeight));

  // Step 4 structural flattening
  const baseConfidence = Math.max(0, Math.min(1, (explanation?.summary.confidence ?? 50) / 100));
  const structuralPenalty = (() => {
    const sq = explanation?.structuralQuality;
    if (!sq) return 0.25;
    const missingPenalty = Math.min(0.45, (sq.missingCriticalInputs.length || 0) * 0.03);
    const partialPenalty = Math.min(0.25, ((sq.partialCoreBlocks + sq.partialOverlays) || 0) * 0.03);
    const proxyPenalty = Math.min(0.15, (sq.proxyHeavyOverlays || 0) * 0.04);
    return missingPenalty + partialPenalty + proxyPenalty;
  })();
  const adjustedConfidence = Math.max(0.05, Math.min(0.98, baseConfidence - structuralPenalty));
  const flatteningFactor = 1 + (1 - adjustedConfidence) * 1.35;
  const normalized = applyTemperature(normalizedBase, flatteningFactor);

  const distribution = adjusted
    .map((row, idx) => ({
      ...row,
      weight: normalized[idx],
      narrative: `${row.regimeId}: score distance driver + block/overlay interactions.`,
    }))
    .sort((a, b) => b.weight - a.weight)
    .map((row, i) => ({
      regimeId: row.regimeId,
      weight: row.weight,
      rank: i + 1,
      supportingBlocks: row.supportingBlocks,
      supportingOverlays: row.supportingOverlays,
      contradictingOverlays: row.contradictingOverlays,
      modulatingOverlays: row.modulatingOverlays,
      opposingFactors: row.opposingFactors,
      narrative: row.narrative,
    }));

  // Step 5 decisiveness
  const top1 = distribution[0];
  const top2 = distribution[1] ?? distribution[0];
  const decisiveness = Math.max(0, top1.weight - top2.weight);

  // Step 6 transition
  const idx1 = ORDERED_REGIMES.indexOf(top1.regimeId);
  const idx2 = ORDERED_REGIMES.indexOf(top2.regimeId);
  const transitionLike = decisiveness < 0.15 && Math.abs(idx1 - idx2) === 1;

  const overlayInteractionText = top1.modulatingOverlays.length > 0
    ? `Modulating overlays: ${top1.modulatingOverlays.join(", ")}.`
    : "No major modulating overlays.";

  const short = `${top1.regimeId} leads (${(top1.weight * 100).toFixed(1)}%), decisiveness ${(decisiveness * 100).toFixed(1)}%. These weights are heuristic relative regime strengths, not calibrated probabilities.`;
  const medium = `${short} Competing regime: ${top2.regimeId} (${(top2.weight * 100).toFixed(1)}%). ${overlayInteractionText}`;
  const long = `${medium} Structural flattening factor ${flatteningFactor.toFixed(2)} (base confidence ${(baseConfidence * 100).toFixed(0)}%, adjusted ${(adjustedConfidence * 100).toFixed(0)}%). Transition-like=${transitionLike}.`;

  return {
    primaryRegime: top1.regimeId,
    primaryWeight: top1.weight,
    decisiveness,
    transitionLike,
    distribution,
    structuralAdjustment: {
      baseConfidence,
      adjustedConfidence,
      flatteningFactor,
      notes: [
        "Weights are based on score distance + block/overlay support and then normalized.",
        "These weights are heuristic relative regime strengths, not calibrated probabilities.",
      ],
    },
    narrative: { short, medium, long },
  };
}

export function buildMacroRegimeProbabilityCompare(input: {
  baseline: MacroRegimeProbability;
  modified: MacroRegimeProbability;
}) {
  const baselineTop = input.baseline.distribution[0];
  const modifiedTop = input.modified.distribution[0];
  return {
    baselinePrimaryRegime: baselineTop.regimeId,
    modifiedPrimaryRegime: modifiedTop.regimeId,
    changed: baselineTop.regimeId !== modifiedTop.regimeId,
    baselinePrimaryWeight: baselineTop.weight,
    modifiedPrimaryWeight: modifiedTop.weight,
    decisivenessDelta: input.modified.decisiveness - input.baseline.decisiveness,
    narrative: `Baseline ${baselineTop.regimeId} (${(baselineTop.weight * 100).toFixed(1)}%) vs modified ${modifiedTop.regimeId} (${(modifiedTop.weight * 100).toFixed(1)}%). These weights are heuristic relative regime strengths, not calibrated probabilities.`,
  };
}
