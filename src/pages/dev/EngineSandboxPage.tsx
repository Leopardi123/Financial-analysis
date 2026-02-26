import { useMemo, useState } from 'react';
import { parseProjectJsonV1WithContext } from '../../lib/project/jsonv1/parse.ts';
import { buildPriceScenarioSetFromSpot } from '../../lib/scenario/presets.ts';
import {
  computeCorporateScenarioRunner,
  type CorporateScenarioRunnerOutput,
} from '../../lib/scenario/corporateScenarioRunner.ts';
import { formatNumber, isDevAccessEnabled, makeHarnessProjectJson } from './shared.ts';

const defaultRawJson = JSON.stringify(makeHarnessProjectJson(), null, 2);

export default function EngineSandboxPage() {
  const [rawJson, setRawJson] = useState(defaultRawJson);
  const [validate, setValidate] = useState(true);
  const [diagnose, setDiagnose] = useState(false);
  const [overheadEnabled, setOverheadEnabled] = useState(false);
  const [lowMultiplier, setLowMultiplier] = useState(0.85);
  const [highMultiplier, setHighMultiplier] = useState(1.15);

  const [discountRate, setDiscountRate] = useState(0.08);
  const [fx, setFx] = useState(1);
  const [cashT0, setCashT0] = useState(0);
  const [debtT0, setDebtT0] = useState(0);
  const [sharesCurrent, setSharesCurrent] = useState(100);
  const [priceCurrent, setPriceCurrent] = useState(1);
  const [equityNeeded, setEquityNeeded] = useState(0);
  const [equityRaisePrice, setEquityRaisePrice] = useState(1);

  const [parseMessage, setParseMessage] = useState('Not run yet');
  const [runnerOutput, setRunnerOutput] = useState<CorporateScenarioRunnerOutput | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<'SPOT' | 'LOW' | 'HIGH'>('SPOT');

  const hasDevAccess = useMemo(() => isDevAccessEnabled(), []);

  if (!hasDevAccess) {
    return <p style={{ padding: 16 }}>Dev tools are hidden. Add <code>?dev=1</code> to the URL.</p>;
  }

  const runHarness = () => {
    setErrorText(null);
    setRunnerOutput(null);

    try {
      const decoded = JSON.parse(rawJson) as unknown;
      const parsed = parseProjectJsonV1WithContext(decoded);
      setParseMessage('ok');

      const pricesByScenario = buildPriceScenarioSetFromSpot(parsed.engineInput.spotPriceUSDByMetal, {
        masterN: parsed.engineInput.masterN,
        lowMultiplier,
        highMultiplier,
      });

      const masterN = parsed.engineInput.masterN;
      const overheadSeries = new Array(masterN + 1).fill(0);

      const base = {
        projects: {
          masterN,
          discountRate,
          validate,
          diagnose,
          projects: [{ id: 'P1', input: parsed.engineInput }],
        },
        financing: {
          fx_USD_to_TargetCurrency: fx,
          cash_TargetCurrency_t0: cashT0,
          debt_TargetCurrency_t0: debtT0,
        },
        market: {
          shares_current: sharesCurrent,
          price_current_TargetCurrency: priceCurrent,
        },
        equityFinancing: {
          equityNeeded_TargetCurrency: equityNeeded,
          equityRaisePrice_TargetCurrency_perShare: equityRaisePrice,
        },
        overhead: {
          enabled: overheadEnabled,
          corpGA_cash_USD: overheadSeries,
          corpSBC_USD: overheadSeries,
        },
      };

      const output = computeCorporateScenarioRunner({
        base,
        pricesByScenario,
      });

      setRunnerOutput(output);
    } catch (error) {
      setParseMessage('error');
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };

  const snapshots = runnerOutput;

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <h1>Engine Sandbox</h1>
      <textarea
        value={rawJson}
        onChange={(event) => setRawJson(event.target.value)}
        rows={18}
        style={{ width: '100%', fontFamily: 'monospace' }}
      />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label><input type="checkbox" checked={validate} onChange={(e) => setValidate(e.target.checked)} /> validate</label>
        <label><input type="checkbox" checked={diagnose} onChange={(e) => setDiagnose(e.target.checked)} /> diagnose</label>
        <label><input type="checkbox" checked={overheadEnabled} onChange={(e) => setOverheadEnabled(e.target.checked)} /> overhead enabled</label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>lowMultiplier <input type="number" value={lowMultiplier} step="0.01" onChange={(e) => setLowMultiplier(Number(e.target.value))} /></label>
        <label>highMultiplier <input type="number" value={highMultiplier} step="0.01" onChange={(e) => setHighMultiplier(Number(e.target.value))} /></label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>discountRate <input type="number" value={discountRate} step="0.01" onChange={(e) => setDiscountRate(Number(e.target.value))} /></label>
        <label>fx_USD_to_TargetCurrency <input type="number" value={fx} step="0.01" onChange={(e) => setFx(Number(e.target.value))} /></label>
        <label>cash_TargetCurrency_t0 <input type="number" value={cashT0} onChange={(e) => setCashT0(Number(e.target.value))} /></label>
        <label>debt_TargetCurrency_t0 <input type="number" value={debtT0} onChange={(e) => setDebtT0(Number(e.target.value))} /></label>
        <label>shares_current <input type="number" value={sharesCurrent} onChange={(e) => setSharesCurrent(Number(e.target.value))} /></label>
        <label>price_current_TargetCurrency <input type="number" value={priceCurrent} step="0.01" onChange={(e) => setPriceCurrent(Number(e.target.value))} /></label>
        <label>equityNeeded_TargetCurrency <input type="number" value={equityNeeded} onChange={(e) => setEquityNeeded(Number(e.target.value))} /></label>
        <label>equityRaisePrice_TargetCurrency_perShare <input type="number" value={equityRaisePrice} step="0.01" onChange={(e) => setEquityRaisePrice(Number(e.target.value))} /></label>
      </div>

      <button onClick={runHarness} style={{ width: 120 }}>Run</button>

      <section>
        <h2>Parse result</h2>
        <p>{parseMessage}</p>
        {errorText ? <pre>{errorText}</pre> : null}
      </section>

      <section>
        <h2>Key metrics</h2>
        <table cellPadding={6} border={1}>
          <thead>
            <tr>
              <th>Metric</th>
              <th>SPOT</th>
              <th>LOW</th>
              <th>HIGH</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['NPV_USD', (s: NonNullable<typeof snapshots>['SPOT']) => s.corporateProjects.npvToday_USD_total],
              ['DCF_prodStart_present_USD', (s: NonNullable<typeof snapshots>['SPOT']) => s.corporateProjects.dcfProdStart_present_USD_total],
              ['NAV_Target', (s: NonNullable<typeof snapshots>['SPOT']) => s.financing.navToday_TargetCurrency],
              ['EV_Target', (s: NonNullable<typeof snapshots>['SPOT']) => s.marketValue.ev_TargetCurrency],
              ['EV/NPV', (s: NonNullable<typeof snapshots>['SPOT']) => s.marketValue.ev_over_npv],
              ['P/NAV', (s: NonNullable<typeof snapshots>['SPOT']) => s.marketValue.p_over_nav],
              ['AISC', (s: NonNullable<typeof snapshots>['SPOT']) => s.corporateProjects.aiscAuEqUSDPerOz_LOM_corp],
              ['NPV per share', (s: NonNullable<typeof snapshots>['SPOT']) => s.perShare.npvToday_perShare_TargetCurrency],
              ['NAV per share', (s: NonNullable<typeof snapshots>['SPOT']) => s.perShare.navToday_perShare_TargetCurrency],
              ['DCF per share', (s: NonNullable<typeof snapshots>['SPOT']) => s.perShare.dcfProdStart_present_perShare_TargetCurrency],
            ].map(([label, getter]) => (
              <tr key={String(label)}>
                <td>{String(label)}</td>
                <td>{snapshots ? formatNumber((getter as any)(snapshots.SPOT)) : '—'}</td>
                <td>{snapshots ? formatNumber((getter as any)(snapshots.LOW)) : '—'}</td>
                <td>{snapshots ? formatNumber((getter as any)(snapshots.HIGH)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Scenario snapshot</h2>
        <label>
          Scenario
          <select value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value as 'SPOT' | 'LOW' | 'HIGH')}>
            <option value="SPOT">SPOT</option>
            <option value="LOW">LOW</option>
            <option value="HIGH">HIGH</option>
          </select>
        </label>
        <details>
          <summary>Raw JSON ({selectedScenario})</summary>
          <pre>{snapshots ? JSON.stringify(snapshots[selectedScenario], null, 2) : 'Run first'}</pre>
        </details>
      </section>
    </div>
  );
}
