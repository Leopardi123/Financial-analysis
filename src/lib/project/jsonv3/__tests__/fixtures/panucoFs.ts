import rawJson from './panucoFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

export const PANUCO_REPORT_PERIODS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;
const M = 1_000_000;
function usdM(values: number[]): number[] {
  return values.map((value) => value * M);
}

export const PANUCO_REPORT_TOTAL_REVENUE_USD = usdM([0, 63, 811, 691, 627, 746, 689, 574, 564, 474, 443, 88, 0, 0]);
export const PANUCO_REPORT_PRE_TAX_FCFF_USD = usdM([-88, -137, 633, 501, 433, 532, 504, 381, 381, 298, 298, 69, -28, 0]);
export const PANUCO_REPORT_POST_TAX_FCFF_USD = usdM([-88, -146, 433, 320, 278, 339, 333, 255, 260, 202, 199, 68, -29, 2]);
export const PANUCO_REPORT_TOTAL_TAX_USD = 1_364_000_000;
export const PANUCO_SUMMARY_INITIAL_CAPEX_USD = 238_700_000;
export const PANUCO_SUMMARY_EXPANSION_CAPEX_USD = 15_400_000;
export const PANUCO_SUMMARY_SUSTAINING_CAPEX_USD = 287_300_000;
export const PANUCO_REPORT_CASHFLOW_SUSTAINING_CAPEX_USD = 289_000_000;
export const PANUCO_SUMMARY_CLOSURE_USD = 37_500_000;

export const PANUCO_FS_V3 = rawJson as unknown as ProjectJsonV3;
