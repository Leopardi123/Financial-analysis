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

const tier3ExceptionalBase: InvestmentScoreInputs = {
  tier: 3,
  pNav: 0.12,
  peak6xVsPrice: 5,
  valuationConvergence: 'EXTREME',
  lomYears: 9,
  cycleResistanceTier1Pass: false,
  downsideRobustnessPass: true,
  tier3ScaleOrLomOnlyExceptionEligible: true,
  fatalFlaw: false,
  management: management('strong'),
  optionality: optionality('strong'),
  rawScore: 2.4,
};

{
  const result = computeInvestmentScore(tier3ExceptionalBase);
  assert.equal(result.gates.score3.passed, true);
  assert.equal(result.bestAllowedScore, 3);
  assert.equal(result.investmentScore, 3, 'Tier 3 may reach Strong Buy when only scale/LOM cause Tier 3 and every exceptional-path gate passes');
}

{
  const result = computeInvestmentScore({ ...tier3ExceptionalBase, valuationConvergence: 'VERY_STRONG' });
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.bestAllowedScore, 4, 'Tier-3 exception requires EXTREME valuation convergence');
}

{
  const result = computeInvestmentScore({ ...tier3ExceptionalBase, management: management('adequate') });
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.bestAllowedScore, 4, 'Tier-3 exception requires at least Strong management');
}

{
  const result = computeInvestmentScore({ ...tier3ExceptionalBase, optionality: optionality('some') });
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.bestAllowedScore, 4, 'Tier-3 exception requires at least Strong optionality');
}

{
  const result = computeInvestmentScore({ ...tier3ExceptionalBase, tier3ScaleOrLomOnlyExceptionEligible: false });
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.bestAllowedScore, 4, 'Tier 3 from capital returns or cycle cannot use the exception');
}

{
  const result = computeInvestmentScore({ ...tier3ExceptionalBase, downsideRobustnessPass: false });
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.bestAllowedScore, 4, 'non-positive 7y survival NPV10 blocks Score 3');
}

{
  const result = computeInvestmentScore({ ...tier3ExceptionalBase, fatalFlaw: true });
  assert.equal(result.gates.score3.passed, false);
  assert.equal(result.bestAllowedScore, 4, 'fatal flaw remains a veto');
}

{
  const tier2CycleButSurvives: InvestmentScoreInputs = {
    ...tier3ExceptionalBase,
    tier: 2,
    valuationConvergence: 'STRONG',
    management: management('adequate'),
    optionality: optionality('some'),
    tier3ScaleOrLomOnlyExceptionEligible: false,
    cycleResistanceTier1Pass: false,
    downsideRobustnessPass: true,
    rawScore: 2.4,
  };
  const result = computeInvestmentScore(tier2CycleButSurvives);
  assert.equal(result.gates.score3.passed, true);
  assert.equal(result.bestAllowedScore, 3);
  assert.equal(result.investmentScore, 3, 'Cycle Tier 2 no longer double-penalizes Score 3 when 7y survival NPV10 remains positive');
}

console.log('tier3Exception tests passed');
