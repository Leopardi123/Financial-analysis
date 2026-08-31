import { computeProjectEngineFullProductionV1 } from '../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../jsonv1/resolvePrices.ts';
import { computeIrr } from '../../metrics/lista3.ts';
import { parseProjectJsonV3 } from './compile.ts';
import type { ProjectJsonV3, ProjectJsonV3ReportVerification } from './schema.ts';

export type ProjectV3ReconciliationResult = {
  status: 'VERIFIED' | 'NOT_VERIFIED';
  sourceId: string;
  npvIrrPageOrTable: string;
  pricesPageOrTable: string;
  discountRate: number;
  discountConvention: 'period_end' | 'mid_year';
  reportNPVPostTaxUSD: number;
  modelNPVPostTaxUSD: number | null;
  npvRelativeDifference: number | null;
  reportIRRPostTax: number;
  modelIRRPostTax: number | null;
  irrRelativeDifference: number | null;
  toleranceRelative: number;
  hardChecks: Array<{ check: string; status: 'PASS' | 'FAIL'; detail: string }>;
  diagnostics: string[];
};

type Check = ProjectV3ReconciliationResult['hardChecks'][number];

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sumFinite(series: Array<number | null>, predicate: (index: number) => boolean = () => true): number | null {
  let total = 0;
  for (let t = 0; t < series.length; t += 1) {
    if (!predicate(t)) continue;
    const value = series[t];
    if (!finite(value)) return null;
    total += value;
  }
  return total;
}

function relativeDifference(actual: number | null, expected: number): number | null {
  if (!finite(actual)) return null;
  return (actual - expected) / Math.max(1e-12, Math.abs(expected));
}

function within(actual: number | null, expected: number, tolerance: number): boolean {
  if (!finite(actual)) return false;
  return Math.abs(actual - expected) / Math.max(1, Math.abs(expected)) <= tolerance;
}

function npv(fcff: Array<number | null>, rate: number, convention: 'period_end' | 'mid_year'): number | null {
  if (!fcff.every(finite)) return null;
  const shift = convention === 'mid_year' ? 0.5 : 0;
  return (fcff as number[]).reduce((sum, value, t) => sum + value / ((1 + rate) ** (t + shift)), 0);
}

function addMoneyCheck(checks: Check[], check: string, actual: number | null, expected: number | null | undefined, tolerance: number): void {
  if (expected == null) return;
  checks.push({
    check,
    status: within(actual, expected, tolerance) ? 'PASS' : 'FAIL',
    detail: `report=${expected}; model=${actual ?? 'null'}`,
  });
}

function reportTargetChecks(
  raw: ProjectJsonV3,
  parsed: ReturnType<typeof parseProjectJsonV3>,
  report: ProjectJsonV3ReportVerification,
  tolerance: number,
): Check[] {
  const checks: Check[] = [];
  const phase1 = parsed.engineInputWithoutPrices.phase1;
  const terminal = phase1.terminalProceedsUSD ?? [];

  addMoneyCheck(checks, 'initial_capex', sumFinite(phase1.capexUSD, (t) => t < raw.time.productionStartPeriod), report.reportInitialCapexUSD, tolerance);
  addMoneyCheck(checks, 'sustaining_capex', sumFinite(phase1.sustainingCapexUSD), report.reportSustainingCapexUSD, tolerance);
  addMoneyCheck(checks, 'closure_total', sumFinite(phase1.reclamationUSD), report.reportClosureUSD, tolerance);
  addMoneyCheck(checks, 'terminal_proceeds_total', terminal.length > 0 ? sumFinite(terminal) : 0, report.reportTerminalProceedsUSD, tolerance);

  if (report.reportClosurePeriod != null) {
    const periods = phase1.reclamationUSD.flatMap((value, index) => finite(value) && value !== 0 ? [index] : []);
    const model = periods.length > 0 ? periods[periods.length - 1] : null;
    checks.push({ check: 'closure_period', status: model === report.reportClosurePeriod ? 'PASS' : 'FAIL', detail: `report=${report.reportClosurePeriod}; model=${model ?? 'none'}` });
  }
  if (report.reportWorkingCapitalUnwindUSD != null) {
    const period = report.reportWorkingCapitalUnwindPeriod;
    const delta = period == null ? null : phase1.workingCapitalDeltaUSD?.[period] ?? null;
    const cashImpact = finite(delta) ? -delta : null;
    addMoneyCheck(checks, 'working_capital_unwind', cashImpact, report.reportWorkingCapitalUnwindUSD, tolerance);
  }
  if (report.reportWorkingCapitalUnwindPeriod != null) {
    const value = phase1.workingCapitalDeltaUSD?.[report.reportWorkingCapitalUnwindPeriod] ?? null;
    checks.push({ check: 'working_capital_unwind_period', status: finite(value) && value !== 0 ? 'PASS' : 'FAIL', detail: `report=${report.reportWorkingCapitalUnwindPeriod}; model value=${value ?? 'null'}` });
  }
  if (report.reportTerminalProceedsPeriod != null) {
    const value = terminal[report.reportTerminalProceedsPeriod] ?? null;
    checks.push({ check: 'terminal_proceeds_period', status: finite(value) && value !== 0 ? 'PASS' : 'FAIL', detail: `report=${report.reportTerminalProceedsPeriod}; model value=${value ?? 'null'}` });
  }
  return checks;
}

