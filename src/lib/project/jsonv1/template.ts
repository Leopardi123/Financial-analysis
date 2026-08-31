import type { ProjectJsonV1 } from './schema.ts';
import {
  buildProjectJsonV1Template as buildProjectJsonV1TemplateLegacy,
  getProjectJsonV1Template as getProjectJsonV1TemplateLegacy,
} from './templateLegacy.ts';

type ProjectJsonV1Template = ProjectJsonV1 & Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Backwards-compatible template overlay. Existing active calculation fields remain legacy-authoritative. */
export function buildProjectJsonV1Template(existing?: ProjectJsonV1): ProjectJsonV1Template {
  const output = buildProjectJsonV1TemplateLegacy(existing) as ProjectJsonV1Template;
  const series = output.series as ProjectJsonV1['series'] & Record<string, unknown>;

  series._description_taxCashFlowUSD = 'Optional report-locked net tax cash flow aligned to t=0..masterN. Positive values are cash inflows/refundable tax credits; negative values are cash tax payments. Must have exactly masterN+1 elements and is mutually exclusive with economics.taxRate.';
  series._example_taxCashFlowUSD = [254700000, 365200000, 398300000, -120000000];
  series._unit_taxCashFlowUSD = 'USD (full dollars)';
  series._description_terminalProceedsUSD = 'Optional report-locked non-operating terminal cash proceeds aligned to t=0..masterN, e.g. salvage value. Values must be >= 0, have exactly masterN+1 elements, and affect FCFF only—not revenue, EBITDA, EBIT or tax.';
  series._example_terminalProceedsUSD = [0, 0, 0, 179100000];
  series._unit_terminalProceedsUSD = 'USD (full dollars)';

  if (existing?.series.taxCashFlowUSD !== undefined) series.taxCashFlowUSD = [...existing.series.taxCashFlowUSD];
  if (existing?.series.terminalProceedsUSD !== undefined) series.terminalProceedsUSD = [...existing.series.terminalProceedsUSD];

  const economicsBreakdown = asRecord(output.economicsBreakdown);
  economicsBreakdown._description_reportedCostMetrics = 'Single source of truth for cost metrics explicitly reported by PEA/PFS/FS. Store the report semantics, not the desired benchmark. metric/value/unit preserve legacy compatibility; new rows should also preserve primaryMetal, basis, denominator, period, byProductTreatment, royaltyTreatment, offSiteTreatment, costBaseYear, quality and exact source/page when supported. Unknown must stay unknown. Never infer missing semantics from free text or array order.';

  const existingEconomicsBreakdown = asRecord((existing as unknown as Record<string, unknown> | undefined)?.economicsBreakdown);
  const existingReported = Array.isArray(existingEconomicsBreakdown.reportedCostMetrics) ? existingEconomicsBreakdown.reportedCostMetrics : [];
  const outputReported = Array.isArray(economicsBreakdown.reportedCostMetrics) ? economicsBreakdown.reportedCostMetrics : [];

  economicsBreakdown.reportedCostMetrics = outputReported.map((row, index) => {
    const normalized = asRecord(row);
    const original = asRecord(existingReported[index]);
    const copy = (key: string) => original[key] ?? null;
    return {
      ...normalized,
      reportedLabel: typeof original.reportedLabel === 'string' ? original.reportedLabel : null,
      definitionNotes: typeof original.definitionNotes === 'string' ? original.definitionNotes : null,
      primaryMetal: copy('primaryMetal'),
      basis: copy('basis'),
      denominator: copy('denominator'),
      period: copy('period'),
      byProductTreatment: copy('byProductTreatment'),
      royaltyTreatment: copy('royaltyTreatment'),
      offSiteTreatment: copy('offSiteTreatment'),
      costBaseYear: copy('costBaseYear'),
      quality: copy('quality'),
      sourceId: typeof original.sourceId === 'string' ? original.sourceId : null,
      pageOrTable: typeof original.pageOrTable === 'string' ? original.pageOrTable : null,
    };
  });
  output.economicsBreakdown = economicsBreakdown as ProjectJsonV1['economicsBreakdown'];
  return output;
}

export function getProjectJsonV1Template(): ProjectJsonV1 {
  return buildProjectJsonV1Template(getProjectJsonV1TemplateLegacy());
}
