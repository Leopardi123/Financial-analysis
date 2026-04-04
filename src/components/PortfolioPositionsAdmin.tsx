import { useEffect, useMemo, useState } from "react";

type PortfolioConfig = { portfolio_id: string; portfolio_name: string };
type CompanyResult = { symbol: string; name: string; company_id: number | null };
type PositionRow = {
  id: number;
  portfolio_id: string;
  symbol: string;
  display_name: string | null;
  company_id: number | null;
  shares: number;
  avg_cost: number | null;
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
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyResults, setCompanyResults] = useState<CompanyResult[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [sectorRows, setSectorRows] = useState<Array<{ id: number; name: string }>>([]);
  const [subsectorRows, setSubsectorRows] = useState<Array<{ id: number; name: string; sector_id: number }>>([]);

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

  async function searchCompany(value: string) {
    setCompanyQuery(value);
    if (value.trim().length < 2) {
      setCompanyResults([]);
      return;
    }
    const res = await fetch(`/api/companies/search?q=${encodeURIComponent(value.trim())}`);
    const json = await res.json();
    setCompanyResults(Array.isArray(json.results) ? json.results : []);
  }

  function selectCompany(row: CompanyResult) {
    setForm((prev) => ({ ...prev, symbol: row.symbol, display_name: row.name, company_id: row.company_id }));
    setCompanyResults([]);
    setCompanyQuery(`${row.symbol} ${row.name}`);
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
    const payload = {
      ...form,
      portfolio_id: form.portfolio_id || selectedPortfolioId,
      avg_cost: form.avg_cost === "" ? null : Number(form.avg_cost),
      shares: Number(form.shares),
      entry_date: form.entry_date || null,
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

  return (
    <div className="portfolio-panel portfolio-positions-admin" style={{ marginTop: 12 }}>
      <h4>Portfolio positions admin</h4>
      <div className="portfolio-form-grid" style={{ gap: 12 }}>
        <label>
          <span>Portfolio</span>
          <select value={selectedPortfolioId} onChange={(e) => setSelectedPortfolioId(e.target.value)}>
            {portfolios.map((item) => <option key={item.portfolio_id} value={item.portfolio_id}>{item.portfolio_name}</option>)}
          </select>
        </label>

        <label>
          <span>Company search (symbol/name)</span>
          <input value={companyQuery} onChange={(e) => void searchCompany(e.target.value)} placeholder="AAPL, Apple..." />
        </label>
        {companyResults.length > 0 && (
          <div className="portfolio-config-list">
            {companyResults.map((row) => (
              <button type="button" key={`${row.symbol}-${row.company_id ?? "none"}`} onClick={() => selectCompany(row)}>
                {row.symbol} · {row.name}
              </button>
            ))}
          </div>
        )}

        <label><span>Symbol</span><input value={form.symbol} onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))} /></label>
        <label><span>Name</span><input value={form.display_name} onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))} /></label>
        <label><span>Shares *</span><input type="number" min="0" step="any" value={form.shares} onChange={(e) => setForm((prev) => ({ ...prev, shares: e.target.value }))} /></label>
        <label><span>Avg cost</span><input type="number" min="0" step="any" value={form.avg_cost} onChange={(e) => setForm((prev) => ({ ...prev, avg_cost: e.target.value }))} /></label>
        <label><span>Entry date</span><input type="date" value={form.entry_date} onChange={(e) => setForm((prev) => ({ ...prev, entry_date: e.target.value }))} /></label>

        <label>
          <span>Asset type *</span>
          <select value={form.asset_type} onChange={(e) => setForm((prev) => ({ ...prev, asset_type: e.target.value }))}>
            {ASSET_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.mapping_override_active}
            onChange={(e) => setForm((prev) => ({ ...prev, mapping_override_active: e.target.checked }))}
          />
          <span>Edit mapping for this position</span>
        </label>

        {form.mapping_override_active && (
          <>
            <label><span>Sector override</span>
              <select value={form.manual_sector_id} onChange={(e) => setForm((prev) => ({ ...prev, manual_sector_id: e.target.value, manual_subsector_id: "" }))}>
                <option value="">None</option>
                {sectorRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label><span>Subsector override</span>
              <select value={form.manual_subsector_id} onChange={(e) => setForm((prev) => ({ ...prev, manual_subsector_id: e.target.value }))}>
                <option value="">None</option>
                {availableSubsectors.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label><span>Commodity override</span>
              <select value={form.manual_commodity_id} onChange={(e) => setForm((prev) => ({ ...prev, manual_commodity_id: e.target.value }))}>
                <option value="">None</option>
                {COMMODITY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </>
        )}

        <label><span>Thesis</span><textarea value={form.thesis} onChange={(e) => setForm((prev) => ({ ...prev, thesis: e.target.value }))} /></label>
        <label><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} /></label>
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
                  entry {row.entry_date ?? "—"} · avg cost {row.avg_cost ?? "—"} · final sector/subsector/commodity {row.final_sector_id ?? "—"}/{row.final_subsector_id ?? "—"}/{row.final_commodity_id ?? "—"}
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
