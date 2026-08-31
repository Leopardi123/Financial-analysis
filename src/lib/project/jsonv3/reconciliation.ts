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

function closeEnough(actual: number, expected: number, toleranceRelative: number): boolean {
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) / scale <= toleranceRelative;
}

function relativeDifference(actual: number | null, expected: number): number | null {
  if (!finite(actual)) return null;
  const scale = Math.max(1e-12, Math.abs(expected));
  return (actual - expected) / scale;
}

function npvWithConvention(fcff: Array<number | null>, rate: number, convention: 'period_end' | 'mid_year'): number | null {
  if (!fcff.every(finite)) return null;
  let npv = 0;
  const shift = convention === 'mid_year' ? 0.5 : 0;
  for (let t = 0; t < fcff.length; t += 1) {
    npv += (fcff[t] as number) / ((1 + rate) ** (t + shift));
  }
  return npv;
}

function exactPriceDeckKeys(raw: ProjectJsonV3, report: ProjectJsonV3ReportVerification): string[] {
  return [...new Set(Object.values(raw.metals.priceKeyByMetal))].sort();
}

function runTargetChecks(
  raw: ProjectJsonV3,
  parsed: ReturnType<typeof parseProjectJsonV3>,
  report: ProjectJsonV3ReportVerification,
  tolerance: number,
): Array<{ check: string; status: 'PASS' | 'FAIL'; detail: string }> {
  const checks: Array<{ check: string; status: 'PASS' | 'FAIL'; detail: string }> = [];
  const phase1 = parsed.engineInputWithoutPrices.phase1 as typeof parsed.engineInputWithoutPrices.phase1 & {
    terminalProceedsUSD?: Array<number | null>;
  };

  const addMoneyCheck = (check: string, actual: number | null, expected: number | null | undefined) => {
    if (expected == null) return;
    const pass = finite(actual) && closeEnough(actual, expected, tolerance);
    checks.push({
      check,
      status: pass ? 'PASS' : 'FAIL',
      detail: `report=${expected}; model=${actual ?? 'null'}`,
    });
  };

  addMoneyCheck(
    'initial_capex',
    sumFinite(phase1.capexUSD, (t) => t < raw.time.productionStartPeriod),
    report.reportInitialCapexUSD,
  );
  addMoneyCheck('sustaining_capex', sumFinite(phase1.sustainingCapexUSD), report.reportSustainingCapexUSD);
  addMoneyCheck('closure_total', sumFinite(phase1.reclamationUSD), report.reportClosureUSD);

  if (report.reportClosurePeriod != null) {
    const actualPeriods = phase1.reclamationUSD
      .map((value, index) => finite(value) && value !== 0 ? index : -1)
      .filter((index) => index >= 0);
    const last = actualPeriods.length > 0 ? actualPeriods[actualPeriods.length - 1] : null;
    checks.push({
      check: 'closure_period',
      status: last === report.reportClosurePeriod ? 'PASS' : 'FAIL',
      detail: `report=${report.reportClosurePeriod}; model=${last ?? 'none'}`,
    });
  }

  if (report.reportWorkingCapitalUnwindUSD != null) {
    const period = report.reportWorkingCapitalUnwindPeriod;
    const rawDelta = period == null ? null : phase1.workingCapitalDeltaUSD?.[period] ?? null;
    const cashImpact = finite(rawDelta) ? -rawDelta : null;
    const pass = finite(cashImpact) && closeEnough(cashImpact, report.reportWorkingCapitalUnwindUSD, tolerance);
    checks.push({
      check: 'working_capital_unwind',
      status: pass ? 'PASS' : 'FAIL',
      detail: `report cash inflow=${report.reportWorkingCapitalUnwindUSD}; model cash impact=${cashImpact ?? 'null'}; period=${period ?? 'missing'}`,
    });
  }

  if (report.reportWorkingCapitalUnwindPeriod != null) {
    const period = report.reportWorkingCapitalUnwindPeriod;
    const value = phase1.workingCapitalDeltaUSD?.[period] ?? null;
    checks.push({
      check: 'working_capital_unwind_period',
      status: finite(value) && value !== 0 ? 'PASS' : 'FAIL',
      detail: `report=${period}; model value=${value ?? 'null'}`,
    });
  }

  if (report.reportTerminalProceedsUSD != null) {
    const total = phase1.terminalProceedsUSD ? sumFinite(phase1.terminalProceedsUSD) : 0;
    addMoneyCheck('terminal_proceeds_total', total, report.reportTerminalProceedsUSD);
  }
  if (report.reportTerminalProceedsPeriod != null) {
    const period = report.reportTerminalProceedsPeriod;
    const value = phase1.terminalProceedsUSD?.[period] ?? null;
    checks.push({
      check: 'terminal_proceeds_period',
      status: finite(value) && value !== 0 ? 'PASS' : 'FAIL',
      detail: `report=${period}; model value=${value ?? 'null'}`,
    });
  }

  return checks;
}

