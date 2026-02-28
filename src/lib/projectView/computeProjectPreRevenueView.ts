export type NullableNumber = number | null;

type Series = Array<number | null>;

type FinancingInput = {
  equityPct: number;
  debtPct: number;
  cashUsedInput: number;
};

export type ProjectViewInputs = {
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

function buildEnterpriseIrrSeries(args: {
  fcfUSD: Series;
  masterN: number;
  tp: number;
  initialCapexUSD: number;
}): number[] | null {
  if (args.masterN < 0 || args.masterN >= args.fcfUSD.length) return null;
  const cashflows = args.fcfUSD.slice(0, args.masterN + 1);
  if (cashflows.length !== args.masterN + 1) return null;
  cashflows[0] = -Math.abs(args.initialCapexUSD);
  for (let t = args.tp; t <= args.masterN; t += 1) {
    const fcff = args.fcfUSD[t];
    if (!finite(fcff)) return null;
    cashflows[t] = fcff;
  }
  if (cashflows.some((v) => !finite(v))) return null;
  return cashflows as number[];
}

function computeIrr(cashFlows: number[]): NullableNumber {
  if (cashFlows.length === 0) return null;
  const hasPositive = cashFlows.some((v) => v > 0);
  const hasNegative = cashFlows.some((v) => v < 0);
  if (!hasPositive || !hasNegative) return null;
  const npv = (rate: number): number => {
    let sum = 0;
    for (let t = 0; t < cashFlows.length; t += 1) {
      sum += cashFlows[t] / ((1 + rate) ** t);
    }
    return sum;
  };

  let low = -0.99;
  let high = 1;
  let lowVal = npv(low);
  let highVal = npv(high);
  for (let i = 0; i < 20 && lowVal * highVal > 0; i += 1) {
    high *= 2;
    highVal = npv(high);
  }
  if (lowVal * highVal > 0) return null;

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const midVal = npv(mid);
    if (Math.abs(midVal) < 1e-8) return mid;
    if (lowVal * midVal <= 0) {
      high = mid;
      highVal = midVal;
    } else {
      low = mid;
      lowVal = midVal;
    }
  }
  return (low + high) / 2;
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

function ratio(num: NullableNumber, den: NullableNumber): MetricValue {
  if (!finite(num)) return mv(null, 'Missing numerator input');
  if (!finite(den)) return mv(null, 'Missing denominator input');
  if (den === 0) return mv(null, 'Denominator is 0');
  return mv(num / den, null);
}

function perShareMetric(value: NullableNumber, shares: NullableNumber, missingValueReason: string): MetricValue {
  if (!finite(value)) return mv(null, missingValueReason);
  if (!finite(shares) || shares <= 0) return mv(null, 'shares_post_financing <= 0');
  return mv(value / shares, null);
}

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

  const tenYearEnd = tp !== null ? tp + 9 : null;
  const inSitu10YUSD = tp !== null && tenYearEnd !== null && tenYearEnd < input.grossRevenueUSD.length
    ? sumRange(input.grossRevenueUSD, tp, tenYearEnd)
    : null;
  const auEq10Y = tp !== null && tenYearEnd !== null && tenYearEnd < input.payableAuEqOz.length
    ? sumRange(input.payableAuEqOz, tp, tenYearEnd)
    : null;
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

  const paybackReal = initialCapexUSD !== null && tp !== null ? (() => {
    let cum = 0;
    for (let i = tp; i < input.fcfUSD.length; i += 1) {
      const v = input.fcfUSD[i];
      if (!finite(v)) return null;
      const cumBefore = cum;
      cum += v;
      if (cum >= initialCapexUSD) {
        if (v <= 0) return null;
        const remainingBefore = initialCapexUSD - cumBefore;
        const fraction = remainingBefore / v;
        const result = (i - tp) + fraction;
        return Math.round(result * 10) / 10;
      }
    }
    return null;
  })() : null;

  const irrSeries = (
    masterN !== null
    && tp !== null
    && initialCapexUSD !== null
    && initialCapexUSD > 0
  )
    ? buildEnterpriseIrrSeries({
      fcfUSD: input.fcfUSD,
      masterN,
      tp,
      initialCapexUSD,
    })
    : null;
  const hasIrrSignChange = irrSeries !== null
    && irrSeries.some((v) => v < 0)
    && irrSeries.some((v) => v > 0);
  const irr = hasIrrSignChange && irrSeries !== null ? computeIrr(irrSeries) : null;

  if (paybackReal !== null && !hasIrrSignChange) {
    console.error('IRR series invalid despite payback');
  }

  if (paybackReal !== null && irr !== null && irr <= 0) {
    console.warn('IRR inconsistency with payback');
  }

  const roi10y = tp !== null && masterN !== null && initialCapexUSD !== null ? (() => {
    const end = Math.min(tp + 9, masterN);
    if (tp < 0 || end < tp) return null;
    let sum = 0;
    let count = 0;
    for (let i = tp; i <= end; i += 1) {
      const v = input.fcfUSD[i];
      if (finite(v)) {
        sum += v;
        count += 1;
      }
    }
    if (count === 0 || initialCapexUSD === 0) return null;
    return sum / Math.abs(initialCapexUSD);
  })() : null;

  const ebitFinite = input.ebitUSD.filter((v): v is number => finite(v));
  const avgEbit = ebitFinite.length > 0 ? avg(ebitFinite) : null;

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
            : (input.fcfUSD.slice(tp).some((v) => !finite(v)) ? 'Missing series fcfUSD' : 'No payback reached in cumulative FCFF')),
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
                : (!hasIrrSignChange
                  ? 'IRR requires valid sign change'
                  : 'IRR could not be solved')))),
      ),
      ROI_10Y: mv(
        roi10y,
        tp === null
          ? 'Missing tp'
          : (initialCapexUSD === null
            ? (capexInit.reason ?? 'Missing Initial_CAPEX_USD')
            : 'Missing finite fcfUSD in 10Y window'),
      ),
      LOM_avg_EBIT_ROCE: mv(avgEbit, 'Missing series ebitUSD'),
      LOM_discounted_EBIT_ROCE: mv(null, 'Discounted EBIT ROCE unavailable'),
      Corporate_ROIC: mv(null, 'Corporate ROIC not provided in project scope'),
      LOM_avg_NOPAT_ROIC: mv(null, 'Missing series nopatUSD'),
      Kapitalavkastning_LOM: mv(null, 'Source metric unavailable'),
      Kapitalavkastning_per_Year: mv(null, 'Source metric unavailable'),
    },
    list4: {
      LOM: mv(prodYears, tp !== null && masterN !== null && tp > masterN ? 'tp > masterN' : 'Missing tp or masterN'),
      AuEq_LOM: mv(aueqLom, tp !== null && masterN !== null && tp > masterN ? 'tp > masterN' : 'Missing series payableAuEqOz'),
      AuEq_YR: mv(aueqYr, aueqLom === null ? 'Missing AuEq_LOM' : 'Denominator is 0'),
      InSitu_10Y_USD: mv(inSitu10YUSD, tp === null ? 'Missing tp' : (masterN !== null && tp > masterN ? 'tp > masterN' : 'Missing series grossRevenue_USD in 10Y window')),
      InSitu_10Y_perShare_USD: ratio(inSitu10YUSD, sharesPf),
      EV_over_10Y_InSitu: ratio(evUsd, inSitu10YUSD),
      AuEq_10Y: mv(auEq10Y, tp === null ? 'Missing tp' : 'Missing series payableAuEqOz in 10Y window'),
      AuEq_10Y_perShare: ratio(auEq10Y, sharesPf),
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
    },
  };
}
