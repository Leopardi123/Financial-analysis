import { useState } from "react";
import CompanyPicker, { type CompanyOption } from "./components/CompanyPicker";

export default function App() {
  const [ticker, setTicker] = useState("AAPL");
  const [secret, setSecret] = useState("");
  const [adminTickers, setAdminTickers] = useState("AAPL, MSFT");
  const [refreshLog, setRefreshLog] = useState<string>("");

  function onSelectCompany(company: CompanyOption) {
    setTicker(company.symbol);
  }

  function onAdminSelect(company: CompanyOption) {
    const next = company.symbol.trim().toUpperCase();
    if (!next) return;
    setAdminTickers((prev) => {
      const values = prev.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
      if (!values.includes(next)) values.push(next);
      return values.join(", ");
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
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "Arial, sans-serif" }}>
      <h1>Financial Analysis</h1>

      <section style={{ marginBottom: 24 }}>
        <h2>Single stock selector</h2>
        <CompanyPicker label="Find company" placeholder="Type company name" onSelect={onSelectCompany} />
        <p>
          Selected ticker: <strong>{ticker}</strong>
        </p>
      </section>

      <section>
        <h2>Admin</h2>
        <label>
          ADMIN/CRON secret
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            style={{ display: "block", marginTop: 6, marginBottom: 12, width: "100%" }}
          />
        </label>
        <button type="button" onClick={() => void refreshCompanies()}>Refresh companies from FMP</button>
        <CompanyPicker label="Add ticker by company name" onSelect={onAdminSelect} />
        <p>Tickers: {adminTickers}</p>
        {refreshLog && <pre>{refreshLog}</pre>}
      </section>
    </main>
  );
}
