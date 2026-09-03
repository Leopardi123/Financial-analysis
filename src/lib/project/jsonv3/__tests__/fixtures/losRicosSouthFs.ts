import rawJson from './losRicosSouthFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;
export const LOS_RICOS_SOUTH_REPORT_PERIODS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
export const LOS_RICOS_SOUTH_REPORT_PRE_TAX_FCFF_USD = [-89.7,-146.6,89,185.6,82.6,101.6,83.9,86.5,79.7,95.8,56.8,48.2,39,40.2,40.6,43.7,14.2].map(v => v * M);
export const LOS_RICOS_SOUTH_REPORT_POST_TAX_FCFF_USD = [-89.7,-146.6,69.9,130.5,63.3,75.7,64.2,65.9,61.4,71.9,46.5,40.9,25.5,26.3,26.5,28.5,14.1].map(v => v * M);
export const LOS_RICOS_SOUTH_FS_V3 = rawJson as unknown as ProjectJsonV3;
