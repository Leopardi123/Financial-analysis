import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/portfolio-dashboard.css";
import PortfolioPositionsAdmin from "./PortfolioPositionsAdmin";

type NullableNumber = number | null;

type SetupState = "no_config" | "configured_no_data" | "configured_positions_no_snapshot" | "partial" | "live";

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
  suggested_hedge_type: string | null;
  hedge_status: string | null;
  hedge_policy_applied: string | null;
  signal_completeness: string | null;
  valuation_state?: string | null;
  positions_found_count?: NullableNumber;
  positions_active_count?: NullableNumber;
  positions_valued_count?: NullableNumber;
  positions_unvalued_count?: NullableNumber;
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
    included_portfolio_count: number;
    major_warnings: string[];
    major_warning_details?: Array<{
      code: string;
      title: string;
      detail: string;
      severity: "warning" | "critical";
      portfolio_id?: string;
    }>;
  };
  performance: {
    daily_return_pct: NullableNumber;
    cumulative_return_pct: NullableNumber;
    drawdown_pct: NullableNumber;
    history_available_days: number;
  };
  portfolios: PortfolioRecord[];
  setup?: { setup_state: SetupState };
  debug?: unknown;
  error?: string | { type?: string; message?: string; debugMessage?: string };
};

type AdminValidateResponse = {
  ok: boolean;
  global: { status: string; sum: number; deviation: number };
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
  allowed_hedge_types: string[];
  hedge_purposes: string[];
  max_hedge_pct: string;
};

const PORTFOLIO_TYPES = [
  { value: "stable_income", label: "Stabil utdelningsportfölj" },
  { value: "growth", label: "Tillväxtportfölj" },
  { value: "commodity_majors", label: "Råvaror — majors/royalty" },
  { value: "commodity_junior", label: "Råvaror — junior/yolo" },
  { value: "opportunistic", label: "Opportunistisk / dry powder" },
];

const RISK_LEVELS = ["low", "medium", "high", "extreme"];
const REBALANCE_MODES = ["soft", "standard", "strict"];

const HEDGE_TYPE_OPTIONS = [
  { value: "index_put", label: "Index put" },
  { value: "index_short", label: "Index short" },
  { value: "inverse_etf", label: "Inverse ETF" },
  { value: "gold", label: "Gold" },
  { value: "cash", label: "Cash" },
  { value: "usd", label: "USD" },
  { value: "commodity_put", label: "Commodity put" },
  { value: "producer_pair_hedge", label: "Producer pair hedge" },
  { value: "no_direct_hedge_use_position_reduction", label: "No direct hedge (use position reduction)" },
];

const HEDGE_PURPOSE_OPTIONS = [
  { value: "market_drawdown", label: "Market drawdown" },
  { value: "cyclical_downturn", label: "Cyclical downturn" },
  { value: "inflation_shock", label: "Inflation shock" },
  { value: "deflationary_stress", label: "Deflationary stress" },
  { value: "usd_strength", label: "USD strength" },
  { value: "commodity_downturn", label: "Commodity downturn" },
  { value: "duration_risk", label: "Duration risk" },
];

const emptyForm: AdminFormState = {
  portfolio_id: "",
  portfolio_name: "",
  portfolio_type: "growth",
  active: true,
  visible_in_overview: true,
  included_in_total_portfolio: true,
  sort_order: "1",
  target_weight_pct: "",
  min_weight_pct: "",
  max_weight_pct: "",
  strategic_risk_level: "medium",
  hedging_allowed: true,
  rebalance_mode: "standard",
  role_description: "",
  long_term_purpose: "",
  notes: "",
  allowed_hedge_types: [],
  hedge_purposes: [],
  max_hedge_pct: "",
};

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function debugEnabled(): boolean {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function label(value: string | null): string {
  if (!value) return "Unavailable";
  return value.replace(/_/g, " ");
}

function formatPct(value: NullableNumber): string {
  return value === null ? "Unavailable" : `${value.toFixed(2)}%`;
}

function formatMoney(value: NullableNumber): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
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
    allowed_hedge_types: parseJsonArray(config.allowed_hedge_types_json),
    hedge_purposes: parseJsonArray(config.hedge_purpose_json),
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
    allowed_hedge_types_json: JSON.stringify(form.allowed_hedge_types),
    hedge_purpose_json: JSON.stringify(form.hedge_purposes),
    max_hedge_pct: form.max_hedge_pct.trim() === "" ? null : Number(form.max_hedge_pct),
  };
}

