import Header from "../components/Header";
import Section from "../components/Section";
import SingleStockDashboard from "../components/SingleStockDashboard";
import SectorDashboard from "../components/SectorDashboard";
import "../styles/dashboard.css";

export default function Dashboard() {
  return (
    <div className="dashboard">
      <Header />
      <main className="dashboard-content">
        <Section
          id="oversikt"
          title="ÖVERSIKT"
          description="HÄR SKALL EVENTUELLT ALLT ÖVERSIKTLIGT VARA"
          background="#bfcfc2"
        >
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
          description="Här skall också finnas en linjegraf som visar upp det historiska aktievärdet som om det vore prissatt i guld."
          background="#e0e9ce"
          defaultOpen
        >
          <SingleStockDashboard />
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
          id="portfolio"
          title="PORTFOLIO DASHBOARD"
          description="Här visas alla portföljer sammanslaget som en kursutvecklingskarta."
          background="#d7eae8"
        >
          <div className="breadcontainerdoublecolumn">
            <div className="subrub">Vald Portfölj</div>
            <p className="bread">Här visas portföljens instrumentbräda.</p>
          </div>
        </Section>

        <Section
          id="screening"
          title="SCREENING DASHBOARD"
          description="Här ordnar man rätt screener och väljer EV, etc."
          background="#bfcfc2"
        >
          <div className="breadcontainerdoublecolumn">
            <div className="subrub">Någon Screening Rubrik</div>
            <p className="bread">Här finns det som syns.</p>
          </div>
        </Section>

        <Section
          id="compare"
          title="COMPARE STOCKS"
          description="Här jämför man flera aktier i samma vy."
          background="#bfcdcf"
        >
          <div className="breadcontainerdoublecolumn">
            <div className="subrub">Jämför flera aktier</div>
            <p className="bread">Här finns det som syns.</p>
          </div>
        </Section>
      </main>
    </div>
  );
}
