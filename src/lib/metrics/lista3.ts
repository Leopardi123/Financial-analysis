export type Lista3Metrics = {
  Payback_approx_years: number | null;
  Payback_real_years: number | null;
  ROI_10Y_pct: number | null;
  IRR: number | null;
  AISC_LOM?: number | null;
  BreakEven_AuEq?: number | null;
  CAPEX_per_Annual_AuEq?: number | null;
  LOM_avg_EBIT_ROCE?: number | null;
  LOM_discounted_EBIT_ROCE?: number | null;
};

export type Lista3DebugMetric = {
  formula: string;
  requiredInputs?: string[];
  inputs: Record<string, unknown>;
  intermediates: Record<string, unknown>;
  missingInputs: string[];
  output: {
    value: number | null;
    computedValuePreview?: number | null;
    storedValue?: number | null;
    nullReason?: string | null;
  };
};

export type Lista3DebugPayload = {
  scope?: 'corporate' | 'project';
  sourcePath?: string;
  tp_main: number | null;
  initialCapexUSD_main: number | null;
  series: {
    fcfUSD_total: Array<number | null>;
  };
  perMetric: {
    Payback_approx: Lista3DebugMetric;
    Payback_real: Lista3DebugMetric;
    IRR: Lista3DebugMetric;
    ROI_10Y: Lista3DebugMetric;
  };
};

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function computeIrr(cashFlows: Array<number | null>): { value: number | null; signChangeCount: number; reason: string | null } {
  if (cashFlows.length === 0 || cashFlows.some((v) => !finite(v))) return { value: null, signChangeCount: 0, reason: 'solver failed' };
  const asFinite = cashFlows as number[];
  let signChangeCount = 0;
  for (let i = 1; i < asFinite.length; i += 1) {
    if ((asFinite[i - 1] < 0 && asFinite[i] > 0) || (asFinite[i - 1] > 0 && asFinite[i] < 0)) {
      signChangeCount += 1;
    }
  }
  const hasPositive = asFinite.some((v) => v > 0);
  const hasNegative = asFinite.some((v) => v < 0);
  if (!hasPositive || !hasNegative) return { value: null, signChangeCount, reason: 'solver failed' };
  if (signChangeCount >= 2) return { value: null, signChangeCount, reason: 'ambiguous: multiple sign changes' };

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
  if (!Number.isFinite(npvLow)) return { value: null, signChangeCount, reason: 'solver failed' };
  if (npvLow === 0) return { value: rLow, signChangeCount, reason: null };

  const highCandidates = [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
  let low = rLow;
  let high = 10.0;
  let lowVal = npvLow;
  let highVal = Number.NaN;
  let bracketFound = false;

  for (const candidate of highCandidates) {
    const candidateNpv = npv(candidate);
    if (!Number.isFinite(candidateNpv)) continue;
    if (candidateNpv === 0) return { value: candidate, signChangeCount, reason: null };
    if (lowVal * candidateNpv < 0) {
      high = candidate;
      highVal = candidateNpv;
      bracketFound = true;
      break;
    }
  }

  if (!bracketFound || !Number.isFinite(highVal)) return { value: null, signChangeCount, reason: 'no root bracketed' };

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const midVal = npv(mid);
    if (!Number.isFinite(midVal)) return { value: null, signChangeCount, reason: 'solver failed' };
    if (Math.abs(midVal) < 1e-8 || Math.abs(high - low) < 1e-12) return { value: mid, signChangeCount, reason: null };
    if (lowVal * midVal < 0) {
      high = mid;
      highVal = midVal;
    } else {
      low = mid;
      lowVal = midVal;
    }
  }
  return { value: (low + high) / 2, signChangeCount, reason: null };
}


type Lista3Args = {
  masterN: number;
  tp: number | null;
  fcfUSD: Array<number | null>;
  initialCapexUSD: number | null;
  strictRoi10Y?: boolean;
  roiAsRatio?: boolean;
  paybackRealUseInitialCapex?: boolean;
  paybackApproxAsRatio?: boolean;
};

type Lista3DebugOptions = { debug: true };

