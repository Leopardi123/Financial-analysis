import { diagnoseProjectFullProductionV1, validateProjectFullProductionV1 } from '../fullProductionV1.ts';
import type { ProjectEngineFullProductionV1Input } from '../../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;

  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

function buildBaseInput(): ProjectEngineFullProductionV1Input {
  return {
    masterN: 1,
    payableQtyByMetal: {
      Au: [100, 120],
    },
    spotPriceUSDByMetal: {
      Au: [10, 11],
    },
    takeItems: [],
    phase1: {
      masterN: 1,
      productionStartPeriod: 0,
      capexUSD: [0, 0],
      operatingCostsUSD: [10, 10],
      sustainingCapexUSD: [1, 1],
      siteGandA_USD: [2, 2],
      reclamationUSD: [0, 0],
    },
    phase2: { discountRate: 0.1 },
    aisc: { auPriceUSDPerOz: [1800, 1820] },
  };
}

(function runFullProductionValidationTests() {
  const happyInput = buildBaseInput();
  const happyReport = diagnoseProjectFullProductionV1(happyInput);
  assert(happyReport.ok, 'happy path diagnose report should be ok');
  assert(happyReport.errors.length === 0, 'happy path should not contain errors');
  validateProjectFullProductionV1(happyInput);

  const missingSpotInput = buildBaseInput();
  missingSpotInput.spotPriceUSDByMetal.Au[0] = null;
  missingSpotInput.streamsByMetal = {
    Au: {
      streamPctOfPayable: 0.2,
      purchasePrice: { kind: 'PCT_OF_SPOT', value: 0.2 },
    },
  };

  const missingSpotReport = diagnoseProjectFullProductionV1(missingSpotInput);
  assert(
    missingSpotReport.errors.some((issue) => issue.code === 'STREAM_TAKE_NULL_PRICE_MISSING' && issue.t === 0),
    'diagnose should include stream take null issue at t=0 for missing spot',
  );
  validateProjectFullProductionV1(missingSpotInput);

  const mismatchedMetalInput = buildBaseInput();
  mismatchedMetalInput.spotPriceUSDByMetal = {
    Ag: [10, 10],
  };
  const mismatchReport = diagnoseProjectFullProductionV1(mismatchedMetalInput);
  assert(
    mismatchReport.missingMetalsInSpotPrice.includes('Au'),
    'diagnose should report Au as missing in spot prices when keys mismatch',
  );
  assertThrows(
    () => validateProjectFullProductionV1(mismatchedMetalInput),
    /spotPriceUSDByMetal missing required metal Au/,
    'validate should throw on qty/spot metal mismatch',
  );

  const lengthMismatchInput = buildBaseInput();
  lengthMismatchInput.aisc.auPriceUSDPerOz = [1800];
  const lengthReport = diagnoseProjectFullProductionV1(lengthMismatchInput);
  assert(
    lengthReport.lengthMismatches.some((mismatch) => mismatch.path === 'aisc.auPriceUSDPerOz'),
    'diagnose should report auPrice length mismatch',
  );
  assertThrows(
    () => validateProjectFullProductionV1(lengthMismatchInput),
    /aisc\.auPriceUSDPerOz length must equal masterN\+1/,
    'validate should throw on auPrice length mismatch',
  );

  const negativeQtyInput = buildBaseInput();
  negativeQtyInput.payableQtyByMetal.Au[0] = -1;
  assertThrows(
    () => validateProjectFullProductionV1(negativeQtyInput),
    /cannot be negative/,
    'validate should throw on negative qty',
  );

  const negativePriceInput = buildBaseInput();
  negativePriceInput.spotPriceUSDByMetal.Au[1] = -5;
  assertThrows(
    () => validateProjectFullProductionV1(negativePriceInput),
    /cannot be negative/,
    'validate should throw on negative spot price',
  );

  console.log('Full production v1 validation tests passed');
})();
