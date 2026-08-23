import { useEffect, useMemo, useState } from 'react';
import {
  deleteCompanyCorporateProducer,
  getCompanyCorporateProducer,
  upsertCompanyCorporateProducer,
} from '../lib/client/companyCorporateProducerClient.ts';
import { copyText } from '../lib/client/clipboard.ts';
import { validateProducerJsonV1 } from '../lib/miningProducer/schema.ts';
import type { ProducerJsonV1 } from '../lib/miningProducer/types.ts';
import '../styles/company-project-editor.css';

function parseSymbol(pathname: string): string {
  const match = pathname.match(/^\/company\/([^/]+)\/corporate\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]).toUpperCase() : '';
}

function buildTemplate(symbol: string): Record<string, unknown> {
  return {
    version: 'producer_json_v1',
    company: {
      id: symbol.toLowerCase(),
      name: '',
      reportingCurrency: 'USD',
      primarySecurity: {
        ticker: symbol,
        exchange: '',
        quoteCurrency: 'USD',
        securityType: 'common',
      },
    },
    valuation: {
      valuationDateUtc: new Date().toISOString().slice(0, 10),
    },
    reportedPriceDecks: [],
    projects: [],
    corporateCosts: [],
    reportedMetrics: [],
    sources: [],
  };
}

type Validation = {
  ok: boolean;
  error: string | null;
  parsed: ProducerJsonV1 | null;
};

function validateRaw(raw: string, symbol: string): Validation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${(error as Error).message}`, parsed: null };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'JSON root must be an object.', parsed: null };
  }
  try {
    const producer = validateProducerJsonV1(parsed as ProducerJsonV1);
    const ticker = producer.company.primarySecurity?.ticker?.trim().toUpperCase();
    if (!ticker) {
      return { ok: false, error: 'company.primarySecurity.ticker is required for Corporate Producer JSON.', parsed: null };
    }
    if (ticker !== symbol) {
      return {
        ok: false,
        error: `company.primarySecurity.ticker (${ticker}) must match route symbol ${symbol}.`,
        parsed: null,
      };
    }
    return { ok: true, error: null, parsed: producer };
  } catch (error) {
    return { ok: false, error: (error as Error).message, parsed: null };
  }
}

export default function CompanyCorporateProducerEditorPage() {
  const symbol = useMemo(() => parseSymbol(window.location.pathname), []);
  const [raw, setRaw] = useState('');
  const [savedRaw, setSavedRaw] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const validation = useMemo(() => validateRaw(raw, symbol), [raw, symbol]);
  const dirty = savedRaw !== null ? raw !== savedRaw : raw.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getCompanyCorporateProducer(symbol)
      .then((record) => {
        if (cancelled) return;
        if (record) {
          const pretty = JSON.stringify(record.raw_json, null, 2);
          setRaw(pretty);
          setSavedRaw(pretty);
          setUpdatedAt(record.updated_at_utc);
          setInfo('Loaded saved Corporate Producer JSON.');
        } else {
          const template = JSON.stringify(buildTemplate(symbol), null, 2);
          setRaw(template);
          setSavedRaw(null);
          setUpdatedAt(null);
          setInfo('No Corporate Producer JSON exists for this company. Created a new draft from template.');
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError((loadError as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [symbol]);

  function prettify(): void {
    if (!validation.ok || !validation.parsed) {
      setError(validation.error);
      return;
    }
    setRaw(JSON.stringify(validation.parsed, null, 2));
    setError(null);
    setInfo('JSON prettified.');
  }

  async function copyTemplate(): Promise<void> {
    try {
      await copyText(JSON.stringify(buildTemplate(symbol), null, 2));
      setInfo('Blank producer_json_v1 template copied.');
      setError(null);
    } catch (copyError) {
      setError((copyError as Error).message);
    }
  }

  async function save(): Promise<void> {
    if (!validation.ok || !validation.parsed) {
      setError(validation.error);
      return;
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const result = await upsertCompanyCorporateProducer({
        symbol,
        raw_json: validation.parsed as unknown as Record<string, unknown>,
      });
      const pretty = JSON.stringify(validation.parsed, null, 2);
      setRaw(pretty);
      setSavedRaw(pretty);
      setUpdatedAt(result.updated_at_utc);
      setInfo('Corporate Producer JSON saved. The company is now eligible for COMPARE STOCKS.');
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete Corporate Producer JSON for ${symbol}? The company will disappear from COMPARE STOCKS.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCompanyCorporateProducer(symbol);
      const template = JSON.stringify(buildTemplate(symbol), null, 2);
      setRaw(template);
      setSavedRaw(null);
      setUpdatedAt(null);
      setInfo('Corporate Producer JSON deleted. The company is no longer part of the peer set.');
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="project-editor-page">
      <div className="project-editor-header">
        <div>
          <h1>Corporate JSON — {symbol}</h1>
          <div>Datakälla: <strong>producer_json_v1</strong></div>
        </div>
        <button type="button" onClick={() => { window.location.href = '/'; }}>Till Instrumentbrädan</button>
      </div>

      <div className="project-editor-panel">
        <p>
          COMPARE STOCKS läser endast sparade Corporate Producer JSON. Bolag utan JSON visas inte.
          Spotpriser, FX, market cap och värderingsdatum hämtas vid körning och ska inte hårdkodas som dagens värden i bolagsdatan.
        </p>
        <p>
          För REPORTED-läge kan ett prisdeck ange <code>appliesTo: {'{'} startYear, endYear {'}'}</code>.
          Om flera decks matchar samma år betraktas valet som tvetydigt i stället för att gissas.
        </p>

        {loading ? <p>Laddar…</p> : (
          <>
            <label className="json-label">
              <span>Raw JSON</span>
              <textarea
                rows={34}
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                spellCheck={false}
              />
            </label>

            <div className="editor-actions">
              <button type="button" onClick={() => {
                if (validation.ok) {
                  setError(null);
                  setInfo('JSON is valid locally. Save to run server validation and persist it.');
                } else {
                  setError(validation.error);
                }
              }}>Validera</button>
              <button type="button" onClick={prettify}>Prettify</button>
              <button type="button" onClick={() => void copyTemplate()}>Kopiera template</button>
              <button type="button" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Sparar…' : 'Spara'}</button>
              {savedRaw !== null && <button type="button" className="danger" disabled={saving} onClick={() => void remove()}>Radera JSON</button>}
            </div>

            <div className="save-meta">
              <div>Local validation: <strong>{validation.ok ? 'OK' : 'FEL'}</strong></div>
              {updatedAt && <div>Senast sparad: {updatedAt}</div>}
              {dirty && <div>Osparade ändringar</div>}
            </div>
          </>
        )}

        {info && <p>{info}</p>}
        {error && <p className="danger">{error}</p>}
      </div>
    </div>
  );
}
