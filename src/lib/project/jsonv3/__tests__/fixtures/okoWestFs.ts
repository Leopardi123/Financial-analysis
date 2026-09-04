import rawJson from './okoWestFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;

export const OKO_WEST_REPORT_PERIODS = ['Y-3', 'Y-2', 'Y-1', ...Array.from({ length: 16 }, (_, i) => `Y${i + 1}`)];

export const OKO_WEST_REPORT_PRE_TAX_FCFF_USD = [
  -188.5, -538.7, -268.1, 397.2, 417.8, 330.3, 375.8, 454.0, 421.2, 464.5,
  512.4, 546.5, 718.1, 627.0, 563.1, 116.8, 37.2, -12.9, -12.9,
].map(value => value * M);

export const OKO_WEST_REPORT_POST_TAX_FCFF_USD = [
  -188.52, -538.65, -268.07, 397.23, 354.53, 278.33, 313.84, 356.62, 320.93, 361.65,
  397.85, 418.04, 548.68, 478.31, 431.57, 94.41, 37.18, -12.90, -12.90,
].map(value => value * M);

export const OKO_WEST_FS_V3 = rawJson as unknown as ProjectJsonV3;
