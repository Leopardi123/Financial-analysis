import { classifyCoreRegimeFromTemplate, classifyOverlayFromTemplate, GLOBAL_MACRO_TEMPLATE } from "./template.ts";
import type { MacroBlock, MacroRegimeSnapshot, MacroTopDriver } from "./types.ts";

export const MACRO_REGIONS = ["US", "EA", "SE"] as const;
export type MacroRegion = typeof MACRO_REGIONS[number];

export const GLOBAL_REGION_WEIGHTS: Record<MacroRegion, number> = {
  US: 0.5,
  EA: 0.35,
  SE: 0.15,
};

function weightedAverage(values: Array<{ value: number | null; weight: number }>): number | null {
  const valid = values.filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  if (valid.length === 0) return null;
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  const sum = valid.reduce((acc, item) => acc + (item.value as number) * item.weight, 0);
  return sum / totalWeight;
}

export function aggregateGlobalBlockScores(
  regionalBlockScores: Partial<Record<MacroRegion, MacroRegimeSnapshot["blockScores"]>>,
): MacroRegimeSnapshot["blockScores"] {
  const blocks: MacroBlock[] = ["A_FISCAL", "B_MONETARY", "C_INFLATION", "D_CREDIBILITY"];
  const out = {
    A_FISCAL: null,
    B_MONETARY: null,
    C_INFLATION: null,
    D_CREDIBILITY: null,
  } as MacroRegimeSnapshot["blockScores"];

  for (const block of blocks) {
    out[block] = weightedAverage(
      MACRO_REGIONS.map((region) => ({
        value: regionalBlockScores[region]?.[block] ?? null,
        weight: GLOBAL_REGION_WEIGHTS[region],
      })),
    );
  }

  return out;
}

export function aggregateGlobalTopDrivers(regionalDrivers: Partial<Record<MacroRegion, MacroTopDriver[]>>): MacroTopDriver[] {
  return MACRO_REGIONS
    .flatMap((region) => (regionalDrivers[region] ?? []).map((driver) => ({ ...driver, region })))
    .map((driver) => ({
      ...driver,
      _rank: Math.abs(driver.score * GLOBAL_REGION_WEIGHTS[driver.region as MacroRegion]),
    }))
    .sort((a, b) => b._rank - a._rank)
    .slice(0, 8)
    .map(({ _rank, ...driver }) => driver);
}

export function aggregateGlobalRegimeFromRegional(params: {
  asOfDate: string;
  regionalRegimes: Partial<Record<MacroRegion, MacroRegimeSnapshot>>;
}): MacroRegimeSnapshot {
  const blockScores = aggregateGlobalBlockScores(
    Object.fromEntries(
      MACRO_REGIONS.map((region) => [region, params.regionalRegimes[region]?.blockScores]),
    ) as Partial<Record<MacroRegion, MacroRegimeSnapshot["blockScores"]>>,
  );

  const validBlockScores = Object.values(blockScores).filter((value): value is number => typeof value === "number");
  const macroScoreTotal = validBlockScores.length > 0
    ? validBlockScores.reduce((acc, value) => acc + value, 0) / validBlockScores.length
    : null;

  const macroConfidence = Math.round(weightedAverage(
    MACRO_REGIONS.map((region) => ({
      value: params.regionalRegimes[region]?.macroConfidence ?? null,
      weight: GLOBAL_REGION_WEIGHTS[region],
    })),
  ) ?? 0);

  const topDrivers = aggregateGlobalTopDrivers(
    Object.fromEntries(
      MACRO_REGIONS.map((region) => [region, params.regionalRegimes[region]?.topDrivers ?? []]),
    ) as Partial<Record<MacroRegion, MacroTopDriver[]>>,
  );

  const growthAvg = weightedAverage(MACRO_REGIONS.map((region) => ({ value: params.regionalRegimes[region]?.clearSignalStrength ?? null, weight: GLOBAL_REGION_WEIGHTS[region] })));
  const stressAvg = weightedAverage(MACRO_REGIONS.map((region) => ({ value: params.regionalRegimes[region]?.speculativeSignalStrength ?? null, weight: GLOBAL_REGION_WEIGHTS[region] })));

  return {
    asOfDate: params.asOfDate,
    region: "GLOBAL",
    blockScores,
    macroScoreTotal,
    macroConfidence,
    coreRegimeLabel: classifyCoreRegimeFromTemplate(macroScoreTotal, GLOBAL_MACRO_TEMPLATE),
    growthOverlay: classifyOverlayFromTemplate("growth", growthAvg, GLOBAL_MACRO_TEMPLATE),
    stressOverlay: classifyOverlayFromTemplate("stress", stressAvg, GLOBAL_MACRO_TEMPLATE),
    hardAssetOverlay: classifyOverlayFromTemplate("hard_asset", stressAvg, GLOBAL_MACRO_TEMPLATE),
    clearSignalStrength: growthAvg,
    speculativeSignalStrength: stressAvg,
    topDrivers,
    regimeExplanation: {
      title: "Global macro aggregation",
      summary: "Global regime is aggregated from US/EA/SE regional engines.",
      driverHighlights: topDrivers.slice(0, 3).map((item) => item.title),
    },
  };
}
