import assert from 'node:assert/strict';
import {
  aggregateManagementRating,
  aggregateOptionalityRating,
  exactFitManagementPass,
} from '../manualEvidence.ts';
import type { ManagementEvidence, OptionalityEvidence } from '../types.ts';

const management: ManagementEvidence = {
  executionTrackRecord: { rating: 'exceptional', assessmentDate: '2026-08-30' },
  capitalAllocation: { rating: 'strong' },
  deliveryCredibility: { rating: 'strong' },
  technicalTeamFit: { rating: 'strong' },
};

assert.equal(aggregateManagementRating(management), 'strong');
assert.equal(exactFitManagementPass(management), true);
assert.equal(
  aggregateManagementRating({ ...management, deliveryCredibility: { rating: 'unassessed' } }),
  null,
  'unassessed must remain unverified rather than silently receiving a neutral score',
);
assert.equal(
  exactFitManagementPass({ ...management, executionTrackRecord: { rating: 'strong' } }),
  false,
  'Score-1 exact-fit history is a separate hard gate',
);

const optionality: OptionalityEvidence = {
  resourceExpansion: { rating: 'exceptional' },
  minePlanConversion: { rating: 'strong' },
  expansionDebottlenecking: { rating: 'strong' },
  districtStrategic: { rating: 'strong' },
};
assert.equal(aggregateOptionalityRating(optionality), 'strong');
assert.equal(
  aggregateOptionalityRating({ ...optionality, districtStrategic: { rating: 'unassessed' } }),
  null,
  'unassessed optionality must not be treated as none',
);

console.log('investmentScore manual evidence tests passed');
