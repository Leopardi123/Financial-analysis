import rawJson from './fennGibPfs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

export const FENN_GIB_CAD_TO_USD = 1 / 1.35;
export const FENN_GIB_REPORT_PERIODS = ['-3', '-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'];
export const FENN_GIB_REPORT_SUMMARY_SUSTAINING_CAPEX_CAD = 60_900_000;
export const FENN_GIB_REPORT_CASHFLOW_SUSTAINING_CAPEX_CAD = 68_200_000;

const M = 1_000_000;
function cadM(values: number[]): number[] {
  return values.map((value) => value * M * FENN_GIB_CAD_TO_USD);
}

export const FENN_GIB_REPORT_GROSS_REVENUE_USD = cadM([0, 0, 0, 239.7, 343.3, 294.5, 292, 306.7, 314.1, 243.6, 226.8, 220.3, 257.3, 286.1, 263.4, 256.9, 224.6, 78, 0]);
export const FENN_GIB_REPORT_PRE_TAX_FCFF_USD = cadM([-93.1, -188.3, -168.6, 123.5, 222.4, 187.5, 177.2, 191.3, 195.2, 132.6, 109.8, 98.8, 142.9, 173.2, 166.3, 168.7, 146.8, 46.4, -46.2]);
export const FENN_GIB_REPORT_POST_TAX_FCFF_USD = cadM([-93.1, -188.3, -168.6, 123.5, 208.4, 174.1, 123.4, 131.9, 135.3, 94.4, 75.2, 68, 95.9, 116.1, 112.2, 114.2, 99.8, 34.5, -45.9]);

export const FENN_GIB_PFS_V3 = rawJson as unknown as ProjectJsonV3;
