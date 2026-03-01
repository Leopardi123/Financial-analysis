export type NullableNumber = number | null;

type Series = Array<number | null>;

type FinancingInput = {
  equityPct: number;
  debtPct: number;
  cashUsedInput: number;
};

export type ProjectViewInputs = {
  meta?: {
    projectId?: string | null;
  };
  targetCurrency: string;
  fxUSDToTarget: NullableNumber;
  discountRate: NullableNumber;
  masterN: number | null;
  sharesCurrent: NullableNumber;
  priceCurrentTarget: NullableNumber;
  cashCurrentTarget: NullableNumber;
  debtCurrentTarget: NullableNumber;
  enterpriseAdjustmentsTarget: NullableNumber;
  fcfUSD: Series;
  capexUSD: Series;
  grossRevenueUSD: Series;
  ebitUSD: Series;
  nopatUSD?: Series;
  effectiveTaxRate?: Series;
  taxUSD?: Series;
  federalIncomeTaxUSD?: Series;
  df_now?: Series;
  economicsTaxRate?: NullableNumber;
  payableAuEqOz: Series;
  sustainingCostUSD: Series;
  productionStartPeriod: number | null;
  financing: FinancingInput;
};

export type MetricValue = { value: NullableNumber; reason: string | null };

export type ProjectViewMetrics = {
  marketBox: {
    marketCapCurrent: MetricValue;
    evCurrent: MetricValue;
    sharesCurrent: MetricValue;
    sharesPf: MetricValue;
  };
  list2: Record<string, MetricValue>;
  list3: Record<string, MetricValue>;
  list4: Record<string, MetricValue>;
  list5: Record<string, MetricValue>;
  list6: Record<string, MetricValue>;
  diagnostics: {
    capexSignConvention: 'negative_spend' | 'positive_spend' | 'none';
    payback_real_debug: {
      tp: number | null;
      masterN: number | null;
      fcff_used: Array<number | null>;
      investment_definition: string;
      investment_abs: number;
      clock_definition: 'from tp';
      cum_path: Array<{ t: number; cum: number }>;
      crossing: {
        t_cross: number;
        prev_cum: number;
        cf: number;
        frac: number;
        payback_years: number;
      } | null;
      failure_reason: string | null;
    };
    irr_debug: {
      fcff_used: Array<number | null>;
      has_valid_sign_change: boolean;
      sign_change_pattern: number[];
      solver: 'bracket+bisection';
      irr_value: number | null;
      failure_reason: string | null;
    };
    lista3_inputs_debug: {
      has_ebit_series: boolean;
      has_nopat_series: boolean;
      has_df_now: boolean;
      ebitUSD_preview: { first3: Array<number | null>; last3: Array<number | null> } | null;
      nopatUSD_preview: { first3: Array<number | null>; last3: Array<number | null> } | null;
      failure_reasons: {
        LOM_avg_EBIT_ROCE: string | null;
        LOM_discounted_EBIT_ROCE: string | null;
        LOM_avg_NOPAT_ROIC: string | null;
        Kapitalavkastning_LOM: string | null;
        Kapitalavkastning_per_Year: string | null;
      };
    };
    metrics_debug: {
      LOM_avg_EBIT_ROCE: { numeratorUSD: number | null; denominatorUSD: number | null; ratio: number | null; displayValue: string | null; unit: 'percent'; failure_reason: string | null };
      LOM_discounted_EBIT_ROCE: { numeratorUSD_discounted: number | null; denominatorUSD: number | null; ratio: number | null; displayValue: string | null; unit: 'percent'; failure_reason: string | null };
      LOM_avg_NOPAT_ROIC: { numeratorUSD: number | null; denominatorUSD: number | null; ratio: number | null; displayValue: string | null; unit: 'percent'; failure_reason: string | null };
      Kapitalavkastning_LOM: { cf_lom_usd: number | null; initial_capex_abs: number | null; multiple: number | null; displayValue: string | null; unit: 'multiple'; failure_reason: string | null };
      Kapitalavkastning_per_Year: { cf_lom_usd: number | null; LOM: number | null; initial_capex_abs: number | null; perYear: number | null; displayValue: string | null; unit: 'multiple_per_year'; failure_reason: string | null };
      ROI_10Y: { cf_10y_usd: number | null; initial_capex_abs: number | null; multiple: number | null; displayValue: string | null; unit: 'multiple'; failure_reason: string | null };
    };
    ui_unit_meta: Record<string, { unitType: 'percent' | 'multiple' | 'multiple_per_year' | 'currency'; renderSuffix: string }>;
  };
};

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function mv(value: NullableNumber, reason: string | null = null): MetricValue {
  return { value: finite(value) ? value : null, reason: finite(value) ? null : (reason ?? 'Missing required input.') };
}

function sumRange(values: Series, start: number, end: number): NullableNumber {
  if (start < 0 || end < start || end >= values.length) return null;
  let sum = 0;
  for (let i = start; i <= end; i += 1) {
    if (!finite(values[i])) return null;
    sum += values[i] as number;
  }
  return sum;
}

function sumPayablePositive(values: Series, start: number, end: number): NullableNumber {
  if (start < 0 || end < start || end >= values.length) return null;
  let sum = 0;
  let counted = 0;
  for (let i = start; i <= end; i += 1) {
    const payable = values[i];
    if (finite(payable) && payable > 0) {
      sum += payable;
      counted += 1;
    }
  }
  return counted > 0 ? sum : null;
}

function countPayablePositive(values: Series, start: number, end: number): NullableNumber {
  if (start < 0 || end < start || end >= values.length) return null;
  let counted = 0;
  for (let i = start; i <= end; i += 1) {
    const payable = values[i];
    if (finite(payable) && payable > 0) counted += 1;
  }
  return counted;
}

