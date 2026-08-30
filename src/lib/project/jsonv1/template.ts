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

/**
 * Backwards-compatible template overlay.
 *
 * The legacy template builder remains authoritative for every existing field.
 * Report-locked cash-flow overlay fields are only preserved when they already
 * exist in the project JSON. Old templates/projects therefore receive no new
 * active inputs and keep exactly the prior calculation behavior.
 */
export function buildProjectJsonV1Template(existing?: ProjectJsonV1): ProjectJsonV1Template {
  const output = buildProjectJsonV1TemplateLegacy(existing) as ProjectJsonV1Template;
  const series = output.series as ProjectJsonV1['series'] & Record<string, unknown>;

  series._description_taxCashFlowUSD = 'Optional report-locked net tax cash flow aligned to t=0..masterN. Positive values are cash inflows/refundable tax credits; negative values are cash tax payments. Must have exactly masterN+1 elements and is mutually exclusive with economics.taxRate.';
  series._example_taxCashFlowUSD = [254700000, 365200000, 398300000, -120000000];
  series._unit_taxCashFlowUSD = 'USD (full dollars)';

  series._description_terminalProceedsUSD = 'Optional report-locked non-operating terminal cash proceeds aligned to t=0..masterN, e.g. salvage value. Values must be >= 0, have exactly masterN+1 elements, and affect FCFF only—not revenue, EBITDA, EBIT or tax.';
  series._example_terminalProceedsUSD = [0, 0, 0, 179100000];
  series._unit_terminalProceedsUSD = 'USD (full dollars)';

  if (existing?.series.taxCashFlowUSD !== undefined) {
    series.taxCashFlowUSD = [...existing.series.taxCashFlowUSD];
  }
  if (existing?.series.terminalProceedsUSD !== undefined) {
    series.terminalProceedsUSD = [...existing.series.terminalProceedsUSD];
  }

  const economicsBreakdown = asRecord(output.economicsBreakdown);
  economicsBreakdown._description_reportedCostMetrics = 'Best available reported project cost metrics for Tier benchmarking. metric identifies the canonical Tier benchmark the reported measure is economically comparable to; it does NOT assert that the technical report uses that exact terminology. Preserve the report wording in reportedLabel, explain material definition differences in definitionNotes, and provide source/page where available. Do not map a reported measure to a canonical metric unless its economic basis is sufficiently comparable.';

  const existingEconomicsBreakdown = asRecord((existing as unknown as Record<string, unknown> | undefined)?.economicsBreakdown);
  const existingReported = Array.isArray(existingEconomicsBreakdown.reportedCostMetrics)
    ? existingEconomicsBreakdown.reportedCostMetrics
    : [];
  const outputReported = Array.isArray(economicsBreakdown.reportedCostMetrics)
    ? economicsBreakdown.reportedCostMetrics
    : [];

  economicsBreakdown.reportedCostMetrics = outputReported.map((row, index) => {
    const normalized = asRecord(row);
    const original = asRecord(existingReported[index]);
    return {
      ...normalized,
      reportedLabel: typeof original.reportedLabel === 'string' ? original.reportedLabel : null,
      definitionNotes: typeof original.definitionNotes === 'string' ? original.definitionNotes : null,
      sourceId: typeof original.sourceId === 'string' ? original.sourceId : null,
      pageOrTable: typeof original.pageOrTable === 'string' ? original.pageOrTable : null,
    };
  });
  output.economicsBreakdown = economicsBreakdown as ProjectJsonV1['economicsBreakdown'];

  return output;
}

/**
 * Keep the default project JSON template equivalent in its active calculation
 * fields. Both report-locked overlays are opt-in and do not alter calculation
 * behavior. Metadata guidance is still exposed in newly created templates.
 */
export function getProjectJsonV1Template(): ProjectJsonV1 {
  return buildProjectJsonV1Template(getProjectJsonV1TemplateLegacy());
}
