import { useMemo, useState } from "react";
import Admin from "./Admin";

type CompanyResponse = {
  ticker: string;
  period: "fy" | "q" | "annual" | "quarterly";
  years: number[];
  balance: Record<string, Array<number | null>>;
};

function StockViewer() {
  const [ticker, setTicker] = useState("AAPL");
  const [period, setPeriod] = useState<"fy" | "q">("fy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompanyResponse | null>(null);

  const balanceFields = useMemo(() => {
    if (!data) {
      return [];
    }
    return Object.keys(data.balance).sort((a, b) => a.localeCompare(b));
  }, [data]);

  async function fetchCompany() {
    const value = ticker.trim().toUpperCase();
    if (!value) {
      setError("Ticker is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/company?ticker=${encodeURIComponent(value)}&period=${period}`);
      const payload = (await response.json()) as CompanyResponse & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Failed to load company data.");
        setData(null);
        return;
      }
      setData(payload);
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Stock Viewer</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label htmlFor="viewer-ticker">Ticker</label>
          <input
            id="viewer-ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            style={{ display: "block", marginTop: 6 }}
          />
        </div>

        <div>
          <label htmlFor="viewer-period">Period</label>
          <select
            id="viewer-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as "fy" | "q")}
            style={{ display: "block", marginTop: 6 }}
          >
            <option value="fy">Annual</option>
            <option value="q">Quarterly</option>
          </select>
        </div>

        <button onClick={fetchCompany} disabled={loading}>
          {loading ? "Loading..." : "Fetch"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {data ? (
          <div>
            <h2>
              Balance Sheet ({data.ticker}) — {period === "fy" ? "Annual" : "Quarterly"}
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ddd",
                        padding: "6px 8px",
                        position: "sticky",
                        left: 0,
                        background: "#fff",
                      }}
                    >
                      Field
                    </th>
                    {data.years.map((year) => (
                      <th
                        key={year}
                        style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "6px 8px" }}
                      >
                        {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {balanceFields.map((field) => (
                    <tr key={field}>
                      <td
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #f0f0f0",
                          padding: "6px 8px",
                          position: "sticky",
                          left: 0,
                          background: "#fff",
                          fontWeight: 600,
                        }}
                      >
                        {field}
                      </td>
                      {data.years.map((year, index) => (
                        <td
                          key={`${field}-${year}`}
                          style={{ textAlign: "right", borderBottom: "1px solid #f0f0f0", padding: "6px 8px" }}
                        >
                          {data.balance[field]?.[index] ?? "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ border: "1px dashed #ccc", padding: 12 }}>
            Fetch a ticker to see balance sheet data.
          </div>
        )}
      </div>
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
