import rawJson from './diambaSudFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;
export const DIAMBA_SUD_REPORT_PERIODS = ['2026','2027','2028','2029','2030','2031','2032','2033','2034','2035','2036','2037'];
export const DIAMBA_SUD_REPORT_PRE_TAX_FCFF_USD = [-95,-189,70,446,442,274,265,102,260,108,129,56].map(value => value * M);
export const DIAMBA_SUD_REPORT_POST_TAX_FCFF_USD = [-95,-189,70,414,339,155,198,34,248,44,120,43].map(value => value * M);
export const DIAMBA_SUD_FS_V3 = rawJson as unknown as ProjectJsonV3;
