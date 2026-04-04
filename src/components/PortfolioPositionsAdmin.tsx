import { useEffect, useMemo, useState } from "react";
import CompanyPicker, { type CompanyOption } from "./CompanyPicker";
import { fetchUniverseSymbols } from "../lib/client/companyUniverse.ts";

type PortfolioConfig = { portfolio_id: string; portfolio_name: string; portfolio_type: string };
type PositionRow = {
  id: number;
  portfolio_id: string;
  symbol: string;
  display_name: string | null;
  company_id: number | null;
  shares: number;
  avg_cost: number | null;
  manual_price: number | null;
  entry_date: string | null;
  asset_type: string;
  thesis: string | null;
  notes: string | null;
  inferred_sector_id: number | null;
  inferred_subsector_id: number | null;
  inferred_commodity_id: string | null;
  manual_sector_id: number | null;
  manual_subsector_id: number | null;
  manual_commodity_id: string | null;
  final_sector_id: number | null;
  final_subsector_id: number | null;
  final_commodity_id: string | null;
  mapping_source: "inherited" | "portfolio_override" | "portfolio_completed";
  mapping_override_active: boolean;
  active_position: boolean;
};

type FormState = {
  id: number | null;
  portfolio_id: string;
  symbol: string;
  display_name: string;
  company_id: number | null;
  shares: string;
  avg_cost: string;
  manual_price: string;
  entry_date: string;
  asset_type: string;
  thesis: string;
  notes: string;
  mapping_override_active: boolean;
  manual_sector_id: string;
  manual_subsector_id: string;
  manual_commodity_id: string;
  mapping_source: "inherited" | "portfolio_override" | "portfolio_completed";
};

const EMPTY_FORM: FormState = {
  id: null,
  portfolio_id: "",
  symbol: "",
  display_name: "",
  company_id: null,
  shares: "",
  avg_cost: "",
  manual_price: "",
  entry_date: "",
  asset_type: "major",
  thesis: "",
  notes: "",
  mapping_override_active: false,
  manual_sector_id: "",
  manual_subsector_id: "",
  manual_commodity_id: "",
  mapping_source: "inherited",
};

const ASSET_TYPE_OPTIONS = [
  ["major", "Major"],
  ["royalty", "Royalty"],
  ["junior", "Junior"],
  ["growth", "Growth"],
  ["defensive", "Defensive"],
  ["cash_proxy", "Cash proxy"],
];

const COMMODITY_OPTIONS = ["gold", "silver", "copper", "uranium", "nickel", "zinc", "lead", "pgm", "tin", "tungsten", "lithium", "coal", "iron_ore", "oil", "gas", "vanadium", "other"];

