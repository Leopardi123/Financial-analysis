import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import type { PortfolioAdminConfig } from "../portfolio-admin/types.js";

type Direction = "positive" | "neutral" | "negative" | "unavailable";
type TrendStatus = "strong_uptrend" | "improving" | "neutral" | "weakening" | "downtrend" | "unavailable";
type SignalCompleteness = "full" | "partial" | "unavailable";
type RelativeStrengthBucket = "strong" | "neutral" | "weak" | "unavailable";
type DataQuality = "full" | "partial" | "estimated";
type HistorySource = "positions_price_history" | "positions_snapshots" | "snapshots" | "unavailable";
type CoverageMissingReason = "unresolved_symbol" | "no_history_rows" | "insufficient_20d" | "insufficient_65d" | "insufficient_200d" | "ok";

type Point = { as_of_date: string; market_value: number; data_quality: DataQuality };

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
  trend_completeness: SignalCompleteness;
  data_quality: DataQuality;
  relative_strength_rank: number | null;
  relative_strength_bucket: RelativeStrengthBucket;
};

type PositionCoverageDiagnostic = {
  portfolio_id: string;
  raw_symbol: string;
  resolved_symbol: string | null;
  history_symbol_used: string | null;
  has_daily_price_history: boolean;
  history_row_count: number;
  first_history_date: string | null;
  last_history_date: string | null;
  enough_20d: boolean;
  enough_65d: boolean;
  enough_200d: boolean;
  has_screen_snapshot: boolean;
  missing_reason: CoverageMissingReason;
};

