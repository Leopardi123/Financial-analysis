import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import type { PortfolioAdminConfig } from "../portfolio-admin/types.js";

type Direction = "positive" | "neutral" | "negative" | "unavailable";
type TrendStatus = "strong_uptrend" | "improving" | "neutral" | "weakening" | "downtrend" | "unavailable";
type SignalCompleteness = "full" | "partial" | "unavailable";
type RelativeStrengthBucket = "strong" | "neutral" | "weak" | "unavailable";

type Point = { as_of_date: string; market_value: number };

type TrendMetrics = {
  available_days: number;
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  short_direction: Direction;
  medium_direction: Direction;
  long_direction: Direction;
  trend_status: TrendStatus;
  signal_completeness: SignalCompleteness;
  data_quality: "full" | "partial" | "estimated";
  relative_strength_rank: number | null;
  relative_strength_bucket: RelativeStrengthBucket;
};

function computeDirection(returnPct: number | null): Direction {
  if (typeof returnPct !== "number" || !Number.isFinite(returnPct)) return "unavailable";
  if (returnPct > 2.0) return "positive";
  if (returnPct < -2.0) return "negative";
  return "neutral";
}

function computeLookbackReturn(series: Point[], lookbackDays: number): number | null {
  if (series.length <= lookbackDays) return null;
  const latest = series[series.length - 1]?.market_value;
  const past = series[series.length - 1 - lookbackDays]?.market_value;
  if (!Number.isFinite(latest) || !Number.isFinite(past) || past === 0) return null;
  return ((latest / past) - 1) * 100;
}

function computeTrendStatus(shortDirection: Direction, mediumDirection: Direction, longDirection: Direction): TrendStatus {
  const hasShort = shortDirection !== "unavailable";
  const hasMedium = mediumDirection !== "unavailable";
  const hasLong = longDirection !== "unavailable";

  if (!hasMedium && !hasShort && !hasLong) {
    return "unavailable";
  }

  if (hasLong) {
    if (longDirection === "positive" && mediumDirection === "positive" && (shortDirection === "positive" || shortDirection === "neutral")) {
      return "strong_uptrend";
    }

    if (mediumDirection === "positive" && shortDirection === "positive"
      && (longDirection === "neutral" || longDirection === "negative")) {
      return "improving";
    }

    if (longDirection === "negative" && mediumDirection === "negative" && (shortDirection === "negative" || shortDirection === "neutral")) {
      return "downtrend";
    }

    if (mediumDirection === "negative" && shortDirection === "negative" && longDirection === "neutral") {
      return "weakening";
    }

    if (shortDirection === "neutral" && mediumDirection === "neutral" && longDirection === "neutral") {
      return "neutral";
    }

    return "neutral";
  }

  if (hasShort && hasMedium) {
    if (shortDirection === "positive" && mediumDirection === "positive") return "strong_uptrend";
    if (shortDirection === "negative" && mediumDirection === "negative") return "downtrend";
    if (shortDirection === "positive" && (mediumDirection === "neutral" || mediumDirection === "positive")) return "improving";
    if (shortDirection === "negative" && (mediumDirection === "neutral" || mediumDirection === "negative")) return "weakening";
    return "neutral";
  }

  if (hasMedium) {
    if (mediumDirection === "positive") return "improving";
    if (mediumDirection === "negative") return "weakening";
    return "neutral";
  }

  return "unavailable";
}

function computeSignalCompleteness(availableDays: number): SignalCompleteness {
  if (availableDays >= 200) return "full";
  if (availableDays >= 65) return "partial";
  return "unavailable";
}

