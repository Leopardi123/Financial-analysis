import rawJson from './grassyMountainFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

export const GRASSY_MOUNTAIN_REPORT_PERIODS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
const M = 1_000_000;
function usdM(values: number[]): number[] {
  return values.map((value) => value * M);
}

export const GRASSY_MOUNTAIN_REPORT_REVENUE_USD = usdM([0, 2.9, 124.1, 186.3, 167.7, 179.9, 174.0, 168.5, 160.4, 113.2, 126.7, 6.9]);
export const GRASSY_MOUNTAIN_REPORT_PRE_TAX_FCFF_USD = usdM([-55.4, -131.6, 52.8, 118.2, 103.2, 113.1, 111.0, 113.8, 101.4, 61.1, 76.3, -6.2]);
export const GRASSY_MOUNTAIN_REPORT_POST_TAX_FCFF_USD = usdM([-55.4, -131.6, 50.8, 113.7, 99.3, 94.8, 90.1, 91.2, 81.9, 50.2, 61.7, -6.2]);
export const GRASSY_MOUNTAIN_REPORT_TAX_USD = usdM([0, 0, 2.0, 4.5, 3.9, 18.4, 20.9, 22.6, 19.5, 10.9, 14.5, 0]);
export const GRASSY_MOUNTAIN_SUMMARY_INITIAL_CAPEX_USD = 189_800_000;
export const GRASSY_MOUNTAIN_SUMMARY_SUSTAINING_CAPEX_USD = 65_100_000;
export const GRASSY_MOUNTAIN_ANNUAL_SUSTAINING_CAPEX_USD = 64_900_000;
export const GRASSY_MOUNTAIN_SUMMARY_CLOSURE_USD = 21_100_000;
export const GRASSY_MOUNTAIN_SUMMARY_SALVAGE_USD = 15_800_000;

export const GRASSY_MOUNTAIN_FS_V3 = rawJson as unknown as ProjectJsonV3;
