import rawJson from './scottiePea.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

export const SCOTTIE_PEA_V3 = rawJson as ProjectJsonV3;
export const SCOTTIE_REPORT_PERIODS = ['-1', '1', '2', '3', '4', '5', '6', '7', '8'] as const;
export const SCOTTIE_CAD_TO_USD = 0.72;
export const SCOTTIE_REPORT_RECOVERED_AU_OZ = 457_600;
export const SCOTTIE_REPORT_SMELTER_PAYABILITY = 0.883;
export const SCOTTIE_REPORT_INITIAL_CAPEX_CAD = 128_600_000;
export const SCOTTIE_REPORT_SUSTAINING_INCL_CLOSURE_CAD = 76_700_000;
export const SCOTTIE_REPORT_CLOSURE_CAD = 15_000_000;
export const SCOTTIE_REPORT_SALVAGE_CAD = 12_900_000;