export async function reconcileProjectJsonV3ToReport(raw: ProjectJsonV3): Promise<ProjectV3ReconciliationResult> {
  const report = raw.verification?.report;
  if (!report) throw new Error('project_json_v3 verification.report is required for report reconciliation.');
  if (!finite(report.discountRate) || report.discountRate <= 0 || report.discountRate > 0.25) throw new Error('verification.report.discountRate must be within (0, 0.25].');
  if (!finite(report.reportNPVPostTaxUSD) || !finite(report.reportIRRPostTax)) throw new Error('verification.report requires finite reportNPVPostTaxUSD and reportIRRPostTax.');
  const tolerance = finite(report.toleranceRelative) ? report.toleranceRelative : 0.02;
  if (!(tolerance > 0 && tolerance <= 0.1)) throw new Error('verification.report.toleranceRelative must be within (0, 0.1].');

  const requiredKeys = [...new Set(Object.values(raw.metals.priceKeyByMetal))].sort();
  const suppliedKeys = Object.keys(report.priceDeckByKey).sort();
  const missing = requiredKeys.filter((key) => !finite(report.priceDeckByKey[key]) || report.priceDeckByKey[key] <= 0);
  const extra = suppliedKeys.filter((key) => !requiredKeys.includes(key));
  const hardChecks: Check[] = [{
    check: 'report_price_deck_keys',
    status: missing.length === 0 && extra.length === 0 ? 'PASS' : 'FAIL',
    detail: `required=[${requiredKeys.join(',')}]; supplied=[${suppliedKeys.join(',')}]; missing=[${missing.join(',')}]; extra=[${extra.join(',')}]`,
  }];

  const parsed = parseProjectJsonV3(raw);
  hardChecks.push(...reportTargetChecks(raw, parsed, report, tolerance));
  const diagnostics: string[] = [];
  let output: ReturnType<typeof computeProjectEngineFullProductionV1> | null = null;

  if (hardChecks.every((check) => check.status === 'PASS')) {
    try {
      const input = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey }, allowRefresh: false, projectId: raw.meta?.projectId ?? 'project-v3-report-check' });
      input.phase2.discountRate = report.discountRate;
      output = computeProjectEngineFullProductionV1(input);
      diagnostics.push(...(input.diagnostics?.warnings ?? []));
    } catch (error) {
      diagnostics.push(`Report-deck engine run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    diagnostics.push('Report-deck engine run withheld because a hard period/CAPEX/closure/WC/price check failed.');
  }

  const fcff = output?.phase1.fcffUSD ?? [];
  const modelNPV = output ? npv(fcff, report.discountRate, report.discountConvention) : null;
  const modelIRR = output && fcff.every(finite) ? computeIrr(fcff, report.discountRate).selectedRoot : null;
  const npvDiff = relativeDifference(modelNPV, report.reportNPVPostTaxUSD);
  const irrDiff = relativeDifference(modelIRR, report.reportIRRPostTax);
  hardChecks.push({ check: 'npv_reconciliation', status: finite(npvDiff) && Math.abs(npvDiff) <= tolerance ? 'PASS' : 'FAIL', detail: `report=${report.reportNPVPostTaxUSD}; model=${modelNPV ?? 'null'}; relDiff=${npvDiff ?? 'null'}; tolerance=${tolerance}` });
  hardChecks.push({ check: 'irr_reconciliation', status: finite(irrDiff) && Math.abs(irrDiff) <= tolerance ? 'PASS' : 'FAIL', detail: `report=${report.reportIRRPostTax}; model=${modelIRR ?? 'null'}; relDiff=${irrDiff ?? 'null'}; tolerance=${tolerance}` });

  return {
    status: hardChecks.every((check) => check.status === 'PASS') ? 'VERIFIED' : 'NOT_VERIFIED',
    sourceId: report.sourceId,
    npvIrrPageOrTable: report.npvIrrPageOrTable,
    pricesPageOrTable: report.pricesPageOrTable,
    discountRate: report.discountRate,
    discountConvention: report.discountConvention,
    reportNPVPostTaxUSD: report.reportNPVPostTaxUSD,
    modelNPVPostTaxUSD: modelNPV,
    npvRelativeDifference: npvDiff,
    reportIRRPostTax: report.reportIRRPostTax,
    modelIRRPostTax: modelIRR,
    irrRelativeDifference: irrDiff,
    toleranceRelative: tolerance,
    hardChecks,
    diagnostics,
  };
}