function nextPortfolioId(existing: PortfolioConfig[]): string {
  const ids = new Set(existing.map((item) => item.portfolio_id));
  let idx = 0;
  while (ids.has(`portf${idx}`)) idx += 1;
  return `portf${idx}`;
}

export default function PortfolioDashboardModule() {
  const [overview, setOverview] = useState<PortfolioOverviewResponse | null>(null);
  const [adminList, setAdminList] = useState<PortfolioConfig[]>([]);
  const [adminValidation, setAdminValidation] = useState<AdminValidateResponse | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({});
  const debugMode = debugEnabled();

  const loadAll = async () => {
    setLoading(true);
    const [overviewRes, adminRes, validateRes] = await Promise.all([
      fetch(`/api/portfolio/overview/latest${debugMode ? "?debug=1" : ""}`),
      fetch(`/api/portfolio/admin/list`),
      fetch(`/api/portfolio/admin/validate`),
    ]);

    const overviewJson = (await overviewRes.json()) as PortfolioOverviewResponse;
    const adminJson = (await adminRes.json()) as { ok: boolean; portfolios: PortfolioConfig[] };
    const validateJson = (await validateRes.json()) as AdminValidateResponse;

    if (!overviewRes.ok || !overviewJson.ok) {
      const errorMessage = typeof overviewJson.error === "string"
        ? overviewJson.error
        : (debugMode ? overviewJson.error?.debugMessage : overviewJson.error?.message);
      throw new Error(errorMessage ?? "Failed to load overview");
    }
    if (!adminRes.ok || !adminJson.ok) throw new Error("Failed to load portfolio admin list");
    if (!validateRes.ok || !validateJson.ok) throw new Error("Failed to load portfolio validation");

    setOverview(overviewJson);
    setAdminList(adminJson.portfolios);
    setAdminValidation(validateJson);
    setLoading(false);
  };

  useEffect(() => {
    void loadAll().catch((loadErr) => {
      setError(loadErr instanceof Error ? loadErr.message : "Failed to load portfolio dashboard");
      setLoading(false);
    });
  }, [debugMode]);

  const setupState = useMemo<SetupState>(() => {
    if (overview?.setup?.setup_state) return overview.setup.setup_state;
    if (adminList.length === 0) return "no_config";
    if (!overview?.portfolios.length) return "configured_no_data";
    return overview.total.major_warnings.includes("data_partial") ? "partial" : "live";
  }, [overview, adminList]);

  const onCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, portfolio_id: nextPortfolioId(adminList), sort_order: String(adminList.length + 1) });
    setShowAdmin(true);
    setShowAdvanced(false);
    setFormErrors([]);
    setFieldErrors({});
    setSaveMsg(null);
  };

  const onEdit = (config: PortfolioConfig) => {
    setEditingId(config.portfolio_id);
    setForm(formFromConfig(config));
    setShowAdmin(true);
    setShowAdvanced(false);
    setFormErrors([]);
    setFieldErrors({});
    setSaveMsg(null);
  };

  const toggleArrayValue = (field: "allowed_hedge_types" | "hedge_purposes", value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value) ? prev[field].filter((item) => item !== value) : [...prev[field], value],
    }));
  };

  const saveAdmin = async () => {
    setFormErrors([]);
    setFieldErrors({});
    setSaveMsg(null);
    const payload = formToPayload(form);
    const endpoint = editingId ? "/api/portfolio/admin/update" : "/api/portfolio/admin/create";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as {
      ok: boolean;
      error?: string | { type?: string; message?: string; fieldErrors?: Record<string, string>; formErrors?: string[] };
      errors?: string[];
    };
    if (!res.ok || !json.ok) {
      if (typeof json.error === "object" && json.error !== null) {
        const nextFieldErrors = json.error.fieldErrors ?? {};
        setFieldErrors(nextFieldErrors);
        setFormErrors(json.error.formErrors ?? [json.error.message ?? "Please correct the highlighted fields"]);
        const firstInvalidField = Object.keys(nextFieldErrors)[0];
        const firstInput = firstInvalidField ? fieldRefs.current[firstInvalidField] : null;
        if (firstInput) {
          firstInput.scrollIntoView({ behavior: "smooth", block: "center" });
          firstInput.focus();
        }
      } else {
        setFormErrors(json.errors ?? [typeof json.error === "string" ? json.error : "Save failed"]);
      }
      return;
    }

    setFieldErrors({});
    setSaveMsg(editingId ? "Portfolio updated." : "Portfolio created.");
    await loadAll();
  };

  const inputClassName = (field: string) => (fieldErrors[field] ? "field-invalid" : "");
  const renderFieldError = (field: string) => fieldErrors[field]
    ? <span className="field-error-text">{fieldErrors[field]}</span>
    : null;
  const warningItems: Array<{ code: string; title: string; detail: string; severity: "warning" | "critical"; portfolio_id?: string }> = overview?.total.major_warning_details?.length
    ? overview.total.major_warning_details
    : (overview?.total.major_warnings ?? []).map((warning) => ({
      code: warning,
      title: label(warning),
      detail: "",
      severity: "warning" as const,
    }));

  return (
    <div className="portfolio-inline-module">
      <div className="portfolio-inline-header">
        <div>
          <h3>Portfolio Dashboard</h3>
          <p className="bread">Inline portfolio overview and admin controls.</p>
        </div>
        <div className="portfolio-actions-row">
          <button type="button" onClick={onCreate}>Create portfolio</button>
          <button type="button" onClick={() => setShowAdmin((current) => !current)}>Manage portfolios</button>
        </div>
      </div>

      {loading && <p className="bread">Loading portfolio dashboard…</p>}
      {error && <p className="portfolio-error">{error}</p>}

      {!loading && !error && setupState === "no_config" && (
        <div className="portfolio-empty-state">
          <h4>No portfolios configured yet.</h4>
          <p>Create portfolios in Portfolio Admin to begin.</p>
        </div>
      )}

      {!loading && !error && setupState === "configured_no_data" && (
        <div className="portfolio-empty-state">
          <h4>Portfolios configured, awaiting holdings / snapshot data.</h4>
          <div className="portfolio-config-list">
            {adminList.map((item) => (
              <div key={item.portfolio_id} className="portfolio-config-row">
                <strong>{item.portfolio_name}</strong> · {item.portfolio_type} · target {item.target_weight_pct.toFixed(1)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && (setupState === "configured_positions_no_snapshot" || setupState === "partial" || setupState === "live") && overview && (
        <>
          <div className="portfolio-kpi-row">
            <span>As of: {overview.as_of_date ?? "Unavailable"}</span>
            <span>Total market value: {formatMoney(overview.total.market_value)}</span>
            <span>Included portfolios: {overview.total.included_portfolio_count}</span>
          </div>
          <div className="portfolio-summary-grid">
            <div className="portfolio-panel">
              <h4>Overview</h4>
              <div>Allocation: {label(overview.total.allocation_plan_status)}</div>
              <div>Risk: {label(overview.total.total_risk_status)} ({overview.total.total_risk_score ?? "n/a"})</div>
              <div>Hedge: {label(overview.total.total_hedge_signal)}</div>
              <div>Dry powder: {label(overview.total.dry_powder_status)}</div>
              <div>Daily return: {formatPct(overview.performance.daily_return_pct)}</div>
            </div>
            <div className="portfolio-panel">
              <h4>Major warnings</h4>
              {overview.total.major_warnings.length > 0
                ? (
                  <div className="warning-list">
                    {warningItems.map((warning) => (
                      <details key={`${warning.code}-${warning.portfolio_id ?? "global"}`} className={`warning-card warning-${warning.severity}`}>
                        <summary>
                          <span className="warning-pill">{warning.title}</span>
                        </summary>
                        <p>{warning.detail || "No additional detail available."}</p>
                      </details>
                    ))}
                  </div>
                )
                : <p className="bread">No major warnings.</p>}
            </div>
          </div>

          <div className="portfolio-list">
            {overview.portfolios.map((portfolio) => (
              <details key={portfolio.portfolio_id} className="portfolio-card">
                <summary>{portfolio.portfolio_name} ({portfolio.portfolio_type})</summary>
                <div className="portfolio-card-grid">
                  <div>Market value: {formatMoney(portfolio.market_value)}</div>
                  <div>Actual weight: {formatPct(portfolio.actual_weight_pct)}</div>
                  <div>Target / min / max: {formatPct(portfolio.target_weight_pct)} / {formatPct(portfolio.min_weight_pct)} / {formatPct(portfolio.max_weight_pct)}</div>
                  <div>Weight status: {label(portfolio.weight_status)}</div>
                  <div>Trend status: {label(portfolio.trend_status)}</div>
                  <div>Risk status: {label(portfolio.risk_status)}</div>
                  <div>Hedge status: {label(portfolio.hedge_status)}</div>
                  <div>Hedge policy: {label(portfolio.hedge_policy_applied)}</div>
                  <div>Signal completeness: {label(portfolio.signal_completeness)}</div>
                  {portfolio.valuation_state && <div>Valuation state: {label(portfolio.valuation_state)}</div>}
                  {portfolio.positions_active_count && portfolio.positions_valued_count === 0 && (
                    <div>Positions exist but current market value could not be resolved.</div>
                  )}
                  {portfolio.suggested_hedge_type && <div>Suggested hedge: {portfolio.suggested_hedge_type}</div>}
                </div>
              </details>
            ))}
          </div>
        </>
      )}

      {!loading && !error && adminList.length > 0 && (
        <PortfolioPositionsAdmin portfolios={adminList.map((item) => ({
          portfolio_id: item.portfolio_id,
          portfolio_name: item.portfolio_name,
          portfolio_type: item.portfolio_type,
        }))} />
      )}

      <details className="portfolio-admin-wrap" open={showAdmin}>
        <summary>Portfolio Admin</summary>

        {adminValidation && (
          <p className="bread">Global target weight validation: <strong>{adminValidation.global.status}</strong> ({adminValidation.global.sum.toFixed(2)}%)</p>
        )}

        <div className="portfolio-admin-list">
          {adminList.map((item) => (
            <div key={item.portfolio_id} className="portfolio-admin-row">
              <div>
                <strong>{item.portfolio_name}</strong> <span>({item.portfolio_id})</span>
              </div>
              <button type="button" onClick={() => onEdit(item)}>Edit</button>
            </div>
          ))}
        </div>

        <div className="portfolio-admin-form">
          <h4>{editingId ? `Edit ${editingId}` : "Create portfolio"}</h4>

          <section>
            <h5>Basic identity</h5>
            <div className="portfolio-form-grid">
              <label>Portfolio ID *
                <input
                  ref={(el) => { fieldRefs.current.portfolio_id = el; }}
                  className={inputClassName("portfolio_id")}
                  value={form.portfolio_id}
                  disabled
                  onChange={(e) => setForm((prev) => ({ ...prev, portfolio_id: e.target.value }))}
                />
                {renderFieldError("portfolio_id")}
              </label>
              <label>Portfolio name *
                <input ref={(el) => { fieldRefs.current.portfolio_name = el; }} className={inputClassName("portfolio_name")} value={form.portfolio_name} onChange={(e) => setForm((prev) => ({ ...prev, portfolio_name: e.target.value }))} />
                {renderFieldError("portfolio_name")}
              </label>
              <label>Portfolio type *
                <select ref={(el) => { fieldRefs.current.portfolio_type = el; }} className={inputClassName("portfolio_type")} value={form.portfolio_type} onChange={(e) => setForm((prev) => ({ ...prev, portfolio_type: e.target.value }))}>
                  {PORTFOLIO_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                {renderFieldError("portfolio_type")}
              </label>
              <label>Sort order *
                <input ref={(el) => { fieldRefs.current.sort_order = el; }} className={inputClassName("sort_order")} value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))} />
                {renderFieldError("sort_order")}
              </label>
            </div>
          </section>

          <section>
            <h5>Allocation</h5>
            <div className="portfolio-form-grid">
              <label>Target weight % *<input ref={(el) => { fieldRefs.current.target_weight_pct = el; }} className={inputClassName("target_weight_pct")} value={form.target_weight_pct} onChange={(e) => setForm((prev) => ({ ...prev, target_weight_pct: e.target.value }))} />{renderFieldError("target_weight_pct")}</label>
              <label>Min weight % *<input ref={(el) => { fieldRefs.current.min_weight_pct = el; }} className={inputClassName("min_weight_pct")} value={form.min_weight_pct} onChange={(e) => setForm((prev) => ({ ...prev, min_weight_pct: e.target.value }))} />{renderFieldError("min_weight_pct")}</label>
              <label>Max weight % *<input ref={(el) => { fieldRefs.current.max_weight_pct = el; }} className={inputClassName("max_weight_pct")} value={form.max_weight_pct} onChange={(e) => setForm((prev) => ({ ...prev, max_weight_pct: e.target.value }))} />{renderFieldError("max_weight_pct")}</label>
            </div>
          </section>

          <section>
            <h5>Strategy</h5>
            <div className="portfolio-form-grid">
              <label>Strategic risk level *
                <select ref={(el) => { fieldRefs.current.strategic_risk_level = el; }} className={inputClassName("strategic_risk_level")} value={form.strategic_risk_level} onChange={(e) => setForm((prev) => ({ ...prev, strategic_risk_level: e.target.value }))}>
                  {RISK_LEVELS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                </select>
                {renderFieldError("strategic_risk_level")}
              </label>
              <label>Rebalance mode *
                <select ref={(el) => { fieldRefs.current.rebalance_mode = el; }} className={inputClassName("rebalance_mode")} value={form.rebalance_mode} onChange={(e) => setForm((prev) => ({ ...prev, rebalance_mode: e.target.value }))}>
                  {REBALANCE_MODES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                </select>
                {renderFieldError("rebalance_mode")}
              </label>
              <label>Role description <span className="optional-tag">Optional</span>
                <input ref={(el) => { fieldRefs.current.role_description = el; }} className={inputClassName("role_description")} value={form.role_description} onChange={(e) => setForm((prev) => ({ ...prev, role_description: e.target.value }))} placeholder="What is this portfolio's role?" />
                {renderFieldError("role_description")}
              </label>
              <label>Long-term purpose <span className="optional-tag">Optional</span>
                <input value={form.long_term_purpose} onChange={(e) => setForm((prev) => ({ ...prev, long_term_purpose: e.target.value }))} placeholder="Optional" />
              </label>
            </div>
          </section>

          <section>
            <h5>Visibility / inclusion</h5>
            <div className="portfolio-form-toggles">
              <label><input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} /> active</label>
              <label><input type="checkbox" checked={form.visible_in_overview} onChange={(e) => setForm((prev) => ({ ...prev, visible_in_overview: e.target.checked }))} /> visible in overview</label>
              <label><input type="checkbox" checked={form.included_in_total_portfolio} onChange={(e) => setForm((prev) => ({ ...prev, included_in_total_portfolio: e.target.checked }))} /> included in total portfolio</label>
            </div>
          </section>

          <section>
            <h5>Hedge settings</h5>
            <div className="portfolio-form-toggles">
              <label><input type="checkbox" checked={form.hedging_allowed} onChange={(e) => setForm((prev) => ({ ...prev, hedging_allowed: e.target.checked }))} /> hedging allowed</label>
            </div>
            <div className={`multi-select-block ${!form.hedging_allowed ? "disabled" : ""}`}>
              <p>Allowed hedge types</p>
              {renderFieldError("allowed_hedge_types_json")}
              <div className="chip-grid">
                {HEDGE_TYPE_OPTIONS.map((option) => (
                  <label key={option.value} className="chip-checkbox">
                    <input
                      type="checkbox"
                      disabled={!form.hedging_allowed}
                      checked={form.allowed_hedge_types.includes(option.value)}
                      onChange={() => toggleArrayValue("allowed_hedge_types", option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div className={`multi-select-block ${!form.hedging_allowed ? "disabled" : ""}`}>
              <p>Hedge purpose</p>
              {renderFieldError("hedge_purpose_json")}
              <div className="chip-grid">
                {HEDGE_PURPOSE_OPTIONS.map((option) => (
                  <label key={option.value} className="chip-checkbox">
                    <input
                      type="checkbox"
                      disabled={!form.hedging_allowed}
                      checked={form.hedge_purposes.includes(option.value)}
                      onChange={() => toggleArrayValue("hedge_purposes", option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <label>Max hedge % <span className="optional-tag">Optional</span>
              <input
                ref={(el) => { fieldRefs.current.max_hedge_pct = el; }}
                className={inputClassName("max_hedge_pct")}
                type="number"
                inputMode="decimal"
                step="0.1"
                value={form.max_hedge_pct}
                disabled={!form.hedging_allowed}
                placeholder={form.hedging_allowed ? "Optional" : "Disabled when hedging is off"}
                onChange={(e) => setForm((prev) => ({ ...prev, max_hedge_pct: e.target.value }))}
              />
              {renderFieldError("max_hedge_pct")}
            </label>
          </section>

          <details open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}>
            <summary>Optional notes / advanced</summary>
            <label>Notes <span className="optional-tag">Optional</span>
              <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional notes" />
            </label>
          </details>

          {formErrors.length > 0 && <div className="portfolio-error">{formErrors.map((item) => <div key={item}>{item}</div>)}</div>}
          {saveMsg && <p className="bread">{saveMsg}</p>}

          <div className="portfolio-actions-row">
            <button type="button" onClick={saveAdmin}>{editingId ? "Save changes" : "Create portfolio"}</button>
            <button type="button" onClick={onCreate}>Reset for new</button>
          </div>
        </div>
      </details>

      {debugMode && (
        <details className="portfolio-debug-wrap">
          <summary>Debug payload</summary>
          <pre>{JSON.stringify({ setupState, adminCount: adminList.length, debug: overview?.debug ?? null }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
