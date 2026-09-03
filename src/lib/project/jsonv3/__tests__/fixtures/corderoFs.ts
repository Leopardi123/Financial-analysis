import rawJson from './corderoFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;

export const CORDERO_REPORT_PERIODS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
export const CORDERO_REPORT_PRE_TAX_FCFF_USD = [-151,-454,140,184,-149,394,259,200,381,695,362,164,162,271,234,202,143,255,282,77,81,-63].map(value => value * M);
export const CORDERO_REPORT_POST_TAX_FCFF_USD = [-151,-454,126,141,-164,274,198,140,271,480,258,102,110,180,156,138,70,176,194,61,64,-64].map(value => value * M);
export const CORDERO_FS_V3 = rawJson as unknown as ProjectJsonV3;
