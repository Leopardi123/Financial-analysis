import { useState } from "react";
import CompanyPicker, { type CompanyOption } from "./components/CompanyPicker";

function StockViewer() {
  const [ticker, setTicker] = useState("AAPL");

  function onSelectCompany(company: CompanyOption) {
    setTicker(company.symbol);
  }

  return (
    <div>
      <h1>Stock Viewer</h1>

      <CompanyPicker
        label="Company"
        placeholder="Type company name"
        onSelect={onSelectCompany}
      />

      <label>Ticker</label>
      <input
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
      />

      <button>Fetch</button>

      <div style={{ marginTop: 16, border: "1px dashed #ccc", padding: 12 }}>
        Chart will appear here
      </div>
    </div>
  );
}

function Admin() {
  const [secret, setSecret] = useState("");
  const [tickers, setTickers] = useState("AAPL, MSFT");
  const [refreshLog, setRefreshLog] = useState("");

  function onAdminSelect(company: CompanyOption) {
    const next = company.symbol.trim().toUpperCase();
    if (!next) return;
    setTickers((prev) => {
      const list = prev
        .split(",")
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean);
      if (!list.includes(next)) {
        list.push(next);
      }
      return list.join(", ");
    });
  }

  async function refreshCompanies() {
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret.trim()}`,
          "x-admin-secret": secret.trim(),
        },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(String(payload.error ?? "Refresh failed"));
      setRefreshLog(JSON.stringify(payload));
    } catch (error) {
      setRefreshLog((error as Error).message);
    }
  }

  return (
    <div>
      <h1>Admin</h1>

      <input
        type="password"
        placeholder="CRON_SECRET"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button>Init DB</button>
        <button type="button" onClick={() => void refreshCompanies()}>Refresh Companies</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <CompanyPicker
          label="Add ticker by company"
          placeholder="Type company name"
          onSelect={onAdminSelect}
        />
        <p>Tickers: {tickers}</p>
      </div>

      {refreshLog && <pre>{refreshLog}</pre>}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"viewer" | "admin">("viewer");

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setTab("viewer")}>Viewer</button>
        <button onClick={() => setTab("admin")}>Admin</button>
      </div>

      {tab === "viewer" ? <StockViewer /> : <Admin />}
    </div>
  );
}
