import { useEffect, useMemo, useState } from 'react';
import { postCorporateSnapshot } from '../lib/client/snapshotClient.ts';
import { getCompanyProject, listCompanyProjects, type CompanyProjectRecord, type CompanyProjectSummary } from '../lib/client/companyProjectsClient.ts';
import type { SnapshotRequest } from '../lib/api/validateSnapshotRequest.ts';
import '../styles/projects-view.css';

const DEFAULT_SYMBOL = 'AAPL';

type RouteState = {
  projectId: string | null;
  symbol: string;
};

function readRouteState(): RouteState {
  const pathname = window.location.pathname;
  const search = window.location.search;
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/i);
  const projectId = match?.[1] ? decodeURIComponent(match[1]) : null;
  const params = new URLSearchParams(search);
  const symbol = params.get('symbol')?.trim().toUpperCase() || DEFAULT_SYMBOL;
  return { projectId, symbol };
}

function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return '—';
}

export default function ProjectsPage() {
  const [route, setRoute] = useState<RouteState>(() => readRouteState());
  const [projects, setProjects] = useState<CompanyProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [editorOverlayUrl, setEditorOverlayUrl] = useState<string | null>(null);

  const [selectedProject, setSelectedProject] = useState<CompanyProjectRecord | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotWarnings, setSnapshotWarnings] = useState<string[]>([]);
  const [snapshotDiagnosticsErrors, setSnapshotDiagnosticsErrors] = useState<string[]>([]);
  const [snapshotData, setSnapshotData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const handlePopState = () => setRoute(readRouteState());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(path: string): void {
    window.history.pushState(null, '', path);
    setRoute(readRouteState());
  }

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      setLoadingProjects(true);
      setProjectsError(null);
      try {
        const list = await listCompanyProjects(route.symbol);
        if (isMounted) {
          setProjects(list);
        }
      } catch (error) {
        if (isMounted) {
          setProjects([]);
          setProjectsError((error as Error).message);
        }
      } finally {
        if (isMounted) {
          setLoadingProjects(false);
        }
      }
    }

    void loadProjects();
    return () => {
      isMounted = false;
    };
  }, [route.symbol]);

  useEffect(() => {
    if (!route.projectId) {
      setSelectedProject(null);
      setSnapshotData(null);
      setSnapshotError(null);
      setSnapshotWarnings([]);
      setSnapshotDiagnosticsErrors([]);
      return;
    }

    let isMounted = true;

    async function loadProjectAndSnapshot() {
      const currentProjectId = route.projectId;
      if (!currentProjectId) return;
      setSnapshotLoading(true);
      setSnapshotError(null);
      setSnapshotWarnings([]);
      setSnapshotDiagnosticsErrors([]);
      try {
        const project = await getCompanyProject(route.symbol, currentProjectId);
        if (!isMounted) return;
        setSelectedProject(project);

        const payload: SnapshotRequest = {
          targetCurrency: 'USD',
          discountRate: 0.1,
          market: {
            shares_current: 100000000,
            price_current_TargetCurrency: 1.5,
          },
          balanceSheet: {
            cash_t0_TargetCurrency: 0,
            debt_t0_TargetCurrency: 0,
          },
          scenario: { mode: 'spot' },
          fx: {
            source: 'auto',
            anchor: 'today',
            scenario: { mode: 'spot' },
          },
          projects: [
            {
              projectId: project.project_id,
              rawJson: project.raw_json,
            },
          ],
        };

        const result = await postCorporateSnapshot(payload);
        if (!isMounted) return;

        setSnapshotWarnings(result.diagnostics?.warnings ?? []);
        setSnapshotDiagnosticsErrors(result.diagnostics?.errors ?? []);
        if (!result.ok || !result.snapshot) {
          setSnapshotData(null);
          setSnapshotError('Snapshot request failed. Check diagnostics for details.');
          return;
        }

        setSnapshotData(result.snapshot as unknown as Record<string, unknown>);
      } catch (error) {
        if (!isMounted) return;
        setSelectedProject(null);
        setSnapshotData(null);
        setSnapshotError((error as Error).message);
      } finally {
        if (isMounted) {
          setSnapshotLoading(false);
        }
      }
    }

    void loadProjectAndSnapshot();
    return () => {
      isMounted = false;
    };
  }, [route.projectId, route.symbol]);

  const metrics = useMemo(() => {
    if (!snapshotData) return [] as Array<{ label: string; value: unknown }>;

    const marketValue = (snapshotData.marketValue ?? {}) as Record<string, unknown>;
    const financing = (snapshotData.financing ?? {}) as Record<string, unknown>;
    const aggregation = (snapshotData.aggregation ?? {}) as Record<string, unknown>;

    return [
      { label: 'NPV_today_TargetCurrency', value: snapshotData.NPV_today_TargetCurrency },
      { label: 'NAV_today_TargetCurrency', value: snapshotData.NAV_today_TargetCurrency },
      { label: 'EV_TargetCurrency', value: marketValue.EV_TargetCurrency },
      { label: 'EV_over_NPV', value: marketValue.EV_over_NPV },
      { label: 'P_over_NAV', value: marketValue.P_over_NAV },
      { label: 'AISC_corp (aggregation)', value: aggregation.aiscAuEqUSDPerOz_LOM },
      { label: 'shares_post_financing', value: financing.shares_post_financing },
    ];
  }, [snapshotData]);

  const projectTitle = (() => {
    const meta = (selectedProject?.raw_json?.meta ?? {}) as Record<string, unknown>;
    const projectName = typeof meta.projectName === 'string' && meta.projectName.trim() ? meta.projectName : null;
    return projectName ?? selectedProject?.project_id ?? route.projectId ?? 'Project';
  })();

  if (!route.projectId) {
    return (
      <div className="projects-shell">
        <main className="projects-card">
          <h1>Project</h1>
          <p>Choose a project to view its metrics, operations, and economics.</p>
          <p className="projects-muted">Symbol: <strong>{route.symbol}</strong></p>

          <div className="projects-actions">
            <button type="button" onClick={() => setSelectorOpen((prev) => !prev)}>
              Select project
            </button>
            <button type="button" onClick={() => setEditorOverlayUrl(`/company/${encodeURIComponent(route.symbol)}/projects?action=new`)}>
              Add project
            </button>
          </div>

          <p className="projects-muted">To add a brand-new project, use “New from template” in the editor.</p>

          {selectorOpen && (
            <section className="projects-selector">
              <h2>Select project</h2>
              {loadingProjects && <p>Loading stored projects…</p>}
              {projectsError && <p className="status error">{projectsError}</p>}
              {!loadingProjects && !projectsError && projects.length === 0 && <p className="status empty">No stored projects found for {route.symbol}.</p>}
              {!loadingProjects && !projectsError && projects.length > 0 && (
                <ul>
                  {projects.map((project) => (
                    <li key={project.project_id}>
                      <button
                        type="button"
                        className="projects-link-button"
                        onClick={() => navigate(`/projects/${encodeURIComponent(project.project_id)}?symbol=${encodeURIComponent(route.symbol)}`)}
                      >
                        {project.project_id} — {project.project_name || 'Unnamed project'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>

        {editorOverlayUrl && (
          <div className="projects-overlay" role="dialog" aria-modal="true">
            <div className="projects-overlay-card">
              <div className="projects-overlay-header">
                <h2>Edit projects</h2>
                <button type="button" onClick={() => setEditorOverlayUrl(null)}>Close</button>
              </div>
              <iframe title="Project editor" src={editorOverlayUrl} className="projects-overlay-frame" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="projects-shell">
      <main className="projects-card">
        <header className="projects-header">
          <div>
            <h1>{projectTitle}</h1>
            <p className="projects-muted">{selectedProject?.project_id ?? route.projectId} • {route.symbol}</p>
          </div>
          <div className="projects-actions">
            <button type="button" onClick={() => setEditorOverlayUrl(`/company/${encodeURIComponent(route.symbol)}/projects?projectId=${encodeURIComponent(route.projectId ?? '')}`)}>Edit project</button>
            <button type="button" onClick={() => navigate(`/projects?symbol=${encodeURIComponent(route.symbol)}`)}>Back to projects</button>
          </div>
        </header>

        {snapshotLoading && <p>Running snapshot…</p>}
        {snapshotError && <p className="status error">{snapshotError}</p>}

        <section className="projects-metrics" aria-label="Key metrics">
          {metrics.map((metric) => (
            <article key={metric.label} className="producer-card">
              <h3>{metric.label}</h3>
              <p>{formatMetricValue(metric.value)}</p>
            </article>
          ))}
        </section>

        <details>
          <summary>Diagnostics</summary>
          {(snapshotDiagnosticsErrors.length === 0 && snapshotWarnings.length === 0) && <p>No diagnostics.</p>}
          {snapshotDiagnosticsErrors.length > 0 && (
            <div>
              <h3>Errors</h3>
              <ul>{snapshotDiagnosticsErrors.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          {snapshotWarnings.length > 0 && (
            <div>
              <h3>Warnings</h3>
              <ul>{snapshotWarnings.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
        </details>

        <details>
          <summary>Snapshot JSON</summary>
          <pre>{snapshotData ? JSON.stringify(snapshotData, null, 2) : 'No snapshot loaded.'}</pre>
        </details>
      </main>

      {editorOverlayUrl && (
        <div className="projects-overlay" role="dialog" aria-modal="true">
          <div className="projects-overlay-card">
            <div className="projects-overlay-header">
              <h2>Edit projects</h2>
              <button type="button" onClick={() => setEditorOverlayUrl(null)}>Close</button>
            </div>
            <iframe title="Project editor" src={editorOverlayUrl} className="projects-overlay-frame" />
          </div>
        </div>
      )}
    </div>
  );
}
