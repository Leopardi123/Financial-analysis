import { useState } from "react";
import Admin from "./Admin";

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
