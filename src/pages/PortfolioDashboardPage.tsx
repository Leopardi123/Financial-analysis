import { useEffect, useMemo, useState } from "react";
import { Chart } from "react-google-charts";
import Header from "../components/Header";
import "../styles/portfolio-dashboard.css";

type NullableNumber = number | null;

type PortfolioRecord = {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_type: string;
  sort_order: number;
  market_value: NullableNumber;
  actual_weight_pct: NullableNumber;
  target_weight_pct: NullableNumber;
  min_weight_pct: NullableNumber;
  max_weight_pct: NullableNumber;
  weight_status: string | null;
  rebalance_status: string | null;
  return_20d: NullableNumber;
  return_65d: NullableNumber;
  return_200d: NullableNumber;
  trend_status: string | null;
  relative_strength_bucket: string | null;
  annualized_vol_65d: NullableNumber;
  current_drawdown_pct: NullableNumber;
  top_holding_weight_pct: NullableNumber;
  risk_score: NullableNumber;
  risk_status: string | null;
  risk_mismatch_flag: boolean | null;
  hedge_status: string | null;
  suggested_hedge_type: string | null;
  hedge_policy_applied: string | null;
  signal_completeness: string | null;
  data_quality_flags: Record<string, boolean> | null;
};

type PortfolioOverviewResponse = {
  ok: boolean;
  as_of_date: string | null;
  total: {
    market_value: NullableNumber;
    allocation_plan_status: string | null;
    total_risk_score: NullableNumber;
    total_risk_status: string | null;
    total_hedge_signal: string | null;
    dry_powder_status: string | null;
    opportunistic_weight_pct: NullableNumber;
    required_min_dry_powder_pct: NullableNumber;
    included_portfolio_count: number;
    major_warnings: string[];
  };
  performance: {
    daily_return_pct: NullableNumber;
    cumulative_return_pct: NullableNumber;
    drawdown_pct: NullableNumber;
    history_available_days: number;
    data_quality: string | null;
  };
  portfolios: PortfolioRecord[];
  debug?: unknown;
  error?: string;
};

type TotalSeriesResponse = {
  ok: boolean;
  series: Array<{
    as_of_date: string;
    total_return_index: NullableNumber;
    market_value: NullableNumber;
    daily_return_pct: NullableNumber;
    cumulative_return_pct: NullableNumber;
    drawdown_pct: NullableNumber;
  }>;
  error?: string;
};

type BadgeTone = "positive" | "caution" | "warning" | "negative" | "muted" | "neutral";

const statusToneMap: Record<string, BadgeTone> = {
  within_allocation_plan: "positive",
  outside_allocation_plan: "caution",
  materially_outside_allocation_plan: "negative",
  strong_uptrend: "positive",
  improving: "positive",
  neutral: "neutral",
  weakening: "caution",
  downtrend: "negative",
  unavailable: "muted",
  calm: "positive",
  elevated: "caution",
  high: "warning",
  critical: "negative",
  hedge_not_needed: "positive",
  consider_hedge: "caution",
  hedge_recommended: "warning",
  hedge_urgent: "negative",
  reduce_exposure: "warning",
  rebalance_to_cash: "warning",
  increase_dry_powder: "warning",
  rotate_to_defensive_bucket: "warning",
  adequate: "positive",
  deployable: "positive",
  insufficient_dry_powder: "negative",
  elevated_cash_buffer: "caution",
  insufficient_data_for_hedge_signal: "muted",
};

function formatCurrency(value: NullableNumber): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatPct(value: NullableNumber): string {
  if (value === null) return "Unavailable";
  return `${value.toFixed(2)}%`;
}

function formatNumber(value: NullableNumber): string {
  if (value === null) return "Unavailable";
  return value.toFixed(2);
}

function labelizeStatus(value: string | null): string {
  if (!value) return "Unavailable";
  return value.replace(/_/g, " ");
}

function toneForStatus(status: string | null): BadgeTone {
  if (!status) return "muted";
  return statusToneMap[status] ?? "neutral";
}

function isDebugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export default function PortfolioDashboardPage() {
  const [overview, setOverview] = useState<PortfolioOverviewResponse | null>(null);
  const [series, setSeries] = useState<TotalSeriesResponse["series"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debugMode = isDebugEnabled();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const overviewRes = await fetch(`/api/portfolio/overview/latest${debugMode ? "?debug=1" : ""}`);
        const overviewPayload = (await overviewRes.json()) as PortfolioOverviewResponse;

        if (!overviewRes.ok || !overviewPayload.ok) {
          throw new Error(overviewPayload.error ?? "Failed to load portfolio overview");
        }

        if (cancelled) return;
        setOverview(overviewPayload);

        if (overviewPayload.performance.history_available_days > 1) {
          const totalSeriesRes = await fetch(`/api/portfolio/history/series/total${debugMode ? "?debug=1" : ""}`);
          const totalSeriesPayload = (await totalSeriesRes.json()) as TotalSeriesResponse;
          if (totalSeriesRes.ok && totalSeriesPayload.ok && !cancelled) {
            setSeries(totalSeriesPayload.series);
          }
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load Portfolio Dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [debugMode]);

  const chartData = useMemo(() => {
    const rows = series
      .filter((point) => typeof point.market_value === "number")
      .map((point) => [point.as_of_date, point.market_value as number]);
    return [["Date", "Market Value"], ...rows];
  }, [series]);

  const dataState = useMemo(() => {
    if (!overview) return "unavailable";
    const warnings = overview.total.major_warnings;
    if (warnings.includes("data_unavailable")) return "unavailable";
    if (warnings.includes("data_partial")) return "partial";
    return "full";
  }, [overview]);

  const toggleDebug = () => {
    const url = new URL(window.location.href);
    if (debugMode) {
      url.searchParams.delete("debug");
    } else {
      url.searchParams.set("debug", "1");
    }
    window.location.href = url.toString();
  };

  return (
    <div className="dashboard">
      <Header />
      <main className="dashboard-content portfolio-dashboard-page">
        <section className="portfolio-top-header">
          <div>
            <h1>Portfolio Dashboard</h1>
            <p>As of: {overview?.as_of_date ?? "Unavailable"}</p>
          </div>
          <div className="portfolio-controls">
            <button type="button" onClick={toggleDebug} className="portfolio-debug-btn">
              {debugMode ? "Disable debug" : "Enable debug"}
            </button>
          </div>
        </section>

        {loading && <div className="portfolio-state">Loading Portfolio Dashboard…</div>}
        {error && <div className="portfolio-state portfolio-state-error">Error: {error}</div>}

        {!loading && !error && !overview && (
          <div className="portfolio-state portfolio-state-error">Portfolio Dashboard unavailable.</div>
        )}

        {!loading && !error && overview && (
          <>
            <section className="portfolio-status-strip">
              <span className={`status-badge tone-${toneForStatus(overview.total.allocation_plan_status)}`}>Allocation: {labelizeStatus(overview.total.allocation_plan_status)}</span>
              <span className={`status-badge tone-${toneForStatus(overview.total.total_risk_status)}`}>Risk: {labelizeStatus(overview.total.total_risk_status)}</span>
              <span className={`status-badge tone-${toneForStatus(overview.total.total_hedge_signal)}`}>Hedge: {labelizeStatus(overview.total.total_hedge_signal)}</span>
              <span className={`status-badge tone-${toneForStatus(overview.total.dry_powder_status)}`}>Dry powder: {labelizeStatus(overview.total.dry_powder_status)}</span>
              <span className={`status-badge tone-${dataState === "full" ? "positive" : dataState === "partial" ? "caution" : "negative"}`}>Data state: {dataState}</span>
            </section>

            <section className="portfolio-summary-grid">
              <article className="portfolio-panel">
                <h2>Total Portfolio</h2>
                <ul>
                  <li><strong>Total market value:</strong> {formatCurrency(overview.total.market_value)}</li>
                  <li><strong>Allocation plan status:</strong> {labelizeStatus(overview.total.allocation_plan_status)}</li>
                  <li><strong>Total risk score:</strong> {formatNumber(overview.total.total_risk_score)}</li>
                  <li><strong>Total risk status:</strong> {labelizeStatus(overview.total.total_risk_status)}</li>
                  <li><strong>Total hedge signal:</strong> {labelizeStatus(overview.total.total_hedge_signal)}</li>
                  <li><strong>Dry powder status:</strong> {labelizeStatus(overview.total.dry_powder_status)}</li>
                  <li><strong>Opportunistic weight:</strong> {formatPct(overview.total.opportunistic_weight_pct)}</li>
                  <li><strong>Required min dry powder:</strong> {formatPct(overview.total.required_min_dry_powder_pct)}</li>
                  <li><strong>Included portfolio count:</strong> {overview.total.included_portfolio_count}</li>
                </ul>
              </article>

              <article className="portfolio-panel">
                <h2>Major warnings</h2>
                {overview.total.major_warnings.length > 0 ? (
                  <div className="warning-list">
                    {overview.total.major_warnings.map((warning) => (
                      <span key={warning} className="warning-pill">{labelizeStatus(warning)}</span>
                    ))}
                  </div>
                ) : (
                  <p className="calm-state">No major warnings.</p>
                )}
              </article>
            </section>

            <section className="portfolio-panel">
              <h2>Performance</h2>
              <div className="performance-grid">
                <div>
                  <strong>Daily return:</strong> {formatPct(overview.performance.daily_return_pct)}
                </div>
                <div>
                  <strong>Cumulative return:</strong> {formatPct(overview.performance.cumulative_return_pct)}
                </div>
                <div>
                  <strong>Drawdown:</strong> {formatPct(overview.performance.drawdown_pct)}
                </div>
                <div>
                  <strong>History available days:</strong> {overview.performance.history_available_days}
                </div>
                <div>
                  <strong>Data quality:</strong> {overview.performance.data_quality ?? "Unavailable"}
                </div>
              </div>
              {chartData.length > 2 ? (
                <div className="portfolio-chart-wrap">
                  <Chart
                    chartType="LineChart"
                    width="100%"
                    height="280px"
                    data={chartData}
                    options={{
                      legend: { position: "none" },
                      chartArea: { width: "85%", height: "70%" },
                      hAxis: { slantedText: true, slantedTextAngle: 45 },
                    }}
                  />
                </div>
              ) : (
                <p className="calm-state">Total portfolio history unavailable.</p>
              )}
            </section>

            <section className="portfolio-panel">
              <h2>Portfolios</h2>
              <div className="portfolio-list">
                {overview.portfolios.map((portfolio) => (
                  <article key={portfolio.portfolio_id} className="portfolio-card">
                    <div className="portfolio-card-header">
                      <h3>{portfolio.portfolio_name}</h3>
                      <div className="portfolio-badges">
                        <span className="status-badge tone-neutral">{portfolio.portfolio_type || "Unavailable"}</span>
                        {portfolio.signal_completeness !== "full" && (
                          <span className={`status-badge tone-${portfolio.signal_completeness === "partial" ? "caution" : "muted"}`}>
                            Signal: {labelizeStatus(portfolio.signal_completeness)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="portfolio-card-grid">
                      <div><strong>Market value:</strong> {formatCurrency(portfolio.market_value)}</div>
                      <div><strong>Actual weight:</strong> {formatPct(portfolio.actual_weight_pct)}</div>
                      <div><strong>Target / min / max:</strong> {formatPct(portfolio.target_weight_pct)} / {formatPct(portfolio.min_weight_pct)} / {formatPct(portfolio.max_weight_pct)}</div>
                      <div><strong>Weight status:</strong> <span className={`status-badge tone-${toneForStatus(portfolio.weight_status)}`}>{labelizeStatus(portfolio.weight_status)}</span></div>
                      <div><strong>Rebalance status:</strong> {labelizeStatus(portfolio.rebalance_status)}</div>
                      <div><strong>Trend status:</strong> <span className={`status-badge tone-${toneForStatus(portfolio.trend_status)}`}>{labelizeStatus(portfolio.trend_status)}</span></div>
                      <div><strong>Relative strength:</strong> {labelizeStatus(portfolio.relative_strength_bucket)}</div>
                      <div><strong>Risk score:</strong> {formatNumber(portfolio.risk_score)}</div>
                      <div><strong>Risk status:</strong> <span className={`status-badge tone-${toneForStatus(portfolio.risk_status)}`}>{labelizeStatus(portfolio.risk_status)}</span></div>
                      <div><strong>Hedge status:</strong> <span className={`status-badge tone-${toneForStatus(portfolio.hedge_status)}`}>{labelizeStatus(portfolio.hedge_status)}</span></div>
                    </div>

                    <div className="portfolio-alerts">
                      {portfolio.risk_mismatch_flag ? <span className="warning-pill">Risk mismatch flag</span> : null}
                      {portfolio.suggested_hedge_type ? <span className="warning-pill">Suggested hedge: {portfolio.suggested_hedge_type}</span> : null}
                      {portfolio.data_quality_flags && Object.entries(portfolio.data_quality_flags)
                        .filter(([, value]) => value)
                        .map(([flag]) => <span key={flag} className="warning-pill">{labelizeStatus(flag)}</span>)}
                    </div>

                    <details>
                      <summary>Details</summary>
                      <div className="portfolio-detail-grid">
                        <div><strong>20d return:</strong> {formatPct(portfolio.return_20d)}</div>
                        <div><strong>65d return:</strong> {formatPct(portfolio.return_65d)}</div>
                        <div><strong>200d return:</strong> {formatPct(portfolio.return_200d)}</div>
                        <div><strong>Annualized vol 65d:</strong> {formatPct(portfolio.annualized_vol_65d)}</div>
                        <div><strong>Current drawdown:</strong> {formatPct(portfolio.current_drawdown_pct)}</div>
                        <div><strong>Top holding weight:</strong> {formatPct(portfolio.top_holding_weight_pct)}</div>
                        <div><strong>Hedge policy applied:</strong> {labelizeStatus(portfolio.hedge_policy_applied)}</div>
                        <div><strong>Data quality flags:</strong> {portfolio.data_quality_flags ? Object.entries(portfolio.data_quality_flags).filter(([, v]) => v).map(([k]) => k).join(", ") || "none" : "Unavailable"}</div>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            </section>

            {debugMode && (
              <section className="portfolio-panel">
                <details>
                  <summary>Debug payload</summary>
                  <pre className="portfolio-debug-json">{JSON.stringify(overview.debug ?? { message: "No debug payload" }, null, 2)}</pre>
                </details>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