type PortfolioCoverageDiagnostic = {
  positions_total: number;
  positions_with_resolved_symbol: number;
  positions_with_history: number;
  positions_without_history: number;
  positions_enough_20d: number;
  positions_enough_65d: number;
  positions_enough_200d: number;
  coverage_ratio_20d: number;
  coverage_ratio_65d: number;
  coverage_ratio_200d: number;
  trend_explanation: string;
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

function computeTrendStatus(args: {
  shortDirection: Direction;
  mediumDirection: Direction;
  longDirection: Direction;
  longReturn: number | null;
}): TrendStatus {
  const { shortDirection, mediumDirection, longDirection, longReturn } = args;
  const hasShort = shortDirection !== "unavailable";
  const hasMedium = mediumDirection !== "unavailable";
  const hasLong = longDirection !== "unavailable";
  const longIsModestlyNegative = typeof longReturn === "number" && longReturn > -5.0 && longReturn < 0;

  if (!hasMedium && !hasShort && !hasLong) {
    return "unavailable";
  }

  if (hasLong) {
    if (longDirection === "positive" && mediumDirection === "positive" && (shortDirection === "positive" || shortDirection === "neutral")) {
      return "strong_uptrend";
    }

    if (mediumDirection === "positive" && shortDirection === "positive"
      && (longDirection === "neutral" || longIsModestlyNegative)) {
      return "improving";
    }

    if (longDirection === "negative" && mediumDirection === "negative" && (shortDirection === "negative" || shortDirection === "neutral")) {
      return "downtrend";
    }

    if (mediumDirection === "negative" && shortDirection === "negative" && (longDirection === "neutral" || !hasLong)) {
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

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

async function loadPortfolioHistorySeriesFromPositionsPriceHistory(portfolioId: string): Promise<{
  rows: Point[];
  position_diagnostics: PositionCoverageDiagnostic[];
  portfolio_coverage: PortfolioCoverageDiagnostic;
}> {
  const positionsRows = await query(
    `SELECT id, symbol, resolved_symbol, shares, entry_date, exited_at
     FROM ${tables.portfolioPositions}
     WHERE portfolio_id = ? AND COALESCE(shares, 0) > 0 AND symbol IS NOT NULL AND TRIM(symbol) <> ''`,
    [portfolioId]
  ) as Array<{ symbol?: unknown; resolved_symbol?: unknown; shares?: unknown; entry_date?: unknown; exited_at?: unknown }>;

  const positions = positionsRows
    .map((row) => ({
      symbol: String(row.symbol ?? "").trim().toUpperCase(),
      resolved_symbol: String(row.resolved_symbol ?? "").trim().toUpperCase() || null,
      shares: Number(row.shares ?? NaN),
      entry_date: isValidDate(row.entry_date) ? row.entry_date.trim() : null,
      exited_at: isValidDate(row.exited_at) ? row.exited_at.trim() : null,
    }))
    .filter((row) => row.symbol && Number.isFinite(row.shares) && row.shares > 0);

  if (positions.length === 0) {
    return {
      rows: [],
      position_diagnostics: [],
      portfolio_coverage: {
        positions_total: 0,
        positions_with_resolved_symbol: 0,
        positions_with_history: 0,
        positions_without_history: 0,
        positions_enough_20d: 0,
        positions_enough_65d: 0,
        positions_enough_200d: 0,
        coverage_ratio_20d: 0,
        coverage_ratio_65d: 0,
        coverage_ratio_200d: 0,
        trend_explanation: "Trend unavailable: no active positions with valid symbol + shares.",
      },
    };
  }

  const symbols = Array.from(
    new Set(
      positions.flatMap((p) => (p.resolved_symbol && p.resolved_symbol !== p.symbol ? [p.resolved_symbol, p.symbol] : [p.symbol]))
    )
  );
  const placeholders = symbols.map(() => "?").join(", ");
  const prices = await query(
    `SELECT symbol, price_date, COALESCE(adjusted_close, close) AS close_price
     FROM ${tables.dailyPriceHistory}
     WHERE symbol IN (${placeholders}) AND COALESCE(adjusted_close, close) IS NOT NULL
     ORDER BY price_date ASC`,
    symbols
  ) as Array<{ symbol?: unknown; price_date?: unknown; close_price?: unknown }>;

  const bySymbol = new Map<string, Array<{ price_date: string; close_price: number }>>();
  for (const row of prices) {
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    const priceDate = String(row.price_date ?? "").trim();
    const closePrice = Number(row.close_price ?? NaN);
    if (!symbol || !isValidDate(priceDate) || !Number.isFinite(closePrice) || closePrice <= 0) continue;
    const bucket = bySymbol.get(symbol) ?? [];
    bucket.push({ price_date: priceDate, close_price: closePrice });
    bySymbol.set(symbol, bucket);
  }

  const aggregate = new Map<string, { market_value: number; contributors: number; expected: number }>();
  const snapshotRows = symbols.length > 0
    ? await query(`SELECT symbol FROM ${tables.priceScreenSnapshot} WHERE symbol IN (${placeholders})`, symbols)
    : [];
  const snapshotSymbolSet = new Set(snapshotRows.map((row: any) => String(row.symbol ?? "").trim().toUpperCase()).filter(Boolean));
  const positionDiagnostics: PositionCoverageDiagnostic[] = [];

  for (const position of positions) {
    const historySymbolUsed = position.resolved_symbol ?? position.symbol;
    const series = bySymbol.get(historySymbolUsed) ?? bySymbol.get(position.symbol) ?? [];
    const hasHistory = series.length > 0;
    const firstHistoryDate = hasHistory ? series[0]?.price_date ?? null : null;
    const lastHistoryDate = hasHistory ? series[series.length - 1]?.price_date ?? null : null;
    const enough20d = series.length >= 21;
    const enough65d = series.length >= 66;
    const enough200d = series.length >= 201;

    const missingReason: CoverageMissingReason = (() => {
      if (!position.resolved_symbol && !hasHistory) return "unresolved_symbol";
      if (!hasHistory) return "no_history_rows";
      if (!enough20d) return "insufficient_20d";
      if (!enough65d) return "insufficient_65d";
      if (!enough200d) return "insufficient_200d";
      return "ok";
    })();

    positionDiagnostics.push({
      portfolio_id: portfolioId,
      raw_symbol: position.symbol,
      resolved_symbol: position.resolved_symbol,
      history_symbol_used: historySymbolUsed,
      has_daily_price_history: hasHistory,
      history_row_count: series.length,
      first_history_date: firstHistoryDate,
      last_history_date: lastHistoryDate,
      enough_20d: enough20d,
      enough_65d: enough65d,
      enough_200d: enough200d,
      has_screen_snapshot: snapshotSymbolSet.has(historySymbolUsed) || snapshotSymbolSet.has(position.symbol),
      missing_reason: missingReason,
    });

    if (series.length === 0) continue;

    for (const point of series) {
      if (position.entry_date && point.price_date < position.entry_date) continue;
      if (position.exited_at && point.price_date > position.exited_at) continue;

      const existing = aggregate.get(point.price_date) ?? { market_value: 0, contributors: 0, expected: 0 };
      existing.market_value += position.shares * point.close_price;
      existing.contributors += 1;
      existing.expected += 1;
      aggregate.set(point.price_date, existing);
    }
  }

  const outputRows = Array.from(aggregate.entries())
    .map(([as_of_date, value]) => ({
      as_of_date,
      market_value: value.market_value,
      data_quality: (value.contributors === value.expected ? "full" : "partial") as DataQuality,
    }))
    .filter((row) => Number.isFinite(row.market_value) && row.market_value > 0)
    .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));

  const totals = {
    positions_total: positionDiagnostics.length,
    positions_with_resolved_symbol: positionDiagnostics.filter((row) => row.resolved_symbol !== null).length,
    positions_with_history: positionDiagnostics.filter((row) => row.has_daily_price_history).length,
    positions_without_history: positionDiagnostics.filter((row) => !row.has_daily_price_history).length,
    positions_enough_20d: positionDiagnostics.filter((row) => row.enough_20d).length,
    positions_enough_65d: positionDiagnostics.filter((row) => row.enough_65d).length,
    positions_enough_200d: positionDiagnostics.filter((row) => row.enough_200d).length,
  };
  const denominator = totals.positions_total > 0 ? totals.positions_total : 1;
  const coverage65 = totals.positions_enough_65d / denominator;
  const coverage200 = totals.positions_enough_200d / denominator;
  const explanation = coverage65 === 0
    ? `Trend unavailable: ${totals.positions_enough_65d}/${totals.positions_total} positions have ≥65 days history.`
    : coverage200 < 1
      ? `Trend partial: ${totals.positions_with_resolved_symbol}/${totals.positions_total} positions resolved, ${totals.positions_enough_200d}/${totals.positions_total} positions have ≥200 days history.`
      : `Trend coverage OK: ${totals.positions_with_history}/${totals.positions_total} positions have daily price history.`;

  return {
    rows: outputRows,
    position_diagnostics: positionDiagnostics,
    portfolio_coverage: {
      ...totals,
      coverage_ratio_20d: totals.positions_enough_20d / denominator,
      coverage_ratio_65d: coverage65,
      coverage_ratio_200d: coverage200,
      trend_explanation: explanation,
    },
  };
}

async function loadPortfolioHistorySeriesFromPositionsSnapshots(portfolioId: string): Promise<Point[]> {
  const rows = await query(
    `SELECT as_of_date,
            SUM(COALESCE(market_value, shares * COALESCE(manual_price, avg_cost))) AS market_value
     FROM ${tables.portfolioPositions}
     WHERE portfolio_id = ? AND active_position = 1
     GROUP BY as_of_date
     ORDER BY as_of_date ASC`,
    [portfolioId]
  ) as Array<{ as_of_date?: unknown; market_value?: unknown }>;

  return rows
    .map((row) => ({
      as_of_date: String(row.as_of_date ?? "").trim(),
      market_value: Number(row.market_value ?? NaN),
      data_quality: "estimated" as DataQuality,
    }))
    .filter((row) => isValidDate(row.as_of_date) && Number.isFinite(row.market_value) && row.market_value > 0);
}

async function loadPortfolioHistorySeriesFromSnapshots(portfolioId: string): Promise<Point[]> {
  const rows = await query(
    `SELECT as_of_date, market_value
     FROM ${tables.portfolioSnapshots}
     WHERE portfolio_id = ? AND market_value IS NOT NULL
     ORDER BY as_of_date ASC`,
    [portfolioId]
  ) as Array<{ as_of_date?: unknown; market_value?: unknown }>;

  return rows
    .map((row) => ({
      as_of_date: String(row.as_of_date ?? "").trim(),
      market_value: Number(row.market_value ?? NaN),
      data_quality: "estimated" as DataQuality,
    }))
    .filter((row) => isValidDate(row.as_of_date) && Number.isFinite(row.market_value) && row.market_value > 0);
}

async function loadPortfolioHistorySeries(portfolioId: string): Promise<{
  source: HistorySource;
  rows: Point[];
  position_diagnostics: PositionCoverageDiagnostic[];
  portfolio_coverage: PortfolioCoverageDiagnostic | null;
}> {
  const hasPositions = await tableExists(tables.portfolioPositions);
  let positionsCoverage: { position_diagnostics: PositionCoverageDiagnostic[]; portfolio_coverage: PortfolioCoverageDiagnostic | null } = {
    position_diagnostics: [],
    portfolio_coverage: null,
  };
  if (hasPositions) {
    const priceHistoryLoaded = await loadPortfolioHistorySeriesFromPositionsPriceHistory(portfolioId);
    positionsCoverage = {
      position_diagnostics: priceHistoryLoaded.position_diagnostics,
      portfolio_coverage: priceHistoryLoaded.portfolio_coverage,
    };
    if (priceHistoryLoaded.rows.length > 0) {
      return { source: "positions_price_history", ...priceHistoryLoaded };
    }

    const positionSnapshotRows = await loadPortfolioHistorySeriesFromPositionsSnapshots(portfolioId);
    if (positionSnapshotRows.length > 0) {
      return {
        source: "positions_snapshots",
        rows: positionSnapshotRows,
        position_diagnostics: priceHistoryLoaded.position_diagnostics,
        portfolio_coverage: priceHistoryLoaded.portfolio_coverage,
      };
    }
  }

  const hasSnapshots = await tableExists(tables.portfolioSnapshots);
  if (hasSnapshots) {
    const snapshotRows = await loadPortfolioHistorySeriesFromSnapshots(portfolioId);
    if (snapshotRows.length > 0) {
      return { source: "snapshots", rows: snapshotRows, ...positionsCoverage };
    }
  }

  return { source: "unavailable", rows: [], ...positionsCoverage };
}

function computeTrendMetrics(series: Point[]): TrendMetrics {
  const availableDays = series.length;
  const return20 = computeLookbackReturn(series, 20);
  const return65 = computeLookbackReturn(series, 65);
  const return200 = computeLookbackReturn(series, 200);

  const shortDirection = computeDirection(return20);
  const mediumDirection = computeDirection(return65);
  const longDirection = computeDirection(return200);

  const trendCompleteness = computeSignalCompleteness(availableDays);
  const trendStatus = trendCompleteness === "unavailable"
    ? "unavailable"
    : computeTrendStatus({
      shortDirection,
      mediumDirection,
      longDirection,
      longReturn: return200,
    });

  const qualityPriority: Record<DataQuality, number> = { partial: 0, estimated: 1, full: 2 };
  const data_quality = series.reduce<DataQuality>((acc, row) => {
    return qualityPriority[row.data_quality] < qualityPriority[acc] ? row.data_quality : acc;
  }, "full");

  return {
    available_days: availableDays,
    return_20d: return20,
    return_65d: return65,
    return_200d: return200,
    short_direction: shortDirection,
    medium_direction: mediumDirection,
    long_direction: longDirection,
    trend_status: trendStatus,
    signal_completeness: trendCompleteness,
    trend_completeness: trendCompleteness,
    data_quality,
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
  const sourceByPortfolio = new Map<string, HistorySource>();
  const coverageByPortfolio = new Map<string, PortfolioCoverageDiagnostic | null>();
  const positionCoverageByPortfolio = new Map<string, PositionCoverageDiagnostic[]>();

  const trendItems: Array<{ portfolio: PortfolioAdminConfig; metrics: TrendMetrics }> = [];

  for (const portfolio of portfolios) {
    const loaded = await loadPortfolioHistorySeries(portfolio.portfolio_id);
    sourceByPortfolio.set(portfolio.portfolio_id, loaded.source);
    byPortfolioSeries.set(portfolio.portfolio_id, loaded.rows);
    coverageByPortfolio.set(portfolio.portfolio_id, loaded.portfolio_coverage);
    positionCoverageByPortfolio.set(portfolio.portfolio_id, loaded.position_diagnostics);

    await execute(`DELETE FROM ${tables.portfolioHistoryDaily} WHERE portfolio_id = ?`, [portfolio.portfolio_id]);

    const enrichedSeries = enrichSeriesReturns(loaded.rows);

    for (const row of enrichedSeries) {
      await execute(
        `INSERT INTO ${tables.portfolioHistoryDaily} (
          portfolio_id, as_of_date, total_return_index, market_value,
          daily_return_pct, cumulative_return_pct, drawdown_pct,
          cash_weight_pct, data_source, data_quality
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          portfolio.portfolio_id,
          row.as_of_date,
          row.market_value,
          row.daily_return_pct,
          row.cumulative_return_pct,
          row.drawdown_pct,
          loaded.source,
          row.data_quality,
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
  const dates = new Set<string>();
  const seriesMapByPortfolio = new Map<string, Map<string, Point>>();

  for (const portfolio of included) {
    const series = byPortfolioSeries.get(portfolio.portfolio_id) ?? [];
    const byDate = new Map<string, Point>();
    for (const row of series) {
      dates.add(row.as_of_date);
      byDate.set(row.as_of_date, row);
    }
    seriesMapByPortfolio.set(portfolio.portfolio_id, byDate);
  }

  const sortedDates = Array.from(dates).sort((a, b) => a.localeCompare(b));
  const totalSeries: Point[] = [];

  for (const date of sortedDates) {
    let sum = 0;
    let contributors = 0;
    let fullContributors = 0;

    for (const portfolio of included) {
      const row = seriesMapByPortfolio.get(portfolio.portfolio_id)?.get(date);
      if (!row) continue;
      sum += row.market_value;
      contributors += 1;
      if (row.data_quality === "full") fullContributors += 1;
    }

    if (contributors > 0) {
      const dataQuality: DataQuality = contributors < included.length
        ? "partial"
        : fullContributors === included.length
          ? "full"
          : "estimated";
      totalSeries.push({ as_of_date: date, market_value: sum, data_quality: dataQuality });
    }
  }

  await execute(`DELETE FROM ${tables.totalPortfolioHistoryDaily}`);

  const totalEnriched = enrichSeriesReturns(totalSeries);
  for (const row of totalEnriched) {
    let contributors = 0;
    for (const portfolio of included) {
      if (seriesMapByPortfolio.get(portfolio.portfolio_id)?.has(row.as_of_date)) {
        contributors += 1;
      }
    }

    await execute(
      `INSERT INTO ${tables.totalPortfolioHistoryDaily} (
        as_of_date, total_return_index, market_value, daily_return_pct, cumulative_return_pct,
        drawdown_pct, total_cash_value, total_cash_weight_pct, included_portfolio_count, data_quality
      ) VALUES (?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [
        row.as_of_date,
        row.market_value,
        row.daily_return_pct,
        row.cumulative_return_pct,
        row.drawdown_pct,
        contributors,
        row.data_quality,
      ]
    );
  }

  const totalMetrics = computeTrendMetrics(totalSeries);

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
        coverage: coverageByPortfolio.get(item.portfolio.portfolio_id) ?? null,
        positions: positionCoverageByPortfolio.get(item.portfolio.portfolio_id) ?? [],
        trend_explanation: coverageByPortfolio.get(item.portfolio.portfolio_id)?.trend_explanation
          ?? (item.metrics.trend_status === "unavailable"
            ? "Trend unavailable: insufficient portfolio history."
            : "Trend available from portfolio history."),
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
        trend_completeness: item.metrics.trend_completeness,
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
      coverage: coverageByPortfolio.get(item.portfolio.portfolio_id) ?? null,
      positions: positionCoverageByPortfolio.get(item.portfolio.portfolio_id) ?? [],
      trend_explanation: coverageByPortfolio.get(item.portfolio.portfolio_id)?.trend_explanation
        ?? (item.metrics.trend_status === "unavailable"
          ? "Trend unavailable: insufficient portfolio history."
          : "Trend available from portfolio history."),
      ...item.metrics,
    })),
    total: {
      included_portfolios: included.map((item) => item.portfolio_id),
      history_days_available: totalSeries.length,
      aggregation_source: included.some((item) => sourceByPortfolio.get(item.portfolio_id) === "positions_price_history")
        ? "positions_price_history"
        : "snapshots",
      daily_return_pct: totalEnriched.length > 0 ? totalEnriched[totalEnriched.length - 1].daily_return_pct : null,
      cumulative_return_pct: totalEnriched.length > 0 ? totalEnriched[totalEnriched.length - 1].cumulative_return_pct : null,
      drawdown_pct: totalEnriched.length > 0 ? totalEnriched[totalEnriched.length - 1].drawdown_pct : null,
      return_20d: totalMetrics.return_20d,
      return_65d: totalMetrics.return_65d,
      return_200d: totalMetrics.return_200d,
      short_direction: totalMetrics.short_direction,
      medium_direction: totalMetrics.medium_direction,
      long_direction: totalMetrics.long_direction,
      trend_status: totalMetrics.trend_status,
      trend_completeness: totalMetrics.trend_completeness,
      data_quality: totalMetrics.data_quality,
    },
  };
}
