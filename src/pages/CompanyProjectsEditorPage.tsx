import { useEffect, useMemo, useState } from 'react';
import {
  deleteCompanyProject,
  getCompanyProject,
  listCompanyProjects,
  upsertCompanyProject,
  type CompanyProjectSummary,
} from '../lib/client/companyProjectsClient.ts';
import { copyText } from '../lib/client/clipboard.ts';
import { parseProjectJsonV1 } from '../lib/project/jsonv1/parse.ts';
import { buildProjectJsonV1Template } from '../lib/project/jsonv1/template.ts';
import '../styles/company-project-editor.css';

type ValidationState = {
  ok: boolean;
  error: string | null;
  warning: string | null;
  parsed: Record<string, unknown> | null;
};

function parseSymbolFromPath(pathname: string): string {
  const match = pathname.match(/^\/company\/([^/]+)\/projects\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]).toUpperCase() : '';
}

function formatTemplate(projectId: string, projectName: string): string {
  const template = buildProjectJsonV1Template() as Record<string, unknown>;
  const meta = (template.meta as Record<string, unknown> | undefined) ?? {};
  meta.projectId = projectId;
  meta.projectName = projectName;
  template.meta = meta;
  return JSON.stringify(template, null, 2);
}

function validateProjectJson(rawJson: string): ValidationState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const message = (error as Error).message || 'Invalid JSON';
    return { ok: false, error: `Invalid JSON: ${message}`, warning: null, parsed: null };
  }

  let root: unknown = parsed;
  let warning: string | null = null;

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { ok: false, error: 'JSON array wrapper is empty.', warning: null, parsed: null };
    }
    const first = parsed[0];
    if (typeof first !== 'object' || first === null || Array.isArray(first)) {
      return { ok: false, error: 'Array wrapper first element must be an object.', warning: null, parsed: null };
    }
    const firstRecord = first as Record<string, unknown>;
    root = firstRecord.rawJson ?? firstRecord;
    warning = parsed.length > 1 ? 'Array wrapper contains multiple entries; loaded first element only.' : null;
  }

  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return { ok: false, error: 'JSON root must be an object.', warning: null, parsed: null };
  }

  const version = (root as Record<string, unknown>).version;
  if (version !== 'project_json_v1') {
    return { ok: false, error: 'raw.version must be "project_json_v1".', warning: null, parsed: null };
  }

  try {
    parseProjectJsonV1(root);
  } catch (error) {
    return { ok: false, error: (error as Error).message, warning, parsed: null };
  }

  return { ok: true, error: null, warning, parsed: root as Record<string, unknown> };
}



type ShiftForwardResult = {
  shifted: Record<string, unknown>;
  shiftedSeriesCount: number;
  k: number;
  tpBase: number;
  tpEff: number;
};

function shiftPerPeriodArraysDeep(value: unknown, expectedLength: number, k: number): { value: unknown; shiftedSeriesCount: number } {
  if (Array.isArray(value)) {
    const isPerPeriodSeries = value.length === expectedLength && value.every((entry) => entry === null || typeof entry === 'number');
    if (isPerPeriodSeries) {
      const shifted = new Array<number | null>(expectedLength).fill(null);
      for (let t = 0; t < expectedLength; t += 1) {
        const src = t - k;
        if (src < 0 || src >= expectedLength) continue;
        const sourceValue = value[src];
        shifted[t] = typeof sourceValue === 'number' && Number.isFinite(sourceValue) ? sourceValue : null;
      }
      return { value: shifted, shiftedSeriesCount: 1 };
    }

    let shiftedSeriesCount = 0;
    const mapped = value.map((entry) => {
      const shiftedEntry = shiftPerPeriodArraysDeep(entry, expectedLength, k);
      shiftedSeriesCount += shiftedEntry.shiftedSeriesCount;
      return shiftedEntry.value;
    });
    return { value: mapped, shiftedSeriesCount };
  }

  if (typeof value === 'object' && value !== null) {
    let shiftedSeriesCount = 0;
    const output = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        const shiftedEntry = shiftPerPeriodArraysDeep(entry, expectedLength, k);
        shiftedSeriesCount += shiftedEntry.shiftedSeriesCount;
        return [key, shiftedEntry.value] as const;
      }),
    );
    return { value: output, shiftedSeriesCount };
  }

  return { value, shiftedSeriesCount: 0 };
}

