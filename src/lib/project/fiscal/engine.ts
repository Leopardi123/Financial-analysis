import type {
  FiscalLedgerLine,
  FiscalPlacement,
  FiscalRateDefinition,
  FiscalTakeEngineInput,
  FiscalTakeEngineOutput,
  FiscalTakeFormulaRule,
  FiscalTakeRule,
} from './types.ts';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function zeroSeries(length: number): Array<number | null> {
  return new Array<number | null>(length).fill(0);
}

function getLedgerSeries(
  input: FiscalTakeEngineInput,
  line: FiscalLedgerLine,
  expectedLength: number,
): Array<number | null> {
  const series = input.ledgerUSD[line];
  if (!series) {
    throw new Error(`Fiscal ledger line ${line} is required by a rule but is unavailable.`);
  }
  if (series.length !== expectedLength) {
    throw new Error(`Fiscal ledger line ${line} length must equal masterN+1.`);
  }
  return series;
}

function validateRate(rate: number, path: string): number {
  if (!finite(rate) || rate < 0 || rate > 1) {
    throw new Error(`${path} must be finite within [0, 1].`);
  }
  return rate;
}

function sortedTiers(
  tiers: Array<{ threshold: number; rate: number }>,
  path: string,
): Array<{ threshold: number; rate: number }> {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error(`${path} must contain at least one tier.`);
  }
  return tiers.map((tier, index) => {
    if (!finite(tier.threshold)) throw new Error(`${path}[${index}].threshold must be finite.`);
    return { threshold: tier.threshold, rate: validateRate(tier.rate, `${path}[${index}].rate`) };
  }).sort((a, b) => a.threshold - b.threshold);
}

function rateAtT(
  rate: FiscalRateDefinition,
  t: number,
  input: FiscalTakeEngineInput,
  expectedLength: number,
): number | null {
  if (rate.type === 'FIXED') return validateRate(rate.rate, 'fiscal rate');

  let metric: number | null = null;
  let tiers: Array<{ threshold: number; rate: number }>;
  if (rate.type === 'TIERED_PRICE') {
    const priceSeries = input.priceSeriesByKey?.[rate.priceKey];
    if (!priceSeries || priceSeries.length !== expectedLength) {
      throw new Error(`Fiscal TIERED_PRICE rule requires price series for ${rate.priceKey}.`);
    }
    metric = finite(priceSeries[t]) ? priceSeries[t] as number : null;
    tiers = sortedTiers(rate.tiers, 'fiscal TIERED_PRICE tiers');
  } else {
    const numerator = getLedgerSeries(input, rate.numeratorLine, expectedLength)[t];
    const denominator = getLedgerSeries(input, rate.denominatorLine, expectedLength)[t];
    metric = finite(numerator) && finite(denominator) && Math.abs(denominator) > 1e-12
      ? numerator / denominator
      : null;
    tiers = sortedTiers(rate.tiers, 'fiscal TIERED_MARGIN tiers');
  }

  if (!finite(metric)) return null;
  let selected = 0;
  for (const tier of tiers) {
    if (metric >= tier.threshold) selected = tier.rate;
  }
  return selected;
}

function ruleBaseAtT(
  rule: FiscalTakeFormulaRule,
  t: number,
  input: FiscalTakeEngineInput,
  expectedLength: number,
): number | null {
  const base = getLedgerSeries(input, rule.base.line, expectedLength)[t];
  if (!finite(base)) return null;
  let value = base;
  for (const deductionLine of rule.base.deductions ?? []) {
    const deduction = getLedgerSeries(input, deductionLine, expectedLength)[t];
    if (!finite(deduction)) return null;
    value -= deduction;
  }
  if (rule.base.floorAtZero !== false) value = Math.max(0, value);
  return value;
}

function addToPlacement(
  placement: FiscalPlacement,
  target: {
    revenueDeductionUSD: Array<number | null>;
    operatingExpenseUSD: Array<number | null>;
    preTaxChargeUSD: Array<number | null>;
    postTaxChargeUSD: Array<number | null>;
  },
  t: number,
  value: number | null,
): void {
  const series = placement === 'REVENUE_DEDUCTION'
    ? target.revenueDeductionUSD
    : placement === 'OPERATING_EXPENSE'
      ? target.operatingExpenseUSD
      : placement === 'PRE_TAX_CHARGE'
        ? target.preTaxChargeUSD
        : target.postTaxChargeUSD;
  if (!finite(value) || !finite(series[t])) series[t] = null;
  else series[t] = (series[t] as number) + value;
}

function isLockedSeriesRule(rule: FiscalTakeRule): rule is Extract<FiscalTakeRule, { lockedSeriesUSD: Array<number | null> }> {
  return 'lockedSeriesUSD' in rule;
}

