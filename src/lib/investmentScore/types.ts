export type VerificationState = 'verified' | 'unverified';

export type ManagementRating = 'unassessed' | 'weak' | 'adequate' | 'strong' | 'exceptional';
export type OptionalityRating = 'unassessed' | 'none' | 'some' | 'strong' | 'exceptional';

export type ManualAssessment<T extends string> = {
  rating: T;
  assessmentDate?: string;
  note?: string;
};

export type ManagementEvidence = {
  executionTrackRecord: ManualAssessment<ManagementRating>;
  capitalAllocation: ManualAssessment<ManagementRating>;
  deliveryCredibility: ManualAssessment<ManagementRating>;
  technicalTeamFit: ManualAssessment<ManagementRating>;
};

export type OptionalityEvidence = {
  resourceExpansion: ManualAssessment<OptionalityRating>;
  minePlanConversion: ManualAssessment<OptionalityRating>;
  expansionDebottlenecking: ManualAssessment<OptionalityRating>;
  districtStrategic: ManualAssessment<OptionalityRating>;
};

export type InvestmentScoreInputs = {
  tier: 1 | 2 | 3 | null;
  pNav: number | null;
  peak6xVsPrice: number | null;
  lomYears: number | null;
  cycleResistanceTier1Pass: boolean | null;
  downsideRobustnessPass: boolean | null;
  fatalFlaw: boolean | null;
  management: ManagementEvidence | null;
  optionality: OptionalityEvidence | null;

  /**
   * Continuous score before hard gates. Lower is better. The derivation of this
   * value is intentionally separate from the gate engine so valuation/UI code
   * cannot duplicate gate logic.
   */
  rawScore: number | null;
};

export type GateCheck = {
  key: string;
  label: string;
  required: boolean;
  passed: boolean | null;
  observed?: number | string | boolean | null;
  threshold?: number | string | boolean | null;
  reason?: string;
};

export type ScoreGateResult = {
  score: 1 | 2 | 3;
  passed: boolean;
  checks: GateCheck[];
};

export type InvestmentScoreComponentBreakdown = {
  assetQuality?: number | null;
  valuation?: number | null;
  rerating?: number | null;
  managementAdjustment?: number | null;
  optionalityAdjustment?: number | null;
};

export type InvestmentScoreResult = {
  investmentScore: number | null;
  rawScore: number | null;
  bestAllowedScore: number | null;
  verified: boolean;
  gates: {
    score1: ScoreGateResult;
    score2: ScoreGateResult;
    score3: ScoreGateResult;
  };
  gateFailures: string[];
  diagnostics: string[];
  components: InvestmentScoreComponentBreakdown;
};
