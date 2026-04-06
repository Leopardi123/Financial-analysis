import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";
import { listPortfolioConfigs } from "../../../../lib/portfolio-admin/repository.js";
import { computeTrendMetricsFromSeries } from "../../../../lib/portfolio-history/metrics.js";

const REBUILT_HISTORY_SOURCES = new Set(["positions_price_history", "positions_snapshots", "snapshots", "unavailable"]);

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function dateToUtcMs(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function buildUnavailableTrendDebugFromMetrics(metrics: {
  available_days: number;
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  short_direction: string;
  medium_direction: string;
  long_direction: string;
  trend_status: string;
  trend_completeness: string;
  value_at_20d_anchor?: number | null;
  value_at_65d_anchor?: number | null;
  value_at_200d_anchor?: number | null;
  return_20d_valid?: boolean;
  return_65d_valid?: boolean;
  return_200d_valid?: boolean;
  invalid_reasons_20d?: string[];
  invalid_reasons_65d?: string[];
  invalid_reasons_200d?: string[];
}) {
  const reason = metrics.available_days < 65 ? "insufficient_history" : "trend_debug_unavailable";
  return {
    attempted: true,
    available_days: metrics.available_days,
    latest_date: null,
    latest_value_sek: null,
    return_20d: metrics.return_20d,
    return_65d: metrics.return_65d,
    return_200d: metrics.return_200d,
    short_direction: metrics.short_direction,
    medium_direction: metrics.medium_direction,
    long_direction: metrics.long_direction,
    trend_status: metrics.trend_status,
    trend_completeness: metrics.trend_completeness,
    anchor_20d_date: null,
    anchor_65d_date: null,
    anchor_200d_date: null,
    anchor_20d_value_sek: metrics.value_at_20d_anchor ?? null,
    anchor_65d_value_sek: metrics.value_at_65d_anchor ?? null,
    anchor_200d_value_sek: metrics.value_at_200d_anchor ?? null,
    value_at_20d_anchor: metrics.value_at_20d_anchor ?? null,
    value_at_65d_anchor: metrics.value_at_65d_anchor ?? null,
    value_at_200d_anchor: metrics.value_at_200d_anchor ?? null,
    return_20d_valid: metrics.return_20d_valid ?? false,
    return_65d_valid: metrics.return_65d_valid ?? false,
    return_200d_valid: metrics.return_200d_valid ?? false,
    invalid_reasons_20d: metrics.invalid_reasons_20d ?? [],
    invalid_reasons_65d: metrics.invalid_reasons_65d ?? [],
    invalid_reasons_200d: metrics.invalid_reasons_200d ?? [],
    reason,
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();

    const configs = await listPortfolioConfigs();
    const portfolioIds = configs.map((row) => row.portfolio_id);
    const includedPortfolioIds = configs
      .filter((row) => row.active && row.included_in_total_portfolio)
      .map((row) => row.portfolio_id);
    const placeholders = portfolioIds.map(() => "?").join(", ");
    const historyRows = portfolioIds.length > 0
      ? await query(
        `SELECT portfolio_id, as_of_date, market_value, data_source
         FROM ${tables.portfolioHistoryDaily}
         WHERE portfolio_id IN (${placeholders}) AND market_value IS NOT NULL
         ORDER BY portfolio_id ASC, as_of_date ASC`,
        portfolioIds
      )
      : [];
    const lastBuildRows = await query(
      `SELECT last_success_at
       FROM ${tables.portfolioBuildMeta}
       WHERE pipeline_name = 'history'
       LIMIT 1`
    );
    const lastHistoryBuild = String(lastBuildRows[0]?.last_success_at ?? "").trim() || null;
    const snapshotDateRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
    const latestSnapshotDate = String(snapshotDateRows[0]?.as_of_date ?? "").trim();
    const snapshotDebugRows = latestSnapshotDate
      ? await query(
        `SELECT portfolio_id, debug_payload_json, relative_strength_bucket
         FROM ${tables.portfolioSnapshots}
         WHERE as_of_date = ?`,
        [latestSnapshotDate]
      )
      : [];
    const snapshotByPortfolio = new Map(
      (snapshotDebugRows as any[]).map((row) => [String(row.portfolio_id ?? ""), row])
    );
    const byPortfolioRaw = new Map<string, Array<{ as_of_date: string; market_value: number; data_source: string | null }>>();
    for (const row of historyRows as any[]) {
      const portfolioId = String(row.portfolio_id ?? "");
      const asOfDate = String(row.as_of_date ?? "").trim();
      const marketValue = Number(row.market_value ?? NaN);
      const dataSource = String(row.data_source ?? "").trim() || null;
      if (!portfolioId || !isValidDate(asOfDate) || !Number.isFinite(marketValue) || marketValue <= 0) continue;
      const bucket = byPortfolioRaw.get(portfolioId) ?? [];
      bucket.push({ as_of_date: asOfDate, market_value: marketValue, data_source: dataSource });
      byPortfolioRaw.set(portfolioId, bucket);
    }
    for (const rows of byPortfolioRaw.values()) {
      rows.sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
    }

    const effectiveSeriesByPortfolio = new Map<string, Array<{ as_of_date: string; market_value: number }>>();
    const historyDiagnosticsByPortfolio = new Map<string, {
      source_path_used: "rebuilt_portfolio_history_daily" | "legacy_portfolio_history_daily" | "none";
      selected_latest_row_date: string | null;
      selected_latest_value: number | null;
      rebuilt_latest_row_date: string | null;
      legacy_latest_row_date: string | null;
      stale_row_conflict_detected: boolean;
      stale_row_conflict_reason: string | null;
      value_origin: "rebuilt" | "legacy" | "none";
      rebuilt_row_count: number;
      legacy_row_count: number;
      total_row_count: number;
    }>();

    for (const portfolioId of portfolioIds) {
      const rows = byPortfolioRaw.get(portfolioId) ?? [];
      const rebuiltRows = rows.filter((row) => row.data_source !== null && REBUILT_HISTORY_SOURCES.has(row.data_source));
      const legacyRows = rows.filter((row) => !(row.data_source !== null && REBUILT_HISTORY_SOURCES.has(row.data_source)));
      const selectedRows = rebuiltRows.length > 0 ? rebuiltRows : legacyRows;
      const selectedLatest = selectedRows[selectedRows.length - 1] ?? null;
      const rebuiltLatest = rebuiltRows[rebuiltRows.length - 1] ?? null;
      const legacyLatest = legacyRows[legacyRows.length - 1] ?? null;
      const staleConflict = Boolean(
        rebuiltLatest
        && legacyLatest
        && legacyLatest.as_of_date < rebuiltLatest.as_of_date
      );

      effectiveSeriesByPortfolio.set(
        portfolioId,
        selectedRows.map((row) => ({ as_of_date: row.as_of_date, market_value: row.market_value })),
      );
      historyDiagnosticsByPortfolio.set(portfolioId, {
        source_path_used: selectedRows.length === 0
          ? "none"
          : rebuiltRows.length > 0
            ? "rebuilt_portfolio_history_daily"
            : "legacy_portfolio_history_daily",
        selected_latest_row_date: selectedLatest?.as_of_date ?? null,
        selected_latest_value: selectedLatest?.market_value ?? null,
        rebuilt_latest_row_date: rebuiltLatest?.as_of_date ?? null,
        legacy_latest_row_date: legacyLatest?.as_of_date ?? null,
        stale_row_conflict_detected: staleConflict,
        stale_row_conflict_reason: staleConflict ? "legacy_rows_older_than_rebuilt_rows_coexist" : null,
        value_origin: selectedRows.length === 0 ? "none" : (rebuiltRows.length > 0 ? "rebuilt" : "legacy"),
        rebuilt_row_count: rebuiltRows.length,
        legacy_row_count: legacyRows.length,
        total_row_count: rows.length,
      });
    }

    const portfolios = portfolioIds.map((portfolioId) => {
      const series = effectiveSeriesByPortfolio.get(portfolioId) ?? [];
      const metrics = computeTrendMetricsFromSeries(series.map((point) => ({
        as_of_date: point.as_of_date,
        market_value: point.market_value,
      })));
      const snapshotRow = snapshotByPortfolio.get(portfolioId) as any;
      const historyDiagnostics = historyDiagnosticsByPortfolio.get(portfolioId);
      return {
        portfolio_id: portfolioId,
        as_of_date: historyDiagnostics?.selected_latest_row_date ?? "",
        available_days: metrics.available_days,
        latest_value: metrics.latest_value,
        return_20d: metrics.return_20d,
        return_65d: metrics.return_65d,
        return_200d: metrics.return_200d,
        anchor_20d_date: metrics.anchor_20d_date,
        anchor_65d_date: metrics.anchor_65d_date,
        anchor_200d_date: metrics.anchor_200d_date,
        short_direction: metrics.short_direction,
        medium_direction: metrics.medium_direction,
        long_direction: metrics.long_direction,
        trend_status: metrics.trend_status,
        trend_completeness: metrics.trend_completeness,
        value_at_20d_anchor: metrics.value_at_20d_anchor,
        value_at_65d_anchor: metrics.value_at_65d_anchor,
        value_at_200d_anchor: metrics.value_at_200d_anchor,
        return_20d_valid: metrics.return_20d_valid,
        return_65d_valid: metrics.return_65d_valid,
        return_200d_valid: metrics.return_200d_valid,
        invalid_reasons_20d: metrics.invalid_reasons_20d,
        invalid_reasons_65d: metrics.invalid_reasons_65d,
        invalid_reasons_200d: metrics.invalid_reasons_200d,
        relative_strength_bucket: snapshotRow?.relative_strength_bucket == null ? "unavailable" : String(snapshotRow.relative_strength_bucket),
        debug_payload_json: snapshotRow?.debug_payload_json ?? null,
        first_history_date: metrics.first_history_date,
        last_history_date: metrics.last_history_date,
        latest_history_source_path: historyDiagnostics?.source_path_used ?? "none",
        history_value_origin: historyDiagnostics?.value_origin ?? "none",
        stale_row_conflict_detected: historyDiagnostics?.stale_row_conflict_detected ?? false,
        stale_row_conflict_reason: historyDiagnostics?.stale_row_conflict_reason ?? null,
        rebuilt_latest_row_date: historyDiagnostics?.rebuilt_latest_row_date ?? null,
        legacy_latest_row_date: historyDiagnostics?.legacy_latest_row_date ?? null,
        rebuilt_row_count: historyDiagnostics?.rebuilt_row_count ?? 0,
        legacy_row_count: historyDiagnostics?.legacy_row_count ?? 0,
      };
    });

    const includedHistoryRows = includedPortfolioIds.flatMap((portfolioId) =>
      (effectiveSeriesByPortfolio.get(portfolioId) ?? []).map((row) => ({
        portfolio_id: portfolioId,
        as_of_date: row.as_of_date,
        market_value: row.market_value,
      }))
    );
    const newestIncludedDateMs = includedHistoryRows
      .map((row) => dateToUtcMs(row.as_of_date))
      .filter((value): value is number => value !== null)
      .reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
    const recentCutoffMs = Number.isFinite(newestIncludedDateMs) ? newestIncludedDateMs - (30 * 24 * 60 * 60 * 1000) : null;

    const contributorsByDate = new Map<string, Set<string>>();
    const valueByPortfolioDate = new Map<string, number>();
    for (const row of includedHistoryRows) {
      const key = `${row.portfolio_id}__${row.as_of_date}`;
      valueByPortfolioDate.set(key, row.market_value);
      const bucket = contributorsByDate.get(row.as_of_date) ?? new Set<string>();
      bucket.add(row.portfolio_id);
      contributorsByDate.set(row.as_of_date, bucket);
    }

    const dateCandidates = Array.from(contributorsByDate.entries())
      .filter(([date]) => {
        if (recentCutoffMs === null) return true;
        const dateMs = dateToUtcMs(date);
        return dateMs !== null && dateMs >= recentCutoffMs;
      });
    const scoredCandidates = (dateCandidates.length > 0 ? dateCandidates : Array.from(contributorsByDate.entries()))
      .map(([date, ids]) => ({ date, contributor_count: ids.size }));
    scoredCandidates.sort((a, b) => {
      if (b.contributor_count !== a.contributor_count) return b.contributor_count - a.contributor_count;
      return b.date.localeCompare(a.date);
    });
    const latestTotalDate = scoredCandidates[0]?.date ?? "";
    const contributingPortfolioIds = Array.from(contributorsByDate.get(latestTotalDate) ?? []).sort((a, b) => a.localeCompare(b));
    const recomputedIncludedCount = contributingPortfolioIds.length;
    const recomputedTotalMarketValue = contributingPortfolioIds
      .map((portfolioId) => valueByPortfolioDate.get(`${portfolioId}__${latestTotalDate}`) ?? 0)
      .reduce((sum, value) => sum + value, 0);

    const commonDateSeries = Array.from(contributorsByDate.entries())
      .filter(([date, ids]) => date <= latestTotalDate && contributingPortfolioIds.every((id) => ids.has(id)))
      .map(([date]) => ({
        as_of_date: date,
        market_value: contributingPortfolioIds
          .map((id) => valueByPortfolioDate.get(`${id}__${date}`) ?? 0)
          .reduce((sum, value) => sum + value, 0),
      }))
      .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
    const seriesIndex = commonDateSeries.findIndex((row) => row.as_of_date === latestTotalDate);
    const prev = seriesIndex > 0 ? commonDateSeries[seriesIndex - 1] : null;
    const first = commonDateSeries[0] ?? null;
    const latest = seriesIndex >= 0 ? commonDateSeries[seriesIndex] : null;
    const runningPeak = commonDateSeries
      .slice(0, Math.max(seriesIndex + 1, 0))
      .reduce((peak, row) => Math.max(peak, row.market_value), Number.NEGATIVE_INFINITY);
    const totalRows = latestTotalDate
      ? await query(
        `SELECT data_quality
         FROM ${tables.totalPortfolioHistoryDaily}
         WHERE as_of_date = ?
         LIMIT 1`,
        [latestTotalDate]
      )
      : [];

    const total = totalRows[0] as any;
    const debug = String(req.query?.debug ?? "") === "1";
    const fallbackHistoryBuild = latestTotalDate ? `${latestTotalDate}T00:00:00.000Z` : null;

    res.status(200).json({
      ok: true,
      portfolios: portfolios.map((row: any) => ({
        portfolio_id: String(row.portfolio_id ?? ""),
        as_of_date: String(row.as_of_date ?? ""),
        return_20d: row.return_20d == null ? null : Number(row.return_20d),
        return_65d: row.return_65d == null ? null : Number(row.return_65d),
        return_200d: row.return_200d == null ? null : Number(row.return_200d),
        short_direction: String(row.short_direction ?? "unavailable"),
        medium_direction: String(row.medium_direction ?? "unavailable"),
        long_direction: String(row.long_direction ?? "unavailable"),
        trend_status: String(row.trend_status ?? "unavailable"),
        relative_strength_bucket: String(row.relative_strength_bucket ?? "unavailable"),
        trend_completeness: String(row.trend_completeness ?? "unavailable"),
        available_days: Number(row.available_days ?? 0),
        latest_value: row.latest_value == null ? null : Number(row.latest_value),
        anchor_20d_date: row.anchor_20d_date == null ? null : String(row.anchor_20d_date),
        anchor_65d_date: row.anchor_65d_date == null ? null : String(row.anchor_65d_date),
        anchor_200d_date: row.anchor_200d_date == null ? null : String(row.anchor_200d_date),
        value_at_20d_anchor: row.value_at_20d_anchor == null ? null : Number(row.value_at_20d_anchor),
        value_at_65d_anchor: row.value_at_65d_anchor == null ? null : Number(row.value_at_65d_anchor),
        value_at_200d_anchor: row.value_at_200d_anchor == null ? null : Number(row.value_at_200d_anchor),
        return_20d_valid: Boolean(row.return_20d_valid),
        return_65d_valid: Boolean(row.return_65d_valid),
        return_200d_valid: Boolean(row.return_200d_valid),
      })),
      total: {
        as_of_date: latestTotalDate || null,
        market_value: recomputedIncludedCount > 0
          ? recomputedTotalMarketValue
          : (total?.market_value == null ? null : Number(total.market_value)),
        daily_return_pct: latest && prev && prev.market_value !== 0
          ? ((latest.market_value / prev.market_value) - 1) * 100
          : null,
        cumulative_return_pct: latest && first && first.market_value !== 0
          ? ((latest.market_value / first.market_value) - 1) * 100
          : null,
        drawdown_pct: latest && Number.isFinite(runningPeak) && runningPeak !== 0
          ? ((latest.market_value / runningPeak) - 1) * 100
          : null,
      },
      ...(debug
        ? {
          diagnostics: {
            portfolios: portfolios.map((row: any) => {
              let trendDebug = null;
              if (typeof row.debug_payload_json === "string" && row.debug_payload_json.trim()) {
                try {
                  const parsed = JSON.parse(row.debug_payload_json);
                  trendDebug = parsed?.trend ?? null;
                } catch {
                  trendDebug = null;
                }
              }
              return {
                portfolio_id: String(row.portfolio_id ?? ""),
                source_path_used: row.latest_history_source_path ?? "none",
                value_origin: row.history_value_origin ?? "none",
                latest_row_date_selected: row.as_of_date ?? null,
                rebuilt_latest_row_date: row.rebuilt_latest_row_date ?? null,
                legacy_latest_row_date: row.legacy_latest_row_date ?? null,
                stale_row_conflict_detected: Boolean(row.stale_row_conflict_detected),
                stale_row_conflict_reason: row.stale_row_conflict_reason ?? null,
                rebuilt_row_count: Number(row.rebuilt_row_count ?? 0),
                legacy_row_count: Number(row.legacy_row_count ?? 0),
                ...(trendDebug ?? buildUnavailableTrendDebugFromMetrics({
                  available_days: Number(row.available_days ?? 0),
                  return_20d: row.return_20d == null ? null : Number(row.return_20d),
                  return_65d: row.return_65d == null ? null : Number(row.return_65d),
                  return_200d: row.return_200d == null ? null : Number(row.return_200d),
                  short_direction: String(row.short_direction ?? "unavailable"),
                  medium_direction: String(row.medium_direction ?? "unavailable"),
                  long_direction: String(row.long_direction ?? "unavailable"),
                  trend_status: String(row.trend_status ?? "unavailable"),
                  trend_completeness: String(row.trend_completeness ?? "unavailable"),
                  value_at_20d_anchor: row.value_at_20d_anchor == null ? null : Number(row.value_at_20d_anchor),
                  value_at_65d_anchor: row.value_at_65d_anchor == null ? null : Number(row.value_at_65d_anchor),
                  value_at_200d_anchor: row.value_at_200d_anchor == null ? null : Number(row.value_at_200d_anchor),
                  return_20d_valid: Boolean(row.return_20d_valid),
                  return_65d_valid: Boolean(row.return_65d_valid),
                  return_200d_valid: Boolean(row.return_200d_valid),
                  invalid_reasons_20d: Array.isArray(row.invalid_reasons_20d) ? row.invalid_reasons_20d : [],
                  invalid_reasons_65d: Array.isArray(row.invalid_reasons_65d) ? row.invalid_reasons_65d : [],
                  invalid_reasons_200d: Array.isArray(row.invalid_reasons_200d) ? row.invalid_reasons_200d : [],
                })),
                first_history_date: row.first_history_date ?? null,
                last_history_date: row.last_history_date ?? null,
                latest_date: row.last_history_date ?? null,
                latest_value_sek: row.latest_value ?? null,
                anchor_20d_date: row.anchor_20d_date ?? null,
                anchor_65d_date: row.anchor_65d_date ?? null,
                anchor_200d_date: row.anchor_200d_date ?? null,
                anchor_20d_value_sek: row.value_at_20d_anchor ?? null,
                anchor_65d_value_sek: row.value_at_65d_anchor ?? null,
                anchor_200d_value_sek: row.value_at_200d_anchor ?? null,
                value_at_20d_anchor: row.value_at_20d_anchor ?? null,
                value_at_65d_anchor: row.value_at_65d_anchor ?? null,
                value_at_200d_anchor: row.value_at_200d_anchor ?? null,
                return_20d_valid: row.return_20d_valid ?? false,
                return_65d_valid: row.return_65d_valid ?? false,
                return_200d_valid: row.return_200d_valid ?? false,
                invalid_reasons_20d: row.invalid_reasons_20d ?? [],
                invalid_reasons_65d: row.invalid_reasons_65d ?? [],
                invalid_reasons_200d: row.invalid_reasons_200d ?? [],
                invalid_reason_20d: Array.isArray(row.invalid_reasons_20d) ? (row.invalid_reasons_20d[0] ?? null) : null,
                invalid_reason_65d: Array.isArray(row.invalid_reasons_65d) ? (row.invalid_reasons_65d[0] ?? null) : null,
                invalid_reason_200d: Array.isArray(row.invalid_reasons_200d) ? (row.invalid_reasons_200d[0] ?? null) : null,
              };
            }),
            total: {
              included_portfolios: null,
              history_days_available: Number((await query(`SELECT COUNT(*) AS count FROM ${tables.totalPortfolioHistoryDaily}`))[0]?.count ?? 0),
              aggregation_source: "portfolio_history_daily_aligned_read",
              daily_return_pct: latest && prev && prev.market_value !== 0
                ? ((latest.market_value / prev.market_value) - 1) * 100
                : null,
              cumulative_return_pct: latest && first && first.market_value !== 0
                ? ((latest.market_value / first.market_value) - 1) * 100
                : null,
              drawdown_pct: latest && Number.isFinite(runningPeak) && runningPeak !== 0
                ? ((latest.market_value / runningPeak) - 1) * 100
                : null,
              data_quality: recomputedIncludedCount === includedPortfolioIds.length ? "full" : "partial",
              included_portfolio_count: recomputedIncludedCount > 0
                ? recomputedIncludedCount
                : (total?.included_portfolio_count ?? null),
              last_history_build: lastHistoryBuild ?? fallbackHistoryBuild,
              total_date_used: latestTotalDate || null,
              total_date_rule_used: "latest_recent_date_max_contributors_then_latest",
              contributing_portfolio_ids: contributingPortfolioIds,
              excluded_portfolio_ids: includedPortfolioIds.filter((id) => !contributingPortfolioIds.includes(id)),
              excluded_portfolio_reasons: includedPortfolioIds
                .filter((id) => !contributingPortfolioIds.includes(id))
                .map((id) => {
                  const rowsForId = includedHistoryRows.filter((row) => row.portfolio_id === id);
                  if (rowsForId.length === 0) return { portfolio_id: id, reason: "no_history_rows" };
                  const latestForId = rowsForId[rowsForId.length - 1]?.as_of_date ?? null;
                  return {
                    portfolio_id: id,
                    reason: latestForId && latestForId < latestTotalDate ? "no_row_on_total_date" : "excluded_by_alignment_rule",
                    latest_history_date: latestForId,
                  };
                }),
            },
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
