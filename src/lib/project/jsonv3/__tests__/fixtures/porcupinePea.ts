import rawJson from './porcupinePea.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;

export const PORCUPINE_REPORT_PERIODS = ['2025','2026','2027','2028','2029','2030','2031','2032','2033','2034','2035','2036','2037','2038','2039','2040','2041','2042','2043','2044','2045','2046','2047','2048-2068'];
export const PORCUPINE_REPORT_PRE_TAX_FCFF_USD = [21,84,133,168,204,219,282,320,273,190,116,89,103,0,20,82,107,52,103,149,216,139,67,-365].map(value => value * M);
export const PORCUPINE_REPORT_POST_TAX_FCFF_USD = [-38,35,91,123,142,147,199,226,193,136,83,62,70,-4,17,65,78,40,72,103,149,106,82,-352].map(value => value * M);
export const PORCUPINE_PEA_V3 = rawJson as unknown as ProjectJsonV3;
