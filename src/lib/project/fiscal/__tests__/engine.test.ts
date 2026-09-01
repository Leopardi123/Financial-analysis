import '../../jsonv3/__tests__/vizcachitasPfs.test.ts';
import '../../jsonv3/__tests__/bergPfs.test.ts';
import '../../jsonv3/__tests__/warintzaPfs.test.ts';
import { computeFiscalTake } from '../engine.ts';
import type { FiscalTakeRule } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function near(actual: number | null | undefined, expected: number, tolerance = 1e-9): void {
  assert(typeof actual === 'number' && Number.isFinite(actual), `Expected finite ${expected}, got ${String(actual)}`);
  assert(Math.abs((actual as number) - expected) <= tolerance, `Expected ${expected}, got ${String(actual)}`);
}

const rules: FiscalTakeRule[] = [
  {
    id: 'nsr-with-offsite-deduction',
    placement: 'OPERATING_EXPENSE',
    base: { line: 'GROSS_METAL_VALUE', deductions: ['TRANSPORT'] },
    rate: { type: 'TIERED_PRICE', priceKey: 'CU_USD_LB', tiers: [{ threshold: 0, rate: 0.01 }, { threshold: 4, rate: 0.02 }] },
  },
  {
    id: 'profit-margin-take',
    placement: 'PRE_TAX_CHARGE',
    base: { line: 'EBIT_BEFORE_FISCAL' },
    rate: {
      type: 'TIERED_MARGIN',
      numeratorLine: 'EBIT_BEFORE_FISCAL',
      denominatorLine: 'NET_SMELTER_RETURN',
      tiers: [{ threshold: 0, rate: 0.02 }, { threshold: 0.4, rate: 0.05 }],
    },
  },
  {
    id: 'post-tax-contractual',
    placement: 'POST_TAX_CHARGE',
    base: { line: 'NET_SMELTER_RETURN' },
    rate: { type: 'FIXED', rate: 0.005 },
  },
];

const out = computeFiscalTake({
  masterN: 1,
  rules,
  ledgerUSD: {
    GROSS_METAL_VALUE: [1000, 2000],
    TRANSPORT: [100, 100],
    NET_SMELTER_RETURN: [800, 1800],
    EBIT_BEFORE_FISCAL: [200, 900],
  },
  priceSeriesByKey: { CU_USD_LB: [3.5, 4.5] },
});

near(out.operatingExpenseUSD[0], 9);
near(out.operatingExpenseUSD[1], 38);
near(out.preTaxChargeUSD[0], 4);
near(out.preTaxChargeUSD[1], 45);
near(out.postTaxChargeUSD[0], 4);
near(out.postTaxChargeUSD[1], 9);
assert(out.byRuleUSD['nsr-with-offsite-deduction'].length === 2, 'Rule outputs must be preserved for audit');
assert(out.diagnostics.some((line) => line.includes('TIERED_MARGIN')), 'Diagnostics must expose rate type');

let threw = false;
try {
  computeFiscalTake({
    masterN: 0,
    rules: [{ id: 'missing-ledger', placement: 'OPERATING_EXPENSE', base: { line: 'PROCESSING_COST' }, rate: { type: 'FIXED', rate: 0.01 } }],
    ledgerUSD: { GROSS_METAL_VALUE: [100] },
  });
} catch (error) {
  threw = error instanceof Error && /PROCESSING_COST/.test(error.message);
}
assert(threw, 'Fiscal engine must fail closed when a source-defined base/deduction ledger line is unavailable');

console.log('fiscal take engine tests passed');
