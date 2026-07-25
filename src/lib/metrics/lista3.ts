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
  Corporate_ROIC?: number | null;
  LOM_avg_NOPAT_ROIC?: number | null;
  Kapitalavkastning_LOM?: number | null;
  Kapitalavkastning_per_Year?: number | null;
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

export type IrrSolveResult = {
  value: number | null;
  roots: number[];
  selectedRoot: number | null;
  selectionReason: string | null;
  residual: number | null;
  signChangeCount: number;
  reason: string | null;
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

const IRR_SCAN_MIN = -0.999;
const IRR_SCAN_MAX = 10;
const IRR_SCAN_STEPS = 20_000;
const IRR_BISECTION_ITERATIONS = 200;
const IRR_ROOT_DEDUP_TOLERANCE = 1e-9;

export function computeIrr(cashFlows: Array<number | null>, discountRate: number): IrrSolveResult {
  const emptyResult = (reason: string, signChangeCount = 0): IrrSolveResult => ({
    value: null,
    roots: [],
    selectedRoot: null,
    selectionReason: null,
    residual: null,
    signChangeCount,
    reason,
  });
  if (cashFlows.length === 0 || cashFlows.some((v) => !finite(v))) return emptyResult('solver failed');
  const asFinite = cashFlows as number[];
  let signChangeCount = 0;
  for (let i = 1; i < asFinite.length; i += 1) {
    if ((asFinite[i - 1] < 0 && asFinite[i] > 0) || (asFinite[i - 1] > 0 && asFinite[i] < 0)) {
      signChangeCount += 1;
    }
  }
  const hasPositive = asFinite.some((v) => v > 0);
  const hasNegative = asFinite.some((v) => v < 0);
  if (!hasPositive || !hasNegative) return emptyResult('IRR requires valid sign change', signChangeCount);

  const npv = (rate: number): number => {
    if (rate <= -1) return Number.NaN;
    let sum = 0;
    for (let t = 0; t < asFinite.length; t += 1) {
      sum += asFinite[t] / ((1 + rate) ** t);
    }
    return sum;
  };

  const roots: number[] = [];
  const addRoot = (root: number): void => {
    if (!Number.isFinite(root) || root < IRR_SCAN_MIN || root > IRR_SCAN_MAX) return;
    if (roots.some((existing) => Math.abs(existing - root) <= IRR_ROOT_DEDUP_TOLERANCE)) return;
    roots.push(root);
  };
  const solveBracket = (initialLow: number, initialHigh: number, initialLowValue: number): number => {
    let low = initialLow;
    let high = initialHigh;
    let lowValue = initialLowValue;
    let bestRate = Math.abs(initialLowValue) <= Math.abs(npv(initialHigh)) ? initialLow : initialHigh;
    let bestResidual = Math.abs(npv(bestRate));
    for (let iteration = 0; iteration < IRR_BISECTION_ITERATIONS; iteration += 1) {
      const mid = (low + high) / 2;
      const midValue = npv(mid);
      const residual = Math.abs(midValue);
      if (residual < bestResidual) {
        bestRate = mid;
        bestResidual = residual;
      }
      if (mid === low || mid === high) break;
      if (lowValue * midValue <= 0) {
        high = mid;
      } else {
        low = mid;
        lowValue = midValue;
      }
    }
    return bestRate;
  };

  const step = (IRR_SCAN_MAX - IRR_SCAN_MIN) / IRR_SCAN_STEPS;
  let scanLeft = IRR_SCAN_MIN;
  let scanLeftValue = npv(scanLeft);
  if (!Number.isFinite(scanLeftValue)) return emptyResult('solver failed', signChangeCount);
  if (scanLeftValue === 0) addRoot(scanLeft);
  for (let index = 1; index <= IRR_SCAN_STEPS; index += 1) {
    const scanRight = index === IRR_SCAN_STEPS ? IRR_SCAN_MAX : IRR_SCAN_MIN + (step * index);
    const scanRightValue = npv(scanRight);
    if (!Number.isFinite(scanRightValue)) {
      scanLeft = scanRight;
      scanLeftValue = scanRightValue;
      continue;
    }
    if (scanRightValue === 0) addRoot(scanRight);
    if (Number.isFinite(scanLeftValue) && scanLeftValue * scanRightValue < 0) {
      addRoot(solveBracket(scanLeft, scanRight, scanLeftValue));
    }
    scanLeft = scanRight;
    scanLeftValue = scanRightValue;
  }
  roots.sort((a, b) => a - b);

  const discountThreshold = finite(discountRate) ? discountRate : 0;
  const positiveRootsAboveDiscountRate = roots
    .filter((root) => root > discountThreshold + IRR_ROOT_DEDUP_TOLERANCE)
    .sort((a, b) => a - b);
  const nonNegativeRoots = roots.filter((root) => root >= 0).sort((a, b) => a - b);
  const selectedRoot = positiveRootsAboveDiscountRate[0] ?? nonNegativeRoots[0] ?? null;
  const selectionReason = positiveRootsAboveDiscountRate[0] !== undefined
    ? 'positive root above project discount rate'
    : (nonNegativeRoots[0] !== undefined ? 'lowest non-negative root' : null);
  const residual = selectedRoot === null ? null : Math.abs(npv(selectedRoot));
  return {
    value: selectedRoot,
    roots,
    selectedRoot,
    selectionReason,
    residual,
    signChangeCount,
    reason: selectedRoot === null ? 'no economically relevant non-negative root found' : null,
  };
}


type Lista3Args = {
  masterN: number;
  tp: number | null;
  fcfUSD: Array<number | null>;
  initialCapexUSD: number | null;
  discountRate?: number | null;
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

  const irrResult = computeIrr(enterpriseCashflows, finite(args.discountRate) ? args.discountRate : 0);
  out.IRR = irrResult.value;
  debugData.perMetric.IRR.inputs.fcfUSD_total = enterpriseCashflows;
  debugData.perMetric.IRR.intermediates.solver = 'bracket+bisection';
  debugData.perMetric.IRR.intermediates.signChangeCount = irrResult.signChangeCount;
  debugData.perMetric.IRR.intermediates.roots = irrResult.roots;
  debugData.perMetric.IRR.intermediates.selectedRoot = irrResult.selectedRoot;
  debugData.perMetric.IRR.intermediates.selectionReason = irrResult.selectionReason;
  debugData.perMetric.IRR.intermediates.residual = irrResult.residual;
  debugData.perMetric.IRR.intermediates.discountRate = finite(args.discountRate) ? args.discountRate : null;
  if (irrResult.reason) debugData.perMetric.IRR.intermediates.reason = irrResult.reason;
  debugData.perMetric.IRR.output.value = out.IRR;

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

  debugData.perMetric.Payback_approx.inputs.LOM_periods = enterpriseCashflows.length - tp;
  debugData.perMetric.Payback_real.inputs.fcfUSD_total_slice = enterpriseCashflows.slice(tp, masterN + 1);

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