function enrichSeriesReturns(series: Point[]) {
  const out: Array<Point & { daily_return_pct: number | null; cumulative_return_pct: number | null; drawdown_pct: number | null }> = [];
  let firstValue: number | null = null;
  let prevValue: number | null = null;
  let runningPeak: number | null = null;

  for (const row of series) {
    const value = row.market_value;
    if (firstValue === null) firstValue = value;
    if (runningPeak === null || value > runningPeak) runningPeak = value;

    const dailyReturn = prevValue && prevValue !== 0 ? ((value / prevValue) - 1) * 100 : null;
    const cumulativeReturn = firstValue && firstValue !== 0 ? ((value / firstValue) - 1) * 100 : null;
    const drawdown = runningPeak && runningPeak !== 0 ? ((value / runningPeak) - 1) * 100 : null;

    out.push({
      ...row,
      daily_return_pct: dailyReturn,
      cumulative_return_pct: cumulativeReturn,
      drawdown_pct: drawdown,
    });

    prevValue = value;
  }

  return out;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [name]);
  return rows.length > 0;
}

async function loadPortfolioHistorySeries(portfolioId: string): Promise<{ source: "positions" | "snapshots" | "unavailable"; rows: Point[] }> {
  const hasPositions = await tableExists(tables.portfolioPositions);

  if (hasPositions) {
    const positionRows = await query(
      `SELECT as_of_date, SUM(market_value) AS market_value
       FROM ${tables.portfolioPositions}
       WHERE portfolio_id = ?
       GROUP BY as_of_date
       ORDER BY as_of_date ASC`,
      [portfolioId]
    );

    const rows = (positionRows as Array<{ as_of_date?: unknown; market_value?: unknown }>)
      .map((row) => ({
        as_of_date: String(row.as_of_date ?? ""),
        market_value: Number(row.market_value ?? NaN),
      }))
      .filter((row) => row.as_of_date && Number.isFinite(row.market_value));

    if (rows.length > 0) {
      return { source: "positions", rows };
    }
  }

  const hasSnapshots = await tableExists(tables.portfolioSnapshots);
  if (hasSnapshots) {
    const snapshotRows = await query(
      `SELECT as_of_date, market_value
       FROM ${tables.portfolioSnapshots}
       WHERE portfolio_id = ? AND market_value IS NOT NULL
       ORDER BY as_of_date ASC`,
      [portfolioId]
    );

    const rows = (snapshotRows as Array<{ as_of_date?: unknown; market_value?: unknown }>)
      .map((row) => ({
        as_of_date: String(row.as_of_date ?? ""),
        market_value: Number(row.market_value ?? NaN),
      }))
      .filter((row) => row.as_of_date && Number.isFinite(row.market_value));

    if (rows.length > 0) {
      return { source: "snapshots", rows };
    }
  }

  return { source: "unavailable", rows: [] };
}

function computeTrendMetrics(series: Point[]): TrendMetrics {
  const availableDays = series.length;
  const return20 = computeLookbackReturn(series, 20);
  const return65 = computeLookbackReturn(series, 65);
  const return200 = computeLookbackReturn(series, 200);

  const shortDirection = computeDirection(return20);
  const mediumDirection = computeDirection(return65);
  const longDirection = computeDirection(return200);

  const signalCompleteness = computeSignalCompleteness(availableDays);
  const trendStatus = signalCompleteness === "unavailable"
    ? "unavailable"
    : computeTrendStatus(shortDirection, mediumDirection, longDirection);

  return {
    available_days: availableDays,
    return_20d: return20,
    return_65d: return65,
    return_200d: return200,
    short_direction: shortDirection,
    medium_direction: mediumDirection,
    long_direction: longDirection,
    trend_status: trendStatus,
    signal_completeness: signalCompleteness,
    data_quality: "estimated",
    relative_strength_rank: null,
    relative_strength_bucket: "unavailable",
  };
}

