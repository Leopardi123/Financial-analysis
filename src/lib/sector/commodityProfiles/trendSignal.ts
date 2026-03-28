export type TrendDataCompleteness = "full" | "partial" | "insufficient";

export function mapTrendStructureScore(structure: string | null | undefined): number | null {
  if (!structure || structure === "insufficient") return null;
  if (structure === "bullish_aligned") return 1;
  if (structure === "bullish_but_narrowing") return 0.5;
  if (structure === "neutral" || structure === "mixed") return 0;
  if (structure === "bearish_short_term") return -0.5;
  if (structure === "breakdown") return -1;
  return 0;
}

export function mapTrendExpansionScore(expansion: string | null | undefined): number | null {
  if (!expansion || expansion === "insufficient") return null;
  if (expansion === "expanding") return 1;
  if (expansion === "stable" || expansion === "flat") return 0.5;
  if (expansion === "narrowing") return -0.5;
  if (expansion === "negative_short_spread") return -1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function deriveTrendSignal(args: {
  structure: string | null | undefined;
  expansion: string | null | undefined;
  completeness?: TrendDataCompleteness | null;
  explicitScore?: number | null;
}): {
  trendScore: number | null;
  trendDataCompleteness: TrendDataCompleteness;
  structureScore: number | null;
  expansionScore: number | null;
} {
  const structureScore = mapTrendStructureScore(args.structure);
  const expansionScore = mapTrendExpansionScore(args.expansion);

  const trendScore = (() => {
    if (typeof args.explicitScore === "number" && Number.isFinite(args.explicitScore)) {
      return clamp(args.explicitScore, -1, 1);
    }
    if (structureScore !== null && expansionScore !== null) return clamp(structureScore * 0.6 + expansionScore * 0.4, -1, 1);
    if (structureScore !== null) return clamp(structureScore, -1, 1);
    if (expansionScore !== null) return clamp(expansionScore, -1, 1);
    return null;
  })();

  const trendDataCompleteness: TrendDataCompleteness = args.completeness
    ?? (structureScore !== null && expansionScore !== null
      ? "full"
      : structureScore !== null || expansionScore !== null
        ? "partial"
        : "insufficient");

  return { trendScore, trendDataCompleteness, structureScore, expansionScore };
}
