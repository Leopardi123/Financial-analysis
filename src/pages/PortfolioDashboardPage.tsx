import Header from "../components/Header";
import PortfolioDashboardModule from "../components/PortfolioDashboardModule";

export default function PortfolioDashboardPage() {
  return (
    <div className="dashboard">
      <Header />
      <main className="dashboard-content">
        <PortfolioDashboardModule />
      </main>
    </div>
  );
}
