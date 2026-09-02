import rawJson from './newPolarisFs.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

export const NEW_POLARIS_CAD_TO_USD = 0.725;
export const NEW_POLARIS_REPORT_PERIODS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function cadM(values: number[]): number[] {
  return values.map((value) => value * 1_000_000 * NEW_POLARIS_CAD_TO_USD);
}

/**
 * Independent rounded report cash-flow checkpoints from Table 22-2.
 * These remain outside the JSON so the test does not validate the source
 * against values copied from that same source.
 */
export const NEW_POLARIS_REPORT_PRE_TAX_FCFF_USD = cadM([
  -127.1, -124.4, 53.0, 145.4, 175.0, 144.9, 170.0,
  141.1, 171.4, 184.2, 58.7, 0, 0, 0,
]);

export const NEW_POLARIS_REPORT_POST_TAX_FCFF_USD = cadM([
  -127.1, -124.4, 50.3, 141.2, 138.8, 97.3, 108.8,
  89.9, 107.4, 120.7, 46.2, 0, 0, 0,
]);

/**
 * The importable JSON is the single source of project inputs.
 * This typed fixture is intentionally only a loader for the golden test.
 */
export const NEW_POLARIS_FS_V3 = rawJson as unknown as ProjectJsonV3;
