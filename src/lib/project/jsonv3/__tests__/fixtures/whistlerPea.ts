import rawJson from './whistlerPea.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;

export const WHISTLER_REPORT_PERIODS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
export const WHISTLER_REPORT_PRE_TAX_FCFF_USD = [-296, -983, 579, 692, 763, 77, 392, 593, 644, 244, 468, 175, -1, 279, 407, 317, -54].map(value => value * M);
export const WHISTLER_REPORT_POST_TAX_FCFF_USD = [-296, -984, 568, 631, 645, 57, 312, 474, 512, 176, 368, 125, -16, 232, 318, 242, -69].map(value => value * M);
export const WHISTLER_PEA_V3 = rawJson as unknown as ProjectJsonV3;
