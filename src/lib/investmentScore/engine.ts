import { INVESTMENT_SCORE_CONFIG } from './config.ts';
import {
  aggregateManagementRating,
  aggregateOptionalityRating,
  exactFitManagementPass,
  exceptionalOptionalityForLongevityPass,
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

const optionalityRank: Record<OptionalityRating, number> = {
  unassessed: -1,
  none: 0,
  some: 1,
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

function optionalityAtLeast(actual: OptionalityRating | null, minimum: OptionalityRating): boolean | null {
  if (actual === null || actual === 'unassessed') return null;
  return optionalityRank[actual] >= optionalityRank[minimum];
}

function longevityPass(
  lomYears: number | null,
  exceptionalOptionality: boolean | null,
  directYears: number,
  withOptionalityYears: number,
): boolean | null {
  if (!finite(lomYears)) return null;
  if (lomYears >= directYears) return true;
  if (lomYears < withOptionalityYears) return false;
  return exceptionalOptionality;
}

type DerivedManualRatings = {
  managementRating: ManagementRating | null;
  optionalityRating: OptionalityRating | null;
  exactFitManagement: boolean | null;
  exceptionalOptionality: boolean | null;
};

function deriveManualRatings(input: InvestmentScoreInputs): DerivedManualRatings {
  return {
    managementRating: aggregateManagementRating(input.management),
    optionalityRating: aggregateOptionalityRating(input.optionality),
    exactFitManagement: exactFitManagementPass(input.management),
    exceptionalOptionality: exceptionalOptionalityForLongevityPass(input.optionality),
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
      longevityPass(input.lomYears, manual.exceptionalOptionality, c.lomDirectYears, c.lomWithExceptionalOptionalityYears),
      input.lomYears,
      `LOM >= ${c.lomDirectYears}y OR LOM >= ${c.lomWithExceptionalOptionalityYears}y + exceptional optionality`,
      'Exceptional optionality for the LOM exception requires at least three of four assessed optionality dimensions to be exceptional.',
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
      longevityPass(input.lomYears, manual.exceptionalOptionality, c.lomDirectYears, c.lomWithExceptionalOptionalityYears),
      input.lomYears,
      `LOM >= ${c.lomDirectYears}y OR LOM >= ${c.lomWithExceptionalOptionalityYears}y + exceptional optionality`,
      'Exceptional optionality for the LOM exception requires at least three of four assessed optionality dimensions to be exceptional.',
    ),
    check('cycleResistance', 'Tier-1 cycle resistance', input.cycleResistanceTier1Pass, input.cycleResistanceTier1Pass, true),
    check('fatalFlaw', 'No fatal flaw', input.fatalFlaw === null ? null : input.fatalFlaw === false, input.fatalFlaw, false),
  ]);
}

function score3TierPath(input: InvestmentScoreInputs): boolean | null {
  const c = INVESTMENT_SCORE_CONFIG.score3;
  if (input.tier === null) return null;
  if (input.tier <= c.tierMax) return true;
  if (input.tier !== 3) return false;
  return input.tier3ScaleOrLomOnlyExceptionEligible ?? null;
}

function score3Gate(input: InvestmentScoreInputs, manual: DerivedManualRatings): ScoreGateResult {
  const c = INVESTMENT_SCORE_CONFIG.score3;
  const exceptionalTier3Path = input.tier === 3;
  const convergenceRequired = exceptionalTier3Path
    ? c.tier3Exception.valuationConvergenceRequired
    : c.valuationConvergenceRequired;
  const managementMinimum = exceptionalTier3Path
    ? c.tier3Exception.managementMinimum
    : c.managementMinimum;

  return gate(3, [
    check(
      'tier',
      exceptionalTier3Path ? 'Tier 3 allowed only for scale/LOM exception' : 'Tier 1-2 required',
      score3TierPath(input),
      input.tier,
      exceptionalTier3Path ? 'Tier 3 only from LOM and/or scale; capital returns and cycle <= Tier 2' : `<= ${c.tierMax}`,
      exceptionalTier3Path
        ? 'Tier 3 may reach Score 3 only when the Tier-3 weakness is confined to LOM and/or physical scale.'
        : undefined,
    ),
    convergenceCheck(input, convergenceRequired),
    check(
      'management',
      exceptionalTier3Path ? 'Strong management minimum for Tier-3 exception' : 'Adequate management minimum',
      managementAtLeast(manual.managementRating, managementMinimum),
      manual.managementRating,
      `>= ${managementMinimum}`,
    ),
    check(
      'optionality',
      exceptionalTier3Path ? 'Strong optionality minimum for Tier-3 exception' : 'Optionality not required for standard Score-3 path',
      exceptionalTier3Path
        ? optionalityAtLeast(manual.optionalityRating, c.tier3Exception.optionalityMinimum)
        : true,
      manual.optionalityRating,
      exceptionalTier3Path ? `>= ${c.tier3Exception.optionalityMinimum}` : 'N/A',
    ),
    check(
      'downsideRobustness',
      '7-year survival downside robustness',
      input.downsideRobustnessPass,
      input.downsideRobustnessPass,
      true,
      'PASS requires positive NPV10 after the canonical seven-production-year historical-low price stress. This is intentionally separate from the 5-year downside-beta cycle Tier.',
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