/**
 * Deterministic fiscal-take engine.
 *
 * Formula rules may read only canonical upstream ledger lines supplied by
 * Project. They cannot reference arbitrary JSON fields or another fiscal
 * rule's output, which prevents hidden circular definitions.
 *
 * A source-locked series may coexist with formula rules. This is needed for a
 * report that, for example, has a reconstructable NSR plus a separately
 * reported profit/margin mining take whose legal tax base cannot be faithfully
 * reconstructed from disclosed data. The locked item remains visibly
 * scenario-limited instead of being disguised as site OPEX or selling cost.
 */
export function computeFiscalTake(input: FiscalTakeEngineInput): FiscalTakeEngineOutput {
  const length = input.masterN + 1;
  const revenueDeductionUSD = zeroSeries(length);
  const operatingExpenseUSD = zeroSeries(length);
  const preTaxChargeUSD = zeroSeries(length);
  const postTaxChargeUSD = zeroSeries(length);
  const byRuleUSD: Record<string, Array<number | null>> = {};
  const diagnostics: string[] = [];
  const ids = new Set<string>();

  for (const [index, rule] of input.rules.entries()) {
    if (!rule || typeof rule !== 'object') throw new Error(`fiscalTake rules[${index}] must be an object.`);
    if (typeof rule.id !== 'string' || !rule.id.trim()) throw new Error(`fiscalTake rules[${index}].id must be non-empty.`);
    if (ids.has(rule.id)) throw new Error(`fiscalTake rules contains duplicate id=${rule.id}.`);
    ids.add(rule.id);

    if (!['REVENUE_DEDUCTION', 'OPERATING_EXPENSE', 'PRE_TAX_CHARGE', 'POST_TAX_CHARGE'].includes(rule.placement)) {
      throw new Error(`fiscalTake rule ${rule.id} has unsupported placement=${String(rule.placement)}.`);
    }

    if (isLockedSeriesRule(rule)) {
      if (!Array.isArray(rule.lockedSeriesUSD) || rule.lockedSeriesUSD.length !== length) {
        throw new Error(`fiscalTake locked rule ${rule.id}.lockedSeriesUSD length must equal masterN+1.`);
      }
      const series = rule.lockedSeriesUSD.map((value, t) => {
        if (value === null) return null;
        if (!finite(value) || value < 0) throw new Error(`fiscalTake locked rule ${rule.id}.lockedSeriesUSD[${t}] must be null or finite >= 0.`);
        return value;
      });
      for (let t = 0; t < length; t += 1) {
        addToPlacement(rule.placement, { revenueDeductionUSD, operatingExpenseUSD, preTaxChargeUSD, postTaxChargeUSD }, t, series[t]);
      }
      byRuleUSD[rule.id] = series;
      diagnostics.push(`fiscalTake id=${rule.id} placement=${rule.placement} source=LOCKED_SERIES scenarioLimited=true`);
      continue;
    }

    if (!rule.base || typeof rule.base.line !== 'string') throw new Error(`fiscalTake rule ${rule.id} requires base.line.`);
    if (rule.start_t != null && (!Number.isInteger(rule.start_t) || rule.start_t < 0 || rule.start_t > input.masterN)) {
      throw new Error(`fiscalTake rule ${rule.id}.start_t must be within 0..masterN.`);
    }
    if (rule.end_t != null && (!Number.isInteger(rule.end_t) || rule.end_t < 0 || rule.end_t > input.masterN)) {
      throw new Error(`fiscalTake rule ${rule.id}.end_t must be within 0..masterN.`);
    }
    if (rule.start_t != null && rule.end_t != null && rule.start_t > rule.end_t) {
      throw new Error(`fiscalTake rule ${rule.id}.start_t cannot exceed end_t.`);
    }

    const series = new Array<number | null>(length).fill(0);
    for (let t = 0; t < length; t += 1) {
      if ((rule.start_t != null && t < rule.start_t) || (rule.end_t != null && t > rule.end_t)) continue;
      const base = ruleBaseAtT(rule, t, input, length);
      const rate = rateAtT(rule.rate, t, input, length);
      const value = finite(base) && finite(rate) ? base * rate : null;
      series[t] = value;
      addToPlacement(rule.placement, { revenueDeductionUSD, operatingExpenseUSD, preTaxChargeUSD, postTaxChargeUSD }, t, value);
    }
    byRuleUSD[rule.id] = series;
    diagnostics.push(`fiscalTake id=${rule.id} placement=${rule.placement} base=${rule.base.line} rateType=${rule.rate.type}`);
  }

  return {
    revenueDeductionUSD,
    operatingExpenseUSD,
    preTaxChargeUSD,
    postTaxChargeUSD,
    byRuleUSD,
    diagnostics,
  };
}
