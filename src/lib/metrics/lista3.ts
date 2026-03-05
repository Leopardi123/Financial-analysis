export type Lista3Metrics = {
  Payback_approx_years: number | null;
  Payback_real_years: number | null;
  ROI_10Y_pct: number | null;
  IRR: number | null;
};

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function computeIrr(cashFlows: Array<number | null>): number | null {
  if (cashFlows.length === 0 || cashFlows.some((v) => !finite(v))) return null;
  const asFinite = cashFlows as number[];
  const hasPositive = asFinite.some((v) => v > 0);
  const hasNegative = asFinite.some((v) => v < 0);
  if (!hasPositive || !hasNegative) return null;

  const npv = (rate: number): number => {
    if (rate <= -1) return Number.NaN;
    let sum = 0;
    for (let t = 0; t < asFinite.length; t += 1) {
      sum += asFinite[t] / ((1 + rate) ** t);
    }
    return sum;
  };

  const rLow = -0.99;
  const npvLow = npv(rLow);
  if (!Number.isFinite(npvLow)) return null;
  if (npvLow === 0) return rLow;

  const highCandidates = [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
  let low = rLow;
  let high = 10.0;
  let lowVal = npvLow;
  let highVal = Number.NaN;
  let bracketFound = false;

  for (const candidate of highCandidates) {
    const candidateNpv = npv(candidate);
    if (!Number.isFinite(candidateNpv)) continue;
    if (candidateNpv === 0) return candidate;
    if (lowVal * candidateNpv < 0) {
      high = candidate;
      highVal = candidateNpv;
      bracketFound = true;
      break;
    }
  }

  if (!bracketFound || !Number.isFinite(highVal)) return null;

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const midVal = npv(mid);
    if (!Number.isFinite(midVal)) return null;
    if (Math.abs(midVal) < 1e-8 || Math.abs(high - low) < 1e-12) return mid;
    if (lowVal * midVal < 0) {
      high = mid;
      highVal = midVal;
    } else {
      low = mid;
      lowVal = midVal;
    }
  }
  return (low + high) / 2;
}

export function computeLista3(args: {
  masterN: number;
  tp: number | null;
  fcfUSD: Array<number | null>;
  initialCapexUSD: number | null;
  strictRoi10Y?: boolean;
}): Lista3Metrics {
  const out: Lista3Metrics = {
    Payback_approx_years: null,
    Payback_real_years: null,
    ROI_10Y_pct: null,
    IRR: null,
  };
  const { masterN, tp, initialCapexUSD } = args;
  if (!Number.isInteger(tp) || tp === null || tp < 0 || tp > masterN) return out;
  if (!finite(initialCapexUSD) || initialCapexUSD === 0) return out;
  if (args.fcfUSD.length < masterN + 1) return out;

  const enterpriseCashflows = args.fcfUSD.slice(0, masterN + 1);
  if (enterpriseCashflows.some((v) => !finite(v))) return out;

  let cumApprox = 0;
  for (let i = tp; i < enterpriseCashflows.length; i += 1) {
    const v = enterpriseCashflows[i] as number;
    cumApprox += v;
    if (cumApprox >= initialCapexUSD) {
      out.Payback_approx_years = i - tp + 1;
      break;
    }
  }

  let investmentAbs = 0;
  for (let t = 0; t <= tp; t += 1) {
    const cf = enterpriseCashflows[t] as number;
    if (cf < 0) investmentAbs += Math.abs(cf);
  }
  if (investmentAbs > 0) {
    let cumulative = -investmentAbs;
    for (let t = tp; t <= masterN; t += 1) {
      const cf = enterpriseCashflows[t] as number;
      const prev = cumulative;
      cumulative += cf;
      if (prev < 0 && cumulative >= 0 && cf > 0) {
        out.Payback_real_years = round1((t - tp) + ((-prev) / cf));
        break;
      }
    }
  }

  out.IRR = computeIrr(enterpriseCashflows);

  const roiEnd = tp + 9;
  if (roiEnd <= masterN || !args.strictRoi10Y) {
    const boundedEnd = Math.min(roiEnd, masterN);
    let sum = 0;
    let count = 0;
    for (let t = tp; t <= boundedEnd; t += 1) {
      const cf = enterpriseCashflows[t] as number;
      sum += cf;
      count += 1;
    }
    if ((!args.strictRoi10Y && count > 0) || (args.strictRoi10Y && roiEnd <= masterN)) {
      out.ROI_10Y_pct = (sum / Math.abs(initialCapexUSD)) * 100;
    }
  }

  return out;
}
