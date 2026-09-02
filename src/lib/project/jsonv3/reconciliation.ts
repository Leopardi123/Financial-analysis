import { computeProjectEngineFullProductionV1 } from '../engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../jsonv1/resolvePrices.ts';
import { computeIrr } from '../../metrics/lista3.ts';
import { parseProjectJsonV3 } from './compile.ts';
import type { ProjectJsonV3, ProjectJsonV3DiscountConvention, ProjectJsonV3ReportVerification } from './schema.ts';

export type ProjectV3ReconciliationResult = {
  status: 'VERIFIED' | 'NOT_VERIFIED';
  sourceId: string;
  npvIrrPageOrTable: string;
  pricesPageOrTable: string;
  discountRate: number;
  discountConvention: ProjectJsonV3DiscountConvention;
  reportNPVPostTaxUSD: number;
  modelNPVPostTaxUSD: number | null;
  npvRelativeDifference: number | null;
  reportIRRPostTax: number;
  modelIRRPostTax: number | null;
  irrRelativeDifference: number | null;
  reportNPVPreTaxUSD: number | null;
  modelNPVPreTaxUSD: number | null;
  npvPreTaxRelativeDifference: number | null;
  reportIRRPreTax: number | null;
  modelIRRPreTax: number | null;
  irrPreTaxRelativeDifference: number | null;
  toleranceRelative: number;
  hardChecks: Array<{ check: string; status: 'PASS' | 'FAIL'; detail: string }>;
  diagnostics: string[];
};

type Check = ProjectV3ReconciliationResult['hardChecks'][number];
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function sumFinite(series: Array<number | null>): number | null {
  let total = 0;
  for (const value of series) { if (!finite(value)) return null; total += value; }
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
function discountExponent(t: number, convention: ProjectJsonV3DiscountConvention): number {
  if (convention === 'mid_year') return t + 0.5;
  if (convention === 'period_end_from_model_start') return t + 1;
  // Legacy/report convention retained for existing V3 fixtures: t=0 is the valuation date.
  return t;
}
function npv(fcff: Array<number | null>, rate: number, convention: ProjectJsonV3DiscountConvention): number | null {
  if (!fcff.every(finite)) return null;
  return (fcff as number[]).reduce((sum, value, t) => sum + value / ((1 + rate) ** discountExponent(t, convention)), 0);
}
function addMoneyCheck(checks: Check[], check: string, actual: number | null, expected: number | null | undefined, tolerance: number): void {
  if (expected == null) return;
  checks.push({ check, status: within(actual, expected, tolerance) ? 'PASS' : 'FAIL', detail: `report=${expected}; model=${actual ?? 'null'}` });
}
function reportTargetChecks(parsed: ReturnType<typeof parseProjectJsonV3>, report: ProjectJsonV3ReportVerification, tolerance: number): Check[] {
  const checks: Check[] = [];
  const phase1 = parsed.engineInputWithoutPrices.phase1;
  const terminal = phase1.terminalProceedsUSD ?? [];
  const capitalizedDevelopmentRevenue = phase1.capitalizedDevelopmentRevenueUSD ?? [];
  const capitalizedDevelopmentCosts = phase1.capitalizedDevelopmentCostsUSD ?? [];
  addMoneyCheck(checks, 'initial_capex', sumFinite(phase1.capexUSD), report.reportInitialCapexUSD, tolerance);
  addMoneyCheck(checks, 'preproduction_revenue', sumFinite(capitalizedDevelopmentRevenue), report.reportPreproductionRevenueUSD, tolerance);
  addMoneyCheck(checks, 'preproduction_costs', sumFinite(capitalizedDevelopmentCosts), report.reportPreproductionCostsUSD, tolerance);
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
    addMoneyCheck(checks, 'working_capital_unwind', finite(delta) ? -delta : null, report.reportWorkingCapitalUnwindUSD, tolerance);
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

function reportPriceDeckCheck(raw: ProjectJsonV3, report: ProjectJsonV3ReportVerification): Check {
  const requiredKeys = [...new Set(Object.values(raw.metals.priceKeyByMetal))].sort();
  const scalar = report.priceDeckByKey ?? {};
  const series = report.priceDeckSeriesByKey ?? {};
  const scalarKeys = Object.keys(scalar).sort();
  const seriesKeys = Object.keys(series).sort();
  const suppliedUnion = [...new Set([...scalarKeys, ...seriesKeys])].sort();
  const overlaps = scalarKeys.filter((key) => seriesKeys.includes(key));
  const missing = requiredKeys.filter((key) => !scalarKeys.includes(key) && !seriesKeys.includes(key));
  const extra = suppliedUnion.filter((key) => !requiredKeys.includes(key));
  const invalidScalar = scalarKeys.filter((key) => !finite(scalar[key]) || scalar[key] <= 0);
  const invalidSeries = seriesKeys.filter((key) => {
    const values = series[key];
    return !Array.isArray(values) || values.length !== raw.time.masterN + 1 || values.some((value) => !finite(value) || value <= 0);
  });
  const pass = overlaps.length === 0 && missing.length === 0 && extra.length === 0 && invalidScalar.length === 0 && invalidSeries.length === 0;
  return {
    check: 'report_price_deck_keys',
    status: pass ? 'PASS' : 'FAIL',
    detail: `required=[${requiredKeys.join(',')}]; scalar=[${scalarKeys.join(',')}]; series=[${seriesKeys.join(',')}]; missing=[${missing.join(',')}]; extra=[${extra.join(',')}]; overlaps=[${overlaps.join(',')}]; invalidScalar=[${invalidScalar.join(',')}]; invalidSeries=[${invalidSeries.join(',')}]`,
  };
}

async function runReportDeckEngine(raw: ProjectJsonV3, parsed: ReturnType<typeof parseProjectJsonV3>, report: ProjectJsonV3ReportVerification) {
  const fixedSeed: Record<string, number> = { ...(report.priceDeckByKey ?? {}) };
  for (const [key, values] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const first = values.find(finite);
    if (first !== undefined && !(key in fixedSeed)) fixedSeed[key] = first;
  }
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey: fixedSeed },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? 'project-v3-report-check',
  });
  for (const [key, valuesRaw] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const values = [...valuesRaw];
    input.priceSeriesByKey = input.priceSeriesByKey ?? {};
    input.priceSeriesByKey[key] = values;
    for (const [metal, priceKey] of Object.entries(raw.metals.priceKeyByMetal)) {
      if (priceKey === key) input.spotPriceUSDByMetal[metal] = [...values];
    }
    if (raw.metals.auPriceKey === key) input.aisc.auPriceUSDPerOz = [...values];
  }
  input.phase2.discountRate = report.discountRate;
  return { input, output: computeProjectEngineFullProductionV1(input) };
}

