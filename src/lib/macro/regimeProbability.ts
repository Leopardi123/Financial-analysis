import { GLOBAL_MACRO_TEMPLATE } from "./template.js";

export type RegimeProbabilityOutput = {
  asOfDate: string;
  region: string;
  probabilities: {
    monetaryDominance: number;
    balanced: number;
    fiscalPressureBuilding: number;
    fiscalDominanceRisk: number;
    dataInsufficient: number;
  };
  method: "heuristic_from_score";
  templateId: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function buildRegimeProbability(input: {
  asOfDate: string;
  region: string;
  macroScoreTotal: number | null;
  macroConfidence: number;
  coreRegimeLabel?: string | null;
}): RegimeProbabilityOutput {
  const score = typeof input.macroScoreTotal === "number" ? input.macroScoreTotal : 50;
  const confidence01 = clamp((Number(input.macroConfidence ?? 0)) / 100);

  const monetaryDominance = clamp((60 - score) / 120) * (0.5 + confidence01 * 0.5);
  const fiscalDominanceRisk = clamp((score - 55) / 90) * (0.45 + confidence01 * 0.55);
  const fiscalPressureBuilding = clamp((score - 45) / 70) * (0.4 + confidence01 * 0.6);
  const balanced = clamp(1 - Math.abs(score - 50) / 45) * (0.35 + confidence01 * 0.65);
  const dataInsufficient = clamp(1 - confidence01);

  const raw = {
    monetaryDominance,
    balanced,
    fiscalPressureBuilding,
    fiscalDominanceRisk,
    dataInsufficient,
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;

  return {
    asOfDate: input.asOfDate,
    region: input.region,
    probabilities: {
      monetaryDominance: raw.monetaryDominance / sum,
      balanced: raw.balanced / sum,
      fiscalPressureBuilding: raw.fiscalPressureBuilding / sum,
      fiscalDominanceRisk: raw.fiscalDominanceRisk / sum,
      dataInsufficient: raw.dataInsufficient / sum,
    },
    method: "heuristic_from_score",
    templateId: GLOBAL_MACRO_TEMPLATE.templateId,
  };
}
