import { useEffect, useMemo, useState } from "react";
import "../styles/portfolio-dashboard.css";

type NullableNumber = number | null;

type SetupState = "no_config" | "configured_no_data" | "partial" | "live";

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

type PortfolioConfig = {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_type: string;
  active: boolean;
  visible_in_overview: boolean;
  included_in_total_portfolio: boolean;
  sort_order: number;
  target_weight_pct: number;
  min_weight_pct: number;
  max_weight_pct: number;
  strategic_risk_level: string;
  hedging_allowed: boolean;
  rebalance_mode: string;
  role_description: string;
  long_term_purpose: string | null;
  notes: string | null;
  allowed_hedge_types_json: string;
  hedge_purpose_json: string;
  max_hedge_pct: number | null;
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
  setup?: {
    setup_state: SetupState;
    portfolios_configured_count: number;
    portfolios_with_snapshots_count: number;
    history_available_days: number;
  };
  debug?: unknown;
  error?: string;
};

type TotalSeriesResponse = {
  ok: boolean;
  series: Array<{ as_of_date: string; market_value: NullableNumber }>;
};

type AdminListResponse = {
  ok: boolean;
  portfolios: PortfolioConfig[];
};

type AdminValidateResponse = {
  ok: boolean;
  global: { status: string; sum: number; deviation: number };
  perPortfolio: Array<{ portfolio_id: string; errors: string[] }>;
};

type AdminFormState = {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_type: string;
  active: boolean;
  visible_in_overview: boolean;
  included_in_total_portfolio: boolean;
  sort_order: string;
  target_weight_pct: string;
  min_weight_pct: string;
  max_weight_pct: string;
  strategic_risk_level: string;
  hedging_allowed: boolean;
  rebalance_mode: string;
  role_description: string;
  long_term_purpose: string;
  notes: string;
  allowed_hedge_types_json: string;
  hedge_purpose_json: string;
  max_hedge_pct: string;
};

const emptyForm: AdminFormState = {
  portfolio_id: "",
  portfolio_name: "",
  portfolio_type: "growth",
  active: true,
  visible_in_overview: true,
  included_in_total_portfolio: true,
  sort_order: "1",
  target_weight_pct: "0",
  min_weight_pct: "0",
  max_weight_pct: "100",
  strategic_risk_level: "medium",
  hedging_allowed: true,
  rebalance_mode: "standard",
  role_description: "",
  long_term_purpose: "",
  notes: "",
  allowed_hedge_types_json: "[]",
  hedge_purpose_json: "[]",
  max_hedge_pct: "",
};

function debugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function formatPct(value: NullableNumber): string {
  return value === null ? "Unavailable" : `${value.toFixed(2)}%`;
}

function formatMoney(value: NullableNumber): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function label(value: string | null): string {
  if (!value) return "Unavailable";
  return value.replace(/_/g, " ");
}

function formFromConfig(config: PortfolioConfig): AdminFormState {
  return {
    portfolio_id: config.portfolio_id,
    portfolio_name: config.portfolio_name,
    portfolio_type: config.portfolio_type,
    active: config.active,
    visible_in_overview: config.visible_in_overview,
    included_in_total_portfolio: config.included_in_total_portfolio,
    sort_order: String(config.sort_order),
    target_weight_pct: String(config.target_weight_pct),
    min_weight_pct: String(config.min_weight_pct),
    max_weight_pct: String(config.max_weight_pct),
    strategic_risk_level: config.strategic_risk_level,
    hedging_allowed: config.hedging_allowed,
    rebalance_mode: config.rebalance_mode,
    role_description: config.role_description,
    long_term_purpose: config.long_term_purpose ?? "",
    notes: config.notes ?? "",
    allowed_hedge_types_json: config.allowed_hedge_types_json,
    hedge_purpose_json: config.hedge_purpose_json,
    max_hedge_pct: config.max_hedge_pct === null ? "" : String(config.max_hedge_pct),
  };
}