export async function reconcileProjectJsonV3ToReport(raw: ProjectJsonV3): Promise<ProjectV3ReconciliationResult> {
  const report = raw.verification?.report;
  if (!report) throw new Error('project_json_v3 verification.report is required for report reconciliation.');
  if (!finite(report.discountRate) || report.discountRate <= 0 || report.discountRate > 0.25) {
    throw new Error('verification.report.discountRate must be within (0, 0.25].');
  }
  if (!finite(report.reportNPVPostTaxUSD) || !finite(report.reportIRRPostTax)) {
    throw new Error('verification.report requires finite reportNPVPostTaxUSD and reportIRRPostTax.');
  }
  const tolerance = finite(report.toleranceRelative) ? report.toleranceRelative : 0.02;
  if (!(tolerance > 0 && tolerance <= 0.1)) throw new Error('verification.report.toleranceRelative must be within (0, 0.1].');

  const requiredPriceKeys = exactPriceDeckKeys(raw, report);
  const suppliedPriceKeys = Object.keys(report.priceDeckByKey).sort();
  const missing = requiredPriceKeys.filter((key) => !finite(report.priceDeckByKey[key]) || report.priceDeckByKey[key] <= 0);
  const extra = suppliedPriceKeys.filter((key) => !requiredPriceKeys.includes(key));
  const hardChecks: ProjectV3ReconciliationResult['hardChecks'] = [];
  hardChecks.push({
    check: 'report_price_deck_keys',
    status: missing.length === 0 && extra.length === 0 ? 'PASS' : 'FAIL',
    detail: `required=[${requiredPriceKeys.join(',')}]; supplied=[${suppliedPriceKeys.join(',')}]; missing=[${missing.join(',')}]; extra=[${extra.join(',')}]`,
  });

  const parsed = parseProjectJsonV3(raw);
  hardChecks.push(...runTargetChecks(raw, parsed, report, tolerance));

  const diagnostics: string[] = [];
  let output: ReturnType<typeof computeProjectEngineFullProductionV1> | null = null;
  if (hardChecks.every((check) => check.status === 'PASS')) {
    try {
      const input = await resolveProjectPricesToEngineInput({
        parsed,
        scenario: { mode: 'fixed', fixedPriceByKey: report.priceDeckByKey },
        allowRefresh: false,
        projectId: raw.meta?.projectId ?? 'project-v3-report-check',
      });
      input.phase2.discountRate = report.discountRate;
      output = computeProjectEngineFullProductionV1(input);
      diagnostics.push(...(input.diagnostics?.warnings ?? []));
    } catch (error) {
      diagnostics.push(`Report-deck engine run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    diagnostics.push('Report-deck engine run withheld because one or more hard period/CAPEX/closure/WC/price checks failed.');
  }

  const fcff = output?.phase1.fcffUSD ?? [];
  const modelNPV = output ? npvWithConvention(fcff, report.discountRate, report.discountConvention) : null;
  const modelIRR = output && fcff.every(finite) ? computeIrr(fcff as number[], report.discountRate).selectedRoot : null;
  const npvDiff = relativeDifference(modelNPV, report.reportNPVPostTaxUSD);
  const irrDiff = relativeDifference(modelIRR, report.reportIRRPostTax);
  const npvPass = finite(npvDiff) && Math.abs(npvDiff) <= tolerance;
  const irrPass = finite(irrDiff) && Math.abs(irrDiff) <= tolerance;
  hardChecks.push({
    check: 'npv_reconciliation',
    status: npvPass ? 'PASS' : 'FAIL',
    detail: `report=${report.reportNPVPostTaxUSD}; model=${modelNPV ?? 'null'}; relDiff=${npvDiff ?? 'null'}; tolerance=${tolerance}`,
  });
  hardChecks.push({
    check: 'irr_reconciliation',
    status: irrPass ? 'PASS' : 'FAIL',
    detail: `report=${report.reportIRRPostTax}; model=${modelIRR ?? 'null'}; relDiff=${irrDiff ?? 'null'}; tolerance=${tolerance}`,
  });

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