function shiftProjectToTargetProductionYear(projectRaw: Record<string, unknown>, targetYear: number): ShiftForwardResult {
  const time = projectRaw.time;
  if (typeof time !== 'object' || time === null || Array.isArray(time)) {
    throw new Error('Kan inte förskjuta: time saknas i JSON.');
  }

  const periodEndDatesUtc = (time as Record<string, unknown>).periodEndDatesUtc;
  if (!Array.isArray(periodEndDatesUtc) || periodEndDatesUtc.length === 0 || !periodEndDatesUtc.every((entry) => typeof entry === 'string')) {
    throw new Error('Kan inte förskjuta: time.periodEndDatesUtc måste vara en array av datumsträngar.');
  }

  const productionStartPeriodRaw = (time as Record<string, unknown>).productionStartPeriod;
  if (!Number.isInteger(productionStartPeriodRaw) || Number(productionStartPeriodRaw) < 0 || Number(productionStartPeriodRaw) >= periodEndDatesUtc.length) {
    throw new Error('Kan inte förskjuta: time.productionStartPeriod är ogiltig.');
  }

  const tpBase = Number(productionStartPeriodRaw);
  const baseDate = periodEndDatesUtc[tpBase] as string;
  const baseYear = Number.parseInt(baseDate.slice(0, 4), 10);
  if (!Number.isInteger(baseYear)) {
    throw new Error('Kan inte förskjuta: hittade inget årtal i production start-datumet.');
  }

  if (!Number.isInteger(targetYear)) {
    throw new Error('Målår måste vara ett heltal.');
  }

  const k = targetYear - baseYear;
  if (k < 0) {
    throw new Error(`Målår (${targetYear}) är tidigare än nuvarande produktionsstart (${baseYear}).`);
  }

  const tpEff = tpBase + k;
  if (tpEff >= periodEndDatesUtc.length) {
    throw new Error(`Målår (${targetYear}) ger tp_eff=${tpEff}, vilket ligger utanför tidshorisonten (masterN=${periodEndDatesUtc.length - 1}).`);
  }

  const shiftedDeep = shiftPerPeriodArraysDeep(projectRaw, periodEndDatesUtc.length, k);
  const shifted = shiftedDeep.value as Record<string, unknown>;
  const shiftedTime = { ...(shifted.time as Record<string, unknown>), productionStartPeriod: tpEff };
  shifted.time = shiftedTime;

  return {
    shifted,
    shiftedSeriesCount: shiftedDeep.shiftedSeriesCount,
    k,
    tpBase,
    tpEff,
  };
}

