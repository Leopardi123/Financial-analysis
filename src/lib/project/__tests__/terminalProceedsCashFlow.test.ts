import { computeProjectPhase1 } from '../phase1.ts';
import { parseProjectJsonV1 } from '../jsonv1/parse.ts';
import { getProjectJsonV1Template } from '../jsonv1/template.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;
  try { fn(); } catch (error) { thrown = error; }
  if (!(thrown instanceof Error) || !pattern.test(thrown.message)) {
    throw new Error(`${message}. Received ${String((thrown as Error | undefined)?.message)}`);
  }
}

(function runTerminalProceedsTests() {
  const baseInput = {
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: 0,
    revenueUSD: [100],
    operatingCostsUSD: [40],
    sustainingCapexUSD: [10],
    siteGandA_USD: [5],
    royaltiesUSD: [3],
    reclamationUSD: [2],
    capexUSD: [7],
    workingCapitalDeltaUSD: [4],
  };

  const withoutTerminal = computeProjectPhase1(baseInput);
  const withTerminal = computeProjectPhase1({ ...baseInput, terminalProceedsUSD: [25] });
  assertEqual(withTerminal.fcffUSD[0], (withoutTerminal.fcffUSD[0] as number) + 25, 'terminal proceeds add exactly once to FCFF');
  assertEqual(withTerminal.ebitdaUSD[0], withoutTerminal.ebitdaUSD[0], 'terminal proceeds do not change EBITDA');
  assertEqual(withTerminal.ebitUSD[0], withoutTerminal.ebitUSD[0], 'terminal proceeds do not change EBIT');
  assertEqual(withTerminal.taxUSD[0], withoutTerminal.taxUSD[0], 'terminal proceeds do not change tax');
  assertEqual(withTerminal.terminalProceedsUSD_effective[0], 25, 'terminal proceeds exposed diagnostically');

  const template = getProjectJsonV1Template();
  const legacyParsed = parseProjectJsonV1(template);
  assertEqual(legacyParsed.engineInput.phase1.terminalProceedsUSD, undefined, 'old JSON does not activate terminal proceeds');

  template.series.terminalProceedsUSD = new Array(template.time.masterN + 1).fill(0);
  template.series.terminalProceedsUSD[template.time.masterN] = 179100000;
  const parsed = parseProjectJsonV1(template);
  assertEqual(parsed.engineInput.phase1.terminalProceedsUSD?.[template.time.masterN], 179100000, 'terminal proceeds reach engine input');

  const short = getProjectJsonV1Template();
  short.series.terminalProceedsUSD = [1];
  assertThrows(() => parseProjectJsonV1(short), /terminalProceedsUSD must be an array of length/, 'terminal proceeds require exact timeline length');

  const negative = getProjectJsonV1Template();
  negative.series.terminalProceedsUSD = new Array(negative.time.masterN + 1).fill(0);
  negative.series.terminalProceedsUSD[0] = -1;
  assertThrows(() => parseProjectJsonV1(negative), /terminalProceedsUSD\[0\].*>= 0/, 'terminal proceeds cannot be negative');

  console.log('Terminal proceeds cash-flow tests passed');
})();
