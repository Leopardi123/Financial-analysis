export const INVESTMENT_SCORE_CONFIG = {
  score1: {
    valuationConvergenceRequired: 'EXTREME',
    tierRequired: 1,
    managementRequired: 'exceptional',
    lomDirectYears: 30,
    lomWithExceptionalOptionalityYears: 20,
    requireTier1CycleResistance: true,
    requireNoFatalFlaw: true,
  },
  score2: {
    valuationConvergenceRequired: 'VERY_STRONG',
    tierRequired: 1,
    managementMinimum: 'strong',
    lomDirectYears: 20,
    lomWithExceptionalOptionalityYears: 15,
    requireTier1CycleResistance: true,
    requireNoFatalFlaw: true,
  },
  score3: {
    valuationConvergenceRequired: 'STRONG',
    tierMax: 2,
    managementMinimum: 'adequate',
    requireDownsideRobustness: true,
    requireNoFatalFlaw: true,
  },
  continuous: {
    minScore: 1,
    maxScore: 10,
  },
} as const;

export type InvestmentScoreConfig = typeof INVESTMENT_SCORE_CONFIG;