function sumSustainingCostsWherePayablePositive(costs: Series, payable: Series, start: number, end: number): { sumCost: number; sumPay: number } | null {
  if (start < 0 || end < start || end >= costs.length || end >= payable.length) return null;
  let sumCost = 0;
  let sumPay = 0;
  for (let i = start; i <= end; i += 1) {
    const pay = payable[i];
    if (finite(pay) && pay > 0) {
      const cost = costs[i];
      if (!finite(cost)) return null;
      sumCost += cost;
      sumPay += pay;
    }
  }
  if (sumPay === 0) return null;
  return { sumCost, sumPay };
}

function buildCanonicalEnterpriseCashflows(args: {
  fcfUSD: Series;
  masterN: number;
}): number[] | null {
  if (args.masterN < 0 || args.masterN >= args.fcfUSD.length) return null;
  const cashflows = args.fcfUSD.slice(0, args.masterN + 1);
  if (cashflows.length !== args.masterN + 1) return null;
  for (let t = 0; t <= args.masterN; t += 1) {
    const fcff = args.fcfUSD[t];
    if (!finite(fcff)) return null;
    cashflows[t] = fcff;
  }
  if (cashflows.some((v) => !finite(v))) return null;
  return cashflows as number[];
}

type IrrSolveResult = {
  value: number | null;
  reason: string | null;
  bracketFound: boolean;
  signChangePattern: number[];
};

function computeIrr(cashFlows: Array<number | null>): IrrSolveResult {
  if (cashFlows.length === 0) {
    return { value: null, reason: 'Invalid cashflow series', bracketFound: false, signChangePattern: [] };
  }

  if (cashFlows.some((v) => !finite(v))) {
    return { value: null, reason: 'Invalid cashflow series', bracketFound: false, signChangePattern: [] };
  }


  const asFinite = cashFlows as number[];
  const signChangePattern: number[] = [];
  let prevSign: number | null = null;
  for (let t = 0; t < asFinite.length; t += 1) {
    const cf = asFinite[t];
    const sign = cf > 0 ? 1 : (cf < 0 ? -1 : 0);
    if (sign === 0) continue;
    if (prevSign !== null && prevSign !== sign) {
      signChangePattern.push(t);
    }
    prevSign = sign;
  }
  const hasPositive = asFinite.some((v) => v > 0);
  const hasNegative = asFinite.some((v) => v < 0);
  if (!hasPositive || !hasNegative) {
    return { value: null, reason: 'IRR requires valid sign change', bracketFound: false, signChangePattern };
  }

  const npv = (rate: number): number => {
    if (rate <= -1) return Number.NaN;
    let sum = 0;
    for (let t = 0; t < asFinite.length; t += 1) {
      const cashflow = asFinite[t];
      const denom = (1 + rate) ** t;
      if (!Number.isFinite(denom)) {
        continue;
      }
      sum += cashflow / denom;
    }
    return sum;
  };

  const rLow = -0.99;
  const npvLow = npv(rLow);
  if (!Number.isFinite(npvLow)) {
    return { value: null, reason: 'Invalid cashflow series', bracketFound: false, signChangePattern: [] };
  }
  if (npvLow === 0) {
    return { value: rLow, reason: null, bracketFound: true, signChangePattern };
  }

  const highCandidates = [0.0, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
  let low = rLow;
  let high = 10.0;
  let lowVal = npvLow;
  let highVal = Number.NaN;
  let bracketFound = false;

  for (const candidate of highCandidates) {
    const candidateNpv = npv(candidate);
    if (!Number.isFinite(candidateNpv)) {
      continue;
    }
    if (candidateNpv === 0) {
      return { value: candidate, reason: null, bracketFound: true, signChangePattern };
    }
    if (lowVal * candidateNpv < 0) {
      high = candidate;
      highVal = candidateNpv;
      bracketFound = true;
      break;
    }
  }

  if (!bracketFound || !Number.isFinite(highVal)) {
    return { value: null, reason: 'IRR not bracketed up to 1000%', bracketFound: false, signChangePattern };
  }

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const midVal = npv(mid);
    if (!Number.isFinite(midVal)) {
      return { value: null, reason: 'Invalid cashflow series', bracketFound: true, signChangePattern };
    }
    if (Math.abs(midVal) < 1e-8 || Math.abs(high - low) < 1e-12) {
      return { value: mid, reason: null, bracketFound: true, signChangePattern };
    }
    if (lowVal * midVal < 0) {
      high = mid;
      highVal = midVal;
    } else {
      low = mid;
      lowVal = midVal;
    }
  }

  return { value: (low + high) / 2, reason: null, bracketFound: true, signChangePattern };
}

function discountToToday(t: number, discountRate: number): number {
  return 1 / ((1 + discountRate) ** t);
}

function deriveInitialCapexUSD(capexUSD: Series, tp: number | null): { value: number | null; signConvention: 'negative_spend' | 'positive_spend' | 'none'; reason: string | null } {
  if (!Number.isInteger(tp)) return { value: null, signConvention: 'none', reason: 'Missing tp' };
  if (tp === 0) return { value: 0, signConvention: 'none', reason: null };
  const slice = capexUSD.slice(0, tp as number);
  if (slice.length !== tp) return { value: null, signConvention: 'none', reason: 'Missing series capexUSD' };
  if (slice.some((v) => !finite(v))) return { value: null, signConvention: 'none', reason: 'Missing series capexUSD' };
  const asNumbers = slice as number[];
  const hasNegative = asNumbers.some((v) => v < 0);
  if (hasNegative) {
    return { value: asNumbers.reduce((sum, v) => sum + Math.max(0, -v), 0), signConvention: 'negative_spend', reason: null };
  }
  return { value: asNumbers.reduce((sum, v) => sum + Math.max(0, v), 0), signConvention: 'positive_spend', reason: null };
}

