export type TrendCompleteness = "full" | "partial" | "unavailable";
export type TrendDirection = "positive" | "neutral" | "negative" | "unavailable";
export type TrendStatus = "strong_uptrend" | "improving" | "neutral" | "weakening" | "downtrend" | "unavailable";

export type TrendContractInput = {
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  trend_completeness: string | null;
  short_direction?: string | null;
  medium_direction?: string | null;
  long_direction?: string | null;
  trend_status?: string | null;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function directionFromReturn(value: number | null): TrendDirection {
  if (!finite(value)) return "unavailable";
  if (value > 2) return "positive";
  if (value < -2) return "negative";
  return "neutral";
}

function statusFromDirections(shortD: TrendDirection, mediumD: TrendDirection, longD: TrendDirection, completeness: TrendCompleteness): TrendStatus {
  if (completeness === "unavailable") return "unavailable";
  if (longD === "positive" && mediumD === "positive" && (shortD === "positive" || shortD === "neutral")) return "strong_uptrend";
  if (longD === "negative" && mediumD === "negative" && (shortD === "negative" || shortD === "neutral")) return "downtrend";
  if (shortD === "positive" && (mediumD === "positive" || mediumD === "neutral")) return "improving";
  if (shortD === "negative" && (mediumD === "negative" || mediumD === "neutral")) return "weakening";
  return "neutral";
}

export function normalizePortfolioTrendContract(input: TrendContractInput) {
  const reasons: string[] = [];
  const has20 = finite(input.return_20d);
  const has65 = finite(input.return_65d);
  const has200 = finite(input.return_200d);
  const normalizedCompleteness: TrendCompleteness = has20 && has65 && has200 ? "full" : (has20 || has65 || has200 ? "partial" : "unavailable");
  if (input.trend_completeness === "full" && normalizedCompleteness !== "full") reasons.push("post_invalidation_survival");
  if ((input.trend_completeness ?? "unavailable") !== normalizedCompleteness) reasons.push("independent_recompute");
  const short_direction = directionFromReturn(input.return_20d);
  const medium_direction = directionFromReturn(input.return_65d);
  const long_direction = directionFromReturn(input.return_200d);
  const trend_status = statusFromDirections(short_direction, medium_direction, long_direction, normalizedCompleteness);
  return {
    return_20d: has20 ? input.return_20d : null,
    return_65d: has65 ? input.return_65d : null,
    return_200d: has200 ? input.return_200d : null,
    short_direction,
    medium_direction,
    long_direction,
    trend_status,
    trend_completeness: normalizedCompleteness,
    contract_error: reasons.length > 0,
    contract_reason: reasons.length > 0 ? reasons.join("|") : null,
  };
}
