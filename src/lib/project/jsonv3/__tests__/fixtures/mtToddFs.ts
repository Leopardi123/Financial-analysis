import rawJson from './mtToddFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;

function spread(totalM: number, years: number): number[] {
  return new Array(years).fill((totalM * M) / years);
}

export const MT_TODD_REPORT_PERIODS = ['-2', '-1', ...Array.from({ length: 43 }, (_, i) => String(i + 1))];

export const MT_TODD_REPORT_PRE_TAX_FCFF_USD = [
  -149, -225,
  44, 245, 231, 237, 153, 143, 145, 147, 145, 153, 141, 149, 155, 146, 151,
].map(value => value * M).concat(
  spread(490, 5),
  spread(402, 5),
  spread(1053, 5),
  spread(103, 3),
  spread(-94, 10),
);

export const MT_TODD_REPORT_POST_TAX_FCFF_USD = [
  -149, -225,
  35, 194, 161, 164, 104, 95, 99, 100, 97, 103, 91, 98, 103, 95, 100,
].map(value => value * M).concat(
  spread(280, 5),
  spread(266, 5),
  spread(700, 5),
  spread(68, 3),
  spread(-94, 10),
);

export const MT_TODD_FS_V3 = rawJson as unknown as ProjectJsonV3;
