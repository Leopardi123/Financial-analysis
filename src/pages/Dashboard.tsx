import { useState } from "react";
import CompanyPicker, { type CompanyOption } from "../components/CompanyPicker";

export default function Dashboard() {
  const [ticker, setTicker] = useState("AAPL");
  const [showAdmin, setShowAdmin] = useState(false);
  const [secret, setSecret] = useState("");
  const [tickers, setTickers] = useState("AAPL, MSFT");
  const [refreshLog, setRefreshLog] = useState("");

  function onSelectCompany(company: CompanyOption) {
    setTicker(company.symbol);
  }

  function onAdminSelect(company: CompanyOption) {
    const next = company.symbol.trim().toUpperCase();
    if (!next) return;
    setTickers((prev) => {
      const list = prev
        .split(",")
        .map((value) => value.trim().toUpperCase())
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
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Dashboard</h1>

      <section>
        <h2>Single Stock</h2>
        <CompanyPicker
          label="Company"
          placeholder="Type company name"
          onSelect={onSelectCompany}
        />

        <label htmlFor="ticker">Ticker</label>
        <input
          id="ticker"
          value={ticker}
          onChange={(event) => setTicker(event.target.value)}
        />

        <button type="button">Fetch</button>

        <div style={{ marginTop: 16, border: "1px dashed #ccc", padding: 12 }}>
          Chart will appear here
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <button type="button" onClick={() => setShowAdmin((prev) => !prev)}>
          {showAdmin ? "Hide Admin" : "Show Admin"}
        </button>

        {showAdmin && (
          <div style={{ marginTop: 16 }}>
            <h2>Admin</h2>
            <input
              type="password"
              placeholder="CRON_SECRET"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />

            <div style={{ marginTop: 12 }}>
              <button type="button">Init DB</button>
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
        )}
      </section>
    </main>
  );
}