export default function CompanyProjectsEditorPage() {
  const symbol = useMemo(() => parseSymbolFromPath(window.location.pathname), []);
  const startWithNewDraft = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('action') === 'new';
  }, []);
  const [projects, setProjects] = useState<CompanyProjectSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [isNewDraft, setIsNewDraft] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectIdInput, setProjectIdInput] = useState('');
  const [projectNameInput, setProjectNameInput] = useState('');
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [savedRawJson, setSavedRawJson] = useState<string | null>(null);

  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorInfo, setEditorInfo] = useState<string | null>(null);
  const [lastSavedAtUtc, setLastSavedAtUtc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [delayTargetYearInput, setDelayTargetYearInput] = useState('');

  const parsedValidation = useMemo(() => validateProjectJson(rawJsonInput), [rawJsonInput]);

  async function refreshList(nextSelectedProjectId?: string): Promise<CompanyProjectSummary[]> {
    if (!symbol) {
      setListError('Missing symbol in route.');
      return [];
    }
    setLoadingList(true);
    setListError(null);
    try {
      const data = await listCompanyProjects(symbol);
      setProjects(data);
      if (nextSelectedProjectId) {
        setSelectedProjectId(nextSelectedProjectId);
      }
      return data;
    } catch (error) {
      setListError((error as Error).message);
      return [];
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void refreshList();
  }, [symbol]);

  useEffect(() => {
    if (!startWithNewDraft || loadingList || projects.length > 0 || isNewDraft) {
      return;
    }
    startNewFromTemplate();
  }, [startWithNewDraft, loadingList, projects.length, isNewDraft]);

  const hasProjects = projects.length > 0;

  async function loadExistingProject(projectId: string): Promise<void> {
    if (!symbol) return;

    setEditorError(null);
    setEditorInfo(null);
    setLoadingProject(true);
    try {
      const project = await getCompanyProject(symbol, projectId);
      const rawJson = JSON.stringify(buildProjectJsonV1Template(project.raw_json as never), null, 2);
      setIsNewDraft(false);
      setSelectedProjectId(project.project_id);
      setProjectIdInput(project.project_id);
      setProjectNameInput(project.project_name ?? '');
      setRawJsonInput(rawJson);
      setSavedRawJson(rawJson);
      setLastSavedAtUtc(project.updated_at_utc);
    } catch (error) {
      setEditorError((error as Error).message);
      await refreshList();
    } finally {
      setLoadingProject(false);
    }
  }

  function startNewFromTemplate(): void {
    const existing = new Set(projects.map((project) => project.project_id));
    let index = 1;
    while (existing.has(`p${index}`)) {
      index += 1;
    }
    const projectId = `p${index}`;
    const rawJson = formatTemplate(projectId, '');

    setIsNewDraft(true);
    setSelectedProjectId('');
    setProjectIdInput(projectId);
    setProjectNameInput('');
    setRawJsonInput(rawJson);
    setSavedRawJson(null);
    setLastSavedAtUtc(null);
    setEditorError(null);
    setEditorInfo('Created a new draft from template.');
  }

  function handleValidate(): void {
    if (!parsedValidation.ok) {
      setEditorError(parsedValidation.error);
      return;
    }

    setEditorError(null);
    setEditorInfo(parsedValidation.warning ?? 'JSON is valid locally. Save to run full server validation.');
  }

  function handlePrettify(): void {
    if (!parsedValidation.ok || !parsedValidation.parsed) {
      setEditorError(parsedValidation.error);
      return;
    }

    const pretty = JSON.stringify(parsedValidation.parsed, null, 2);
    setRawJsonInput(pretty);
    setEditorError(null);
    setEditorInfo(parsedValidation.warning ?? 'JSON prettified.');
  }

  async function handleCopyTemplate(): Promise<void> {
    const template = formatTemplate('p1', '');
    try {
      await copyText(template);
      setEditorInfo('Blank template copied to clipboard.');
    } catch (error) {
      setEditorError(`Failed to copy template: ${(error as Error).message}`);
    }
  }

  async function handleSave(): Promise<void> {
    if (!symbol) {
      setEditorError('Cannot save: symbol is missing from route.');
      return;
    }

    if (!parsedValidation.ok || !parsedValidation.parsed) {
      setEditorError(parsedValidation.error);
      return;
    }

    if (!projectIdInput.trim()) {
      setEditorError('project_id is required.');
      return;
    }

    setSaving(true);
    setEditorError(null);
    setEditorInfo(null);

    try {
      const result = await upsertCompanyProject({
        symbol,
        project_id: projectIdInput.trim(),
        project_name: projectNameInput.trim() || null,
        raw_json: parsedValidation.parsed,
      });

      setIsNewDraft(false);
      setSelectedProjectId(result.project_id);
      setLastSavedAtUtc(result.updated_at_utc);
      setSavedRawJson(rawJsonInput);
      setEditorInfo(`Saved successfully at ${result.updated_at_utc}.`);
      await refreshList(result.project_id);
    } catch (error) {
      setEditorError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(projectId: string): Promise<void> {
    if (!symbol) return;
    const confirmed = window.confirm(`Delete project "${projectId}" for ${symbol}?`);
    if (!confirmed) return;

    try {
      await deleteCompanyProject({ symbol, project_id: projectId });
      setEditorInfo(`Deleted ${projectId}.`);
      setEditorError(null);

      if (selectedProjectId === projectId || (isNewDraft && projectIdInput === projectId)) {
        setSelectedProjectId('');
        setProjectIdInput('');
        setProjectNameInput('');
        setRawJsonInput('');
        setSavedRawJson(null);
        setLastSavedAtUtc(null);
      }

      await refreshList();
    } catch (error) {
      setEditorError((error as Error).message);
    }
  }

  function handleResetToSaved(): void {
    if (savedRawJson == null) return;
    setRawJsonInput(savedRawJson);
    setEditorError(null);
    setEditorInfo('Reset to last saved JSON.');
  }



  function handleShiftProductionToYear(): void {
    if (!parsedValidation.ok || !parsedValidation.parsed) {
      setEditorError(parsedValidation.error);
      return;
    }

    const targetYear = Number.parseInt(delayTargetYearInput.trim(), 10);
    if (!Number.isInteger(targetYear)) {
      setEditorError('Ange ett giltigt målår, t.ex. 2030.');
      return;
    }

    try {
      const shifted = shiftProjectToTargetProductionYear(parsedValidation.parsed, targetYear);
      setRawJsonInput(JSON.stringify(shifted.shifted, null, 2));
      setEditorError(null);
      setEditorInfo(
        `Försköt produktionen med k=${shifted.k} perioder (tp ${shifted.tpBase} -> ${shifted.tpEff}) mot målår ${targetYear}. Skiftade serier: ${shifted.shiftedSeriesCount}.`,
      );
    } catch (error) {
      setEditorError((error as Error).message);
    }
  }

  const canSave = Boolean(symbol) && parsedValidation.ok && !saving;

  return (
    <div className="project-editor-page">
      <header className="project-editor-header">
        <h1>Projects for {symbol || '—'}</h1>
        <a href="/">Back to dashboard</a>
      </header>

      <div className="project-editor-layout">
        <aside className="project-list-panel">
          <div className="project-list-header">
            <h2>Projects for {symbol || '—'}</h2>
            <button type="button" onClick={startNewFromTemplate} disabled={!symbol}>New from template</button>
          </div>

          {loadingList && <p>Loading projects…</p>}
          {listError && <p className="status error">{listError}</p>}

          {!loadingList && !listError && !hasProjects && <p>No projects stored. Click “New from template”.</p>}

          <ul className="project-list">
            {projects.map((project) => (
              <li key={project.project_id} className={selectedProjectId === project.project_id ? 'selected' : ''}>
                <div>
                  <strong>{project.project_id}</strong>
                  <div>{project.project_name || '—'}</div>
                  <small>{project.updated_at_utc}</small>
                </div>
                <div className="project-row-actions">
                  <button type="button" onClick={() => void loadExistingProject(project.project_id)}>Edit</button>
                  <button type="button" className="danger" onClick={() => void handleDelete(project.project_id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <section className="project-editor-panel">
          <h2>Editor</h2>

          {!symbol && <p className="status error">Symbol missing from route. Use /company/:symbol/projects.</p>}

          {loadingProject && <p>Loading project…</p>}

          <div className="field-grid">
            <label>
              <span>project_id</span>
              <input
                type="text"
                value={projectIdInput}
                onChange={(event) => setProjectIdInput(event.target.value)}
                disabled={!isNewDraft}
              />
            </label>
            <label>
              <span>project_name</span>
              <input type="text" value={projectNameInput} onChange={(event) => setProjectNameInput(event.target.value)} />
            </label>
          </div>

          

          <div className="scenario-shift-controls">
            <h3>Scenario: förskjut produktion framåt</h3>
            <p className="save-meta">Ange målår för produktionsstart. Editorn flyttar då alla per-periodserier framåt lika mycket och uppdaterar productionStartPeriod.</p>
            <div className="field-grid">
              <label>
                <span>Målår för produktionsstart</span>
                <input
                  type="number"
                  value={delayTargetYearInput}
                  onChange={(event) => setDelayTargetYearInput(event.target.value)}
                  placeholder="t.ex. 2030"
                />
              </label>
            </div>
            <div className="editor-actions">
              <button type="button" onClick={handleShiftProductionToYear}>Förskjut till målår</button>
            </div>
          </div>

          {editorError && <p className="status error">{editorError}</p>}
          {editorInfo && <p className="status ok">{editorInfo}</p>}

          <label className="json-label">
            <span>raw JSON</span>
            <textarea
              rows={24}
              value={rawJsonInput}
              onChange={(event) => {
                setRawJsonInput(event.target.value);
                setEditorError(null);
              }}
            />
          </label>

          <p className="save-meta">
            Optional JSON hints: operations.gradeByMetal is per-period head grade in the unit defined by operations.gradeUnitByMetal;
            operations.recoveryPctByMetal is per-period metallurgical recovery (0..1 or 0..100);
            metals.priceKeyByMetal examples include Au: XAU_USD_TOZ and Ag: XAG_USD_TOZ;
            series.depreciationUSD is optional for EBITDA display (if omitted, EBITDA shows null).
          </p>

          <div className="editor-actions">
            <button type="button" onClick={handleValidate}>Validate</button>
            <button type="button" onClick={() => void handleSave()} disabled={!canSave}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => void handleCopyTemplate()}>Copy template</button>
            <button type="button" onClick={handlePrettify}>Prettify JSON</button>
            <button type="button" onClick={handleResetToSaved} disabled={savedRawJson == null}>Reset to saved</button>
          </div>

          <p className="save-meta">Last successful save (UTC): <strong>{lastSavedAtUtc ?? '—'}</strong></p>
        </section>
      </div>
    </div>
  );
}