function formToPayload(form: AdminFormState) {
  return {
    portfolio_id: form.portfolio_id.trim(),
    portfolio_name: form.portfolio_name.trim(),
    portfolio_type: form.portfolio_type,
    active: form.active,
    visible_in_overview: form.visible_in_overview,
    included_in_total_portfolio: form.included_in_total_portfolio,
    sort_order: Number(form.sort_order),
    target_weight_pct: Number(form.target_weight_pct),
    min_weight_pct: Number(form.min_weight_pct),
    max_weight_pct: Number(form.max_weight_pct),
    strategic_risk_level: form.strategic_risk_level,
    hedging_allowed: form.hedging_allowed,
    rebalance_mode: form.rebalance_mode,
    role_description: form.role_description.trim(),
    long_term_purpose: form.long_term_purpose.trim() || null,
    notes: form.notes.trim() || null,
    allowed_hedge_types_json: form.allowed_hedge_types_json.trim(),
    hedge_purpose_json: form.hedge_purpose_json.trim(),
    max_hedge_pct: form.max_hedge_pct.trim() === "" ? null : Number(form.max_hedge_pct),
  };
}

export default function PortfolioDashboardModule() {
  const [overview, setOverview] = useState<PortfolioOverviewResponse | null>(null);
  const [series, setSeries] = useState<TotalSeriesResponse["series"]>([]);
  const [adminList, setAdminList] = useState<PortfolioConfig[]>([]);
  const [adminValidation, setAdminValidation] = useState<AdminValidateResponse | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const debugMode = debugEnabled();

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    const [overviewRes, adminRes, validateRes] = await Promise.all([
      fetch(`/api/portfolio/overview/latest${debugMode ? "?debug=1" : ""}`),
      fetch(`/api/portfolio/admin/list${debugMode ? "?debug=1" : ""}`),
      fetch(`/api/portfolio/admin/validate${debugMode ? "?debug=1" : ""}`),
    ]);
    const overviewJson = (await overviewRes.json()) as PortfolioOverviewResponse;
    const adminJson = (await adminRes.json()) as AdminListResponse;
    const validateJson = (await validateRes.json()) as AdminValidateResponse;
    if (!overviewRes.ok || !overviewJson.ok) throw new Error(overviewJson.error ?? "Failed to load overview");
    if (!adminRes.ok || !adminJson.ok) throw new Error("Failed to load portfolio admin list");
    if (!validateRes.ok || !validateJson.ok) throw new Error("Failed to load validation");

    setOverview(overviewJson);
    setAdminList(adminJson.portfolios);
    setAdminValidation(validateJson);

    if (overviewJson.performance.history_available_days > 1) {
      const totalSeriesRes = await fetch(`/api/portfolio/history/series/total${debugMode ? "?debug=1" : ""}`);
      const totalSeriesJson = (await totalSeriesRes.json()) as TotalSeriesResponse;
      if (totalSeriesRes.ok && totalSeriesJson.ok) {
        setSeries(totalSeriesJson.series);
      } else {
        setSeries([]);
      }
    } else {
      setSeries([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadAll().catch((loadErr) => {
      setError(loadErr instanceof Error ? loadErr.message : "Failed to load portfolio dashboard");
      setLoading(false);
    });
  }, [debugMode]);

  const setupState: SetupState = useMemo(() => {
    if (overview?.setup?.setup_state) return overview.setup.setup_state;
    if (adminList.length === 0) return "no_config";
    if (overview?.portfolios.length) {
      if (overview.total.major_warnings.includes("data_partial")) return "partial";
      if (overview.total.major_warnings.includes("data_unavailable")) return "configured_no_data";
      return "live";
    }
    return "configured_no_data";
  }, [overview, adminList]);

  const chartPoints = useMemo(() => {
    if (!series.length) return "";
    const values = series.filter((item) => typeof item.market_value === "number").map((item) => item.market_value as number);
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    return values
      .map((value, idx) => {
        const x = (idx / (values.length - 1)) * 100;
        const y = max === min ? 30 : 60 - ((value - min) / (max - min)) * 50;
        return `${x},${y}`;
      })
      .join(" ");
  }, [series]);

  const onEdit = (config: PortfolioConfig) => {
    setEditingId(config.portfolio_id);
    setForm(formFromConfig(config));
    setShowAdmin(true);
    setFormErrors([]);
    setSaveMsg(null);
  };

  const onCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sort_order: String(adminList.length + 1) });
    setShowAdmin(true);
    setFormErrors([]);
    setSaveMsg(null);
  };

  const saveAdmin = async () => {
    setFormErrors([]);
    setSaveMsg(null);
    const payload = formToPayload(form);
    const endpoint = editingId ? "/api/portfolio/admin/update" : "/api/portfolio/admin/create";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { ok: boolean; errors?: string[]; error?: string };
    if (!res.ok || !json.ok) {
      setFormErrors(json.errors ?? [json.error ?? "Failed to save portfolio"]);
      return;
    }
    setSaveMsg(editingId ? "Portfolio updated." : "Portfolio created.");
    await loadAll();
  };

  const statusHeader = (
    <div className="portfolio-inline-header">
      <div>
        <h3>Portfolio Dashboard</h3>
        <p className="bread">Backend-driven portfolio overview, warnings and diagnostics.</p>
      </div>
      <div className="portfolio-actions-row">
        <button type="button" onClick={onCreate}>Create portfolio</button>
        <button type="button" onClick={() => setShowAdmin((current) => !current)}>Manage portfolios</button>
      </div>
    </div>
  );

  return (
    <div className="portfolio-inline-module">
      {statusHeader}
      {loading && <p className="bread">Loading portfolio dashboard…</p>}
      {error && <p className="bread portfolio-error">Error: {error}</p>}

      {!loading && !error && setupState === "no_config" && (
        <div className="portfolio-empty-state">
          <h4>No portfolios configured yet.</h4>
          <p>Create portfolios in Portfolio Admin to begin.</p>
          <p>After portfolios are created and populated, overview, warnings and debug will appear here.</p>
          <button type="button" onClick={onCreate}>Open Portfolio Admin</button>
        </div>
      )}

      {!loading && !error && setupState === "configured_no_data" && (
        <div className="portfolio-empty-state">
          <h4>Portfolios configured, awaiting holdings / snapshot data.</h4>
          <p>Admin config exists, but there is no usable snapshot/history data yet.</p>
          <div className="portfolio-config-list">
            {adminList.map((item) => (
              <div key={item.portfolio_id} className="portfolio-config-row">
                <strong>{item.portfolio_name}</strong> ({item.portfolio_type}) — target {item.target_weight_pct.toFixed(1)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && (setupState === "partial" || setupState === "live") && overview && (
        <div className="portfolio-live-wrap">
          <div className="portfolio-kpi-row">
            <span>As of: {overview.as_of_date ?? "Unavailable"}</span>
            <span>Total market value: {formatMoney(overview.total.market_value)}</span>
            <span>Included portfolios: {overview.total.included_portfolio_count}</span>
            <span>Data state: {setupState === "partial" ? "Partial portfolio data available" : "Portfolio overview active"}</span>
          </div>

          <div className="portfolio-summary-grid">
            <div className="portfolio-panel">
              <h4>Total summary</h4>
              <div><strong>Allocation:</strong> {label(overview.total.allocation_plan_status)}</div>
              <div><strong>Total risk score:</strong> {overview.total.total_risk_score ?? "Unavailable"}</div>
              <div><strong>Total risk status:</strong> {label(overview.total.total_risk_status)}</div>
              <div><strong>Total hedge signal:</strong> {label(overview.total.total_hedge_signal)}</div>
              <div><strong>Dry powder status:</strong> {label(overview.total.dry_powder_status)}</div>
            </div>
            <div className="portfolio-panel">
              <h4>Major warnings</h4>
              {overview.total.major_warnings.length ? overview.total.major_warnings.map((item) => (
                <span className="warning-pill" key={item}>{label(item)}</span>
              )) : <p className="bread">No major warnings.</p>}
            </div>
            <div className="portfolio-panel">
              <h4>Performance</h4>
              <div><strong>Daily:</strong> {formatPct(overview.performance.daily_return_pct)}</div>
              <div><strong>Cumulative:</strong> {formatPct(overview.performance.cumulative_return_pct)}</div>
              <div><strong>Drawdown:</strong> {formatPct(overview.performance.drawdown_pct)}</div>
              {chartPoints ? (
                <svg viewBox="0 0 100 65" className="portfolio-mini-chart" role="img" aria-label="Total portfolio chart">
                  <polyline points={chartPoints} fill="none" stroke="#0f766e" strokeWidth="2" />
                </svg>
              ) : (
                <p className="bread">History chart unavailable.</p>
              )}
            </div>
          </div>

          <div className="portfolio-list">
            {overview.portfolios.map((portfolio) => (
              <details key={portfolio.portfolio_id} className="portfolio-card" open={setupState === "partial"}>
                <summary>{portfolio.portfolio_name} ({portfolio.portfolio_type})</summary>
                <div className="portfolio-card-grid">
                  <div><strong>Market value:</strong> {formatMoney(portfolio.market_value)}</div>
                  <div><strong>Actual weight:</strong> {formatPct(portfolio.actual_weight_pct)}</div>
                  <div><strong>Target / min / max:</strong> {formatPct(portfolio.target_weight_pct)} / {formatPct(portfolio.min_weight_pct)} / {formatPct(portfolio.max_weight_pct)}</div>
                  <div><strong>Weight status:</strong> {label(portfolio.weight_status)}</div>
                  <div><strong>Rebalance status:</strong> {label(portfolio.rebalance_status)}</div>
                  <div><strong>Trend status:</strong> {label(portfolio.trend_status)}</div>
                  <div><strong>Relative strength:</strong> {label(portfolio.relative_strength_bucket)}</div>
                  <div><strong>Risk score:</strong> {portfolio.risk_score ?? "Unavailable"}</div>
                  <div><strong>Risk status:</strong> {label(portfolio.risk_status)}</div>
                  <div><strong>Hedge status:</strong> {label(portfolio.hedge_status)}</div>
                  <div><strong>20d / 65d / 200d:</strong> {formatPct(portfolio.return_20d)} / {formatPct(portfolio.return_65d)} / {formatPct(portfolio.return_200d)}</div>
                  <div><strong>Annualized vol 65d:</strong> {formatPct(portfolio.annualized_vol_65d)}</div>
                  <div><strong>Current drawdown:</strong> {formatPct(portfolio.current_drawdown_pct)}</div>
                  <div><strong>Top holding weight:</strong> {formatPct(portfolio.top_holding_weight_pct)}</div>
                  <div><strong>Hedge policy:</strong> {label(portfolio.hedge_policy_applied)}</div>
                  <div><strong>Signal completeness:</strong> {label(portfolio.signal_completeness)}</div>
                  {portfolio.suggested_hedge_type ? <div><strong>Suggested hedge:</strong> {portfolio.suggested_hedge_type}</div> : null}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      <details className="portfolio-admin-wrap" open={showAdmin}>
        <summary>Portfolio Admin</summary>
        {adminValidation && (
          <p className="bread">Global target weight validation: <strong>{adminValidation.global.status}</strong> (sum {adminValidation.global.sum.toFixed(2)}%)</p>
        )}

        <div className="portfolio-admin-list">
          {adminList.map((item) => (
            <div className="portfolio-admin-row" key={item.portfolio_id}>
              <div>
                <strong>{item.portfolio_name}</strong> <span>({item.portfolio_id})</span>
              </div>
              <button type="button" onClick={() => onEdit(item)}>Edit</button>
            </div>
          ))}
        </div>

        <div className="portfolio-admin-form">
          <h4>{editingId ? `Edit ${editingId}` : "Create portfolio"}</h4>
          <div className="portfolio-form-grid">
            <label>portfolio_id<input value={form.portfolio_id} onChange={(e) => setForm((p) => ({ ...p, portfolio_id: e.target.value }))} disabled={Boolean(editingId)} /></label>
            <label>portfolio_name<input value={form.portfolio_name} onChange={(e) => setForm((p) => ({ ...p, portfolio_name: e.target.value }))} /></label>
            <label>portfolio_type<input value={form.portfolio_type} onChange={(e) => setForm((p) => ({ ...p, portfolio_type: e.target.value }))} /></label>
            <label>sort_order<input value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))} /></label>
            <label>target_weight_pct<input value={form.target_weight_pct} onChange={(e) => setForm((p) => ({ ...p, target_weight_pct: e.target.value }))} /></label>
            <label>min_weight_pct<input value={form.min_weight_pct} onChange={(e) => setForm((p) => ({ ...p, min_weight_pct: e.target.value }))} /></label>
            <label>max_weight_pct<input value={form.max_weight_pct} onChange={(e) => setForm((p) => ({ ...p, max_weight_pct: e.target.value }))} /></label>
            <label>strategic_risk_level<input value={form.strategic_risk_level} onChange={(e) => setForm((p) => ({ ...p, strategic_risk_level: e.target.value }))} /></label>
            <label>rebalance_mode<input value={form.rebalance_mode} onChange={(e) => setForm((p) => ({ ...p, rebalance_mode: e.target.value }))} /></label>
            <label>max_hedge_pct<input value={form.max_hedge_pct} onChange={(e) => setForm((p) => ({ ...p, max_hedge_pct: e.target.value }))} /></label>
            <label>role_description<input value={form.role_description} onChange={(e) => setForm((p) => ({ ...p, role_description: e.target.value }))} /></label>
            <label>long_term_purpose<input value={form.long_term_purpose} onChange={(e) => setForm((p) => ({ ...p, long_term_purpose: e.target.value }))} /></label>
            <label>notes<input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            <label>allowed_hedge_types_json<input value={form.allowed_hedge_types_json} onChange={(e) => setForm((p) => ({ ...p, allowed_hedge_types_json: e.target.value }))} /></label>
            <label>hedge_purpose_json<input value={form.hedge_purpose_json} onChange={(e) => setForm((p) => ({ ...p, hedge_purpose_json: e.target.value }))} /></label>
          </div>
          <div className="portfolio-form-toggles">
            <label><input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} /> active</label>
            <label><input type="checkbox" checked={form.visible_in_overview} onChange={(e) => setForm((p) => ({ ...p, visible_in_overview: e.target.checked }))} /> visible_in_overview</label>
            <label><input type="checkbox" checked={form.included_in_total_portfolio} onChange={(e) => setForm((p) => ({ ...p, included_in_total_portfolio: e.target.checked }))} /> included_in_total_portfolio</label>
            <label><input type="checkbox" checked={form.hedging_allowed} onChange={(e) => setForm((p) => ({ ...p, hedging_allowed: e.target.checked }))} /> hedging_allowed</label>
          </div>
          {formErrors.length > 0 && <div className="portfolio-error">{formErrors.map((item) => <div key={item}>{item}</div>)}</div>}
          {saveMsg && <p className="bread">{saveMsg}</p>}
          <div className="portfolio-actions-row">
            <button type="button" onClick={saveAdmin}>{editingId ? "Save changes" : "Create portfolio"}</button>
            <button type="button" onClick={onCreate}>Reset for new</button>
          </div>
          <p className="bread">Next step: after config creation, add holdings/positions via ingest/snapshot pipeline to populate metrics and history.</p>
        </div>
      </details>

      {debugMode && (
        <details className="portfolio-debug-wrap">
          <summary>Debug payload</summary>
          <pre>{JSON.stringify({ setupState, adminCount: adminList.length, overviewDebug: overview?.debug ?? null }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
