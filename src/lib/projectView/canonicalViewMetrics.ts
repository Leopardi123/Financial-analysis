import type { MetricValue, ProjectViewMetrics } from './computeProjectPreRevenueView.ts';
import {
  selectCanonicalValuationMetrics,
  type ValuationTimeline,
} from '../valuation/canonicalValuationTimeline.ts';

const metric = (value: number | null, reason: string): MetricValue => ({
  value,
  reason: value === null ? reason : null,
});

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function divide(numerator: number | null, denominator: number | null): number | null {
  return finite(numerator) && finite(denominator) && denominator !== 0 ? numerator / denominator : null;
}

/** Make canonical timeline nodes the sole valuation source for tables and charts. */
export function withCanonicalViewMetrics(
  view: ProjectViewMetrics,
  timeline: ValuationTimeline,
): ProjectViewMetrics {
  const values = selectCanonicalValuationMetrics(timeline);
  const isCorporate = timeline.scope === 'corporate';

  // Corporate P/NAV is an equity-per-share comparison and must therefore use the
  // same fully diluted/PF share denominator as canonical NAV/share. Derive the
  // observed current share price from the current market box instead of mixing
  // current market cap (current shares) with PF NAV/share.
  const currentPrice = divide(
    view.marketBox.marketCapCurrent.value,
    view.marketBox.sharesCurrent.value,
  );
  const pOverNavPf = divide(currentPrice, values.navPerShareToday);

  return {
    ...view,
    valuationTimeline: timeline,
    marketBox: {
      ...view.marketBox,
      sharesPf: metric(timeline.periods[timeline.todayPeriod]?.sharesPf ?? null, 'Missing canonical Shares PF'),
    },
    list2: {
      ...view.list2,
      NPV_Target: metric(values.npvToday, 'Missing canonical NPV today'),
      NPV_perShare: metric(values.npvPerShareToday, 'Missing canonical NPV/share today'),
      NAV_Target: metric(values.navToday, 'Missing canonical NAV today'),
      NAV_perShare: metric(values.navPerShareToday, 'Missing canonical NAV/share today'),
      NPV_prodStart: metric(values.npvStart, 'Missing canonical NPV at production start'),
      NPV_prodStart_perShare: metric(values.npvPerShareStart, 'Missing canonical NPV/share at production start'),
      NAV_prodStart: metric(values.navStart, 'Missing canonical NAV at production start'),
      NAV_prodStart_perShare: metric(values.navPerShareStart, 'Missing canonical NAV/share at production start'),
      DCF_Target: metric(values.dcfStart, 'Missing canonical DCF at production start'),
      DCF_perShare: metric(values.dcfPerShareStart, 'Missing canonical DCF/share at production start'),
      DCF_Target_discounted: metric(values.dcfStartPresentToday, 'Missing canonical DCF present value today'),
      DCF_Target_discounted_perShare: metric(values.dcfPerShareStartPresentToday, 'Missing canonical DCF present value/share today'),
      ...(isCorporate ? {
        P_over_NAV: metric(
          pOverNavPf,
          'Missing current price or canonical PF NAV/share for P/NAV PF',
        ),
        // DEBUG QUARANTINE: the existing Corporate EV/NAV numerator is a hybrid
        // of current market cap and post-financing cash/debt while NAV is an
        // equity NAV. Keep the metric visibly unavailable until a like-for-like
        // enterprise definition is approved.
        EV_over_NAV: metric(
          null,
          'DEBUG: EV/NAV is quarantined. Existing definition mixes current market cap with post-financing cash/debt and equity NAV; redesign pending.',
        ),
      } : {}),
    },
  };
}
