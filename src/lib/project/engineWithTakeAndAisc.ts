import { computeProjectAisc } from './aisc/engine.ts';
import { computeProjectEngineWithTake } from './engineWithTake.ts';
import type {
  ProjectEngineWithTakeAndAiscInput,
  ProjectEngineWithTakeAndAiscOutput,
} from './types.ts';

function assertSeriesLength(series: (number | null)[], masterN: number, name: string): void {
  if (series.length !== masterN + 1) {
    throw new Error(`${name} length must equal phase1.masterN+1`);
  }
}

function assertEqualSeries(left: (number | null)[], right: (number | null)[], name: string): void {
  if (left.length !== right.length) {
    throw new Error(`${name} must match engineWithTake.take.grossRevenueUSD length`);
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) {
      throw new Error(`${name} must match engineWithTake.take.grossRevenueUSD values`);
    }
  }
}

export function computeProjectEngineWithTakeAndAisc(
  input: ProjectEngineWithTakeAndAiscInput,
): ProjectEngineWithTakeAndAiscOutput {
  const masterN = input.engineWithTake.phase1.masterN;

  assertSeriesLength(input.aisc.grossRevenueUSD, masterN, 'aisc.grossRevenueUSD');
  assertSeriesLength(input.aisc.auPriceUSDPerOz, masterN, 'aisc.auPriceUSDPerOz');
  assertEqualSeries(input.aisc.grossRevenueUSD, input.engineWithTake.take.grossRevenueUSD, 'aisc.grossRevenueUSD');

  const out = computeProjectEngineWithTake(input.engineWithTake);

  const aiscOut = computeProjectAisc({
    masterN,
    productionStartPeriod: input.engineWithTake.phase1.productionStartPeriod,
    grossRevenueUSD: input.aisc.grossRevenueUSD,
    auPriceUSDPerOz: input.aisc.auPriceUSDPerOz,
    sustainingCostUSD: out.phase1.sustainingCostUSD,
  });

  return { ...out, aisc: aiscOut };
}