export default function PortfolioPositionsAdmin({ portfolios }: { portfolios: PortfolioConfig[] }) {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(portfolios[0]?.portfolio_id ?? "");
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [universeSymbols, setUniverseSymbols] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [sectorRows, setSectorRows] = useState<Array<{ id: number; name: string }>>([]);
  const [subsectorRows, setSubsectorRows] = useState<Array<{ id: number; name: string; sector_id: number }>>([]);
  const [opportunisticMode, setOpportunisticMode] = useState<"cash" | "company">("cash");
  const selectedPortfolio = useMemo(
    () => portfolios.find((item) => item.portfolio_id === selectedPortfolioId) ?? null,
    [portfolios, selectedPortfolioId]
  );
  const isOpportunisticPortfolio = selectedPortfolio?.portfolio_type === "opportunistic";

  useEffect(() => {
    setOpportunisticMode(isOpportunisticPortfolio ? "cash" : "company");
  }, [isOpportunisticPortfolio, selectedPortfolioId]);

  useEffect(() => {
    if (!selectedPortfolioId) return;
    void loadPositions(selectedPortfolioId);
  }, [selectedPortfolioId]);

  useEffect(() => {
    void fetch("/api/sector/canonical-taxonomy")
      .then((res) => res.json())
      .then((json) => {
        setSectorRows(Array.isArray(json.sector_rows) ? json.sector_rows : []);
        setSubsectorRows(Array.isArray(json.subsector_rows) ? json.subsector_rows : []);
      })
      .catch(() => {
        setSectorRows([]);
        setSubsectorRows([]);
      });
  }, []);

  useEffect(() => {
    void fetchUniverseSymbols({ limit: 500 })
      .then((symbols) => setUniverseSymbols(symbols))
      .catch(() => setUniverseSymbols([]));
  }, []);

  const availableSubsectors = useMemo(() => {
    const sectorId = Number(form.manual_sector_id);
    if (!Number.isFinite(sectorId)) return [];
    return subsectorRows.filter((item) => item.sector_id === sectorId);
  }, [form.manual_sector_id, subsectorRows]);

  async function loadPositions(portfolioId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/positions/list?portfolio_id=${encodeURIComponent(portfolioId)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed loading positions");
      setPositions(json.positions);
      setForm((prev) => ({ ...prev, portfolio_id: portfolioId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed loading positions");
    } finally {
      setLoading(false);
    }
  }

  function selectCompany(row: CompanyOption) {
    setForm((prev) => ({ ...prev, symbol: row.symbol, display_name: row.name, company_id: row.company_id ?? null }));
  }

  function startEdit(row: PositionRow) {
    setForm({
      id: row.id,
      portfolio_id: row.portfolio_id,
      symbol: row.symbol,
      display_name: row.display_name ?? "",
      company_id: row.company_id,
      shares: String(row.shares),
      avg_cost: row.avg_cost == null ? "" : String(row.avg_cost),
      manual_price: row.manual_price == null ? "" : String(row.manual_price),
      entry_date: row.entry_date ?? "",
      asset_type: row.asset_type,
      thesis: row.thesis ?? "",
      notes: row.notes ?? "",
      mapping_override_active: row.mapping_override_active,
      manual_sector_id: row.manual_sector_id == null ? "" : String(row.manual_sector_id),
      manual_subsector_id: row.manual_subsector_id == null ? "" : String(row.manual_subsector_id),
      manual_commodity_id: row.manual_commodity_id ?? "",
      mapping_source: row.mapping_source,
    });
  }

  async function save() {
    setError(null);
    setSaveMsg(null);
    if (isOpportunisticPortfolio && opportunisticMode === "cash") {
      const cashAmount = Number(form.manual_price);
      if (!Number.isFinite(cashAmount) || cashAmount <= 0) {
        setError("Cash amount must be a number > 0.");
        return;
      }
    }
    const payload = {
      ...form,
      portfolio_id: form.portfolio_id || selectedPortfolioId,
      symbol: (isOpportunisticPortfolio && opportunisticMode === "cash" ? "CASH" : form.symbol).toUpperCase(),
      display_name: isOpportunisticPortfolio && opportunisticMode === "cash" ? (form.display_name || "Cash") : form.display_name,
      avg_cost: form.avg_cost === "" ? null : Number(form.avg_cost),
      manual_price: form.manual_price === "" ? null : Number(form.manual_price),
      shares: isOpportunisticPortfolio && opportunisticMode === "cash" ? 1 : Number(form.shares),
      market_value: isOpportunisticPortfolio && opportunisticMode === "cash"
        ? Number(form.manual_price)
        : null,
      entry_date: form.entry_date || null,
      asset_type: isOpportunisticPortfolio && opportunisticMode === "cash" ? "cash_proxy" : form.asset_type,
      manual_sector_id: form.manual_sector_id ? Number(form.manual_sector_id) : null,
      manual_subsector_id: form.manual_subsector_id ? Number(form.manual_subsector_id) : null,
      manual_commodity_id: form.manual_commodity_id || null,
      mapping_source: form.mapping_override_active
        ? (form.manual_sector_id || form.manual_subsector_id || form.manual_commodity_id ? "portfolio_override" : "portfolio_completed")
        : "inherited",
    };

    const endpoint = form.id ? "/api/portfolio/positions/update" : "/api/portfolio/positions/create";
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(Array.isArray(json.errors) ? json.errors.join(" · ") : (json.error ?? "Save failed"));
      return;
    }
    setSaveMsg(form.id ? "Position updated." : "Position added.");
    setForm({ ...EMPTY_FORM, portfolio_id: selectedPortfolioId });
    await loadPositions(selectedPortfolioId);
  }

  async function deactivate(id: number) {
    const res = await fetch("/api/portfolio/positions/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed to deactivate");
      return;
    }
    await loadPositions(selectedPortfolioId);
  }

  function addCashPositionTemplate() {
    setForm({
      ...EMPTY_FORM,
      portfolio_id: selectedPortfolioId,
      symbol: "CASH",
      display_name: "Dry Powder Cash",
      company_id: null,
      shares: "1",
      manual_price: "",
      asset_type: "cash_proxy",
      thesis: "Cash reserve / dry powder",
      mapping_source: "portfolio_completed",
    });
    setOpportunisticMode("cash");
  }

  return (
    <div className="portfolio-panel" style={{ marginTop: 12 }}>
      <h4>Portfolio positions admin</h4>
      <div className="portfolio-admin-grid">
        <section className="portfolio-admin-section">
          <h5>Company</h5>
          <div className="portfolio-field">
            <label htmlFor="portfolio-position-selector">Portfolio</label>
            <select id="portfolio-position-selector" value={selectedPortfolioId} onChange={(e) => setSelectedPortfolioId(e.target.value)}>
              {portfolios.map((item) => <option key={item.portfolio_id} value={item.portfolio_id}>{item.portfolio_name}</option>)}
            </select>
          </div>
          {isOpportunisticPortfolio && (
            <div className="portfolio-actions-row">
              <button type="button" onClick={() => setOpportunisticMode("cash")}>Add cash / dry powder</button>
              <button type="button" onClick={() => setOpportunisticMode("company")}>Add company position</button>
            </div>
          )}
          {(!isOpportunisticPortfolio || opportunisticMode === "company") && (
            <CompanyPicker
              label="Company search (symbol/name)"
              placeholder="AAPL, Apple..."
              allowedSymbols={universeSymbols}
              onSelect={selectCompany}
            />
          )}
          {isOpportunisticPortfolio && (
            <div className="portfolio-actions-row">
              <button type="button" onClick={addCashPositionTemplate}>Add cash amount</button>
            </div>
          )}
        </section>

        <section className="portfolio-admin-section">
          <h5>Position details</h5>
          <div className="portfolio-field-grid">
            {(!isOpportunisticPortfolio || opportunisticMode === "company") && (
              <>
                <div className="portfolio-field">
                  <label htmlFor="portfolio-position-symbol">Symbol</label>
                  <input id="portfolio-position-symbol" value={form.symbol} onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))} />
                </div>
                <div className="portfolio-field">
                  <label htmlFor="portfolio-position-name">Name</label>
                  <input id="portfolio-position-name" value={form.display_name} onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))} />
                </div>
                <div className="portfolio-field">
                  <label htmlFor="portfolio-position-shares">Shares *</label>
                  <input id="portfolio-position-shares" type="number" min="0" step="any" value={form.shares} onChange={(e) => setForm((prev) => ({ ...prev, shares: e.target.value }))} />
                </div>
                <div className="portfolio-field">
                  <label htmlFor="portfolio-position-avg-cost">Avg cost</label>
                  <input id="portfolio-position-avg-cost" type="number" min="0" step="any" value={form.avg_cost} onChange={(e) => setForm((prev) => ({ ...prev, avg_cost: e.target.value }))} />
                </div>
              </>
            )}
            {isOpportunisticPortfolio && opportunisticMode === "cash" && (
              <div className="portfolio-field">
                <label htmlFor="portfolio-position-name">Cash label</label>
                <input id="portfolio-position-name" value={form.display_name} onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))} placeholder="Cash" />
              </div>
            )}
            <div className="portfolio-field">
              <label htmlFor="portfolio-position-manual-price">{isOpportunisticPortfolio ? "Cash amount (USD) *" : "Manual price"}</label>
              <input id="portfolio-position-manual-price" type="number" min="0" step="any" value={form.manual_price} onChange={(e) => setForm((prev) => ({ ...prev, manual_price: e.target.value }))} />
            </div>
            <div className="portfolio-field">
              <label htmlFor="portfolio-position-entry-date">Entry date</label>
              <input id="portfolio-position-entry-date" type="date" value={form.entry_date} onChange={(e) => setForm((prev) => ({ ...prev, entry_date: e.target.value }))} />
            </div>
          </div>
        </section>

        <section className="portfolio-admin-section">
          <h5>Classification</h5>
          <div className="portfolio-field">
            <label htmlFor="portfolio-position-asset-type">Asset type *</label>
            <select id="portfolio-position-asset-type" value={form.asset_type} onChange={(e) => setForm((prev) => ({ ...prev, asset_type: e.target.value }))} disabled={isOpportunisticPortfolio && opportunisticMode === "cash"}>
              {ASSET_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </section>

        <section className="portfolio-admin-section">
          <h5>Mapping</h5>
          <label className="portfolio-toggle-field" htmlFor="portfolio-position-mapping-toggle">
            <input
              id="portfolio-position-mapping-toggle"
              type="checkbox"
              checked={form.mapping_override_active}
              onChange={(e) => setForm((prev) => ({ ...prev, mapping_override_active: e.target.checked }))}
            />
            <span>Edit mapping for this position</span>
          </label>

          {form.mapping_override_active && (
            <div className="portfolio-field-grid">
              <div className="portfolio-field">
                <label htmlFor="portfolio-position-sector">Sector override</label>
                <select id="portfolio-position-sector" value={form.manual_sector_id} onChange={(e) => setForm((prev) => ({ ...prev, manual_sector_id: e.target.value, manual_subsector_id: "" }))}>
                  <option value="">None</option>
                  {sectorRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </div>
              <div className="portfolio-field">
                <label htmlFor="portfolio-position-subsector">Subsector override</label>
                <select id="portfolio-position-subsector" value={form.manual_subsector_id} onChange={(e) => setForm((prev) => ({ ...prev, manual_subsector_id: e.target.value }))}>
                  <option value="">None</option>
                  {availableSubsectors.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </div>
              <div className="portfolio-field">
                <label htmlFor="portfolio-position-commodity">Commodity override</label>
                <select id="portfolio-position-commodity" value={form.manual_commodity_id} onChange={(e) => setForm((prev) => ({ ...prev, manual_commodity_id: e.target.value }))}>
                  <option value="">None</option>
                  {COMMODITY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>
          )}
        </section>

        <section className="portfolio-admin-section">
          <h5>Optional notes</h5>
          <div className="portfolio-field">
            <label htmlFor="portfolio-position-thesis">Thesis</label>
            <textarea id="portfolio-position-thesis" value={form.thesis} onChange={(e) => setForm((prev) => ({ ...prev, thesis: e.target.value }))} />
          </div>
          <div className="portfolio-field">
            <label htmlFor="portfolio-position-notes">Notes</label>
            <textarea id="portfolio-position-notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>
        </section>
      </div>

      <div className="portfolio-actions-row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => void save()}>{form.id ? "Update position" : "Add position"}</button>
        <button type="button" onClick={() => setForm({ ...EMPTY_FORM, portfolio_id: selectedPortfolioId })}>Reset form</button>
      </div>
      {error && <p className="portfolio-error">{error}</p>}
      {saveMsg && <p className="portfolio-save-msg">{saveMsg}</p>}

      {loading ? <p className="bread">Loading positions…</p> : (
        positions.length === 0 ? <p className="bread">No positions in this portfolio yet.</p> : (
          <div className="portfolio-config-list">
            {positions.map((row) => (
              <div key={row.id} className="portfolio-config-row">
                <strong>{row.symbol}</strong> · {row.display_name ?? row.symbol} · shares {row.shares} · {row.asset_type} · map {row.mapping_source} · {row.active_position ? "active" : "inactive"}
                <div style={{ marginTop: 6 }}>
                  entry {row.entry_date ?? "—"} · avg cost {row.avg_cost ?? "—"} · manual price {row.manual_price ?? "—"} · final sector/subsector/commodity {row.final_sector_id ?? "—"}/{row.final_subsector_id ?? "—"}/{row.final_commodity_id ?? "—"}
                </div>
                <div className="portfolio-actions-row" style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => startEdit(row)}>Edit</button>
                  {row.active_position && <button type="button" onClick={() => void deactivate(row.id)}>Deactivate</button>}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
