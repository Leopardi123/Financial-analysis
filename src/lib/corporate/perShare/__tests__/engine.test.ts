import { computeCorporatePerShare } from '../engine.ts';
import type { CorporatePerShareInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }

  throw new Error(message);
}

function makeBaseInput(): CorporatePerShareInput {
  return {
    shares_post_financing: 100,
    npvToday_TargetCurrency: 10000,
    navToday_TargetCurrency: 12000,
    cfLOM_TargetCurrency: 5000,
    dcfProdStart_present_TargetCurrency: 8000,
  };
}

(function runCorporatePerShareTests() {
  const happy = computeCorporatePerShare(makeBaseInput());
  assertEqual(happy.npvToday_perShare_TargetCurrency, 100, 'happy path should compute NPV/share');
  assertEqual(happy.navToday_perShare_TargetCurrency, 120, 'happy path should compute NAV/share');
  assertEqual(happy.cfLOM_perShare_TargetCurrency, 50, 'happy path should compute CF LOM/share');
  assertEqual(
    happy.dcfProdStart_present_perShare_TargetCurrency,
    80,
    'happy path should compute DCF prod-start present/share',
  );

  const nullShares = makeBaseInput();
  nullShares.shares_post_financing = null;
  const nullSharesResult = computeCorporatePerShare(nullShares);
  assertEqual(
    nullSharesResult.npvToday_perShare_TargetCurrency,
    null,
    'NPV/share should be null when shares are null',
  );
  assertEqual(
    nullSharesResult.navToday_perShare_TargetCurrency,
    null,
    'NAV/share should be null when shares are null',
  );
  assertEqual(
    nullSharesResult.cfLOM_perShare_TargetCurrency,
    null,
    'CF LOM/share should be null when shares are null',
  );
  assertEqual(
    nullSharesResult.dcfProdStart_present_perShare_TargetCurrency,
    null,
    'DCF prod-start present/share should be null when shares are null',
  );

  const zeroShares = makeBaseInput();
  zeroShares.shares_post_financing = 0;
  assertThrows(() => computeCorporatePerShare(zeroShares), 'shares_post_financing = 0 should throw');

  const negativeShares = makeBaseInput();
  negativeShares.shares_post_financing = -1;
  assertThrows(() => computeCorporatePerShare(negativeShares), 'shares_post_financing < 0 should throw');

  const nullValuations: CorporatePerShareInput = {
    shares_post_financing: 100,
    npvToday_TargetCurrency: null,
    navToday_TargetCurrency: null,
    cfLOM_TargetCurrency: null,
    dcfProdStart_present_TargetCurrency: null,
  };
  const nullValuationResult = computeCorporatePerShare(nullValuations);
  assertEqual(
    nullValuationResult.npvToday_perShare_TargetCurrency,
    null,
    'NPV/share should be null for null valuation input',
  );
  assertEqual(
    nullValuationResult.navToday_perShare_TargetCurrency,
    null,
    'NAV/share should be null for null valuation input',
  );
  assertEqual(
    nullValuationResult.cfLOM_perShare_TargetCurrency,
    null,
    'CF LOM/share should be null for null valuation input',
  );
  assertEqual(
    nullValuationResult.dcfProdStart_present_perShare_TargetCurrency,
    null,
    'DCF prod-start present/share should be null for null valuation input',
  );

  console.log('Corporate per-share engine tests passed');
})();
