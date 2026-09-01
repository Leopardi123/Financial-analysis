import assert from 'node:assert/strict';
import { deriveNextInitialCapexMilestone } from '../preRevenueInitialCapex.ts';

const snapshot = {
  modeledValuationTimeline: {
    markers: [
      {
        yearLabelUsed: '2029',
        value_low: null,
        value_high: null,
        lista2Metrics: { InitialCAPEX_incremental_TargetCurrency: 500 },
      },
      {
        yearLabelUsed: '2032',
        value_low: 10,
        value_high: 20,
        lista2Metrics: { InitialCAPEX_incremental_TargetCurrency: 300 },
      },
    ],
  },
};

const next = deriveNextInitialCapexMilestone(snapshot, 2026);
assert.equal(next.status, 'OK');
assert.equal(next.markerYear, 2029);
assert.equal(next.initialCapexTargetCurrency, 500, 'CAPEX must use the next production milestone even when valuation low/high is unavailable');
assert.equal(next.basis, 'NEXT_PRODUCTION_MILESTONE_INCREMENTAL');

const missing = deriveNextInitialCapexMilestone({
  modeledValuationTimeline: {
    markers: [{ yearLabelUsed: 2030, lista2Metrics: { InitialCAPEX_incremental_TargetCurrency: null } }],
  },
}, 2026);
assert.equal(missing.status, 'MISSING_CAPEX');
assert.equal(missing.markerYear, 2030);
assert.equal(missing.initialCapexTargetCurrency, null);

const none = deriveNextInitialCapexMilestone(snapshot, 2035);
assert.equal(none.status, 'NO_FUTURE_MILESTONE');
assert.equal(none.markerYear, null);

console.log('preRevenueInitialCapex.test.ts passed');
