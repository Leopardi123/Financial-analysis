import { useEffect, useMemo, useState } from 'react';
import ProducerCompareDashboard from './ProducerCompareDashboard.tsx';
import { listCompanyProjects, type CompanyProjectSummary } from '../lib/client/companyProjectsClient.ts';
import '../styles/compareStocks.css';

type CompareTab = 'producer' | 'pre-revenue';

type CompanyListResponse = {
  ok: boolean;
  companies?: Array<{ ticker: string; name: string }>;
};

type PreRevenueCompany = {
  ticker: string;
  name: string;
  projects: CompanyProjectSummary[];
};

const METRIC_GROUPS = [
  {
    label: 'VÄRDERING IDAG',
    columns: [
      ['P/NAV', 'Corporate P/NAV'],
      ['EV/NAV', 'Corporate EV/NAV'],
      ['EV/EBITDA peak', 'Högsta/base EV/EBITDA från Corporate-värderingen'],
    ],
  },
  {
    label: 'TARGET / RE-RATING',
    columns: [
      ['Target / pris', 'Target price relativt dagens pris'],
      ['Årlig avk. → prod.', 'Annualiserad utveckling till produktion/target'],
    ],
  },
  {
    label: 'PROJEKTKVALITET',
    columns: [
      ['Tier', 'Project tier'],
      ['IRR', 'Kanonisk project/corporate IRR'],
      ['Payback', 'Kanonisk payback'],
      ['LOM', 'Life of mine'],
      ['Initial CAPEX', 'Initial construction CAPEX'],
      ['CAPEX / annual AuEq', 'Kapitalintensitet per normaliserad årsproduktion'],
    ],
  },
  {
    label: 'SKALA',
    columns: [
      ['Annual AuEq', 'Genomsnittlig årlig recoverable/payable AuEq-produktion'],
      ['10y AuEq', 'Recoverable/payable AuEq under de första tio produktionsåren'],
      ['LOM AuEq', 'Recoverable/payable AuEq över LOM'],
      ['In-situ AuEq', 'Geologisk in-situ AuEq, sekundärt skalmått'],
      ['AuEq / aktie', 'In-situ AuEq per aktie'],
    ],
  },
  {
    label: 'RELATIV VÄRDERING',
    columns: [
      ['MCap / 10y AuEq', 'Market cap per 10y recoverable/payable AuEq'],
      ['MCap / LOM AuEq', 'Market cap per LOM recoverable/payable AuEq'],
      ['EV / LOM AuEq', 'Enterprise value per LOM recoverable/payable AuEq'],
    ],
  },
] as const;

function PreRevenueCompareDashboard() {
  const [rows, setRows] = useState<PreRevenueCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/company/list?limit=500', { signal: controller.signal });
        const body = await response.json() as CompanyListResponse;
        if (!response.ok || !body.ok || !Array.isArray(body.companies)) {
          throw new Error('Kunde inte läsa bolagsuniversum.');
        }

        const candidates = await Promise.all(body.companies.map(async (company) => {
          try {
            const projects = await listCompanyProjects(company.ticker);
            return projects.length > 0 ? { ...company, projects } : null;
          } catch {
            return null;
          }
        }));

        if (!controller.signal.aborted) {
          setRows(candidates.filter((row): row is PreRevenueCompany => row !== null));
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  const metricColumns = useMemo(() => METRIC_GROUPS.flatMap((group) => group.columns), []);

  return (
    <div className="pre-revenue-compare">
      <div className="pre-revenue-compare__intro">
        <div>
          <strong>PRE REVENUE · FÖRSTA UTKAST</strong>
          <p>Jämför projektkvalitet, skala och priset marknaden betalar för den ekonomiskt relevanta metallbasen.</p>
        </div>
        <div className="pre-revenue-compare__basis">
          <strong>Kanonisk källa:</strong> Corporate + modellerade project_json. Inga jämförelsemått ska få en separat beräkningsmotor här.
        </div>
      </div>

      <div className="pre-revenue-compare__note">
        Detta PR etablerar informationsarkitektur och automatiskt universum av bolag med sparade projekt. Värden som ännu inte är exponerade via en gemensam Corporate peer-endpoint visas avsiktligt som — i stället för att räknas om lokalt.
      </div>

      {loading && <div className="producer-compare__state">Laddar pre-revenue-universum…</div>}
      {error && <div className="producer-compare__error">{error}</div>}

      {!loading && !error && (
        <div className="pre-revenue-compare__table-wrap">
          <table className="pre-revenue-compare__table">
            <thead>
              <tr className="pre-revenue-compare__group-row">
                <th colSpan={4}>BOLAG</th>
                {METRIC_GROUPS.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}
              </tr>
              <tr>
                <th>Bolag</th>
                <th>Ticker</th>
                <th>Projekt</th>
                <th>Corporate</th>
                {metricColumns.map(([label, help]) => <th key={label} title={help}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ticker}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.ticker}</td>
                  <td>
                    <div className="pre-revenue-compare__projects">
                      <strong>{row.projects.length}</strong>
                      <small>{row.projects.map((project) => project.project_name || project.project_id).join(' · ')}</small>
                    </div>
                  </td>
                  <td><a href={`/company/${encodeURIComponent(row.ticker)}/corporate`}>Öppna</a></td>
                  {metricColumns.map(([label]) => <td className="pre-revenue-compare__pending" key={`${row.ticker}-${label}`}>—</td>)}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4 + metricColumns.length}>Inga bolag med sparade modellerade projekt hittades.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CompareStocksDashboard() {
  const [tab, setTab] = useState<CompareTab>('producer');

  return (
    <div className="compare-stocks">
      <div className="compare-stocks__tabs" role="tablist" aria-label="Compare Stocks model">
        <button type="button" role="tab" aria-selected={tab === 'producer'} className={tab === 'producer' ? 'is-active' : ''} onClick={() => setTab('producer')}>PRODUCER</button>
        <button type="button" role="tab" aria-selected={tab === 'pre-revenue'} className={tab === 'pre-revenue' ? 'is-active' : ''} onClick={() => setTab('pre-revenue')}>PRE REVENUE</button>
      </div>
      {tab === 'producer' ? <ProducerCompareDashboard /> : <PreRevenueCompareDashboard />}
    </div>
  );
}
