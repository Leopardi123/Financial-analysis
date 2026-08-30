import assert from 'node:assert/strict';
import { computeInvestmentScore } from '../engine.ts';
import type {
  InvestmentScoreInputs,
  ManagementEvidence,
  ManagementRating,
  OptionalityEvidence,
  OptionalityRating,
} from '../types.ts';

function management(rating: ManagementRating): ManagementEvidence {
  return {
    executionTrackRecord: { rating },
    capitalAllocation: { rating },
    deliveryCredibility: { rating },
    technicalTeamFit: { rating },
  };
}

function optionality(rating: OptionalityRating): OptionalityEvidence {
  return {
    resourceExpansion: { rating },
    minePlanConversion: { rating },
    expansionDebottlenecking: { rating },
    districtStrategic: { rating },
  };
}

const base: InvestmentScoreInputs = {
  tier: 1,
  pNav: 0.12,
  peak6xVsPrice: 5,
  valuationConvergenceScore1Pass: true,
  lomYears: 32,
  cycleResistanceTier1Pass: true,
  downsideRobustnessPass: true,
  fatalFlaw: false,
  management: management('exceptional'),
  optionality: optionality('strong'),
  rawScore: 1.4,
};

{
  const result = computeInvestmentScore(base);
  assert.equal(result.gates.score1.passed, true);
  assert.equal(result.bestAllowedScore, 1);
  assert.equal(result.investmentScore, 2, 'raw continuous score still determines position within the allowed class');
  assert.equal(result.components.managementRating, 'exceptional');
  assert.equal(result.components.optionalityRating, 'strong');
}

{
  const result = computeInvestmentScore({ ...base, rawScore: 1, pNav: 0.16 });
  assert.equal(result.gates.score1.passed, false);
  assert.equal(result.gates.score2.passed, true);
  assert.equal(result.bestAllowedScore, 2);
  assert.equal(result.investmentScore, 2, 'Score 1 valuation gate must cap an otherwise perfect raw score');
}

{
  const result = computeInvestmentScore({ ...base, rawScore: 1, tier: 2, pNav: 0.2, lomYears: 25 });
  assert.equal(result.gates.score1.passed, false);
  assert.equal(result.gates.score2.passed, false);
  assert.equal(result.gates.score3.passed, true);
  assert.equal(result.bestAllowedScore, 3);
  assert.equal(result.investmentScore, 3, 'Tier 2 can reach Score 3 but never Score 1-2');
}

{
  const result = computeInvestmentScore({ ...base, rawScore: 1, lomYears: 20, optionality: optionality('exceptional') });
  assert.equal(result.gates.score1.passed, true, '20y LOM plus exceptional optionality can satisfy Score 1 longevity gate');
}

{
  const result = computeInvestmentScore({ ...base, rawScore: 1, lomYears: 19, optionality: optionality('exceptional') });
  assert.equal(result.gates.score1.passed, false);
}

{
  const result = computeInvestmentScore({
    ...base,
    rawScore: 1,
    management: {
      ...management('exceptional'),
      executionTrackRecord: { rating: 'strong' },
    },
  });
  assert.equal(result.gates.score1.passed, false, 'Score 1 requires exceptional exact-fit execution history, not only a high management average');
}

{
  const result = computeInvestmentScore({ ...base, rawScore: 1, fatalFlaw: true });
  assert.equal(result.gates.score1.passed, false);
  assert.equal(result.gates.score2.passed, false);
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.bestAllowedScore, 4, 'fatal flaw veto blocks Scores 1-3');
}

{
  const result = computeInvestmentScore({ ...base, rawScore: 2, valuationConvergenceScore1Pass: null });
  assert.equal(result.gates.score1.passed, false);
  assert.equal(result.verified, false);
  assert.match(result.diagnostics.join(' '), /Ej verifierad/);
}

{
  const result = computeInvestmentScore({ ...base, rawScore: 2, management: null });
  assert.equal(result.gates.score1.passed, false);
  assert.equal(result.gates.score2.passed, false);
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.verified, false);
  assert.match(result.diagnostics.join(' '), /Management|management/i);
}

console.log('investmentScore engine tests passed');
