export interface DailyPriceRow {
  symbol: string;
  price_date: string;
  close: number;
  adjusted_close: number | null;
  volume: number | null;
  source: string;
  currency: string | null;
}

export interface PriceScreenSnapshotRow {
  symbol: string;
  as_of_date: string;
  last_close: number | null;
  return_5d: number | null;
  return_20d: number | null;
  return_60d: number | null;
  high_20d: number | null;
  high_60d: number | null;
  drawdown_20d: number | null;
  drawdown_60d: number | null;
  ma20: number | null;
  ma50: number | null;
  trend_state: "down" | "up" | "sideways" | null;
  recovery_state: "selloff" | "stabilizing" | "early_reversal" | "near_highs" | "neutral" | null;
  history_points_used: number;
  source: string | null;
  updated_at: string;
}

export interface PriceScreenSnapshotDebug {
  as_of_date: string | null;
  last_close: number | null;
  history_points_used: number;
  return_dates: {
    d5: { as_of: string; base: string } | null;
    d20: { as_of: string; base: string } | null;
    d60: { as_of: string; base: string } | null;
  };
  high_20d: number | null;
  high_60d: number | null;
  ma20: number | null;
  ma50: number | null;
  trend_state: PriceScreenSnapshotRow["trend_state"];
  recovery_state: PriceScreenSnapshotRow["recovery_state"];
  null_reasons: Record<string, string>;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function safeReturn(last: number, base: number | null): number | null {
  if (base === null || base === 0) return null;
  return (last / base) - 1;
}

function getOffsetClose(closes: number[], offset: number): number | null {
  const index = closes.length - 1 - offset;
  if (index < 0 || index >= closes.length) return null;
  const value = closes[index];
  return Number.isFinite(value) ? value : null;
}

export function computePriceScreenSnapshot(symbol: string, rowsAsc: DailyPriceRow[], nowIso = new Date().toISOString()): {
  snapshot: PriceScreenSnapshotRow;
  debug: PriceScreenSnapshotDebug;
} {
  const closes = rowsAsc.map((row) => row.adjusted_close ?? row.close);
  const dates = rowsAsc.map((row) => row.price_date);
  const historyPointsUsed = rowsAsc.length;
  const lastClose = closes.length > 0 ? closes[closes.length - 1] : null;
  const asOfDate = dates.length > 0 ? dates[dates.length - 1] : null;
  const nullReasons: Record<string, string> = {};

  const base5 = getOffsetClose(closes, 5);
  if (base5 === null) nullReasons.return_5d = "insufficient_history_min_6";
  const base20 = getOffsetClose(closes, 20);
  if (base20 === null) nullReasons.return_20d = "insufficient_history_min_21";
  const base60 = getOffsetClose(closes, 60);
  if (base60 === null) nullReasons.return_60d = "insufficient_history_min_61";

  const return5d = lastClose === null ? null : safeReturn(lastClose, base5);
  const return20d = lastClose === null ? null : safeReturn(lastClose, base20);
  const return60d = lastClose === null ? null : safeReturn(lastClose, base60);

  const high20d = closes.length >= 20 ? Math.max(...closes.slice(-20)) : null;
  if (high20d === null) nullReasons.high_20d = "insufficient_history_min_20";
  const high60d = closes.length >= 60 ? Math.max(...closes.slice(-60)) : null;
  if (high60d === null) nullReasons.high_60d = "insufficient_history_min_60";

  const ma20 = closes.length >= 20 ? avg(closes.slice(-20)) : null;
  if (ma20 === null) nullReasons.ma20 = "insufficient_history_min_20";
  const ma50 = closes.length >= 50 ? avg(closes.slice(-50)) : null;
  if (ma50 === null) nullReasons.ma50 = "insufficient_history_min_50";

  const ma20Prev = closes.length >= 21 ? avg(closes.slice(-21, -1)) : null;
  if (ma20Prev === null) nullReasons.ma20_slope = "insufficient_history_min_21";

  const drawdown20d = lastClose !== null && high20d !== null && high20d !== 0 ? (lastClose / high20d) - 1 : null;
  if (drawdown20d === null) nullReasons.drawdown_20d = "insufficient_history_or_invalid_high";
  const drawdown60d = lastClose !== null && high60d !== null && high60d !== 0 ? (lastClose / high60d) - 1 : null;
  if (drawdown60d === null) nullReasons.drawdown_60d = "insufficient_history_or_invalid_high";

  let trendState: PriceScreenSnapshotRow["trend_state"] = null;
  if (lastClose !== null && ma20 !== null && ma50 !== null && ma20Prev !== null) {
    if (lastClose < ma20 && lastClose < ma50 && ma20 < ma20Prev) {
      trendState = "down";
    } else if (lastClose > ma20 && lastClose > ma50 && ma20 > ma20Prev) {
      trendState = "up";
    } else {
      trendState = "sideways";
    }
  } else {
    nullReasons.trend_state = "missing_last_close_or_mas";
  }

  let recoveryState: PriceScreenSnapshotRow["recovery_state"] = null;
  if (trendState !== null && drawdown60d !== null) {
    if (drawdown60d <= -0.25 && trendState === "down") {
      recoveryState = "selloff";
    } else if (drawdown60d <= -0.25 && trendState === "sideways") {
      recoveryState = "stabilizing";
    } else if (drawdown60d <= -0.25 && trendState === "up") {
      recoveryState = "early_reversal";
    } else if (drawdown60d > -0.10) {
      recoveryState = "near_highs";
    } else {
      recoveryState = "neutral";
    }
  } else {
    nullReasons.recovery_state = "missing_trend_or_drawdown_60d";
  }

  const source = rowsAsc[rowsAsc.length - 1]?.source ?? null;
  const snapshot: PriceScreenSnapshotRow = {
    symbol,
    as_of_date: asOfDate ?? nowIso.slice(0, 10),
    last_close: lastClose,
    return_5d: return5d,
    return_20d: return20d,
    return_60d: return60d,
    high_20d: high20d,
    high_60d: high60d,
    drawdown_20d: drawdown20d,
    drawdown_60d: drawdown60d,
    ma20,
    ma50,
    trend_state: trendState,
    recovery_state: recoveryState,
    history_points_used: historyPointsUsed,
    source,
    updated_at: nowIso,
  };

  return {
    snapshot,
    debug: {
      as_of_date: asOfDate,
      last_close: lastClose,
      history_points_used: historyPointsUsed,
      return_dates: {
        d5: base5 !== null && asOfDate ? { as_of: asOfDate, base: dates[dates.length - 1 - 5] } : null,
        d20: base20 !== null && asOfDate ? { as_of: asOfDate, base: dates[dates.length - 1 - 20] } : null,
        d60: base60 !== null && asOfDate ? { as_of: asOfDate, base: dates[dates.length - 1 - 60] } : null,
      },
      high_20d: high20d,
      high_60d: high60d,
      ma20,
      ma50,
      trend_state: trendState,
      recovery_state: recoveryState,
      null_reasons: nullReasons,
    },
  };
}
