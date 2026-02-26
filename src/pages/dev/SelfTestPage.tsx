import { useMemo, useState } from 'react';
import { computeCorporateFullPipelineFromProjectInputs } from '../../lib/corporate/pipeline/fromProjectInputs.ts';
import { computeProjectEngineFullProductionV1 } from '../../lib/project/engineFullProductionV1.ts';
import { parseProjectJsonV1WithContext } from '../../lib/project/jsonv1/parse.ts';
import { getProjectJsonV1Template } from '../../lib/project/jsonv1/template.ts';
import { buildPriceScenarioSetFromSpot } from '../../lib/scenario/presets.ts';
import { computeCorporateScenarioRunner } from '../../lib/scenario/corporateScenarioRunner.ts';
import { isDevAccessEnabled, makeHarnessProjectJson } from './shared.ts';

type TestResult = {
  name: string;
  ok: boolean;
  message: string;
};

export default function SelfTestPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const hasDevAccess = useMemo(() => isDevAccessEnabled(), []);

  if (!hasDevAccess) {
    return <p style={{ padding: 16 }}>Dev tools are hidden. Add <code>?dev=1</code> to the URL.</p>;
  }

  const runSelfTests = () => {
    const nextResults: TestResult[] = [];

    const run = (name: string, fn: () => void) => {
      try {
        fn();
        nextResults.push({ name, ok: true, message: 'PASS' });
      } catch (error) {
        nextResults.push({
          name,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    run('parseProjectJsonV1 template parses', () => {
      parseProjectJsonV1WithContext(getProjectJsonV1Template());
    });

    run('engine full production runs on minimal input', () => {
      const parsed = parseProjectJsonV1WithContext(makeHarnessProjectJson());
      const engineOut = computeProjectEngineFullProductionV1(parsed.engineInput);
      if (engineOut.phase2.npvToday_USD === null) {
        throw new Error('Expected non-null NPV from engine output');
      }
    });

    run('corporate pipeline runs on one project', () => {
      const parsed = parseProjectJsonV1WithContext(makeHarnessProjectJson());
      const out = computeCorporateFullPipelineFromProjectInputs({
        projects: {
          masterN: parsed.engineInput.masterN,
          discountRate: 0.08,
          projects: [{ id: 'P1', input: parsed.engineInput }],
        },
        financing: {
          fx_USD_to_TargetCurrency: 1,
          cash_TargetCurrency_t0: 0,
          debt_TargetCurrency_t0: 0,
        },
        market: {
          shares_current: 100,
          price_current_TargetCurrency: 1,
        },
        equityFinancing: {
          equityNeeded_TargetCurrency: 0,
          equityRaisePrice_TargetCurrency_perShare: 1,
        },
      });
      if (out.corporateProjects.npvToday_USD_total === null) {
        throw new Error('Expected non-null corporate NPV');
      }
    });

    run('scenario runner produces HIGH NPV > SPOT > LOW', () => {
      const parsed = parseProjectJsonV1WithContext(makeHarnessProjectJson());
      const pricesByScenario = buildPriceScenarioSetFromSpot(parsed.engineInput.spotPriceUSDByMetal, {
        masterN: parsed.engineInput.masterN,
        lowMultiplier: 0.8,
        highMultiplier: 1.2,
      });
      const out = computeCorporateScenarioRunner({
        base: {
          projects: {
            masterN: parsed.engineInput.masterN,
            discountRate: 0.08,
            projects: [{ id: 'P1', input: parsed.engineInput }],
          },
          financing: {
            fx_USD_to_TargetCurrency: 1,
            cash_TargetCurrency_t0: 0,
            debt_TargetCurrency_t0: 0,
          },
          market: {
            shares_current: 100,
            price_current_TargetCurrency: 1,
          },
          equityFinancing: {
            equityNeeded_TargetCurrency: 0,
            equityRaisePrice_TargetCurrency_perShare: 1,
          },
        },
        pricesByScenario,
      });

      const low = out.LOW.corporateProjects.npvToday_USD_total;
      const spot = out.SPOT.corporateProjects.npvToday_USD_total;
      const high = out.HIGH.corporateProjects.npvToday_USD_total;
      if (low === null || spot === null || high === null || !(high > spot && spot > low)) {
        throw new Error(`Ordering failed: low=${String(low)} spot=${String(spot)} high=${String(high)}`);
      }
    });

    run('overhead overlay reduces NPV when overhead > 0', () => {
      const parsed = parseProjectJsonV1WithContext(makeHarnessProjectJson());
      const masterN = parsed.engineInput.masterN;
      const noOverhead = computeCorporateFullPipelineFromProjectInputs({
        projects: {
          masterN,
          discountRate: 0.08,
          projects: [{ id: 'P1', input: parsed.engineInput }],
        },
        financing: {
          fx_USD_to_TargetCurrency: 1,
          cash_TargetCurrency_t0: 0,
          debt_TargetCurrency_t0: 0,
        },
        market: {
          shares_current: 100,
          price_current_TargetCurrency: 1,
        },
        equityFinancing: {
          equityNeeded_TargetCurrency: 0,
          equityRaisePrice_TargetCurrency_perShare: 1,
        },
      });

      const withOverhead = computeCorporateFullPipelineFromProjectInputs({
        projects: {
          masterN,
          discountRate: 0.08,
          projects: [{ id: 'P1', input: parsed.engineInput }],
        },
        financing: {
          fx_USD_to_TargetCurrency: 1,
          cash_TargetCurrency_t0: 0,
          debt_TargetCurrency_t0: 0,
        },
        market: {
          shares_current: 100,
          price_current_TargetCurrency: 1,
        },
        equityFinancing: {
          equityNeeded_TargetCurrency: 0,
          equityRaisePrice_TargetCurrency_perShare: 1,
        },
        overhead: {
          enabled: true,
          corpGA_cash_USD: [0, 10, 10],
          corpSBC_USD: [0, 0, 0],
        },
      });

      const without = noOverhead.financing.npvToday_TargetCurrency;
      const withOv = withOverhead.financing.npvToday_TargetCurrency;
      if (without === null || withOv === null || !(withOv < without)) {
        throw new Error(`Expected overhead to reduce NPV: without=${String(without)} with=${String(withOv)}`);
      }
    });

    setResults(nextResults);
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Self-test</h1>
      <button onClick={runSelfTests}>Run self-tests</button>
      <ul>
        {results.map((result) => (
          <li key={result.name} style={{ color: result.ok ? 'green' : 'red' }}>
            <strong>{result.ok ? 'PASS' : 'FAIL'}</strong> — {result.name}: {result.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