function applyRelativeStrength(
  portfolios: Array<{ portfolio_id: string; active: boolean; included_in_total_portfolio: boolean; metrics: TrendMetrics }>
): void {
  const comparable = portfolios
    .filter((item) => item.active && item.included_in_total_portfolio)
    .filter((item) => typeof item.metrics.return_65d === "number" && Number.isFinite(item.metrics.return_65d));

  if (comparable.length < 2) {
    return;
  }

  const sorted = comparable
    .map((item) => ({ portfolio_id: item.portfolio_id, value: Number(item.metrics.return_65d) }))
    .sort((a, b) => a.value - b.value);

  const rankById = new Map<string, number>();
  for (let i = 0; i < sorted.length; i += 1) {
    rankById.set(sorted[i].portfolio_id, i / (sorted.length - 1));
  }

  for (const item of comparable) {
    const rank = rankById.get(item.portfolio_id);
    if (rank === undefined) continue;
    item.metrics.relative_strength_rank = rank;
    if (rank >= 0.7) {
      item.metrics.relative_strength_bucket = "strong";
    } else if (rank <= 0.3) {
      item.metrics.relative_strength_bucket = "weak";
    } else {
      item.metrics.relative_strength_bucket = "neutral";
    }
  }
}

export async function buildPortfolioHistory() {
  const portfolios = await listPortfolioConfigs();
  const byPortfolioSeries = new Map<string, Point[]>();
  const sourceByPortfolio = new Map<string, "positions" | "snapshots" | "unavailable">();

  const trendItems: Array<{ portfolio: PortfolioAdminConfig; metrics: TrendMetrics }> = [];

  for (const portfolio of portfolios) {
    const loaded = await loadPortfolioHistorySeries(portfolio.portfolio_id);
    sourceByPortfolio.set(portfolio.portfolio_id, loaded.source);
    byPortfolioSeries.set(portfolio.portfolio_id, loaded.rows);

    const enrichedSeries = enrichSeriesReturns(loaded.rows);

    for (const row of enrichedSeries) {
      await execute(
        `INSERT INTO ${tables.portfolioHistoryDaily} (
          portfolio_id, as_of_date, total_return_index, market_value,
          daily_return_pct, cumulative_return_pct, drawdown_pct,
          cash_weight_pct, data_source, data_quality
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(portfolio_id, as_of_date)
        DO UPDATE SET
          market_value = excluded.market_value,
          daily_return_pct = excluded.daily_return_pct,
          cumulative_return_pct = excluded.cumulative_return_pct,
          drawdown_pct = excluded.drawdown_pct,
          data_source = excluded.data_source,
          data_quality = excluded.data_quality`,
        [
          portfolio.portfolio_id,
          row.as_of_date,
          row.market_value,
          row.daily_return_pct,
          row.cumulative_return_pct,
          row.drawdown_pct,
          loaded.source,
          "estimated",
        ]
      );
    }

    const metrics = computeTrendMetrics(loaded.rows);
    trendItems.push({ portfolio, metrics });
  }

  applyRelativeStrength(
    trendItems.map((item) => ({
      portfolio_id: item.portfolio.portfolio_id,
      active: item.portfolio.active,
      included_in_total_portfolio: item.portfolio.included_in_total_portfolio,
      metrics: item.metrics,
    }))
  );

  const included = portfolios.filter((item) => item.active && item.included_in_total_portfolio);
  const allDates = new Set<string>();
  for (const portfolio of included) {
    for (const row of byPortfolioSeries.get(portfolio.portfolio_id) ?? []) {
      allDates.add(row.as_of_date);
    }
  }

  const sortedDates = Array.from(allDates).sort((a, b) => a.localeCompare(b));
  const totalSeries: Point[] = [];

  for (const date of sortedDates) {
    let sum = 0;
    let contributors = 0;
    for (const portfolio of included) {
      const row = (byPortfolioSeries.get(portfolio.portfolio_id) ?? []).find((item) => item.as_of_date === date);
      if (!row) continue;
      sum += row.market_value;
      contributors += 1;
    }
    if (contributors > 0) {
      totalSeries.push({ as_of_date: date, market_value: sum });
    }
  }

  const totalEnriched = enrichSeriesReturns(totalSeries);
  for (const row of totalEnriched) {
    const contributors = included
      .map((portfolio) => (byPortfolioSeries.get(portfolio.portfolio_id) ?? []).some((point) => point.as_of_date === row.as_of_date))
      .filter(Boolean).length;

    const dataQuality = contributors === included.length ? "estimated" : "partial";

    await execute(
      `INSERT INTO ${tables.totalPortfolioHistoryDaily} (
        as_of_date, total_return_index, market_value, daily_return_pct, cumulative_return_pct,
        drawdown_pct, total_cash_value, total_cash_weight_pct, included_portfolio_count, data_quality
      ) VALUES (?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(as_of_date)
      DO UPDATE SET
        market_value = excluded.market_value,
        daily_return_pct = excluded.daily_return_pct,
        cumulative_return_pct = excluded.cumulative_return_pct,
        drawdown_pct = excluded.drawdown_pct,
        included_portfolio_count = excluded.included_portfolio_count,
        data_quality = excluded.data_quality`,
      [
        row.as_of_date,
        row.market_value,
        row.daily_return_pct,
        row.cumulative_return_pct,
        row.drawdown_pct,
        contributors,
        dataQuality,
      ]
    );
  }

  const latestSnapshotDateRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
  const latestSnapshotDate = String(latestSnapshotDateRows[0]?.as_of_date ?? "").trim();

  if (latestSnapshotDate) {
    for (const item of trendItems) {
      const snapshotRows = await query(
        `SELECT debug_payload_json FROM ${tables.portfolioSnapshots} WHERE portfolio_id = ? AND as_of_date = ? LIMIT 1`,
        [item.portfolio.portfolio_id, latestSnapshotDate]
      ) as Array<{ debug_payload_json?: unknown }>;

      let debugPayload: Record<string, unknown> = {};
      const existingDebug = snapshotRows[0]?.debug_payload_json;
      if (typeof existingDebug === "string" && existingDebug.trim()) {
        try {
          debugPayload = JSON.parse(existingDebug) as Record<string, unknown>;
        } catch {
          debugPayload = {};
        }
      }

      debugPayload.trend = {
        history_source: sourceByPortfolio.get(item.portfolio.portfolio_id) ?? "unavailable",
        available_days: item.metrics.available_days,
        return_20d: item.metrics.return_20d,
        return_65d: item.metrics.return_65d,
        return_200d: item.metrics.return_200d,
        short_direction: item.metrics.short_direction,
        medium_direction: item.metrics.medium_direction,
        long_direction: item.metrics.long_direction,
        trend_status: item.metrics.trend_status,
        relative_strength_rank: item.metrics.relative_strength_rank,
        relative_strength_bucket: item.metrics.relative_strength_bucket,
        signal_completeness: item.metrics.signal_completeness,
        data_quality: item.metrics.data_quality,
      };

      await execute(
        `UPDATE ${tables.portfolioSnapshots}
         SET return_20d = ?,
             return_65d = ?,
             return_200d = ?,
             short_direction = ?,
             medium_direction = ?,
             long_direction = ?,
             trend_status = ?,
             relative_strength_bucket = ?,
             signal_completeness = ?,
             debug_payload_json = ?
         WHERE portfolio_id = ? AND as_of_date = ?`,
        [
          item.metrics.return_20d,
          item.metrics.return_65d,
          item.metrics.return_200d,
          item.metrics.short_direction,
          item.metrics.medium_direction,
          item.metrics.long_direction,
          item.metrics.trend_status,
          item.metrics.relative_strength_bucket,
          item.metrics.signal_completeness,
          JSON.stringify(debugPayload),
          item.portfolio.portfolio_id,
          latestSnapshotDate,
        ]
      );
    }
  }

  return {
    portfolios: trendItems.map((item) => ({
      portfolio_id: item.portfolio.portfolio_id,
      history_source: sourceByPortfolio.get(item.portfolio.portfolio_id) ?? "unavailable",
      ...item.metrics,
    })),
    total: {
      included_portfolios: included.map((item) => item.portfolio_id),
      history_days_available: totalSeries.length,
      aggregation_source: (await tableExists(tables.portfolioPositions)) ? "positions" : "snapshots",
      data_quality: totalSeries.length > 0 ? "estimated" : "partial",
    },
  };
}
