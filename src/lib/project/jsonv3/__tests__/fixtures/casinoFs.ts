import rawJson from './casinoFs.json' with { type: 'json' };
import stressJson from './casinoFsInflationStress.json' with { type: 'json' };
import type { ProjectJsonV3 } from '../../schema.ts';

const M = 1_000_000;

export const CASINO_CAD_TO_USD = 0.80;
export const CASINO_LB_PER_TONNE = 2204.622621848776;
export const CASINO_REPORT_PERIODS = ["-4", "-3", "-2", "-1", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32"];
export const CASINO_REPORT_PRE_TAX_FCFF_USD = [-80.3832, -796.0632, -1067.8816, -682.3944, 391.8856, 1082.4784, 1047.3768, 782.5176, 673.736, 643.2536, 632.0512, 645.944, 626.1592, 593.308, 599.9392, 594.0112, 550.3864, 435.6088, 351.084, 314.3984, 332.7984, 390.2064, 442.6976, 449.9592, 466.7872, 416.6792, 261.7416, 221.8304, 287.2144, 363.5328, 219.5704, -40.0, -48.0, -48.0, -48.0, -36.0].map(value => value * M);
export const CASINO_REPORT_POST_TAX_FCFF_USD = [-80.3832, -796.0632, -1067.8816, -682.3944, 391.8856, 1082.4784, 978.5656, 589.5704, 498.256, 470.1384, 461.2544, 479.1072, 461.1096, 431.3456, 430.9024, 433.8792, 403.6816, 328.296, 266.5992, 227.7264, 247.5992, 284.86, 323.0928, 333.292, 336.2408, 314.5032, 202.6456, 162.8944, 205.492, 292.4536, 164.7808, -29.2, -35.04, -35.04, -35.04, -26.28].map(value => value * M);

export const CASINO_FS_V3 = rawJson as unknown as ProjectJsonV3;
export const CASINO_FS_INFLATION_STRESS_V3 = stressJson as unknown as ProjectJsonV3;
