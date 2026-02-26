import { getProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import { validateSnapshotRequest } from '../validateSnapshotRequest.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(function runTests() {
  const rawJson = getProjectJsonV1Template();

  const happy = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    fx_USD_to_TargetCurrency: 10,
    market: {
      shares_current: 100000000,
      price_current_TargetCurrency: 12.5,
      preferredEquity_TargetCurrency: 0,
      minorityInterest_TargetCurrency: 0,
    },
    balanceSheet: {
      cash_t0_TargetCurrency: 500000000,
      debt_t0_TargetCurrency: 0,
    },
    financingPlan: {
      debt_fraction: 0,
      equity_fraction: 1,
      use_cash_first: true,
      cash_use_cap_TargetCurrency: null,
      equity_raise_price_TargetCurrency: 12.5,
    },
    buildFundingNeed_USD: 100000000,
    projects: [{ projectId: 'p1', rawJson }],
  });

  assert(happy.ok, 'happy path should validate');

  const badDiscount = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.5,
    fx_USD_to_TargetCurrency: 10,
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
    },
    projects: [{ projectId: 'p1', rawJson }],
  });

  assert(!badDiscount.ok, 'invalid discountRate should fail');
  if (!badDiscount.ok) {
    assert(
      badDiscount.errors.some((error) => error.includes('discountRate')),
      'invalid discountRate should produce discountRate error',
    );
  }

  const missingProjects = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    fx_USD_to_TargetCurrency: 10,
    market: {
      shares_current: 100,
      price_current_TargetCurrency: 10,
    },
  });

  assert(!missingProjects.ok, 'missing projects should fail');
  if (!missingProjects.ok) {
    assert(
      missingProjects.errors.some((error) => error.includes('projects must be a non-empty array')),
      'missing projects should produce projects error',
    );
  }

  console.log('validateSnapshotRequest tests passed');
})();
