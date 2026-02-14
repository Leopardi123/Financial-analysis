import { useState } from "react";
import CompanyPicker, { type CompanyOption } from "./components/CompanyPicker";

export default function App() {
  const [ticker, setTicker] = useState("AAPL");

  function onSelectCompany(company: CompanyOption) {
    setTicker(company.symbol);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Financial Analysis</h1>

      <CompanyPicker
        label="Company"
        placeholder="Search company name"
        onSelect={onSelectCompany}
      />

      <p style={{ marginTop: 16 }}>
        Selected ticker: <strong>{ticker}</strong>
      </p>
    </div>
  );
}
