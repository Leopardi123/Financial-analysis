import assert from 'node:assert/strict';
import { computeProvisionalRawScoreV0 } from '../rawScore.ts';
import type { InvestmentScoreInputs } from '../types.ts';

const viscariaLike: InvestmentScoreInputs = {
  tier: 3,
  pNav: 0.96,
  peak6xVsPrice: 1.84,
  valuationConvergence: 'MIXED',
  lomYears: 18,
  cycleResistanceTier1Pass: true,
  downsideRobustnessPass: true,
  fatalFlaw: false,
  management: {
    executionTrackRecord: { rating: 'weak' },
    capitalAllocation: { rating: 'adequate' },
    deliveryCredibility: { rating: 'adequate' },
    technicalTeamFit: { rating: 'adequate' },
  },
  optionality: {
    resourceExpansion: { rating: 'strong' },
    minePlanConversion: { rating: 'strong' },
    expansionDebottlenecking: { rating: 'some' },
    districtStrategic: { rating: 'some' },
  },
  rawScore: null,
};

{
  const result = computeProvisionalRawScoreV0(viscariaLike);
  assert.equal(result.components.management, 6.9, 'continuous management should retain all four dimensions with 40/20/20/20 weights');
  assert.ok(result.rawScore !== null);
  assert.ok(Math.abs((result.rawScore ?? 0) - 6.7) < 0.02, `expected Viscaria-like raw score near 6.70, got ${result.rawScore}`);
}

{
  const result = computeProvisionalRawScoreV0({
    ...viscariaLike,
    management: {
      ...viscariaLike.management!,
      technicalTeamFit: { rating: 'unassessed' },
    },
  });
  assert.equal(result.components.management, null);
  assert.equal(result.rawScore, null, 'unassessed management must not be replaced by a neutral proxy');
  assert.match(result.diagnostics.join(' '), /ingen neutral proxy/i);
}

console.log('investmentScore raw score tests passed');
