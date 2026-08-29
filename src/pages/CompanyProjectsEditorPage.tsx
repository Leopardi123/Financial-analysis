import { useEffect, useMemo, useState } from 'react';
import {
  deleteCompanyProject,
  getCompanyProject,
  listAllCompanyProjects,
  upsertCompanyProject,
  type CompanyProjectSummary,
} from '../lib/client/companyProjectsClient.ts';
import { copyText } from '../lib/client/clipboard.ts';
import { parseProjectJsonV1 } from '../lib/project/jsonv1/parse.ts';
import { buildProjectJsonV1Template } from '../lib/project/jsonv1/template.ts';
import { shiftProjectToTargetProductionYear } from './companyProjectShift.ts';
import { convertProjectJsonV1ToV2 } from '../lib/projectJson/convertV1ToV2.ts';
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

function readRootTime(root: Record<string, unknown>): Record<string, unknown> | null {
  const time = root.time;
  if (typeof time !== 'object' || time === null || Array.isArray(time)) {
    return null;
  }
  return time as Record<string, unknown>;
}

function parseStrictYear(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2200
    ? value
    : null;
}

function stripPeriodEndDatesForV2(root: Record<string, unknown>): Record<string, unknown> {
  if (root.version !== 'project_json_v2') return root;
  const clone = JSON.parse(JSON.stringify(root)) as Record<string, unknown>;
  const time = readRootTime(clone);
  const legacyPeriodDatesKey = `periodEnd${'DatesUtc'}`;
  if (time && Object.prototype.hasOwnProperty.call(time, legacyPeriodDatesKey)) {
    delete time[legacyPeriodDatesKey];
  }
  return clone;
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
  if (version !== 'project_json_v2') {
    return {
      ok: false,
      error: 'raw.version must be "project_json_v2". Update version to project_json_v2 and add time.productionStartYear.',
      warning: null,
      parsed: null,
    };
  }

  const time = readRootTime(root as Record<string, unknown>);
  if (!time) {
    return { ok: false, error: 'time must be an object and include time.productionStartYear.', warning: null, parsed: null };
  }

  if (!Object.prototype.hasOwnProperty.call(time, 'productionStartYear')) {
    return { ok: false, error: 'time.productionStartYear is required for project_json_v2.', warning: null, parsed: null };
  }

  const productionStartYear = parseStrictYear(time.productionStartYear);
  if (productionStartYear === null) {
    return {
      ok: false,
      error: 'time.productionStartYear must be a 4-digit integer in range 1900–2200.',
      warning: null,
      parsed: null,
    };
  }

  try {
    parseProjectJsonV1(root);
  } catch (error) {
    return { ok: false, error: (error as Error).message, warning, parsed: null };
  }

  return { ok: true, error: null, warning, parsed: root as Record<string, unknown> };
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
  const [manualProductionStartDraft, setManualProductionStartDraft] = useState<{ period: number; year: number } | null>(null);

  const parsedValidation = useMemo(() => validateProjectJson(rawJsonInput), [rawJsonInput]);
  const parsedTime = useMemo(() => {
    if (!parsedValidation.ok || !parsedValidation.parsed) {
      return null;
    }
    return readRootTime(parsedValidation.parsed);
  }, [parsedValidation]);
  const productionStartPeriodValue = useMemo(
    () => (Number.isInteger(parsedTime?.productionStartPeriod) ? String(parsedTime?.productionStartPeriod) : ''),
    [parsedTime],
  );
  const productionStartYearValue = useMemo(
    () => (Number.isInteger(parsedTime?.productionStartYear) ? String(parsedTime?.productionStartYear) : ''),
    [parsedTime],
  );
  const editorNowYear = useMemo(() => {
    const productionStartYear = Number.isInteger(parsedTime?.productionStartYear)
      ? parsedTime?.productionStartYear as number
      : null;
    const productionStartPeriod = Number.isInteger(parsedTime?.productionStartPeriod)
      ? parsedTime?.productionStartPeriod as number
      : null;
    if (productionStartYear !== null && productionStartPeriod !== null) {
      return productionStartYear - productionStartPeriod;
    }
    return new Date().getUTCFullYear();
  }, [parsedTime]);

  const alreadyProducing = useMemo(
    () => Number.isInteger(parsedTime?.productionStartPeriod)
      && Number.isInteger(parsedTime?.productionStartYear)
      && (parsedTime?.productionStartPeriod as number) === 0
      && (parsedTime?.productionStartYear as number) === editorNowYear,
    [editorNowYear, parsedTime],
  );

  const productionStartInconsistencyWarning = useMemo(() => {
    if (alreadyProducing) return null;
    const productionStartPeriod = Number.isInteger(parsedTime?.productionStartPeriod)
      ? parsedTime?.productionStartPeriod as number
      : null;
    const productionStartYear = Number.isInteger(parsedTime?.productionStartYear)
      ? parsedTime?.productionStartYear as number
      : null;
    if (productionStartPeriod === 0 && productionStartYear !== null && productionStartYear > editorNowYear) {
      return 'Warning: productionStartPeriod=0 while productionStartYear is in the future relative to model now year.';
    }
    return null;
  }, [alreadyProducing, editorNowYear, parsedTime]);

  function updateTimeField(field: 'productionStartPeriod' | 'productionStartYear', value: number): void {
    if (!parsedValidation.ok || !parsedValidation.parsed) {
      setEditorError(parsedValidation.error ?? 'Fix JSON validation errors before editing time fields.');
      return;
    }

    const nextRoot = JSON.parse(JSON.stringify(parsedValidation.parsed)) as Record<string, unknown>;
    const time = readRootTime(nextRoot);
    if (!time) {
      setEditorError('time must be an object in raw JSON.');
      return;
    }

    time[field] = value;
    setRawJsonInput(JSON.stringify(stripPeriodEndDatesForV2(nextRoot), null, 2));
    setEditorError(null);
  }

  function updateProductionStartFields(period: number, year: number): void {
    if (!parsedValidation.ok || !parsedValidation.parsed) {
      setEditorError(parsedValidation.error ?? 'Fix JSON validation errors before editing time fields.');
      return;
    }

    const nextRoot = JSON.parse(JSON.stringify(parsedValidation.parsed)) as Record<string, unknown>;
    const time = readRootTime(nextRoot);
    if (!time) {
      setEditorError('time must be an object in raw JSON.');
      return;
    }

    time.productionStartPeriod = period;
    time.productionStartYear = year;
    setRawJsonInput(JSON.stringify(stripPeriodEndDatesForV2(nextRoot), null, 2));
    setEditorError(null);
  }

  function handleAlreadyProducingToggle(checked: boolean): void {
    if (checked) {
      const currentPeriod = Number.isInteger(parsedTime?.productionStartPeriod)
        ? parsedTime?.productionStartPeriod as number
        : null;
      const currentYear = Number.isInteger(parsedTime?.productionStartYear)
        ? parsedTime?.productionStartYear as number
        : null;
      if (currentPeriod !== null && currentYear !== null && !alreadyProducing) {
        setManualProductionStartDraft({ period: currentPeriod, year: currentYear });
      }
      updateProductionStartFields(0, editorNowYear);
      return;
    }

    if (manualProductionStartDraft) {
      updateProductionStartFields(manualProductionStartDraft.period, manualProductionStartDraft.year);
      return;
    }

    setEditorError(null);
  }

  async function refreshList(nextSelectedProjectId?: string): Promise<CompanyProjectSummary[]> {
    if (!symbol) {
      setListError('Missing symbol in route.');
      return [];
    }
    setLoadingList(true);
    setListError(null);
    try {
      const data = await listAllCompanyProjects(symbol);
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
      const rawJson = JSON.stringify(stripPeriodEndDatesForV2(project.raw_json as Record<string, unknown>), null, 2);
      setIsNewDraft(false);
      setSelectedProjectId(project.project_id);
      setProjectIdInput(project.project_id);
      setProjectNameInput(project.project_name ?? '');
      setRawJsonInput(rawJson);
      setSavedRawJson(rawJson);
      setLastSavedAtUtc(project.updated_at_utc);
      setManualProductionStartDraft(null);
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
    setManualProductionStartDraft(null);
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

    const pretty = JSON.stringify(stripPeriodEndDatesForV2(parsedValidation.parsed), null, 2);
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
      const rawForSave = JSON.parse(JSON.stringify(parsedValidation.parsed)) as Record<string, unknown>;
      if (alreadyProducing) {
        const time = readRootTime(rawForSave);
        if (!time) {
          setEditorError('time must be an object in raw JSON.');
          setSaving(false);
          return;
        }
        time.productionStartPeriod = 0;
        time.productionStartYear = editorNowYear;
      }

      const result = await upsertCompanyProject({
        symbol,
        project_id: projectIdInput.trim(),
        project_name: projectNameInput.trim() || null,
        raw_json: stripPeriodEndDatesForV2(rawForSave),
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

  async function handleSetProjectDisabled(project: CompanyProjectSummary, disabled: boolean): Promise<void> {
    if (!symbol) return;

    if (
      selectedProjectId === project.project_id
      && savedRawJson !== null
      && rawJsonInput !== savedRawJson
    ) {
      setEditorError('Projektet har osparade ändringar. Spara eller återställ innan status ändras.');
      return;
    }

    try {
      const stored = await getCompanyProject(symbol, project.project_id);
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
        if (Object.keys(meta).length > 0) {
          raw.meta = meta;
        } else {
          delete raw.meta;
        }
      }

      const result = await upsertCompanyProject({
        symbol,
        project_id: stored.project_id,
        project_name: stored.project_name,
        raw_json: stripPeriodEndDatesForV2(raw),
      });

      setEditorError(null);
      setEditorInfo(disabled ? `Inaktiverade ${project.project_id}.` : `Aktiverade ${project.project_id}.`);

      if (selectedProjectId === project.project_id && !isNewDraft) {
        const pretty = JSON.stringify(stripPeriodEndDatesForV2(raw), null, 2);
        setRawJsonInput(pretty);
        setSavedRawJson(pretty);
        setLastSavedAtUtc(result.updated_at_utc);
      }

      await refreshList(project.project_id);
    } catch (error) {
      setEditorError((error as Error).message);
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
        setManualProductionStartDraft(null);
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

  function handleConvertV1ToV2(): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJsonInput);
    } catch (error) {
      setEditorError(`Invalid JSON: ${(error as Error).message || 'Unable to parse JSON.'}`);
      setEditorInfo(null);
      return;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setEditorError('JSON root must be an object.');
      setEditorInfo(null);
      return;
    }

    const root = parsed as Record<string, unknown>;
    if (root.version !== 'project_json_v1') {
      setEditorError(null);
      setEditorInfo('Only v1 can be converted.');
      return;
    }

    const hasUnsavedChanges = savedRawJson == null ? rawJsonInput.trim().length > 0 : rawJsonInput !== savedRawJson;
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('This will overwrite the editor content.');
      if (!confirmed) {
        return;
      }
    }

    try {
      const converted = convertProjectJsonV1ToV2(root);
      setRawJsonInput(JSON.stringify(converted, null, 2));
      setEditorError(null);
      setEditorInfo('Converted project JSON from v1 to v2.');
    } catch (error) {
      setEditorError((error as Error).message || 'Failed to convert project JSON.');
      setEditorInfo(null);
    }
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
      setRawJsonInput(JSON.stringify(stripPeriodEndDatesForV2(shifted.shifted), null, 2));
      setEditorError(null);
      setEditorInfo(
        `Försköt produktionen med k=${shifted.k} perioder (tp_base ${shifted.tpBase} -> tp_eff ${shifted.tpEff}) mot målår ${targetYear}. Uppdaterade productionStartYear=${targetYear}, flyttade per-periodserier utan truncering och ökade masterN med ${shifted.k}. Skiftade serier: ${shifted.shiftedSeriesCount}.`,
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
                  <small>{project.disabled ? 'Inaktiverat · ' : ''}{project.updated_at_utc}</small>
                </div>
                <div className="project-row-actions">
                  <button type="button" onClick={() => void loadExistingProject(project.project_id)}>Edit</button>
                  <button type="button" onClick={() => void handleSetProjectDisabled(project, !project.disabled)}>
                    {project.disabled ? 'Aktivera' : 'Inaktivera'}
                  </button>
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
            <div className="checkbox-field">
              <span>Production status</span>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={alreadyProducing}
                  onChange={(event) => handleAlreadyProducingToggle(event.target.checked)}
                />
                <span>Already producing (in production now)</span>
              </label>
              <small>Sets productionStartPeriod=0 and productionStartYear to the model's current year ({editorNowYear}).</small>
            </div>
            <label>
              <span>time.productionStartPeriod (tp)</span>
              <input
                type="number"
                value={productionStartPeriodValue}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  if (!Number.isInteger(next) || next < 0) {
                    setEditorError('time.productionStartPeriod must be an integer >= 0.');
                    return;
                  }
                  updateTimeField('productionStartPeriod', next);
                }}
                disabled={alreadyProducing}
                readOnly={alreadyProducing}
              />
            </label>
            <label>
              <span>time.productionStartYear (required)</span>
              <input
                type="number"
                required
                value={productionStartYearValue}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  if (!Number.isInteger(next) || next < 1900 || next > 2200) {
                    setEditorError('time.productionStartYear must be a 4-digit integer in range 1900–2200.');
                    return;
                  }
                  updateTimeField('productionStartYear', next);
                }}
                disabled={alreadyProducing}
                readOnly={alreadyProducing}
              />
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
          {productionStartInconsistencyWarning && <p className="save-meta">{productionStartInconsistencyWarning}</p>}

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
            Optional JSON hints: all monetary series are expected in full USD (whole dollars);
            ore/tonnage inputs are expected in whole tonnes;
            payable quantities are expected in whole physical units declared by metals.payableQtyUnitByMetal;
            operations.gradeByMetal is per-period head grade in the unit defined by operations.gradeUnitByMetal;
            operations.recoveryPctByMetal is per-period metallurgical recovery (0..1 or 0..100);
            metals.priceKeyByMetal examples include Au: XAU_USD_TOZ, Ag: XAG_USD_TOZ, and Cu: CU_USD_LB or CU_USD_TONNE;
            Copper: CU_USD_LB = COMEX basis, CU_USD_TONNE = LME basis. If CU_USD_TONNE series is missing, system can derive from CU_USD_LB using 1 tonne = 2204.6226218 lb (warns about basis).
            series.depreciationUSD is optional for EBITDA display (if omitted, EBITDA shows null).
          </p>

          <div className="editor-actions">
            <button type="button" onClick={handleValidate}>Validate</button>
            <button type="button" onClick={() => void handleSave()} disabled={!canSave}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => void handleCopyTemplate()}>Copy template</button>
            <button type="button" onClick={handlePrettify}>Prettify JSON</button>
            <button type="button" onClick={handleConvertV1ToV2}>Convert v1 → v2</button>
            <button type="button" onClick={handleResetToSaved} disabled={savedRawJson == null}>Reset to saved</button>
          </div>

          <p className="save-meta">Last successful save (UTC): <strong>{lastSavedAtUtc ?? '—'}</strong></p>
        </section>
      </div>
    </div>
  );
}
