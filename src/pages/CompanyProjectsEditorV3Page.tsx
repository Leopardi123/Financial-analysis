import { useEffect, useMemo, useState } from 'react';
import InvestmentScoreEvidenceDialog from '../components/investmentScore/InvestmentScoreEvidenceDialog.tsx';
import {
  deleteCompanyProject,
  getCompanyProject,
  listAllCompanyProjects,
  upsertCompanyProject,
  type CompanyProjectSummary,
} from '../lib/client/companyProjectsClient.ts';
import { copyText } from '../lib/client/clipboard.ts';
import { parseProjectJsonV1 } from '../lib/project/jsonv1/parse.ts';
import { buildProjectJsonV3Template } from '../lib/project/jsonv3/template.ts';
import '../styles/company-project-editor.css';

function parseSymbol(pathname: string): string {
  const match = pathname.match(/^\/company\/([^/]+)\/projects\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]).toUpperCase() : '';
}

function templateText(projectId: string, projectName: string): string {
  const template = buildProjectJsonV3Template() as Record<string, unknown>;
  const meta = typeof template.meta === 'object' && template.meta !== null && !Array.isArray(template.meta)
    ? template.meta as Record<string, unknown>
    : {};
  meta.projectId = projectId;
  meta.projectName = projectName;
  template.meta = meta;
  return JSON.stringify(template, null, 2);
}

function validateRaw(text: string): { ok: true; raw: Record<string, unknown> } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'JSON root must be an object.' };
  if ((raw as Record<string, unknown>).version !== 'project_json_v3') return { ok: false, error: 'V3 editor accepts only raw.version="project_json_v3". Use Legacy v2 editor for existing V2 projects.' };
  try {
    parseProjectJsonV1(raw);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true, raw: raw as Record<string, unknown> };
}

