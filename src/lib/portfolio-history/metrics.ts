export type TrendDirection = "positive" | "neutral" | "negative" | "unavailable";
export type TrendStatus = "strong_uptrend" | "improving" | "neutral" | "weakening" | "downtrend" | "unavailable";
export type TrendCompleteness = "full" | "partial" | "unavailable";

export type TrendSeriesPoint = {
  as_of_date: string;
  market_value: number;
  contributor_count?: number;
};

export type TrendWindowDiagnostics = {
  value_at_anchor: number | null;
  valid: boolean;
  invalid_reasons: string[];
};

export type TrendComputationResult = {
  available_days: number;
  first_history_date: string | null;
  last_history_date: string | null;
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  return_20d_valid: boolean;
  return_65d_valid: boolean;
  return_200d_valid: boolean;
  value_at_20d_anchor: number | null;
  value_at_65d_anchor: number | null;
  value_at_200d_anchor: number | null;
  invalid_reasons_20d: string[];
  invalid_reasons_65d: string[];
  invalid_reasons_200d: string[];
  short_direction: TrendDirection;
  medium_direction: TrendDirection;
  long_direction: TrendDirection;
  trend_status: TrendStatus;
  trend_completeness: TrendCompleteness;
};

function computeDirection(returnPct: number | null): TrendDirection {
  if (typeof returnPct !== "number" || !Number.isFinite(returnPct)) return "unavailable";
  if (returnPct > 2.0) return "positive";
  if (returnPct < -2.0) return "negative";
  return "neutral";
}

function computeTrendStatus(shortDirection: TrendDirection, mediumDirection: TrendDirection, longDirection: TrendDirection): TrendStatus {
  if (shortDirection === "unavailable" && mediumDirection === "unavailable" && longDirection === "unavailable") {
    return "unavailable";
  }
  if (longDirection === "positive" && mediumDirection === "positive" && (shortDirection === "positive" || shortDirection === "neutral")) {
    return "strong_uptrend";
  }
  if (longDirection === "negative" && mediumDirection === "negative" && (shortDirection === "negative" || shortDirection === "neutral")) {
    return "downtrend";
  }
  if (shortDirection === "positive" && (mediumDirection === "positive" || mediumDirection === "neutral")) return "improving";
  if (shortDirection === "negative" && (mediumDirection === "negative" || mediumDirection === "neutral")) return "weakening";
  return "neutral";
}

function computeCompleteness(availableDays: number): TrendCompleteness {
  if (availableDays >= 200) return "full";
  if (availableDays >= 65) return "partial";
  return "unavailable";
}

function computeWindowReturn(series: TrendSeriesPoint[], lookbackDays: number): { value: number | null; diagnostics: TrendWindowDiagnostics } {
  if (series.length <= lookbackDays) {
    return {
      value: null,
      diagnostics: {
        value_at_anchor: null,
        valid: false,
        invalid_reasons: ["insufficient_window_coverage"],
      },
    };
  }
  const latest = series[series.length - 1];
  const anchor = series[series.length - 1 - lookbackDays];
  const latestValue = Number(latest?.market_value ?? NaN);
  const anchorValue = Number(anchor?.market_value ?? NaN);
  const reasons: string[] = [];
  if (!Number.isFinite(latestValue) || latestValue <= 0 || !Number.isFinite(anchorValue) || anchorValue <= 0) {
    reasons.push("invalid_anchor_or_latest_value");
  }
  const minAnchorThreshold = Number.isFinite(latestValue) && latestValue > 0 ? Math.max(1, latestValue * 0.02) : 1;
  if (Number.isFinite(anchorValue) && anchorValue > 0 && anchorValue < minAnchorThreshold) {
    reasons.push("anchor_value_too_small");
  }

  const latestContributors = Number(latest?.contributor_count ?? NaN);
  const anchorContributors = Number(anchor?.contributor_count ?? NaN);
  if (Number.isFinite(latestContributors) && latestContributors > 0 && Number.isFinite(anchorContributors) && anchorContributors > 0) {
    if (anchorContributors < Math.max(1, Math.ceil(latestContributors * 0.6))) {
      reasons.push("composition_discontinuity");
    }
  }

  if (reasons.length > 0) {
    return {
      value: null,
      diagnostics: {
        value_at_anchor: Number.isFinite(anchorValue) ? anchorValue : null,
        valid: false,
        invalid_reasons: reasons,
      },
    };
  }

  return {
    value: ((latestValue / anchorValue) - 1) * 100,
    diagnostics: {
      value_at_anchor: anchorValue,
      valid: true,
      invalid_reasons: [],
    },
  };
}

export function computeTrendMetricsFromSeries(seriesRaw: TrendSeriesPoint[]): TrendComputationResult {
  const series = [...seriesRaw].sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
  const availableDays = series.length;
  const firstHistoryDate = series[0]?.as_of_date ?? null;
  const lastHistoryDate = series[series.length - 1]?.as_of_date ?? null;

  const win20 = computeWindowReturn(series, 20);
  const win65 = computeWindowReturn(series, 65);
  const win200 = computeWindowReturn(series, 200);

  const shortDirection = computeDirection(win20.value);
  const mediumDirection = computeDirection(win65.value);
  const longDirection = computeDirection(win200.value);

  const completeness = computeCompleteness(availableDays);
  const trendStatus = completeness === "unavailable"
    ? "unavailable"
    : computeTrendStatus(shortDirection, mediumDirection, longDirection);

  return {
    available_days: availableDays,
    first_history_date: firstHistoryDate,
    last_history_date: lastHistoryDate,
    return_20d: win20.value,
    return_65d: win65.value,
    return_200d: win200.value,
    return_20d_valid: win20.diagnostics.valid,
    return_65d_valid: win65.diagnostics.valid,
    return_200d_valid: win200.diagnostics.valid,
    value_at_20d_anchor: win20.diagnostics.value_at_anchor,
    value_at_65d_anchor: win65.diagnostics.value_at_anchor,
    value_at_200d_anchor: win200.diagnostics.value_at_anchor,
    invalid_reasons_20d: win20.diagnostics.invalid_reasons,
    invalid_reasons_65d: win65.diagnostics.invalid_reasons,
    invalid_reasons_200d: win200.diagnostics.invalid_reasons,
    short_direction: shortDirection,
    medium_direction: mediumDirection,
    long_direction: longDirection,
    trend_status: trendStatus,
    trend_completeness: completeness,
  };
}
