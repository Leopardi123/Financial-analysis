import { useState } from "react";

export default function App() {
  const [ticker, setTicker] = useState("AAPL");

  return (
    <div className="app">
      <h1>Stock Viewer</h1>
      <label htmlFor="ticker">Ticker</label>
      <input
        id="ticker"
        type="text"
        value={ticker}
        onChange={(event) => setTicker(event.target.value)}
      />
      <button type="button">Fetch</button>
      <div className="placeholder">Chart will appear here</div>
    </div>
  );
}
