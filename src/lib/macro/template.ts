import type { MacroRegimeSnapshot, OverlayType } from "./types.ts";

export type GlobalMacroTemplate = {
  templateId: string;
  updatedAt: string;
  thresholds: {
    coreRegime: {
      monetaryDominanceMax: number;
      balancedMax: number;
      fiscalPressureMax: number;
    };
    overlay: {
      weakMax: number;
      neutralMax: number;
    };
    blockBands: {
      lowMax: number;
      neutralMax: number;
      elevatedMax: number;
    };
  };
};

export const GLOBAL_MACRO_TEMPLATE: GlobalMacroTemplate = {
  templateId: "global-macro-template-v1",
  updatedAt: "2026-03-11",
  thresholds: {
    coreRegime: {
      monetaryDominanceMax: 35,
      balancedMax: 55,
      fiscalPressureMax: 75,
    },
    overlay: {
      weakMax: -0.5,
      neutralMax: 0.5,
    },
    blockBands: {
      lowMax: 35,
      neutralMax: 55,
      elevatedMax: 75,
    },
  },
};

export function classifyCoreRegimeFromTemplate(score: number | null, template: GlobalMacroTemplate): MacroRegimeSnapshot["coreRegimeLabel"] {
  if (score === null) return "DataInsufficient";
  if (score <= template.thresholds.coreRegime.monetaryDominanceMax) return "MonetaryDominance";
  if (score <= template.thresholds.coreRegime.balancedMax) return "Balanced";
  if (score <= template.thresholds.coreRegime.fiscalPressureMax) return "FiscalPressureBuilding";
  return "FiscalDominanceRisk";
}

export function classifyOverlayFromTemplate(type: OverlayType, weightedAverageScore: number | null, template: GlobalMacroTemplate) {
  const { weakMax, neutralMax } = template.thresholds.overlay;
  if (type === "stress") {
    if (weightedAverageScore === null || weightedAverageScore <= weakMax) return "Low";
    if (weightedAverageScore < neutralMax) return "Medium";
    return "High";
  }
  if (weightedAverageScore === null || weightedAverageScore <= weakMax) return "Weak";
  if (weightedAverageScore < neutralMax) return "Neutral";
  return "Strong";
}

export function classifyBlockBandFromTemplate(score: number | null, template: GlobalMacroTemplate): "Low" | "Neutral" | "Elevated" | "High" | "Insufficient" {
  if (score === null) return "Insufficient";
  if (score <= template.thresholds.blockBands.lowMax) return "Low";
  if (score <= template.thresholds.blockBands.neutralMax) return "Neutral";
  if (score <= template.thresholds.blockBands.elevatedMax) return "Elevated";
  return "High";
}
