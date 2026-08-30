import { INVESTMENT_SCORE_CONFIG } from './config.ts';
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

function score1Gate(input: InvestmentScoreInputs): ScoreGateResult {
  const c = INVESTMENT_SCORE_CONFIG.score1;
  return gate(1, [
    check('tier', 'Tier 1 required', input.tier === null ? null : input.tier === c.tierRequired, input.tier, c.tierRequired),
    check('pNav', 'Extreme P/NAV', finite(input.pNav) ? input.pNav <= c.pNavMax : null, input.pNav, `<= ${c.pNavMax}`),
    check(
      'valuationConvergence',
      'Independent valuation convergence',
      input.valuationConvergenceScore1Pass,
      input.valuationConvergenceScore1Pass,
      true,
      'Must be produced by a separately verified canonical convergence rule.',
    ),
    check(
      'management',
      'Exceptional management',
      input.managementRating === null || input.managementRating === 'unassessed'
        ? null
        : input.managementRating === c.managementRequired,
      input.managementRating,
      c.managementRequired,
    ),
    check(
      'longevityOptionality',
      'Multigenerational LOM or exceptional optionality',
      longevityPass(input.lomYears, input.optionalityRating, c.lomDirectYears, c.lomWithExceptionalOptionalityYears),
      input.lomYears,
      `LOM >= ${c.lomDirectYears}y OR LOM >= ${c.lomWithExceptionalOptionalityYears}y + exceptional optionality`,
    ),
    check('cycleResistance', 'Tier-1 cycle resistance', input.cycleResistanceTier1Pass, input.cycleResistanceTier1Pass, true),
    check('fatalFlaw', 'No fatal flaw', input.fatalFlaw === null ? null : input.fatalFlaw === false, input.fatalFlaw, false),
  ]);
}

function score2Gate(input: InvestmentScoreInputs): ScoreGateResult {
  const c = INVESTMENT_SCORE_CONFIG.score2;
  return gate(2, [
    check('tier', 'Tier 1 required', input.tier === null ? null : input.tier === c.tierRequired, input.tier, c.tierRequired),
    check('pNav', 'P/NAV', finite(input.pNav) ? input.pNav <= c.pNavMax : null, input.pNav, `<= ${c.pNavMax}`),
    check('peak6xVsPrice', 'Peak 6x / price confirmation', finite(input.peak6xVsPrice) ? input.peak6xVsPrice >= c.peak6xVsPriceMin : null, input.peak6xVsPrice, `>= ${c.peak6xVsPriceMin}`),
    check('management', 'Strong management minimum', managementAtLeast(input.managementRating, c.managementMinimum), input.managementRating, `>= ${c.managementMinimum}`),
    check(
      'longevityOptionality',
      'Long LOM or exceptional optionality',
      longevityPass(input.lomYears, input.optionalityRating, c.lomDirectYears, c.lomWithExceptionalOptionalityYears),
      input.lomYears,
      `LOM >= ${c.lomDirectYears}y OR LOM >= ${c.lomWithExceptionalOptionalityYears}y + exceptional optionality`,
    ),
    check('cycleResistance', 'Tier-1 cycle resistance', input.cycleResistanceTier1Pass, input.cycleResistanceTier1Pass, true),
    check('fatalFlaw', 'No fatal flaw', input.fatalFlaw === null ? null : input.fatalFlaw === false, input.fatalFlaw, false),
  ]);
}

function score3Gate(input: InvestmentScoreInputs): ScoreGateResult {
  const c = INVESTMENT_SCORE_CONFIG.score3;
  return gate(3, [
    check('tier', 'Tier 1-2 required', input.tier === null ? null : input.tier <= c.tierMax, input.tier, `<= ${c.tierMax}`),
    check('pNav', 'P/NAV', finite(input.pNav) ? input.pNav <= c.pNavMax : null, input.pNav, `<= ${c.pNavMax}`),
    check('peak6xVsPrice', 'Peak 6x / price confirmation', finite(input.peak6xVsPrice) ? input.peak6xVsPrice >= c.peak6xVsPriceMin : null, input.peak6xVsPrice, `>= ${c.peak6xVsPriceMin}`),
    check('management', 'Adequate management minimum', managementAtLeast(input.managementRating, c.managementMinimum), input.managementRating, `>= ${c.managementMinimum}`),
    check('downsideRobustness', 'Downside robustness', input.downsideRobustnessPass, input.downsideRobustnessPass, true),
    check('fatalFlaw', 'No fatal flaw', input.fatalFlaw === null ? null : input.fatalFlaw === false, input.fatalFlaw, false),
  ]);
}

function clampRawScore(rawScore: number | null): number | null {
  if (!finite(rawScore)) return null;
  return Math.min(INVESTMENT_SCORE_CONFIG.continuous.maxScore, Math.max(INVESTMENT_SCORE_CONFIG.continuous.minScore, rawScore));
}

/**
 * v0 hard-gate engine. It deliberately does not derive valuation, Tier,
 * management or optionality from UI state. Those arrive as canonical inputs.
 * The 4-10 continuous mapping remains provisional; hard gates can only make a
 * score worse, never better.
 */
export function computeInvestmentScore(input: InvestmentScoreInputs): InvestmentScoreResult {
  const rawScore = clampRawScore(input.rawScore);
  const gates = {
    score1: score1Gate(input),
    score2: score2Gate(input),
    score3: score3Gate(input),
  };

  const bestAllowedScore = gates.score1.passed ? 1 : gates.score2.passed ? 2 : gates.score3.passed ? 3 : 4;
  const gateFailures = [gates.score1, gates.score2, gates.score3]
    .flatMap((result) => result.checks.filter((item) => item.passed === false).map((item) => `Score ${result.score}: ${item.label}`));
  const unknownRequired = [gates.score1, gates.score2, gates.score3]
    .flatMap((result) => result.checks.filter((item) => item.passed === null).map((item) => `Score ${result.score}: ${item.label}`));

  if (rawScore === null) {
    return {
      investmentScore: null,
      rawScore: null,
      bestAllowedScore,
      verified: false,
      gates,
      gateFailures,
      diagnostics: ['Ej verifierad: rawScore saknas.', ...unknownRequired.map((value) => `Ej verifierad: ${value}.`)],
      components: {},
    };
  }

  const provisionalRounded = Math.ceil(rawScore);
  const investmentScore = Math.max(bestAllowedScore, provisionalRounded);

  return {
    investmentScore,
    rawScore,
    bestAllowedScore,
    verified: unknownRequired.length === 0,
    gates,
    gateFailures,
    diagnostics: [
      'v0: mappingen för Score 4-10 är preliminär och ska kalibreras mot test-JSON.',
      ...unknownRequired.map((value) => `Ej verifierad: ${value}.`),
    ],
    components: {},
  };
}