export function computeLista3(args: Lista3Args): Lista3Metrics;
export function computeLista3(args: Lista3Args, options: Lista3DebugOptions): { metrics: Lista3Metrics; debug: Lista3DebugPayload };
export function computeLista3(args: Lista3Args, options?: Lista3DebugOptions): Lista3Metrics | { metrics: Lista3Metrics; debug: Lista3DebugPayload } {
  const out: Lista3Metrics = {
    Payback_approx_years: null,
    Payback_real_years: null,
    ROI_10Y_pct: null,
    IRR: null,
  };
  const debugData: Lista3DebugPayload = {
    tp_main: args.tp,
    initialCapexUSD_main: finite(args.initialCapexUSD) ? args.initialCapexUSD : null,
    series: {
      fcfUSD_total: args.fcfUSD.slice(0, Math.max(0, args.masterN + 1)),
    },
    perMetric: {
      Payback_approx: {
        formula: '|Initial_CAPEX_USD| / AnnualAvg_FCFF_USD',
        inputs: {
          Initial_CAPEX_USD: finite(args.initialCapexUSD) ? args.initialCapexUSD : null,
          tp_main: args.tp,
          masterN: args.masterN,
        },
        intermediates: {},
        missingInputs: [],
        output: { value: null },
      },
      Payback_real: {
        formula: 'cumulative FCFF from tp until payback; linear interpolation',
        inputs: {
          Initial_CAPEX_USD: finite(args.initialCapexUSD) ? args.initialCapexUSD : null,
          tp_main: args.tp,
        },
        intermediates: {},
        missingInputs: [],
        output: { value: null },
      },
      IRR: {
        formula: 'IRR(fcfUSD_total[0..masterN])',
        inputs: {
          masterN: args.masterN,
        },
        intermediates: {},
        missingInputs: [],
        output: { value: null },
      },
      ROI_10Y: {
        formula: 'Σ FCFF(t=tp..tp+9) / |Initial_CAPEX_USD|',
        inputs: {
          Initial_CAPEX_USD: finite(args.initialCapexUSD) ? args.initialCapexUSD : null,
          tp_main: args.tp,
        },
        intermediates: {},
        missingInputs: [],
        output: { value: null },
      },
    },
  };

  const { masterN, tp, initialCapexUSD } = args;
  if (!Number.isInteger(tp) || tp === null || tp < 0 || tp > masterN) {
    debugData.perMetric.Payback_approx.missingInputs.push('tp_main');
    debugData.perMetric.Payback_real.missingInputs.push('tp_main');
    debugData.perMetric.ROI_10Y.missingInputs.push('tp_main');
    debugData.perMetric.Payback_approx.intermediates.invalid_tp = true;
    debugData.perMetric.Payback_real.intermediates.invalid_tp = true;
    debugData.perMetric.ROI_10Y.intermediates.invalid_tp = true;
    return options?.debug ? { metrics: out, debug: debugData } : out;
  }
  if (!finite(initialCapexUSD) || initialCapexUSD === 0) {
    debugData.perMetric.Payback_approx.missingInputs.push('Initial_CAPEX_USD');
    debugData.perMetric.Payback_real.missingInputs.push('Initial_CAPEX_USD');
    debugData.perMetric.ROI_10Y.missingInputs.push('Initial_CAPEX_USD');
    return options?.debug ? { metrics: out, debug: debugData } : out;
  }
  if (args.fcfUSD.length < masterN + 1) {
    debugData.perMetric.Payback_approx.missingInputs.push('fcfUSD_total');
    debugData.perMetric.Payback_real.missingInputs.push('fcfUSD_total');
    debugData.perMetric.ROI_10Y.missingInputs.push('fcfUSD_total');
    debugData.perMetric.IRR.missingInputs.push('fcfUSD_total');
    return options?.debug ? { metrics: out, debug: debugData } : out;
  }

  const enterpriseCashflows = args.fcfUSD.slice(0, masterN + 1);
  if (enterpriseCashflows.some((v) => !finite(v))) {
    debugData.perMetric.Payback_approx.missingInputs.push('fcfUSD_total contains non-finite values');
    debugData.perMetric.Payback_real.missingInputs.push('fcfUSD_total contains non-finite values');
    debugData.perMetric.ROI_10Y.missingInputs.push('fcfUSD_total contains non-finite values');
    debugData.perMetric.IRR.missingInputs.push('fcfUSD_total contains non-finite values');
    return options?.debug ? { metrics: out, debug: debugData } : out;
  }

  debugData.perMetric.Payback_approx.inputs.LOM_periods = enterpriseCashflows.length - tp;
  debugData.perMetric.Payback_real.inputs.fcfUSD_total_slice = enterpriseCashflows.slice(tp, masterN + 1);
  debugData.perMetric.IRR.inputs.fcfUSD_total = enterpriseCashflows;

  const fcffSumLom = (enterpriseCashflows as number[]).slice(tp).reduce((sum, v) => sum + v, 0);
  const annualAvgFcff = enterpriseCashflows.length - tp > 0 ? fcffSumLom / (enterpriseCashflows.length - tp) : null;
  if (args.paybackApproxAsRatio) {
    if (annualAvgFcff !== null && annualAvgFcff > 0) {
      out.Payback_approx_years = Math.abs(initialCapexUSD) / annualAvgFcff;
    }
  } else {
    let cumApprox = 0;
    const cumApproxSeriesLegacy: Array<{ t: number; cumulative: number }> = [];
    for (let i = tp; i < enterpriseCashflows.length; i += 1) {
      const v = enterpriseCashflows[i] as number;
      cumApprox += v;
      cumApproxSeriesLegacy.push({ t: i, cumulative: cumApprox });
      if (cumApprox >= initialCapexUSD) {
        out.Payback_approx_years = i - tp + 1;
        break;
      }
    }
    debugData.perMetric.Payback_approx.intermediates.cumulativeSeries = cumApproxSeriesLegacy;
  }
  debugData.perMetric.Payback_approx.intermediates = {
    FCFF_sum_LOM_USD: fcffSumLom,
    AnnualAvg_FCFF_USD: annualAvgFcff,
    ...(debugData.perMetric.Payback_approx.intermediates.cumulativeSeries
      ? { cumulativeSeries: debugData.perMetric.Payback_approx.intermediates.cumulativeSeries }
      : {}),
  };

  const investmentAbs = args.paybackRealUseInitialCapex
    ? Math.abs(initialCapexUSD)
    : (() => {
      let acc = 0;
      for (let t = 0; t <= tp; t += 1) {
        const cf = enterpriseCashflows[t] as number;
        if (cf < 0) acc += Math.abs(cf);
      }
      return acc;
    })();
  if (investmentAbs > 0) {
    let cumulative = -investmentAbs;
    const cumulativeSeries: Array<{ t: number; cumulative: number }> = [];
    for (let t = tp; t <= masterN; t += 1) {
      const cf = enterpriseCashflows[t] as number;
      const prev = cumulative;
      cumulative += cf;
       cumulativeSeries.push({ t, cumulative });
      if (prev < 0 && cumulative >= 0 && cf > 0) {
        out.Payback_real_years = round1((t - tp) + ((-prev) / cf));
        debugData.perMetric.Payback_real.intermediates.firstPaybackIndex = t;
        debugData.perMetric.Payback_real.intermediates.interpolation = (-prev) / cf;
        break;
      }
    }
    debugData.perMetric.Payback_real.intermediates.cumulativeSeries = cumulativeSeries;
  }
  debugData.perMetric.Payback_real.intermediates.investmentAbs = investmentAbs;

  const irrResult = computeIrr(enterpriseCashflows);
  out.IRR = irrResult.value;
  debugData.perMetric.IRR.intermediates.solver = 'bracket+bisection';
  debugData.perMetric.IRR.intermediates.signChangeCount = irrResult.signChangeCount;
  if (irrResult.reason) debugData.perMetric.IRR.intermediates.reason = irrResult.reason;

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
    debugData.perMetric.ROI_10Y.inputs.fcff_10y_slice = enterpriseCashflows.slice(tp, boundedEnd + 1);
    debugData.perMetric.ROI_10Y.intermediates.fcff_10y_sum = sum;
    if ((!args.strictRoi10Y && count > 0) || (args.strictRoi10Y && roiEnd <= masterN)) {
      const roiRatio = sum / Math.abs(initialCapexUSD);
      out.ROI_10Y_pct = args.roiAsRatio ? roiRatio : roiRatio * 100;
    }
  } else {
    debugData.perMetric.ROI_10Y.missingInputs.push('10Y window incomplete under strictRoi10Y');
  }

  debugData.perMetric.Payback_approx.output.value = out.Payback_approx_years;
  debugData.perMetric.Payback_real.output.value = out.Payback_real_years;
  debugData.perMetric.IRR.output.value = out.IRR;
  debugData.perMetric.ROI_10Y.output.value = out.ROI_10Y_pct;

  return options?.debug ? { metrics: out, debug: debugData } : out;
}