function avg(values: number[]): NullableNumber {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function safeRatio(numerator: number | null, denominator: number | null): { value: number | null; failure_reason: string | null } {
  if (!finite(numerator)) return { value: null, failure_reason: 'Missing numerator' };
  if (!finite(denominator)) return { value: null, failure_reason: 'Missing denominator' };
  if (denominator === 0) return { value: null, failure_reason: 'Denominator is 0' };
  return { value: numerator / denominator, failure_reason: null };
}

function formatDebugDisplay(value: number | null, unitType: 'percent' | 'multiple' | 'multiple_per_year'): string | null {
  if (!finite(value)) return null;
  if (unitType === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (unitType === 'multiple_per_year') return `${value.toFixed(1)}x/år`;
  return `${value.toFixed(1)}x`;
}

function hasFiniteSeries(values: Series | undefined): values is Series {
  return Array.isArray(values) && values.some((v) => finite(v));
}

function previewSeries(values: Series | undefined): { first3: Array<number | null>; last3: Array<number | null> } | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  return {
    first3: values.slice(0, 3),
    last3: values.slice(Math.max(0, values.length - 3)),
  };
}

function ratio(num: NullableNumber, den: NullableNumber): MetricValue {
  if (!finite(num)) return mv(null, 'Missing numerator input');
  if (!finite(den)) return mv(null, 'Missing denominator input');
  if (den === 0) return mv(null, 'Denominator is 0');
  return mv(num / den, null);
}

function perShareMetric(value: NullableNumber, shares: NullableNumber, missingValueReason: string): MetricValue {
  if (!finite(value)) return mv(null, missingValueReason);
  if (!finite(shares) || shares <= 0) return mv(null, 'Missing required upstream input: shares_post_financing');
  return mv(value / shares, null);
}

type TenYearValidation = { ok: true; sum: number } | { ok: false; reason: string };

function validateStrictTenYearWindow(series: Series, requiredLength = 10, start = 0, windowLen = 10): TenYearValidation {
  const availableCount = Array.isArray(series) ? series.length : 0;
  if (availableCount < requiredLength) {
    return { ok: false, reason: `10Y requires 10 periods; have ${availableCount}` };
  }
  const end = start + windowLen - 1;
  if (end >= availableCount) {
    return { ok: false, reason: `10Y requires 10 periods; have ${availableCount}` };
  }

  let sum = 0;
  for (let t = start; t <= end; t += 1) {
    const value = series[t];
    if (!finite(value)) {
      return { ok: false, reason: 'Missing value(s) in 10Y window (t=0..9)' };
    }
    sum += value;
  }
  return { ok: true, sum };
}

let enterpriseCashflowDebugLogged = false;

export function computeProjectViewMetrics(input: ProjectViewInputs): ProjectViewMetrics {
  const fx = finite(input.fxUSDToTarget) && input.fxUSDToTarget > 0 ? input.fxUSDToTarget : null;
  const r = finite(input.discountRate) && input.discountRate > 0 ? input.discountRate : null;
  const sharesCurrent = finite(input.sharesCurrent) && input.sharesCurrent > 0 ? input.sharesCurrent : null;
  const priceCurrent = finite(input.priceCurrentTarget) && input.priceCurrentTarget > 0 ? input.priceCurrentTarget : null;
  const cashCurrent = finite(input.cashCurrentTarget) ? input.cashCurrentTarget : null;
  const debtCurrent = finite(input.debtCurrentTarget) ? input.debtCurrentTarget : null;
  const enterpriseAdjustments = finite(input.enterpriseAdjustmentsTarget) ? input.enterpriseAdjustmentsTarget : 0;
  const tp = Number.isInteger(input.productionStartPeriod) ? input.productionStartPeriod as number : null;
  const masterN = Number.isInteger(input.masterN) ? input.masterN as number : null;


  const debtFrac = Math.max(0, Math.min(1, input.financing.debtPct / 100));
  const equityFracRaw = Math.max(0, Math.min(1, input.financing.equityPct / 100));
  const normBase = debtFrac + equityFracRaw;
  const equityFrac = normBase > 0 ? equityFracRaw / normBase : 1;
  const normDebtFrac = normBase > 0 ? debtFrac / normBase : 0;

  const capexInit = deriveInitialCapexUSD(input.capexUSD, tp);
  const initialCapexUSD = capexInit.value;
  const initialCapexTarget = initialCapexUSD !== null && fx !== null ? initialCapexUSD * fx : null;

  const cashUsedTarget = initialCapexTarget !== null && cashCurrent !== null
    ? Math.min(Math.max(0, input.financing.cashUsedInput), cashCurrent)
    : 0;
  const remainingNeedTarget = initialCapexTarget !== null ? Math.max(0, initialCapexTarget - cashUsedTarget) : null;
  const debtAddedTarget = remainingNeedTarget !== null ? remainingNeedTarget * normDebtFrac : 0;
  const equityRaiseTarget = remainingNeedTarget !== null ? remainingNeedTarget * equityFrac : 0;
  const newShares = priceCurrent !== null && priceCurrent > 0 ? equityRaiseTarget / priceCurrent : null;
  const sharesPf = sharesCurrent !== null ? sharesCurrent + (newShares ?? 0) : null;
  const debtT0 = debtCurrent !== null ? debtCurrent + debtAddedTarget : debtCurrent;
  const cashT0 = cashCurrent !== null ? cashCurrent - cashUsedTarget : cashCurrent;

  const marketCapCurrent = sharesCurrent !== null && priceCurrent !== null ? sharesCurrent * priceCurrent : null;
  const evTarget = marketCapCurrent !== null && debtT0 !== null && cashT0 !== null
    ? marketCapCurrent + debtT0 - cashT0 + enterpriseAdjustments
    : null;

  const npvTodayUSD = r !== null ? (() => {
    let sum = 0;
    for (let i = 0; i < input.fcfUSD.length; i += 1) {
      const v = input.fcfUSD[i];
      if (!finite(v)) return null;
      sum += v * discountToToday(i, r);
    }
    return sum;
  })() : null;

  const npvTarget = npvTodayUSD !== null && fx !== null ? npvTodayUSD * fx : null;
  const navTarget = npvTarget !== null && cashT0 !== null && debtT0 !== null ? npvTarget + (cashT0 - debtT0) : null;
  const cfLomUSD = input.fcfUSD.length > 0 ? sumRange(input.fcfUSD, 0, input.fcfUSD.length - 1) : null;
  const cfLomTarget = cfLomUSD !== null && fx !== null ? cfLomUSD * fx : null;

  const dcfProdStartExCapexUSD = tp !== null && r !== null ? (() => {
    let sum = 0;
    for (let i = tp; i < input.fcfUSD.length; i += 1) {
      const v = input.fcfUSD[i];
      if (!finite(v)) return null;
      sum += v / ((1 + r) ** (i - tp));
    }
    return sum;
  })() : null;

  const dcfTarget = dcfProdStartExCapexUSD !== null && fx !== null ? dcfProdStartExCapexUSD * fx : null;

  const npvProdStartUSD = dcfProdStartExCapexUSD !== null && initialCapexUSD !== null
    ? dcfProdStartExCapexUSD - Math.abs(initialCapexUSD)
    : null;
  const npvProdStartTarget = npvProdStartUSD !== null && fx !== null ? npvProdStartUSD * fx : null;
  const navProdStartTarget = npvProdStartTarget !== null && cashT0 !== null && debtT0 !== null
    ? npvProdStartTarget + (cashT0 - debtT0)
    : null;

  const dcfProdStartPresentUSD = dcfProdStartExCapexUSD !== null && tp !== null && r !== null
    ? dcfProdStartExCapexUSD / ((1 + r) ** tp)
    : null;
  const dcfTargetDiscounted = dcfProdStartPresentUSD !== null && fx !== null ? dcfProdStartPresentUSD * fx : null;

  const prodYears = tp !== null && masterN !== null && tp <= masterN ? countPayablePositive(input.payableAuEqOz, tp, masterN) : null;
  const aueqLom = tp !== null && masterN !== null && tp <= masterN ? sumPayablePositive(input.payableAuEqOz, tp, masterN) : null;
  const aueqYr = aueqLom !== null && prodYears !== null && prodYears > 0 ? aueqLom / prodYears : null;
  const sustainingVsPayable = tp !== null && masterN !== null && tp <= masterN
    ? sumSustainingCostsWherePayablePositive(input.sustainingCostUSD, input.payableAuEqOz, tp, masterN)
    : null;
  const aiscLom = sustainingVsPayable !== null ? sustainingVsPayable.sumCost / sustainingVsPayable.sumPay : null;
  const capexPerAnnual = initialCapexUSD !== null && aueqYr !== null && aueqYr > 0 ? Math.abs(initialCapexUSD) / aueqYr : null;

  const inSitu10YValidation = tp !== null
    ? validateStrictTenYearWindow(input.grossRevenueUSD, 10, tp, 10)
    : { ok: false as const, reason: 'Missing tp' };
  const inSitu10YUSD = inSitu10YValidation.ok ? inSitu10YValidation.sum : null;
  const inSitu10YReason = inSitu10YValidation.ok ? null : inSitu10YValidation.reason;

  const auEq10YValidation = tp !== null
    ? validateStrictTenYearWindow(input.payableAuEqOz, 10, tp, 10)
    : { ok: false as const, reason: 'Missing tp' };
  const auEq10Y = auEq10YValidation.ok ? auEq10YValidation.sum : null;
  const auEq10YReason = auEq10YValidation.ok ? null : auEq10YValidation.reason;
  const evUsd = evTarget !== null && fx !== null ? evTarget / fx : null;

  const paybackApprox = initialCapexUSD !== null && tp !== null ? (() => {
    let cum = 0;
    for (let i = tp; i < input.fcfUSD.length; i += 1) {
      const v = input.fcfUSD[i];
      if (!finite(v)) return null;
      cum += v;
      if (cum >= initialCapexUSD) return i - tp + 1;
    }
    return null;
  })() : null;

  const enterpriseCashflows = masterN !== null
    ? buildCanonicalEnterpriseCashflows({
      fcfUSD: input.fcfUSD,
      masterN,
    })
    : null;

  // Keep Payback/IRR/ROI on the exact same FCFF enterprise series to avoid mixed-series inconsistencies.
  const paybackSeries = enterpriseCashflows;
  const irrSeries = enterpriseCashflows;
  const roiSeries = enterpriseCashflows;

  console.assert(
    paybackSeries === irrSeries && irrSeries === roiSeries,
    'Mismatch in project cashflow series',
  );

  if (!(paybackSeries === irrSeries && irrSeries === roiSeries)) {
    console.error('Mismatch in project cashflow series', {
      paybackSeriesRef: paybackSeries,
      irrSeriesRef: irrSeries,
      roiSeriesRef: roiSeries,
      projectId: input.meta?.projectId ?? null,
    });
  }

  const paybackDebug = {
    tp,
    masterN,
    fcff_used: (masterN !== null
      ? Array.from({ length: masterN + 1 }, (_, t) => {
        const cf = input.fcfUSD[t];
        return finite(cf) ? cf : null;
      })
      : [] as Array<number | null>),
    investment_definition: 'sum(abs(negative fcffUSD_total[t])) for t in [0..tp], inclusive',
    investment_abs: 0,
    clock_definition: 'from tp' as const,
    cum_path: [] as Array<{ t: number; cum: number }>,
    crossing: null as {
      t_cross: number;
      prev_cum: number;
      cf: number;
      frac: number;
      payback_years: number;
    } | null,
    failure_reason: null as string | null,
  };

  let paybackReal: number | null = null;
  if (tp === null || masterN === null || paybackSeries === null) {
    paybackDebug.failure_reason = tp === null ? 'Missing tp' : (masterN === null ? 'Missing masterN' : 'Missing series fcfUSD');
  } else {
    let investmentAbs = 0;
    for (let t = 0; t <= tp; t += 1) {
      const cf = paybackSeries[t];
      if (!finite(cf)) {
        paybackDebug.failure_reason = `Missing series fcfUSD at t=${t} in investment window`;
        break;
      }
      if (cf < 0) investmentAbs += Math.abs(cf);
    }

    paybackDebug.investment_abs = investmentAbs;

    if (paybackDebug.failure_reason === null) {
      if (investmentAbs <= 0) {
        paybackDebug.failure_reason = 'investment_abs <= 0';
      } else {
        let cum = -investmentAbs;
        for (let t = tp; t <= masterN; t += 1) {
          const cf = paybackSeries[t];
          if (!finite(cf)) {
            paybackDebug.failure_reason = `Missing series fcfUSD at t=${t} in payback path`;
            break;
          }
          const prev = cum;
          cum += cf;
          paybackDebug.cum_path.push({ t, cum });
          if (prev < 0 && cum >= 0) {
            if (cf <= 0) {
              paybackDebug.failure_reason = `crossing requires positive fcff at t=${t}`;
              break;
            }
            const frac = (-prev) / cf;
            const paybackYears = (t - tp) + frac;
            paybackDebug.crossing = {
              t_cross: t,
              prev_cum: prev,
              cf,
              frac,
              payback_years: paybackYears,
            };
            paybackReal = paybackYears;
            break;
          }
        }
        if (paybackReal === null && paybackDebug.failure_reason === null) {
          paybackDebug.failure_reason = 'No payback reached in FCFF path';
        }
      }
    }
  }

  const hasIrrSignChange = irrSeries !== null
    && irrSeries.some((v) => v < 0)
    && irrSeries.some((v) => v > 0);
  const irrSolve = irrSeries !== null ? computeIrr(irrSeries) : {
    value: null,
    reason: 'Missing series fcfUSD',
    bracketFound: false,
    signChangePattern: [],
  };
  let irr = irrSolve.value;
  let irrReason = irrSolve.reason;

  const irrDebug = {
    fcff_used: (masterN !== null
      ? Array.from({ length: masterN + 1 }, (_, t) => {
        const cf = input.fcfUSD[t];
        return finite(cf) ? cf : null;
      })
      : [] as Array<number | null>),
    has_valid_sign_change: hasIrrSignChange,
    sign_change_pattern: irrSolve.signChangePattern,
    solver: 'bracket+bisection' as const,
    irr_value: irr,
    failure_reason: irrReason,
  };

  let roi10yNumerator: number | null = null;
  const roi10y = tp !== null && masterN !== null && initialCapexUSD !== null && roiSeries !== null ? (() => {
    const end = Math.min(tp + 9, masterN);
    if (tp < 0 || end < tp) return null;
    let sum = 0;
    let count = 0;
    for (let i = tp; i <= end; i += 1) {
      const v = roiSeries[i];
      if (finite(v)) {
        sum += v;
        count += 1;
      }
    }
    roi10yNumerator = count > 0 ? sum : null;
    const roi10yRatio = safeRatio(roi10yNumerator, Math.abs(initialCapexUSD));
    return roi10yRatio.value;
  })() : null;

  if (!enterpriseCashflowDebugLogged && enterpriseCashflows !== null) {
    enterpriseCashflowDebugLogged = true;
    const debugSeries = enterpriseCashflows;
    const finiteSeries = debugSeries.filter((v): v is number => finite(v));
    const minCashflow = finiteSeries.length > 0 ? Math.min(...finiteSeries) : null;
    const maxCashflow = finiteSeries.length > 0 ? Math.max(...finiteSeries) : null;
    const countNeg = finiteSeries.filter((v) => v < 0).length;
    const countPos = finiteSeries.filter((v) => v > 0).length;
    const indexedFirst8 = debugSeries.slice(0, 8).map((value, idx) => ({ idx, value }));
    console.log('projectCashflowDebug', {
      projectId: input.meta?.projectId ?? null,
      sameSeriesForPaybackAndIRR: paybackSeries === irrSeries,
      first8EnterpriseCashflows: indexedFirst8,
      minCashflow,
      maxCashflow,
      countNeg,
      countPos,
      tp,
      masterN,
      payback_real: paybackReal,
      irr,
      roi10y,
    });
  }

  if (paybackSeries !== irrSeries) {
    console.error('Payback and IRR cashflows must reference the exact same array.');
  }

  if (paybackReal !== null && !hasIrrSignChange) {
    console.error('IRR series invalid despite payback');
  }

  if (paybackReal !== null && irr === null) {
    const debugSeries = irrSeries ?? [];
    const finiteSeries = debugSeries.filter((v): v is number => finite(v));
    const minCashflow = finiteSeries.length > 0 ? Math.min(...finiteSeries) : null;
    const maxCashflow = finiteSeries.length > 0 ? Math.max(...finiteSeries) : null;
    console.warn('IRR null despite payback', {
      first6Cashflows: debugSeries.slice(0, 6),
      minCashflow,
      maxCashflow,
      bracketFound: irrSolve.bracketFound,
    });
  }

  if (paybackReal !== null && irr !== null && irr <= 0) {
    console.warn('IRR inconsistency with payback');
  }

  let avgEbitNumerator: number | null = null;
  const avgEbit = tp !== null && masterN !== null && initialCapexUSD !== null ? (() => {
    const ebitFinite: number[] = [];
    for (let t = tp; t <= masterN; t += 1) {
      const ebit = input.ebitUSD[t];
      if (finite(ebit)) ebitFinite.push(ebit);
    }
    avgEbitNumerator = ebitFinite.length > 0 ? avg(ebitFinite) : null;
    const avgEbitRatio = safeRatio(avgEbitNumerator, Math.abs(initialCapexUSD));
    return avgEbitRatio.value;
  })() : null;
  let discountedEbitNumerator: number | null = null;
  const discountedEbitRoce = tp !== null && masterN !== null && initialCapexUSD !== null ? (() => {
    const discountFactors = Array.isArray(input.df_now) && input.df_now.length > 0
      ? input.df_now
      : (r !== null ? Array.from({ length: input.ebitUSD.length }, (_, t) => discountToToday(t, r)) : null);
    if (!discountFactors) return null;
    let sum = 0;
    let count = 0;
    for (let t = tp; t <= masterN; t += 1) {
      const ebit = input.ebitUSD[t];
      const df = discountFactors[t];
      if (!finite(ebit) || !finite(df)) continue;
      sum += ebit * df;
      count += 1;
    }
    if (count === 0) return null;
    discountedEbitNumerator = sum;
    const discountedRatio = safeRatio(discountedEbitNumerator, Math.abs(initialCapexUSD));
    return discountedRatio.value;
  })() : null;

  const nopatSeries: Series = Array.isArray(input.nopatUSD) ? [...input.nopatUSD] : new Array(input.ebitUSD.length).fill(null);
  if (!hasFiniteSeries(input.nopatUSD)) {
    for (let t = 0; t < input.ebitUSD.length; t += 1) {
      const ebit = input.ebitUSD[t];
      if (!finite(ebit)) {
        nopatSeries[t] = null;
        continue;
      }

      const taxFromFederal = input.federalIncomeTaxUSD?.[t];
      const taxRateFromFederal = finite(taxFromFederal) && ebit > 0 ? Math.max(0, Math.min(1, taxFromFederal / ebit)) : null;
      const effectiveTaxRate = finite(input.effectiveTaxRate?.[t])
        ? Math.max(0, Math.min(1, input.effectiveTaxRate?.[t] as number))
        : (taxRateFromFederal ?? (finite(input.economicsTaxRate) ? Math.max(0, Math.min(1, input.economicsTaxRate)) : null));

      nopatSeries[t] = effectiveTaxRate === null ? null : ebit * (1 - effectiveTaxRate);
    }
  }

  const nopatFinite = nopatSeries.filter((v): v is number => finite(v));
  const avgNopatNumerator = nopatFinite.length > 0 ? (avg(nopatFinite) as number) : null;
  const avgNopatRoic = initialCapexUSD !== null
    ? safeRatio(avgNopatNumerator, Math.abs(initialCapexUSD)).value
    : null;

  const kapitalavkastningLom = initialCapexUSD !== null
    ? safeRatio(cfLomUSD, Math.abs(initialCapexUSD)).value
    : null;
  const kapitalavkastningPerYear = kapitalavkastningLom !== null && prodYears !== null && prodYears > 0
    ? kapitalavkastningLom / prodYears
    : null;

  const avgEbitReason = avgEbit !== null
    ? null
    : (tp === null || masterN === null
      ? 'Missing tp/masterN'
      : (avgEbitNumerator === null ? 'Missing finite ebitUSD observations' : (initialCapexUSD === null ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD') : 'Denominator is 0')));
  const discountedEbitReason = discountedEbitRoce !== null
    ? null
    : (r === null && !hasFiniteSeries(input.df_now)
      ? 'Missing discountRate and df_now series'
      : (discountedEbitNumerator === null
        ? 'Missing finite ebitUSD*df_now observations'
        : (initialCapexUSD === null ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD') : 'Denominator is 0')));
  const nopatReason = avgNopatRoic !== null
    ? null
    : (hasFiniteSeries(input.nopatUSD)
      ? 'Missing finite nopatUSD observations'
      : (hasFiniteSeries(input.federalIncomeTaxUSD)
        ? 'Cannot infer nopatUSD from federalIncomeTaxUSD (requires positive ebitUSD)'
        : (finite(input.economicsTaxRate)
          ? 'Missing finite ebitUSD observations'
          : 'Missing nopatUSD and tax inputs (federalIncomeTaxUSD or economics.taxRate)')));
  const kapitalReason = kapitalavkastningLom !== null
    ? null
    : (cfLomUSD === null ? 'Missing source metric CF_LOM_USD' : (initialCapexUSD === null ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD') : 'Initial_CAPEX_USD is 0'));
  const kapitalPerYearReason = kapitalavkastningPerYear !== null
    ? null
    : (kapitalavkastningLom === null ? (kapitalReason ?? 'Missing Kapitalavkastning_LOM') : 'Missing production-year count');

  return {
    marketBox: {
      marketCapCurrent: mv(marketCapCurrent, sharesCurrent === null ? 'Missing shares_current' : 'Missing price_current_TargetCurrency'),
      evCurrent: mv(evTarget, marketCapCurrent === null ? 'Missing MarketCap_current' : (debtT0 === null || cashT0 === null ? 'Missing cash_t0 or debt_t0' : null)),
      sharesCurrent: mv(sharesCurrent, 'Missing shares_current'),
      sharesPf: mv(sharesPf, 'Missing shares_current'),
    },
    list2: {
      NPV_Target: mv(npvTarget, r === null ? 'Missing discountRate r' : (fx === null ? 'Missing fx_USD_to_TargetCurrency' : 'Missing series fcfUSD')),
      NPV_perShare: ratio(npvTarget, sharesPf),
      NPV_prodStart: mv(
        npvProdStartTarget,
        initialCapexUSD === null
          ? 'Missing Initial_CAPEX_USD'
          : (dcfProdStartExCapexUSD === null
            ? 'Missing DCF_prodStart_exCapex_USD'
            : 'Missing fx'),
      ),
      NPV_prodStart_perShare: perShareMetric(
        npvProdStartTarget,
        sharesPf,
        initialCapexUSD === null
          ? 'Missing Initial_CAPEX_USD'
          : (dcfProdStartExCapexUSD === null
            ? 'Missing DCF_prodStart_exCapex_USD'
            : 'Missing fx'),
      ),
      NAV_Target: mv(navTarget, npvTarget === null ? 'Missing NPV_Target' : 'Missing cash_t0 or debt_t0'),
      NAV_perShare: ratio(navTarget, sharesPf),
      NAV_prodStart: mv(
        navProdStartTarget,
        npvProdStartTarget === null
          ? (initialCapexUSD === null
            ? 'Missing Initial_CAPEX_USD'
            : (dcfProdStartExCapexUSD === null
              ? 'Missing DCF_prodStart_exCapex_USD'
              : 'Missing fx'))
          : 'Missing cash_t0 or debt_t0',
      ),
      NAV_prodStart_perShare: perShareMetric(
        navProdStartTarget,
        sharesPf,
        npvProdStartTarget === null
          ? (initialCapexUSD === null
            ? 'Missing Initial_CAPEX_USD'
            : (dcfProdStartExCapexUSD === null
              ? 'Missing DCF_prodStart_exCapex_USD'
              : 'Missing fx'))
          : 'Missing cash_t0 or debt_t0',
      ),
      CF_LOM_Target: mv(cfLomTarget, fx === null ? 'Missing fx_USD_to_TargetCurrency' : 'Missing series fcfUSD'),
      CF_LOM_Target_perShare: ratio(cfLomTarget, sharesPf),
      DCF_Target: mv(dcfTarget, tp === null ? 'Missing tp' : (r === null ? 'Missing discountRate r' : (fx === null ? 'Missing fx_USD_to_TargetCurrency' : 'Missing series fcfUSD'))),
      DCF_perShare: ratio(dcfTarget, sharesPf),
      DCF_Target_discounted: mv(dcfTargetDiscounted, tp === null ? 'Missing tp' : (r === null ? 'Missing discountRate r' : (fx === null ? 'Missing fx_USD_to_TargetCurrency' : 'Missing series fcfUSD'))),
      DCF_Target_discounted_perShare: ratio(dcfTargetDiscounted, sharesPf),
      EV_over_NPV: ratio(evTarget, npvTarget),
      EV_over_NAV: ratio(evTarget, navTarget),
      P_over_NAV: ratio(marketCapCurrent, navTarget),
      NPV_over_ETLV: ratio(npvTodayUSD, cfLomUSD),
      DCF_over_ETLV: ratio(dcfProdStartExCapexUSD, cfLomUSD),
    },
    list3: {
      AISC_LOM: mv(aiscLom, sustainingVsPayable === null ? 'Missing series sustainingCostUSD for payable periods' : null),
      BreakEven_AuEq: mv(aiscLom, sustainingVsPayable === null ? 'Missing series sustainingCostUSD for payable periods' : null),
      CAPEX_per_Annual_AuEq: mv(capexPerAnnual, initialCapexUSD === null ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD') : 'Denominator is 0'),
      Payback_approx: mv(paybackApprox, initialCapexUSD === null ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD') : 'No payback reached in FCF path'),
      Payback_real: mv(
        paybackReal,
        tp === null
          ? 'Missing tp'
          : (initialCapexUSD === null
            ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD')
            : (paybackSeries === null
              ? 'Missing series fcfUSD'
              : (paybackDebug.failure_reason ?? 'Payback is computed from production start (tp) using FCFF. Pre-production deficit is derived from cumulative FCFF before tp (no capex double-counting).'))),
      ),
      IRR: mv(
        irr,
        masterN === null
          ? 'Missing masterN'
          : (tp === null
            ? 'Missing tp'
            : (initialCapexUSD === null
              ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD')
              : (irrSeries === null
                ? 'Missing series fcfUSD'
                : (irrDebug.failure_reason ?? 'IRR could not be solved')))),
      ),
      ROI_10Y: mv(
        roi10y,
        tp === null
          ? 'Missing tp'
          : (initialCapexUSD === null
            ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD')
            : (roiSeries === null ? 'Missing series fcfUSD' : 'Missing finite fcfUSD in 10Y window')),
      ),
      LOM_avg_EBIT_ROCE: mv(avgEbit, avgEbitReason),
      LOM_discounted_EBIT_ROCE: mv(discountedEbitRoce, discountedEbitReason),
      Corporate_ROIC: mv(null, 'Corporate ROIC not provided in project scope'),
      LOM_avg_NOPAT_ROIC: mv(avgNopatRoic, nopatReason),
      Kapitalavkastning_LOM: mv(kapitalavkastningLom, kapitalReason),
      Kapitalavkastning_per_Year: mv(kapitalavkastningPerYear, kapitalPerYearReason),
    },
    list4: {
      LOM: mv(prodYears, tp !== null && masterN !== null && tp > masterN ? 'tp > masterN' : 'Missing tp or masterN'),
      AuEq_LOM: mv(aueqLom, tp !== null && masterN !== null && tp > masterN ? 'tp > masterN' : 'Missing series payableAuEqOz'),
      AuEq_YR: mv(aueqYr, aueqLom === null ? 'Missing AuEq_LOM' : 'Denominator is 0'),
      InSitu_10Y_USD: mv(inSitu10YUSD, inSitu10YReason),
      InSitu_10Y_perShare_USD: perShareMetric(inSitu10YUSD, sharesPf, inSitu10YReason ?? 'Missing numerator input'),
      EV_over_10Y_InSitu: ratio(evUsd, inSitu10YUSD),
      AuEq_10Y: mv(auEq10Y, auEq10YReason),
      AuEq_10Y_perShare: perShareMetric(auEq10Y, sharesPf, auEq10YReason ?? 'Missing numerator input'),
    },
    list5: {
      Initial_CAPEX_Target: mv(initialCapexTarget, initialCapexUSD === null ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD') : 'Missing fx_USD_to_TargetCurrency'),
      cash_used_Target: mv(cashUsedTarget, null),
      remaining_need_Target: mv(remainingNeedTarget, initialCapexTarget === null ? 'Missing Initial_CAPEX_Target' : null),
      Debt_Added_Target: mv(debtAddedTarget, null),
      Equity_Raise_Target: mv(equityRaiseTarget, null),
      New_Shares: mv(newShares, priceCurrent === null ? 'Missing price_current_TargetCurrency' : null),
      debt_t0: mv(debtT0, 'Missing debt_t0 current input'),
      cash_t0: mv(cashT0, 'Missing cash_t0 current input'),
    },
    list6: {
      NAV_Mult: mv(null, 'M&A comparables not provided in current dataset'),
      InSitu_10Y_Mult: mv(null, 'M&A comparables not provided in current dataset'),
      AuEq_10Y_Mult: mv(null, 'M&A comparables not provided in current dataset'),
      MA_Median: mv(null, 'M&A comparables not provided in current dataset'),
      Premium_vs_EV: mv(null, 'M&A comparables not provided in current dataset'),
    },
    diagnostics: {
      capexSignConvention: capexInit.signConvention,
      payback_real_debug: paybackDebug,
      irr_debug: irrDebug,
      lista3_inputs_debug: {
        has_ebit_series: hasFiniteSeries(input.ebitUSD),
        has_nopat_series: hasFiniteSeries(nopatSeries),
        has_df_now: hasFiniteSeries(input.df_now),
        ebitUSD_preview: previewSeries(input.ebitUSD),
        nopatUSD_preview: previewSeries(nopatSeries),
        failure_reasons: {
          LOM_avg_EBIT_ROCE: avgEbitReason,
          LOM_discounted_EBIT_ROCE: discountedEbitReason,
          LOM_avg_NOPAT_ROIC: nopatReason,
          Kapitalavkastning_LOM: kapitalReason,
          Kapitalavkastning_per_Year: kapitalPerYearReason,
        },
      },
      metrics_debug: {
        LOM_avg_EBIT_ROCE: {
          numeratorUSD: avgEbitNumerator,
          denominatorUSD: finite(initialCapexUSD) ? Math.abs(initialCapexUSD) : null,
          ratio: avgEbit,
          displayValue: formatDebugDisplay(avgEbit, 'percent'),
          unit: 'percent',
          failure_reason: avgEbitReason,
        },
        LOM_discounted_EBIT_ROCE: {
          numeratorUSD_discounted: discountedEbitNumerator,
          denominatorUSD: finite(initialCapexUSD) ? Math.abs(initialCapexUSD) : null,
          ratio: discountedEbitRoce,
          displayValue: formatDebugDisplay(discountedEbitRoce, 'percent'),
          unit: 'percent',
          failure_reason: discountedEbitReason,
        },
        LOM_avg_NOPAT_ROIC: {
          numeratorUSD: avgNopatNumerator,
          denominatorUSD: finite(initialCapexUSD) ? Math.abs(initialCapexUSD) : null,
          ratio: avgNopatRoic,
          displayValue: formatDebugDisplay(avgNopatRoic, 'percent'),
          unit: 'percent',
          failure_reason: nopatReason,
        },
        Kapitalavkastning_LOM: {
          cf_lom_usd: cfLomUSD,
          initial_capex_abs: finite(initialCapexUSD) ? Math.abs(initialCapexUSD) : null,
          multiple: kapitalavkastningLom,
          displayValue: formatDebugDisplay(kapitalavkastningLom, 'multiple'),
          unit: 'multiple',
          failure_reason: kapitalReason,
        },
        Kapitalavkastning_per_Year: {
          cf_lom_usd: cfLomUSD,
          LOM: prodYears,
          initial_capex_abs: finite(initialCapexUSD) ? Math.abs(initialCapexUSD) : null,
          perYear: kapitalavkastningPerYear,
          displayValue: formatDebugDisplay(kapitalavkastningPerYear, 'multiple_per_year'),
          unit: 'multiple_per_year',
          failure_reason: kapitalPerYearReason,
        },
        ROI_10Y: {
          cf_10y_usd: roi10yNumerator,
          initial_capex_abs: finite(initialCapexUSD) ? Math.abs(initialCapexUSD) : null,
          multiple: roi10y,
          displayValue: formatDebugDisplay(roi10y, 'multiple'),
          unit: 'multiple',
          failure_reason: roi10y !== null
            ? null
            : (tp === null
              ? 'Missing tp'
              : (initialCapexUSD === null
                ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD')
                : (roi10yNumerator === null ? 'Missing finite fcfUSD in 10Y window' : 'Denominator is 0'))),
        },
      },
      ui_unit_meta: {
        ROI_10Y: { unitType: 'multiple', renderSuffix: 'x' },
        LOM_avg_EBIT_ROCE: { unitType: 'percent', renderSuffix: '%' },
        LOM_discounted_EBIT_ROCE: { unitType: 'percent', renderSuffix: '%' },
        LOM_avg_NOPAT_ROIC: { unitType: 'percent', renderSuffix: '%' },
        Kapitalavkastning_LOM: { unitType: 'multiple', renderSuffix: 'x' },
        Kapitalavkastning_per_Year: { unitType: 'multiple_per_year', renderSuffix: 'x/år' },
      },
    },
  };
}
