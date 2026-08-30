import type { ProjectJsonV1 } from './schema.ts';
import {
  buildProjectJsonV1Template as buildProjectJsonV1TemplateLegacy,
  getProjectJsonV1Template as getProjectJsonV1TemplateLegacy,
} from './templateLegacy.ts';

type ProjectJsonV1Template = ProjectJsonV1 & Record<string, unknown>;

/**
 * Backwards-compatible template overlay.
 *
 * The legacy template builder remains authoritative for every existing field.
 * The new explicit tax series is only preserved when it already exists in the
 * project JSON, so old templates/projects receive no new active input and keep
 * exactly the prior taxRate behavior.
 */
export function buildProjectJsonV1Template(existing?: ProjectJsonV1): ProjectJsonV1Template {
  const output = buildProjectJsonV1TemplateLegacy(existing) as ProjectJsonV1Template;
  const series = output.series as ProjectJsonV1['series'] & Record<string, unknown>;

  series._description_taxCashFlowUSD = 'Optional report-locked net tax cash flow aligned to t=0..masterN. Positive values are cash inflows/refundable tax credits; negative values are cash tax payments. Must have exactly masterN+1 elements and is mutually exclusive with economics.taxRate.';
  series._example_taxCashFlowUSD = [254700000, 365200000, 398300000, -120000000];
  series._unit_taxCashFlowUSD = 'USD (full dollars)';

  if (existing?.series.taxCashFlowUSD !== undefined) {
    series.taxCashFlowUSD = [...existing.series.taxCashFlowUSD];
  }

  return output;
}

/**
 * Keep the default project JSON template byte-for-byte equivalent in its active
 * calculation fields. Explicit tax is opt-in and therefore is not inserted into
 * newly created legacy-style project JSONs.
 */
export function getProjectJsonV1Template(): ProjectJsonV1 {
  return getProjectJsonV1TemplateLegacy();
}