export default function CompanyProjectsEditorV3Page() {
  const symbol = useMemo(() => parseSymbol(window.location.pathname), []);
  const [projects, setProjects] = useState<CompanyProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [rawText, setRawText] = useState('');
  const [savedRawText, setSavedRawText] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [evidenceProject, setEvidenceProject] = useState<CompanyProjectSummary | null>(null);

  const validation = useMemo(() => rawText.trim() ? validateRaw(rawText) : null, [rawText]);

  async function refresh(nextSelectedId?: string): Promise<void> {
    if (!symbol) return;
    try {
      const all = await listAllCompanyProjects(symbol);
      setProjects(all.filter((project) => project.json_version === 'project_json_v3'));
      if (nextSelectedId) setSelectedId(nextSelectedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => { void refresh(); }, [symbol]);

  function newV3(): void {
    const used = new Set(projects.map((project) => project.project_id));
    let n = 1;
    while (used.has(`p${n}`)) n += 1;
    const id = `p${n}`;
    setSelectedId('');
    setProjectId(id);
    setProjectName('');
    setRawText(templateText(id, ''));
    setSavedRawText(null);
    setIsNew(true);
    setError(null);
    setStatus('Created a project_json_v3 draft. Report periods and economic sources must be filled from the technical report; unknowns must not be guessed.');
  }

  async function load(project: CompanyProjectSummary): Promise<void> {
    try {
      const stored = await getCompanyProject(symbol, project.project_id);
      if (stored.raw_json.version !== 'project_json_v3') throw new Error('Selected project is not project_json_v3.');
      const pretty = JSON.stringify(stored.raw_json, null, 2);
      setSelectedId(stored.project_id);
      setProjectId(stored.project_id);
      setProjectName(stored.project_name ?? '');
      setRawText(pretty);
      setSavedRawText(pretty);
      setIsNew(false);
      setError(null);
      setStatus(`Loaded ${stored.project_id}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function save(): Promise<void> {
    if (!symbol) return setError('Symbol missing from route.');
    if (!validation?.ok) return setError(validation?.error ?? 'Enter a valid project_json_v3 document.');
    if (!projectId.trim()) return setError('project_id is required.');
    setSaving(true);
    setError(null);
    try {
      const raw = JSON.parse(JSON.stringify(validation.raw)) as Record<string, unknown>;
      const meta = typeof raw.meta === 'object' && raw.meta !== null && !Array.isArray(raw.meta) ? raw.meta as Record<string, unknown> : {};
      meta.projectId = projectId.trim();
      meta.projectName = projectName.trim();
      raw.meta = meta;
      const result = await upsertCompanyProject({ symbol, project_id: projectId.trim(), project_name: projectName.trim() || null, raw_json: raw });
      const pretty = JSON.stringify(raw, null, 2);
      setSelectedId(result.project_id);
      setIsNew(false);
      setRawText(pretty);
      setSavedRawText(pretty);
      setStatus(`Saved project_json_v3 at ${result.updated_at_utc}. This means schema-valid, not report-verified.`);
      await refresh(result.project_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function setProjectDisabled(project: CompanyProjectSummary, disabled: boolean): Promise<void> {
    if (!symbol) return;
    if (selectedId === project.project_id && savedRawText !== null && rawText !== savedRawText) {
      setError('Projektet har osparade ändringar. Spara eller återställ innan status ändras.');
      return;
    }

    try {
      const stored = await getCompanyProject(symbol, project.project_id);
      if (stored.raw_json.version !== 'project_json_v3') throw new Error('Selected project is not project_json_v3.');
      const raw = JSON.parse(JSON.stringify(stored.raw_json)) as Record<string, unknown>;
      const existingMeta = raw.meta;
      const meta = typeof existingMeta === 'object' && existingMeta !== null && !Array.isArray(existingMeta)
        ? existingMeta as Record<string, unknown>
        : {};

      if (disabled) {
        meta.disabled = true;
        raw.meta = meta;
      } else {
        delete meta.disabled;
        raw.meta = meta;
      }

      const result = await upsertCompanyProject({
        symbol,
        project_id: stored.project_id,
        project_name: stored.project_name,
        raw_json: raw,
      });

      setError(null);
      setStatus(disabled ? `Inaktiverade ${project.project_id}.` : `Aktiverade ${project.project_id}.`);
      if (selectedId === project.project_id && !isNew) {
        const pretty = JSON.stringify(raw, null, 2);
        setRawText(pretty);
        setSavedRawText(pretty);
      }
      await refresh(result.project_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm(`Delete V3 project "${id}" for ${symbol}?`)) return;
    try {
      await deleteCompanyProject({ symbol, project_id: id });
      if (selectedId === id) {
        setSelectedId(''); setProjectId(''); setProjectName(''); setRawText(''); setSavedRawText(null); setIsNew(false);
      }
      setStatus(`Deleted ${id}.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function copyTemplate(): Promise<void> {
    try {
      await copyText(templateText('p1', ''));
      setStatus('Blank project_json_v3 template copied.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="project-editor-page">
      <header className="project-editor-header">
        <h1>Projects for {symbol || '—'} · project_json_v3</h1>
        <a href="/">Back to dashboard</a>
      </header>
      <p className="save-meta">V3 is the canonical single-source format. Saving means schema-valid only. A project is “Verifierad” only after the same Project engine reproduces the report NPV/IRR at the report price deck within tolerance.</p>
      <div className="project-editor-layout">
        <aside className="project-list-panel">
          <div className="project-list-header"><h2>V3 projects</h2><button type="button" onClick={newV3}>New V3</button></div>
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.project_id} className={selectedId === project.project_id ? 'selected' : ''}>
                <div>
                  <strong>{project.project_id}</strong>
                  <div>{project.project_name || '—'}</div>
                  <small>{project.disabled ? 'Inaktiverat · ' : ''}{project.updated_at_utc}</small>
                </div>
                <div className="project-row-actions">
                  <button type="button" onClick={() => void load(project)}>Edit</button>
                  <button type="button" onClick={() => setEvidenceProject(project)}>Kvalitativ bedömning</button>
                  <button type="button" onClick={() => void setProjectDisabled(project, !project.disabled)}>
                    {project.disabled ? 'Aktivera' : 'Inaktivera'}
                  </button>
                  <button type="button" className="danger" onClick={() => void remove(project.project_id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </aside>
        <section className="project-editor-panel">
          <h2>{isNew ? 'New V3 project' : 'V3 editor'}</h2>
          <div className="field-grid">
            <label><span>project_id</span><input value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!isNew && Boolean(selectedId)} /></label>
            <label><span>project_name</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          </div>
          {error && <p className="status error">{error}</p>}
          {status && <p className="status ok">{status}</p>}
          <label className="json-label"><span>raw project_json_v3</span><textarea rows={30} value={rawText} onChange={(event) => { setRawText(event.target.value); setError(null); }} /></label>
          {validation && !validation.ok && <p className="status error">{validation.error}</p>}
          <div className="editor-actions">
            <button type="button" onClick={() => validation?.ok ? setStatus('V3 JSON is schema-valid locally. Report reconciliation is a separate hard check.') : setError(validation?.error ?? 'Invalid V3 JSON.')}>Validate</button>
            <button type="button" onClick={() => void save()} disabled={!validation?.ok || saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => validation?.ok && setRawText(JSON.stringify(validation.raw, null, 2))} disabled={!validation?.ok}>Prettify</button>
            <button type="button" onClick={() => void copyTemplate()}>Copy V3 template</button>
            <button type="button" onClick={() => savedRawText !== null && setRawText(savedRawText)} disabled={savedRawText === null}>Reset to saved</button>
          </div>
        </section>
      </div>

      {evidenceProject && (
        <InvestmentScoreEvidenceDialog
          symbol={symbol}
          projectId={evidenceProject.project_id}
          projectName={evidenceProject.project_name}
          onClose={() => setEvidenceProject(null)}
        />
      )}
    </div>
  );
}
