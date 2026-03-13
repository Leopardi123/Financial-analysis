import { classifyCoreRegimeFromTemplate, classifyOverlayFromTemplate, GLOBAL_MACRO_TEMPLATE } from "./template.ts";
import type { MacroBlock, MacroRegimeSnapshot, MacroTopDriver } from "./types.ts";

export const MACRO_REGIONS = ["GLOBAL", "US", "EA", "SE"] as const;
export type MacroRegion = typeof MACRO_REGIONS[number];

export const MACRO_GLOBAL_REGION_WEIGHTS: Record<string, number> = {
  US: 0.5,
  EA: 0.35,
  SE: 0.15,
};


function weightedAverage(values: Array<{ value: number; weight: number }>): number | null {
  const sumWeight = values.reduce((acc, item) => acc + item.weight, 0);
  if (sumWeight <= 0) return null;
  return values.reduce((acc, item) => acc + item.value * item.weight, 0) / sumWeight;
}

function toOverlayScore(value: string): number | null {
  if (value === "Weak" || value === "Low") return -1;
  if (value === "Neutral" || value === "Medium") return 0;
  if (value === "Strong" || value === "High") return 1;
  return null;
}

export function aggregateGlobalMacroRegime(regional: MacroRegimeSnapshot[]): MacroRegimeSnapshot {
  const relevant = regional.filter((entry) => entry.region in MACRO_GLOBAL_REGION_WEIGHTS);
  const blocks: MacroBlock[] = ["A_FISCAL", "B_MONETARY", "C_INFLATION", "D_CREDIBILITY"];
  const blockScores = Object.fromEntries(blocks.map((block) => {
    const candidates = relevant
      .map((item) => ({ value: item.blockScores[block], weight: MACRO_GLOBAL_REGION_WEIGHTS[item.region] ?? 0 }))
      .filter((item): item is { value: number; weight: number } => typeof item.value === "number" && item.weight > 0);
    return [block, weightedAverage(candidates)];
  })) as MacroRegimeSnapshot["blockScores"];

  const validBlockScores = blocks.map((block) => blockScores[block]).filter((v): v is number => typeof v === "number");
  const macroScoreTotal = validBlockScores.length > 0 ? validBlockScores.reduce((a, b) => a + b, 0) / validBlockScores.length : null;

  const confidence = weightedAverage(
    relevant
      .map((item) => ({ value: item.macroConfidence, weight: MACRO_GLOBAL_REGION_WEIGHTS[item.region] ?? 0 }))
      .filter((item) => item.weight > 0),
  );

  const clearSignalStrength = weightedAverage(
    relevant
      .map((item) => ({ value: item.clearSignalStrength, weight: MACRO_GLOBAL_REGION_WEIGHTS[item.region] ?? 0 }))
      .filter((item): item is { value: number; weight: number } => typeof item.value === "number" && item.weight > 0),
  );
  const speculativeSignalStrength = weightedAverage(
    relevant
      .map((item) => ({ value: item.speculativeSignalStrength, weight: MACRO_GLOBAL_REGION_WEIGHTS[item.region] ?? 0 }))
      .filter((item): item is { value: number; weight: number } => typeof item.value === "number" && item.weight > 0),
  );

  const driverCandidates: MacroTopDriver[] = relevant
    .flatMap((entry) => (entry.topDrivers ?? []).map((driver) => ({ ...driver, region: driver.region ?? entry.region })))
    .map((driver) => ({
      ...driver,
      contribution: driver.contribution * (MACRO_GLOBAL_REGION_WEIGHTS[driver.region ?? ""] ?? 0),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  const sortedDates = relevant.map((item) => item.asOfDate).sort((a, b) => a.localeCompare(b));
  const asOfDate = sortedDates[sortedDates.length - 1] ?? new Date().toISOString().slice(0, 10);

  const growthOverlayAvg = weightedAverage(
    relevant
      .map((item) => ({ value: toOverlayScore(item.growthOverlay), weight: MACRO_GLOBAL_REGION_WEIGHTS[item.region] ?? 0 }))
      .filter((item): item is { value: number; weight: number } => typeof item.value === "number" && item.weight > 0),
  );
  const stressOverlayAvg = weightedAverage(
    relevant
      .map((item) => ({ value: toOverlayScore(item.stressOverlay), weight: MACRO_GLOBAL_REGION_WEIGHTS[item.region] ?? 0 }))
      .filter((item): item is { value: number; weight: number } => typeof item.value === "number" && item.weight > 0),
  );
  const hardAssetOverlayAvg = weightedAverage(
    relevant
      .map((item) => ({ value: toOverlayScore(item.hardAssetOverlay), weight: MACRO_GLOBAL_REGION_WEIGHTS[item.region] ?? 0 }))
      .filter((item): item is { value: number; weight: number } => typeof item.value === "number" && item.weight > 0),
  );

  const coreLabel = classifyCoreRegimeFromTemplate(macroScoreTotal, GLOBAL_MACRO_TEMPLATE);
  return {
    asOfDate,
    region: "GLOBAL",
    blockScores,
    macroScoreTotal,
    macroConfidence: confidence === null ? 0 : Math.round(confidence),
    coreRegimeLabel: coreLabel,
    growthOverlay: classifyOverlayFromTemplate("growth", growthOverlayAvg, GLOBAL_MACRO_TEMPLATE),
    stressOverlay: classifyOverlayFromTemplate("stress", stressOverlayAvg, GLOBAL_MACRO_TEMPLATE),
    hardAssetOverlay: classifyOverlayFromTemplate("hard_asset", hardAssetOverlayAvg, GLOBAL_MACRO_TEMPLATE),
    clearSignalStrength,
    speculativeSignalStrength,
    topDrivers: driverCandidates,
    regimeExplanation: {
      title: coreLabel,
      summary: "Global aggregation across US/EA/SE.",
      driverHighlights: driverCandidates.slice(0, 3).map((d) => `${d.region ?? "?"} ${d.indicatorId}`),
    },
  };
}