export async function reconcileProjectJsonV3ToReport(raw: ProjectJsonV3): Promise<ProjectV3ReconciliationResult> {
  const report = raw.verification?.report;
  if (!report) throw new Error('project_json_v3 verification.report is required for report reconciliation.');
  if (!finite(report.discountRate) || report.discountRate <= 0 || report.discountRate > 0.25) throw new Error('verification.report.discountRate must be within (0, 0.25].');
  if (!finite(report.reportNPVPostTaxUSD) || !finite(report.reportIRRPostTax)) throw new Error('verification.report requires finite reportNPVPostTaxUSD and reportIRRPostTax.');
  if (report.reportNPVPreTaxUSD != null && !finite(report.reportNPVPreTaxUSD)) throw new Error('verification.report.reportNPVPreTaxUSD must be finite or null.');
  if (report.reportIRRPreTax != null && !finite(report.reportIRRPreTax)) throw new Error('verification.report.reportIRRPreTax must be finite or null.');
  const tolerance = finite(report.toleranceRelative) ? report.toleranceRelative : 0.02;
  if (!(tolerance > 0 && tolerance <= 0.1)) throw new Error('verification.report.toleranceRelative must be within (0, 0.1].');

  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const labelCount = raw.time.reportPeriodLabels?.length ?? null;
  const hardChecks: Check[] = [
    {
      check: 'relative_period_mapping',
      status: raw.time.phaseByPeriod.length === raw.time.masterN + 1 && (labelCount === null || labelCount === raw.time.masterN + 1) ? 'PASS' : 'FAIL',
      detail: `periods=${raw.time.masterN + 1}; productionStartPeriod=${raw.time.productionStartPeriod}; nameplateCapacityPeriod=${raw.time.nameplateCapacityPeriod ?? 'not_disclosed'}; reportLabels=${labelCount ?? 'not_disclosed'}; runtimePlacement=ignored_for_report_reconciliation`,
    },
    reportPriceDeckCheck(raw, report),
  ];
  hardChecks.push(...reportTargetChecks(parsed, report, tolerance));

  const diagnostics: string[] = [];
  let output: ReturnType<typeof computeProjectEngineFullProductionV1> | null = null;
  if (hardChecks.every((check) => check.status === 'PASS')) {
    try {
      const run = await runReportDeckEngine(raw, parsed, report);
      output = run.output;
      diagnostics.push(...(run.input.diagnostics?.warnings ?? []));
      if (Object.keys(report.priceDeckSeriesByKey ?? {}).length > 0) diagnostics.push(`Applied report-relative price series exactly for keys=[${Object.keys(report.priceDeckSeriesByKey ?? {}).sort().join(',')}].`);
    } catch (error) {
      diagnostics.push(`Report-deck engine run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else diagnostics.push('Report-deck engine run withheld because a hard relative-period/CAPEX/closure/WC/price check failed.');

  const fcff = output?.phase1.fcffUSD ?? [];
  const modelNPV = output ? npv(fcff, report.discountRate, report.discountConvention) : null;
  const modelIRR = output && fcff.every(finite) ? computeIrr(fcff, report.discountRate).selectedRoot : null;
  const npvDiff = relativeDifference(modelNPV, report.reportNPVPostTaxUSD);
  const irrDiff = relativeDifference(modelIRR, report.reportIRRPostTax);
  hardChecks.push({ check: 'npv_reconciliation', status: finite(npvDiff) && Math.abs(npvDiff) <= tolerance ? 'PASS' : 'FAIL', detail: `report=${report.reportNPVPostTaxUSD}; model=${modelNPV ?? 'null'}; relDiff=${npvDiff ?? 'null'}; tolerance=${tolerance}` });
  hardChecks.push({ check: 'irr_reconciliation', status: finite(irrDiff) && Math.abs(irrDiff) <= tolerance ? 'PASS' : 'FAIL', detail: `report=${report.reportIRRPostTax}; model=${modelIRR ?? 'null'}; relDiff=${irrDiff ?? 'null'}; tolerance=${tolerance}` });

  let modelNPVPreTax: number | null = null;
  let modelIRRPreTax: number | null = null;
  let npvPreTaxDiff: number | null = null;
  let irrPreTaxDiff: number | null = null;
  const reportNPVPreTax = report.reportNPVPreTaxUSD ?? null;
  const reportIRRPreTax = report.reportIRRPreTax ?? null;
  if (output && (reportNPVPreTax != null || reportIRRPreTax != null)) {
    const tax = output.phase1.taxUSD;
    const preTaxFcff = fcff.map((value, t) => finite(value) && finite(tax[t]) ? (value as number) + (tax[t] as number) : null);
    modelNPVPreTax = npv(preTaxFcff, report.discountRate, report.discountConvention);
    modelIRRPreTax = preTaxFcff.every(finite) ? computeIrr(preTaxFcff, report.discountRate).selectedRoot : null;
  }
  if (reportNPVPreTax != null) {
    npvPreTaxDiff = relativeDifference(modelNPVPreTax, reportNPVPreTax);
    hardChecks.push({ check: 'npv_pre_tax_reconciliation', status: finite(npvPreTaxDiff) && Math.abs(npvPreTaxDiff) <= tolerance ? 'PASS' : 'FAIL', detail: `report=${reportNPVPreTax}; model=${modelNPVPreTax ?? 'null'}; relDiff=${npvPreTaxDiff ?? 'null'}; tolerance=${tolerance}` });
  }
  if (reportIRRPreTax != null) {
    irrPreTaxDiff = relativeDifference(modelIRRPreTax, reportIRRPreTax);
    hardChecks.push({ check: 'irr_pre_tax_reconciliation', status: finite(irrPreTaxDiff) && Math.abs(irrPreTaxDiff) <= tolerance ? 'PASS' : 'FAIL', detail: `report=${reportIRRPreTax}; model=${modelIRRPreTax ?? 'null'}; relDiff=${irrPreTaxDiff ?? 'null'}; tolerance=${tolerance}` });
  }

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
    reportNPVPreTaxUSD: reportNPVPreTax,
    modelNPVPreTaxUSD: modelNPVPreTax,
    npvPreTaxRelativeDifference: npvPreTaxDiff,
    reportIRRPreTax,
    modelIRRPreTax,
    irrPreTaxRelativeDifference: irrPreTaxDiff,
    toleranceRelative: tolerance,
    hardChecks,
    diagnostics,
  };
}