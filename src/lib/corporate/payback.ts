export type CorporateRealPaybackResult = {
  paybackYears: number | null;
  productionStartPeriod: number | null;
  cumulativeAtProductionStartUSD: number | null;
  initialDeficitUSD: number | null;
  crossingPeriod: number | null;
  interpolation: number | null;
  diagnostic: string | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Canonical Corporate real payback.
 *
 * Definition:
 * - use the complete Corporate FCFF series on its internal calendar axis;
 * - carry the full cumulative project cash-flow balance into production start;
 * - measure elapsed years from the first production period;
 * - interpolate within the first period where cumulative FCFF crosses zero.
 *
 * Historical construction cash flow is therefore part of project payback even when
 * the current valuation year is later than the first project cash-flow year. This is
 * intentionally different from a forward-looking/sunk-cost payback measured from the
 * valuation date.
 */
export function deriveCorporateRealPayback(args: {
  fcffUSD: Array<number | null>;
  productionStartPeriod: number | null;
  masterN?: number;
}): CorporateRealPaybackResult {
  const masterN = Number.isInteger(args.masterN) ? (args.masterN as number) : args.fcffUSD.length - 1;
  const tp = args.productionStartPeriod;

  const fail = (diagnostic: string): CorporateRealPaybackResult => ({
    paybackYears: null,
    productionStartPeriod: Number.isInteger(tp) ? tp : null,
    cumulativeAtProductionStartUSD: null,
    initialDeficitUSD: null,
    crossingPeriod: null,
    interpolation: null,
    diagnostic,
  });

  if (!Number.isInteger(masterN) || masterN < 0 || args.fcffUSD.length < masterN + 1) {
    return fail('Corporate FCFF series does not cover masterN.');
  }
  if (!Number.isInteger(tp) || tp === null || tp < 0 || tp > masterN) {
    return fail('Corporate productionStartPeriod is unavailable or outside the FCFF axis.');
  }

  const series = args.fcffUSD.slice(0, masterN + 1);
  if (series.some((value) => !finite(value))) {
    return fail('Corporate FCFF contains a missing/non-finite value inside the project window.');
  }

  let cumulative = (series as number[]).slice(0, tp).reduce((sum, value) => sum + value, 0);
  const cumulativeAtProductionStartUSD = cumulative;
  const initialDeficitUSD = cumulative < 0 ? -cumulative : 0;

  // If the project has already recovered its cumulative cash investment before the
  // first production period, payback at production start is zero by this definition.
  if (cumulative >= 0) {
    return {
      paybackYears: 0,
      productionStartPeriod: tp,
      cumulativeAtProductionStartUSD,
      initialDeficitUSD,
      crossingPeriod: tp,
      interpolation: 0,
      diagnostic: null,
    };
  }

  for (let t = tp; t <= masterN; t += 1) {
    const cashFlow = series[t] as number;
    const previous = cumulative;
    cumulative += cashFlow;
    if (previous < 0 && cumulative >= 0 && cashFlow > 0) {
      const interpolation = (-previous) / cashFlow;
      return {
        paybackYears: (t - tp) + interpolation,
        productionStartPeriod: tp,
        cumulativeAtProductionStartUSD,
        initialDeficitUSD,
        crossingPeriod: t,
        interpolation,
        diagnostic: null,
      };
    }
  }

  return {
    paybackYears: null,
    productionStartPeriod: tp,
    cumulativeAtProductionStartUSD,
    initialDeficitUSD,
    crossingPeriod: null,
    interpolation: null,
    diagnostic: 'Cumulative full-project FCFF does not recover by the end of the Corporate model horizon.',
  };
}
