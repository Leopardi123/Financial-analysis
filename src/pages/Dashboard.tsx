import { useState } from "react";
import Header from "../components/Header";
import Section from "../components/Section";
import SingleStockDashboard from "../components/SingleStockDashboard";
import CorporateFinancingHydrationBridge from "../components/CorporateFinancingHydrationBridge";
import SectorDashboard from "../components/SectorDashboard";
import GlobalMacroDashboard from "../components/GlobalMacroDashboard";
import ScreeningDashboard from "../components/ScreeningDashboard";
import MacroRegimeValidationLab from "../components/MacroRegimeValidationLab";
import ErrorBoundary from "../components/ErrorBoundary";
import PortfolioDashboardModule from "../components/PortfolioDashboardModule";
import CompareStocksDashboard from "../components/CompareStocksDashboard";
import { getTier1CostBenchmarkTodos } from "../lib/tier1/config";
import "../styles/dashboard.css";

export default function Dashboard() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const tier1BenchmarkTodos = getTier1CostBenchmarkTodos();

  return (
    <div className="dashboard">
      {/* Keeps Corporate financing controls synchronized with the persisted per-ticker state. */}
      <CorporateFinancingHydrationBridge ticker={selectedTicker} />
      <Header />
      <main className="dashboard-content">
        <Section
          id="oversikt"
          title="ÖVERSIKT"
          description="HÄR SKALL EVENTUELLT ALLT ÖVERSIKTLIGT VARA"
          background="#bfcfc2"
        >
          <div className="breadcontainersinglecolumn">
            <h2 className="subrub small">Göromål</h2>
            {tier1BenchmarkTodos.length === 0
              ? <p className="bread">Inga göromål just nu.</p>
              : <ul className="bread">{tier1BenchmarkTodos.map((todo) => <li key={todo}>{todo}</li>)}</ul>}
          </div>
          <div className="breadcontainerdoublecolumn">
            <div className="subrub">Översiktligheter</div>
            <p className="bread">
              Här visas det översiktliga innehållet. Detta kan senare fyllas med screening‑logik och
              sammanfattningar av större rörelser.
            </p>
          </div>
        </Section>

        <Section
          id="singlestock"
          title="SINGLE STOCK DASHBOARD"
          description=""
          background="#e0e9ce"
          defaultOpen
        >
          <ErrorBoundary sectionTitle="Single Stock Dashboard" selectedTicker={selectedTicker}>
          <SingleStockDashboard onTickerChange={(nextTicker) => setSelectedTicker(nextTicker)} />
          </ErrorBoundary>
        </Section>

        <Section
          id="sector"
          title="SECTOR DASHBOARD"
          description="Eventuell text om sector dashboard. Här väljs en sektor att titta på."
          background="#d7cee9"
        >
          <SectorDashboard />
        </Section>


        <Section
          id="globalmacro"
          title="GLOBAL MACRO DASHBOARD"
          description="Read-only global macro regime och overlays på egen toppnivå."
          background="#cedee9"
        >
          <GlobalMacroDashboard />
        </Section>

        <Section
          id="macro-lab"
          title="MACRO LAB"
          description="Frikopplad valideringsmiljö för makroregimer (sandbox)."
          background="#dbeafe"
        >
          <MacroRegimeValidationLab />
        </Section>

        <Section
          id="portfolio"
          title="PORTFOLIO DASHBOARD"
          description="Här visas alla portföljer sammanslaget som en kursutvecklingskarta."
          background="#d7eae8"
        >
          <div className="breadcontainerdoublecolumn">
            <PortfolioDashboardModule />
          </div>
        </Section>

        <Section
          id="screening"
          title="SCREENING DASHBOARD"
          description="Här ordnar man rätt screener och väljer EV, etc."
          background="#bfcfc2"
        >
          <ScreeningDashboard />
        </Section>

        <Section
          id="compare"
          title="COMPARE STOCKS"
          description="Jämför Producer och Pre revenue med samma kanoniska bolags- och projektmotorer."
          background="#bfcdcf"
        >
          <CompareStocksDashboard />
        </Section>
      </main>
    </div>
  );
}
