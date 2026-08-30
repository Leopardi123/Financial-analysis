import { INVESTMENT_SCORE_CONFIG } from './config.ts';
import {
  aggregateManagementRating,
  aggregateOptionalityRating,
  exactFitManagementPass,
} from './manualEvidence.ts';
import { valuationConvergencePasses } from './valuationConvergence.ts';
import type {
  GateCheck,
  InvestmentScoreInputs,
  InvestmentScoreResult,
  ManagementRating,
  OptionalityRating,
  ScoreGateResult,
} from './types.ts';

const managementRank: Record<ManagementRating, number> = {
  unassessed: -1,
  weak: 0,
  adequate: 1,
  strong: 2,
  exceptional: 3,
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function check(
  key: string,
  label: string,
  passed: boolean | null,
  observed?: number | string | boolean | null,
  threshold?: number | string | boolean | null,
  reason?: string,
): GateCheck {
  return { key, label, required: true, passed, observed, threshold, reason };
}

function gate(score: 1 | 2 | 3, checks: GateCheck[]): ScoreGateResult {
  return {
    score,
    passed: checks.every((item) => item.passed === true),
    checks,
  };
}

function managementAtLeast(actual: ManagementRating | null, minimum: ManagementRating): boolean | null {
  if (actual === null || actual === 'unassessed') return null;
  return managementRank[actual] >= managementRank[minimum];
}

function hasExceptionalOptionality(rating: OptionalityRating | null): boolean | null {
  if (rating === null || rating === 'unassessed') return null;
  return rating === 'exceptional';
}

function longevityPass(
  lomYears: number | null,
  optionalityRating: OptionalityRating | null,
  directYears: number,
  withOptionalityYears: number,
): boolean | null {
  if (!finite(lomYears)) return null;
  if (lomYears >= directYears) return true;
  if (lomYears < withOptionalityYears) return false;
  return hasExceptionalOptionality(optionalityRating);
}

type DerivedManualRatings = {
  managementRating: ManagementRating | null;
  optionalityRating: OptionalityRating | null;
  exactFitManagement: boolean | null;
};

function deriveManualRatings(input: InvestmentScoreInputs): DerivedManualRatings {
  return {
    managementRating: aggregateManagementRating(input.management),
    optionalityRating: aggregateOptionalityRating(input.optionality),
    exactFitManagement: exactFitManagementPass(input.management),
  };
}

function convergenceCheck(
  input: InvestmentScoreInputs,
  required: 'EXTREME' | 'VERY_STRONG' | 'STRONG',
): GateCheck {
  return check(
    'valuationConvergence',
    `${required.replace('_', ' ')} valuation convergence`,
    valuationConvergencePasses(input.valuationConvergence, required),
    input.valuationConvergence,
    required,
    'Canonical convergence requires both P/NAV PF and Peak 6x / pris to reach the centrally defined level; the two legs cannot compensate for each other.',
  );
}

function score1Gate(input: InvestmentScoreInputs, manual: DerivedManualRatings): ScoreGateResult {
  const c = INVESTMENT_SCORE_CONFIG.score1;
  return gate(1, [
    check('tier', 'Tier 1 required', input.tier === null ? null : input.tier === c.tierRequired, input.tier, c.tierRequired),
    convergenceCheck(input, c.valuationConvergenceRequired),
    check(
      'management',
      'Exceptional management',
      manual.managementRating === null || manual.managementRating === 'unassessed'
        ? null
        : manual.managementRating === c.managementRequired,
      manual.managementRating,
      c.managementRequired,
    ),
    check(
      'managementExactFit',
      'Exact-fit prior execution',
      manual.exactFitManagement,
      manual.exactFitManagement,
      true,
      'Relevant execution track record must itself be rated exceptional.',
    ),
    check(
      'longevityOptionality',
      'Multigenerational LOM or exceptional optionality',
      longevityPass(input.lomYears, manual.optionalityRating, c.lomDirectYears, c.lomWithExceptionalOptionalityYears),
      input.lomYears,
      `LOM >= ${c.lomDirectYears}y OR LOM >= ${c.lomWithExceptionalOptionalityYears}y + exceptional optionality`,
    ),
    check('cycleResistance', 'Tier-1 cycle resistance', input.cycleResistanceTier1Pass, input.cycleResistanceTier1Pass, true),
    check('fatalFlaw', 'No fatal flaw', input.fatalFlaw === null ? null : input.fatalFlaw === false, input.fatalFlaw, false),
  ]);
}

function score2Gate(input: InvestmentScoreInputs, manual: DerivedManualRatings): ScoreGateResult {
  const c = INVESTMENT_SCORE_CONFIG.score2;
  return gate(2, [
    check('tier', 'Tier 1 required', input.tier === null ? null : input.tier === c.tierRequired, input.tier, c.tierRequired),
    convergenceCheck(input, c.valuationConvergenceRequired),
    check('management', 'Strong management minimum', managementAtLeast(manual.managementRating, c.managementMinimum), manual.managementRating, `>= ${c.managementMinimum}`),
    check(
      'longevityOptionality',
      'Long LOM or exceptional optionality',
      longevityPass(input.lomYears, manual.optionalityRating, c.lomDirectYears, c.lomWithExceptionalOptionalityYears),
      input.lomYears,
      `LOM >= ${c.lomDirectYears}y OR LOM >= ${c.lomWithExceptionalOptionalityYears}y + exceptional optionality`,
    ),
    check('cycleResistance', 'Tier-1 cycle resistance', input.cycleResistanceTier1Pass, input.cycleResistanceTier1Pass, true),
    check('fatalFlaw', 'No fatal flaw', input.fatalFlaw === null ? null : input.fatalFlaw === false, input.fatalFlaw, false),
  ]);
}

function score3Gate(input: InvestmentScoreInputs, manual: DerivedManualRatings): ScoreGateResult {
  const c = INVESTMENT_SCORE_CONFIG.score3;
  return gate(3, [
    check('tier', 'Tier 1-2 required', input.tier === null ? null : input.tier <= c.tierMax, input.tier, `<= ${c.tierMax}`),
    convergenceCheck(input, c.valuationConvergenceRequired),
    check('management', 'Adequate management minimum', managementAtLeast(manual.managementRating, c.managementMinimum), manual.managementRating, `>= ${c.managementMinimum}`),
    check(
      'downsideRobustness',
      'Downside robustness',
      input.downsideRobustnessPass,
      input.downsideRobustnessPass,
      true,
      'v0 calibration: this currently reuses the exact canonical Tier cycle gate. Recalibrate only through the central adapter/rule after real project JSON testing.',
    ),
    check('fatalFlaw', 'No fatal flaw', input.fatalFlaw === null ? null : input.fatalFlaw === false, input.fatalFlaw, false),
  ]);
}

function clampRawScore(rawScore: number | null): number | null {
  if (!finite(rawScore)) return null;
  return Math.min(INVESTMENT_SCORE_CONFIG.continuous.maxScore, Math.max(INVESTMENT_SCORE_CONFIG.continuous.minScore, rawScore));
}

/**
 * v0 hard-gate engine. It deliberately does not derive valuation or Tier from
 * UI state. Manual overlay aggregates are derived here from evidence so UI
 * cannot inject a precomputed management/optionality class.
 *
 * Valuation convergence is a canonical categorical input produced from the
 * same P/NAV PF and Peak 6x / pris definitions used by Compare Stocks. Score
 * gates consume only that category; threshold math is not duplicated here.
 *
 * The 4-10 continuous mapping remains provisional; hard gates can only make a
 * score worse, never better. The continuous score is mapped to the nearest
 * integer; hard gates are then applied as a lower bound on quality.
 */
export function computeInvestmentScore(input: InvestmentScoreInputs): InvestmentScoreResult {
  const rawScore = clampRawScore(input.rawScore);
  const manual = deriveManualRatings(input);
  const gates = {
    score1: score1Gate(input, manual),
    score2: score2Gate(input, manual),
    score3: score3Gate(input, manual),
  };

  const bestAllowedScore = gates.score1.passed ? 1 : gates.score2.passed ? 2 : gates.score3.passed ? 3 : 4;
  const gateFailures = [gates.score1, gates.score2, gates.score3]
    .flatMap((result) => result.checks.filter((item) => item.passed === false).map((item) => `Score ${result.score}: ${item.label}`));
  const unknownRequired = [gates.score1, gates.score2, gates.score3]
    .flatMap((result) => result.checks.filter((item) => item.passed === null).map((item) => `Score ${result.score}: ${item.label}`));

  const components = {
    valuationConvergence: input.valuationConvergence,
    managementRating: manual.managementRating,
    optionalityRating: manual.optionalityRating,
  };

  if (rawScore === null) {
    return {
      investmentScore: null,
      rawScore: null,
      bestAllowedScore,
      verified: false,
      gates,
      gateFailures,
      diagnostics: ['Ej verifierad: rawScore saknas.', ...unknownRequired.map((value) => `Ej verifierad: ${value}.`)],
      components,
    };
  }

  const provisionalRounded = Math.round(rawScore);
  const investmentScore = Math.max(bestAllowedScore, provisionalRounded);

  return {
    investmentScore,
    rawScore,
    bestAllowedScore,
    verified: unknownRequired.length === 0,
    gates,
    gateFailures,
    diagnostics: [
      'v0: rawScore mappas till närmaste heltal; Score 1-3 begränsas därefter av hårda gates. Mappingen ska fortsatt kalibreras mot riktiga project JSON.',
      ...unknownRequired.map((value) => `Ej verifierad: ${value}.`),
    ],
    components,
  };
}
