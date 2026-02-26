import { getProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import { validateSnapshotRequest } from '../validateSnapshotRequest.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(function runValidateSnapshotRequestTests() {
  const project = getProjectJsonV1Template();
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
    projects: [
      {
        projectId: 'p1',
        rawJson: project,
      },
    ],
  });
  assert(happy.ok, 'happy path should validate');

  const badDiscount = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0,
    fx_USD_to_TargetCurrency: 10,
    market: { shares_current: 10, price_current_TargetCurrency: 1 },
    balanceSheet: {},
    financingPlan: {},
    projects: [{ projectId: 'p1', rawJson: project }],
  });
  assert(!badDiscount.ok, 'discountRate=0 should fail');
  assert(
    !badDiscount.ok && badDiscount.errors.some((error) => error.includes('discountRate')),
    'discountRate failure should include clear error',
  );

  const missingProjects = validateSnapshotRequest({
    targetCurrency: 'SEK',
    discountRate: 0.1,
    fx_USD_to_TargetCurrency: 10,
    market: { shares_current: 10, price_current_TargetCurrency: 1 },
    balanceSheet: {},
    financingPlan: {},
    projects: [],
  });
  assert(!missingProjects.ok, 'missing projects should fail');
  assert(
    !missingProjects.ok && missingProjects.errors.some((error) => error.includes('projects')),
    'missing projects should include error',
  );

  console.log('Snapshot request validation tests passed');
})();
