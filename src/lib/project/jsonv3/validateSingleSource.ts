import type { ProjectJsonV3 } from './schema.ts';

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function forbid(obj: Record<string, unknown>, keys: string[], path: string, mode: string): void {
  const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(obj, key));
  if (present.length > 0) {
    throw new Error(`${path} mode=${mode} forbids parallel source field(s): ${present.join(', ')}.`);
  }
}

/** Hard project_json_v3 rule: one active source for every economic category. */
export function validateProjectJsonV3SingleSource(raw: ProjectJsonV3): void {
  const root = raw as unknown as Record<string, unknown>;
  forbid(root, ['series', 'economicsBreakdown', 'takeItems', 'priceOverrides'], 'root', 'project_json_v3');

  const economics = record(raw.economics, 'economics');
  const cost = record(economics.costModel, 'economics.costModel');
  if (cost.mode === 'AGGREGATE') {
    forbid(cost, ['components'], 'economics.costModel', 'AGGREGATE');
  } else if (cost.mode === 'COMPONENTS') {
    forbid(cost, ['operatingCostsUSD', 'siteGandA_USD'], 'economics.costModel', 'COMPONENTS');
  }

  const selling = record(economics.sellingModel, 'economics.sellingModel');
  if (selling.mode === 'NONE') {
    forbid(selling, ['sellingCostsUSD', 'components'], 'economics.sellingModel', 'NONE');
  } else if (selling.mode === 'AGGREGATE') {
    forbid(selling, ['components'], 'economics.sellingModel', 'AGGREGATE');
  } else if (selling.mode === 'COMPONENTS') {
    forbid(selling, ['sellingCostsUSD'], 'economics.sellingModel', 'COMPONENTS');
  }

  const royalty = record(economics.royaltyModel, 'economics.royaltyModel');
  if (royalty.mode === 'NONE') {
    forbid(royalty, ['items', 'royaltiesUSD'], 'economics.royaltyModel', 'NONE');
  } else if (royalty.mode === 'RULES') {
    forbid(royalty, ['royaltiesUSD'], 'economics.royaltyModel', 'RULES');
  } else if (royalty.mode === 'LOCKED_SERIES') {
    forbid(royalty, ['items'], 'economics.royaltyModel', 'LOCKED_SERIES');
  }

  const tax = record(economics.taxModel, 'economics.taxModel');
  if (tax.mode === 'FLAT_RATE') {
    forbid(tax, ['taxCashFlowUSD'], 'economics.taxModel', 'FLAT_RATE');
  } else if (tax.mode === 'LOCKED_SERIES') {
    forbid(tax, ['taxRate'], 'economics.taxModel', 'LOCKED_SERIES');
  }

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
