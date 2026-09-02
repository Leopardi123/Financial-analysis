import type { ProjectJsonV3 } from './schema.ts';

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function forbid(obj: Record<string, unknown>, keys: string[], path: string, mode: string): void {
  const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(obj, key));
  if (present.length > 0) throw new Error(`${path} mode=${mode} forbids parallel source field(s): ${present.join(', ')}.`);
}

/** Hard project_json_v3 rule: one active source for every economic category/scenario. */
export function validateProjectJsonV3SingleSource(raw: ProjectJsonV3): void {
  const root = raw as unknown as Record<string, unknown>;
  forbid(root, ['series', 'economicsBreakdown', 'takeItems', 'priceOverrides'], 'root', 'project_json_v3');

  const time = record(raw.time, 'time');
  forbid(time, ['periodEndDatesUtc', 'productionStartYear', 'constructionStartYear', 'nameplateCapacityYear'], 'time', 'RELATIVE_AXIS_PLUS_RUNTIME_PLACEMENT');
  if (time.runtimePlacement != null) {
    const placement = record(time.runtimePlacement, 'time.runtimePlacement');
    forbid(placement, ['productionStartYear', 'constructionStartYear', 'nameplateCapacityYear', 'sourceId', 'pageOrTable', 'asOfDate'], 'time.runtimePlacement', 'SOURCED_SCHEDULE_ANCHORS');
  }

  const metals = record(raw.metals, 'metals');
  forbid(metals, ['revenueQtyByMetal', 'containedQtyByMetal', 'recoveredQtyByMetal'], 'metals', 'COMMERCIAL_QUANTITY_EVIDENCE');

  const economics = record(raw.economics, 'economics');
  forbid(economics, ['royaltyModel'], 'economics', 'FISCAL_TAKE_MODEL');

  const cost = record(economics.costModel, 'economics.costModel');
  if (cost.mode === 'UNKNOWN') forbid(cost, ['operatingCostsUSD', 'siteGandA_USD', 'components'], 'economics.costModel', 'UNKNOWN');
  else if (cost.mode === 'AGGREGATE') forbid(cost, ['components'], 'economics.costModel', 'AGGREGATE');
  else if (cost.mode === 'COMPONENTS') forbid(cost, ['operatingCostsUSD', 'siteGandA_USD'], 'economics.costModel', 'COMPONENTS');

  const selling = record(economics.sellingModel, 'economics.sellingModel');
  if (selling.mode === 'UNKNOWN' || selling.mode === 'NONE') forbid(selling, ['sellingCostsUSD', 'components'], 'economics.sellingModel', String(selling.mode));
  else if (selling.mode === 'AGGREGATE') forbid(selling, ['components'], 'economics.sellingModel', 'AGGREGATE');
  else if (selling.mode === 'COMPONENTS') forbid(selling, ['sellingCostsUSD'], 'economics.sellingModel', 'COMPONENTS');

  if (economics.developmentModel != null) {
    const development = record(economics.developmentModel, 'economics.developmentModel');
    if (development.mode === 'UNKNOWN' || development.mode === 'NONE') {
      forbid(
        development,
        ['capitalizedRevenueUSD', 'capitalizedCostsUSD', 'reportCapitalizedRevenueUSD', 'reportCapitalizedCostsUSD', 'runtime'],
        'economics.developmentModel',
        String(development.mode),
      );
    } else if (development.mode === 'LOCKED_SERIES') {
      forbid(development, ['reportCapitalizedRevenueUSD', 'reportCapitalizedCostsUSD', 'runtime'], 'economics.developmentModel', 'LOCKED_SERIES');
    } else if (development.mode === 'REPORT_LOCKED_WITH_RUNTIME_PROXY') {
      forbid(development, ['capitalizedRevenueUSD', 'capitalizedCostsUSD'], 'economics.developmentModel', 'REPORT_LOCKED_WITH_RUNTIME_PROXY');
      const runtime = record(development.runtime, 'economics.developmentModel.runtime');
      if (runtime.method === 'REVENUE_SHARE') {
        forbid(runtime, ['capitalizedRevenueUSD', 'reportCapitalizedRevenueUSD', 'reportCapitalizedCostsUSD'], 'economics.developmentModel.runtime', 'REVENUE_SHARE');
      }
    }
  }

  const fiscal = record(economics.fiscalTakeModel, 'economics.fiscalTakeModel');
  if (fiscal.mode === 'UNKNOWN' || fiscal.mode === 'NONE') forbid(fiscal, ['items', 'fiscalTakeUSD', 'placement'], 'economics.fiscalTakeModel', String(fiscal.mode));
  else if (fiscal.mode === 'RULES') forbid(fiscal, ['fiscalTakeUSD', 'placement'], 'economics.fiscalTakeModel', 'RULES');
  else if (fiscal.mode === 'LOCKED_SERIES') forbid(fiscal, ['items'], 'economics.fiscalTakeModel', 'LOCKED_SERIES');

  const tax = record(economics.taxModel, 'economics.taxModel');
  if (tax.mode === 'UNKNOWN') forbid(tax, ['taxRate', 'taxCashFlowUSD', 'reportTaxCashFlowUSD', 'runtime'], 'economics.taxModel', 'UNKNOWN');
  else if (tax.mode === 'FLAT_RATE') forbid(tax, ['taxCashFlowUSD', 'reportTaxCashFlowUSD', 'runtime'], 'economics.taxModel', 'FLAT_RATE');
  else if (tax.mode === 'LOCKED_SERIES') forbid(tax, ['taxRate', 'reportTaxCashFlowUSD', 'runtime', 'lossCarryforward'], 'economics.taxModel', 'LOCKED_SERIES');
  else if (tax.mode === 'REPORT_LOCKED_WITH_RUNTIME_PROXY') forbid(tax, ['taxRate', 'taxCashFlowUSD', 'lossCarryforward'], 'economics.taxModel', 'REPORT_LOCKED_WITH_RUNTIME_PROXY');

  const verification = raw.verification as unknown as Record<string, unknown> | null | undefined;
  if (verification && typeof verification === 'object') {
    const report = verification.report;
    if (report && typeof report === 'object' && !Array.isArray(report)) {
      forbid(
        report as Record<string, unknown>,
        ['reportPreTaxFCF_USD', 'reportPostTaxFCF_USD', 'reportTaxCashFlowUSD', 'reportMiningRoyaltyCashFlowUSD'],
        'verification.report',
        'CHECKPOINTS_ONLY',
      );
    }
  }
}