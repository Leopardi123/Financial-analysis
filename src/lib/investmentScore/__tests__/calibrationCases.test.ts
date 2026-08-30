import assert from 'node:assert/strict';
import { computeInvestmentScore } from '../engine.ts';
import { computeProvisionalRawScoreV0 } from '../rawScore.ts';
import type { InvestmentScoreInputs, ManagementRating, OptionalityRating } from '../types.ts';

function management(rating: ManagementRating) {
  return {
    executionTrackRecord: { rating },
    capitalAllocation: { rating },
    deliveryCredibility: { rating },
    technicalTeamFit: { rating },
  };
}

function optionality(rating: OptionalityRating) {
  return {
    resourceExpansion: { rating },
    minePlanConversion: { rating },
    expansionDebottlenecking: { rating },
    districtStrategic: { rating },
  };
}

const cases: Array<{
  name: string;
  input: Omit<InvestmentScoreInputs, 'rawScore'>;
  expectedScore: number;
}> = [
  {
    name: 'extreme Tier 1, exceptional team, long LOM',
    input: { tier: 1, pNav: 0.12, peak6xVsPrice: 5.5, valuationConvergence: 'EXTREME', lomYears: 32, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('exceptional'), optionality: optionality('exceptional') },
    expectedScore: 1,
  },
  {
    name: 'very cheap Tier 1, strong team',
    input: { tier: 1, pNav: 0.22, peak6xVsPrice: 3.5, valuationConvergence: 'VERY_STRONG', lomYears: 22, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('strong'), optionality: optionality('strong') },
    expectedScore: 2,
  },
  {
    name: 'cheap Tier 2 with adequate team',
    input: { tier: 2, pNav: 0.35, peak6xVsPrice: 2.3, valuationConvergence: 'STRONG', lomYears: 18, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('adequate'), optionality: optionality('some') },
    expectedScore: 4,
  },
  {
    name: 'quality Tier 1 at only moderate valuation',
    input: { tier: 1, pNav: 0.55, peak6xVsPrice: 2.0, valuationConvergence: 'MIXED', lomYears: 24, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('strong'), optionality: optionality('strong') },
    expectedScore: 4,
  },
  {
    name: 'cheap Tier 2 but weak management',
    input: { tier: 2, pNav: 0.25, peak6xVsPrice: 2.8, valuationConvergence: 'STRONG', lomYears: 18, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('weak'), optionality: optionality('strong') },
    expectedScore: 4,
  },
  {
    name: 'excellent asset near NAV',
    input: { tier: 1, pNav: 0.95, peak6xVsPrice: 1.8, valuationConvergence: 'MIXED', lomYears: 25, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('strong'), optionality: optionality('strong') },
    expectedScore: 4,
  },
  {
    name: 'Tier 3 at extreme discount',
    input: { tier: 3, pNav: 0.18, peak6xVsPrice: 3.2, valuationConvergence: 'VERY_STRONG', lomYears: 14, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('adequate'), optionality: optionality('some') },
    expectedScore: 4,
  },
  {
    name: 'Tier 2 with weak rerating',
    input: { tier: 2, pNav: 0.45, peak6xVsPrice: 1.1, valuationConvergence: 'MIXED', lomYears: 18, cycleResistanceTier1Pass: true, downsideRobustnessPass: true, fatalFlaw: false, management: management('strong'), optionality: optionality('some') },
    expectedScore: 5,
  },
  {
    name: 'poor Tier 3 and expensive',
    input: { tier: 3, pNav: 0.85, peak6xVsPrice: 0.9, valuationConvergence: 'MIXED', lomYears: 10, cycleResistanceTier1Pass: false, downsideRobustnessPass: false, fatalFlaw: false, management: management('weak'), optionality: optionality('none') },
    expectedScore: 8,
  },
  {
    name: 'broken extreme valuation with fatal flaw',
    input: { tier: 3, pNav: 1.4, peak6xVsPrice: 0.4, valuationConvergence: 'MIXED', lomYears: 8, cycleResistanceTier1Pass: false, downsideRobustnessPass: false, fatalFlaw: true, management: management('weak'), optionality: optionality('none') },
    expectedScore: 9,
  },
];

for (const calibrationCase of cases) {
  const raw = computeProvisionalRawScoreV0({ ...calibrationCase.input, rawScore: null });
  assert.notEqual(raw.rawScore, null, `${calibrationCase.name}: rawScore should be calculable`);
  const result = computeInvestmentScore({ ...calibrationCase.input, rawScore: raw.rawScore });
  assert.equal(result.investmentScore, calibrationCase.expectedScore, calibrationCase.name);
  console.log(`${calibrationCase.name}: raw=${raw.rawScore?.toFixed(2)} bestAllowed=${result.bestAllowedScore} final=${result.investmentScore}`);
}

console.log('investmentScore 10-case calibration tests passed');
