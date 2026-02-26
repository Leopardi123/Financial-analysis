import { useMemo, useState } from 'react';
import type { SnapshotRequest, SnapshotScenario } from '../lib/api/validateSnapshotRequest.ts';
import { postCorporateSnapshot } from '../lib/client/snapshotClient.ts';
import { prettifyJson, safeParseJson } from '../lib/client/json.ts';
import { getProjectJsonV1Template } from '../lib/project/jsonv1/template.ts';

type Mode = 'spot' | 'percentile' | 'fixed';
type FxSource = 'auto' | 'manual';

type NumberInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function NumberInput({ label, value, onChange, placeholder }: NumberInputProps) {
  return (
    <label className="playground-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseRequiredNumber(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

const initialProjectPayload = JSON.stringify([{ projectId: 'p1', rawJson: getProjectJsonV1Template() }], null, 2);

export default function PlaygroundSnapshot() {
  const [projectsJson, setProjectsJson] = useState(initialProjectPayload);
  const [targetCurrency, setTargetCurrency] = useState<'USD' | 'SEK' | 'CAD' | 'EUR'>('USD');
  const [discountRate, setDiscountRate] = useState('0.10');

  const [sharesCurrent, setSharesCurrent] = useState('100000000');
  const [priceCurrent, setPriceCurrent] = useState('1.50');
  const [preferredEquity, setPreferredEquity] = useState('');
  const [minorityInterest, setMinorityInterest] = useState('');

  const [cashT0, setCashT0] = useState('0');
  const [debtT0, setDebtT0] = useState('0');

  const [useDefaultFinancing, setUseDefaultFinancing] = useState(true);
  const [useCashFirst, setUseCashFirst] = useState(true);
  const [cashUseCap, setCashUseCap] = useState('');
  const [debtFraction, setDebtFraction] = useState('0.5');
  const [equityFraction, setEquityFraction] = useState('0.5');
  const [equityRaisePrice, setEquityRaisePrice] = useState('');

  const [scenarioMode, setScenarioMode] = useState<Mode>('spot');
  const [lookbackYears, setLookbackYears] = useState('10');
  const [percentile, setPercentile] = useState('50');
  const [fixedPriceMap, setFixedPriceMap] = useState(JSON.stringify({ XAU_USD_TOZ: 2400, CU_USD_LB: 4.1, FX_USD_SEK: 10.5 }, null, 2));

  const [fxSource, setFxSource] = useState<FxSource>('auto');
  const [manualFx, setManualFx] = useState('');
  const [fxAnchor, setFxAnchor] = useState<'today' | 't0_period_end'>('today');
  const [fxScenarioSameAsScenario, setFxScenarioSameAsScenario] = useState(true);
  const [fxScenarioMode, setFxScenarioMode] = useState<Mode>('spot');

  const [jsonError, setJsonError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });

  const buildScenario = (mode: Mode, fixedMap?: Record<string, number>): SnapshotScenario => {
    if (mode === 'percentile') {
      return {
        mode: 'percentile',
        lookbackYears: Number(lookbackYears) || 10,
        percentile: Number(percentile) || 50,
        window: 'trailing',
        sampling: 'eod_close',
        anchor: 'period_end',
      };
    }

    if (mode === 'fixed') {
      return { mode: 'fixed', fixedPriceByKey: fixedMap ?? {} };
    }

    return { mode: 'spot' };
  };

  const runSnapshot = async () => {
    setJsonError(null);
    setRequestError(null);

    const parsedProjects = safeParseJson<SnapshotRequest['projects']>(projectsJson);
    if (!parsedProjects.ok) {
      setJsonError(`Projects JSON parse error: ${parsedProjects.error}`);
      return;
    }

    let fixedMap: Record<string, number> | undefined;
    if (scenarioMode === 'fixed' || (!fxScenarioSameAsScenario && fxScenarioMode === 'fixed')) {
      const parsedFixed = safeParseJson<Record<string, number>>(fixedPriceMap);
      if (!parsedFixed.ok || Array.isArray(parsedFixed.value)) {
        setJsonError(`Fixed scenario map parse error: ${parsedFixed.ok ? 'Expected object map' : parsedFixed.error}`);
        return;
      }
      fixedMap = parsedFixed.value;
    }

    const payload: SnapshotRequest = {
      targetCurrency,
      discountRate: parseRequiredNumber(discountRate),
      projects: parsedProjects.value,
      market: {
        shares_current: parseRequiredNumber(sharesCurrent),
        price_current_TargetCurrency: parseRequiredNumber(priceCurrent),
        preferredEquity_TargetCurrency: parseOptionalNumber(preferredEquity),
        minorityInterest_TargetCurrency: parseOptionalNumber(minorityInterest),
      },
      balanceSheet: {
        cash_t0_TargetCurrency: parseOptionalNumber(cashT0),
        debt_t0_TargetCurrency: parseOptionalNumber(debtT0),
      },
      financingPlan: useDefaultFinancing
        ? undefined
        : {
            use_cash_first: useCashFirst,
            cash_use_cap_TargetCurrency: parseOptionalNumber(cashUseCap),
            debt_fraction: parseOptionalNumber(debtFraction),
            equity_fraction: parseOptionalNumber(equityFraction),
            equity_raise_price_TargetCurrency: parseOptionalNumber(equityRaisePrice),
          },
      scenario: buildScenario(scenarioMode, fixedMap),
      fx: {
        source: fxSource,
        anchor: fxAnchor,
        scenario: fxScenarioSameAsScenario ? buildScenario(scenarioMode, fixedMap) : buildScenario(fxScenarioMode, fixedMap),
        manual_fx_USD_to_TargetCurrency: parseOptionalNumber(manualFx),
      },
    };

    setLoading(true);
    try {
      const result = await postCorporateSnapshot(payload);
      setDiagnostics({
        errors: result.diagnostics?.errors ?? [],
        warnings: result.diagnostics?.warnings ?? [],
      });
      if (!result.ok || !result.snapshot) {
        setSnapshot(null);
        setRequestError('Snapshot request failed. Review diagnostics for details.');
        return;
      }

      setSnapshot(result.snapshot as unknown as Record<string, unknown>);
      setLastRunAt(new Date().toLocaleString());
    } catch (error) {
      setSnapshot(null);
      setRequestError(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo(() => {
    if (!snapshot) {
      return [] as Array<{ label: string; value: unknown }>;
    }

    const marketValue = (snapshot.marketValue ?? {}) as Record<string, unknown>;
    const financing = (snapshot.financing ?? {}) as Record<string, unknown>;
    const aggregation = (snapshot.aggregation ?? {}) as Record<string, unknown>;

    return [
      { label: 'NPV_today_TargetCurrency', value: snapshot.NPV_today_TargetCurrency },
      { label: 'NAV_today_TargetCurrency', value: snapshot.NAV_today_TargetCurrency },
      { label: 'EV_TargetCurrency', value: marketValue.EV_TargetCurrency },
      { label: 'EV/NPV', value: marketValue.EV_over_NPV },
      { label: 'P/NAV', value: marketValue.P_over_NAV },
      { label: 'AISC_corp', value: aggregation.aiscAuEqUSDPerOz_LOM },
      { label: 'shares_post_financing', value: financing.shares_post_financing },
    ];
  }, [snapshot]);

  return (
    <div className="playground-shell">
      <h1>Corporate Snapshot Playground</h1>
      <p className="playground-subtitle">Test /api/snapshot/corporate with project JSON v1 and scenario settings.</p>
      <div className="playground-grid">
        <section className="playground-card">
          <h2>Inputs</h2>
          <h3>Projects editor</h3>
          <textarea className="playground-textarea" rows={14} value={projectsJson} onChange={(event) => setProjectsJson(event.target.value)} />
          <div className="playground-actions">
            <button
              type="button"
              onClick={() => {
                setProjectsJson(JSON.stringify([{ projectId: 'p1', rawJson: getProjectJsonV1Template() }], null, 2));
                setTargetCurrency('USD');
                setDiscountRate('0.10');
                setSharesCurrent('100000000');
                setPriceCurrent('1.50');
              }}
            >
              Insert template (1 project)
            </button>
            <button
              type="button"
              onClick={() => {
                const pretty = prettifyJson(projectsJson);
                if (!pretty.ok) {
                  setJsonError(`Prettify failed: ${pretty.error}`);
                  return;
                }
                setProjectsJson(pretty.text);
                setJsonError(null);
              }}
            >
              Prettify JSON
            </button>
          </div>
          {jsonError ? <p className="playground-error">{jsonError}</p> : null}

          <h3>Corporate inputs</h3>
          <label className="playground-field"><span>targetCurrency</span><select value={targetCurrency} onChange={(event) => setTargetCurrency(event.target.value as 'USD' | 'SEK' | 'CAD' | 'EUR')}><option>USD</option><option>SEK</option><option>CAD</option><option>EUR</option></select></label>
          <NumberInput label="discountRate" value={discountRate} onChange={setDiscountRate} />

          <h3>Market inputs</h3>
          <NumberInput label="shares_current" value={sharesCurrent} onChange={setSharesCurrent} />
          <NumberInput label="price_current_TargetCurrency" value={priceCurrent} onChange={setPriceCurrent} />
          <NumberInput label="preferredEquity_TargetCurrency (optional)" value={preferredEquity} onChange={setPreferredEquity} />
          <NumberInput label="minorityInterest_TargetCurrency (optional)" value={minorityInterest} onChange={setMinorityInterest} />

          <h3>Balance sheet</h3>
          <NumberInput label="cash_t0_TargetCurrency" value={cashT0} onChange={setCashT0} />
          <NumberInput label="debt_t0_TargetCurrency" value={debtT0} onChange={setDebtT0} />

          <h3>Financing plan</h3>
          <label className="playground-inline"><input type="checkbox" checked={useDefaultFinancing} onChange={(event) => setUseDefaultFinancing(event.target.checked)} />Use defaults</label>
          {!useDefaultFinancing ? (
            <>
              <label className="playground-inline"><input type="checkbox" checked={useCashFirst} onChange={(event) => setUseCashFirst(event.target.checked)} />use_cash_first</label>
              <NumberInput label="cash_use_cap_TargetCurrency (optional)" value={cashUseCap} onChange={setCashUseCap} />
              <NumberInput label="debt_fraction" value={debtFraction} onChange={setDebtFraction} />
              <NumberInput label="equity_fraction" value={equityFraction} onChange={setEquityFraction} />
              <NumberInput label="equity_raise_price_TargetCurrency (optional)" value={equityRaisePrice} onChange={setEquityRaisePrice} />
            </>
          ) : null}

          <h3>Scenario</h3>
          <label className="playground-field"><span>mode</span><select value={scenarioMode} onChange={(event) => setScenarioMode(event.target.value as Mode)}><option value="spot">spot</option><option value="percentile">percentile</option><option value="fixed">fixed</option></select></label>
          {scenarioMode === 'percentile' ? (
            <>
              <NumberInput label="lookbackYears" value={lookbackYears} onChange={setLookbackYears} />
              <NumberInput label="percentile" value={percentile} onChange={setPercentile} />
            </>
          ) : null}
          {scenarioMode === 'fixed' ? (
            <label className="playground-field">
              <span>fixedPriceByKey map</span>
              <textarea className="playground-textarea" rows={5} value={fixedPriceMap} onChange={(event) => setFixedPriceMap(event.target.value)} />
            </label>
          ) : null}

          <h3>FX mode</h3>
          <label className="playground-field"><span>source</span><select value={fxSource} onChange={(event) => setFxSource(event.target.value as FxSource)}><option value="auto">auto</option><option value="manual">manual</option></select></label>
          {fxSource === 'manual' ? <NumberInput label="manual_fx_USD_to_TargetCurrency" value={manualFx} onChange={setManualFx} /> : null}
          <label className="playground-field"><span>anchor</span><select value={fxAnchor} onChange={(event) => setFxAnchor(event.target.value as 'today' | 't0_period_end')}><option value="today">today</option><option value="t0_period_end">t0_period_end</option></select></label>
          <label className="playground-inline"><input type="checkbox" checked={fxScenarioSameAsScenario} onChange={(event) => setFxScenarioSameAsScenario(event.target.checked)} />same as scenario</label>
          {!fxScenarioSameAsScenario ? (
            <label className="playground-field"><span>fx scenario mode</span><select value={fxScenarioMode} onChange={(event) => setFxScenarioMode(event.target.value as Mode)}><option value="spot">spot</option><option value="percentile">percentile</option><option value="fixed">fixed</option></select></label>
          ) : null}

          <button type="button" onClick={() => void runSnapshot()} disabled={loading}>
            {loading ? 'Running…' : 'Run snapshot'}
          </button>
          {lastRunAt ? <p className="playground-subtitle">Last run: {lastRunAt}</p> : null}
          {requestError ? <p className="playground-error">{requestError}</p> : null}
        </section>

        <section className="playground-card">
          <h2>Output</h2>
          <h3>Diagnostics</h3>
          <div>
            <p><strong>Errors</strong></p>
            {diagnostics.errors.length ? diagnostics.errors.map((error) => <p className="playground-error" key={error}>{error}</p>) : <p>None</p>}
            <p><strong>Warnings</strong></p>
            {diagnostics.warnings.length ? diagnostics.warnings.map((warning) => <p className="playground-warning" key={warning}>{warning}</p>) : <p>None</p>}
          </div>

          <h3>Key metrics</h3>
          <div className="playground-metrics">
            {metrics.length === 0 ? <p>Run snapshot to see metrics.</p> : metrics.map((metric) => (
              <article className="playground-metric-card" key={metric.label}>
                <p>{metric.label}</p>
                <strong>{metric.value === null || metric.value === undefined ? '—' : String(metric.value)}</strong>
              </article>
            ))}
          </div>

          <details>
            <summary>Snapshot JSON</summary>
            <button
              type="button"
              onClick={() => {
                if (!snapshot) {
                  return;
                }
                void navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
              }}
            >
              Copy JSON
            </button>
            <pre className="playground-pre">{snapshot ? JSON.stringify(snapshot, null, 2) : 'Run snapshot first.'}</pre>
          </details>
        </section>
      </div>
    </div>
  );
}
