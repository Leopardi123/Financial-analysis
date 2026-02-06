import { useState } from "react";

function StockViewer() {
  const [ticker, setTicker] = useState("AAPL");

  return (
    <div>
      <h1>Stock Viewer</h1>

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
        <button>Refresh</button>
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