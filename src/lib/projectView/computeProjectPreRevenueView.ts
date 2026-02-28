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

export type MetricValue = { value: NullableNumber; nullReason: string | null };

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
};

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function mv(value: NullableNumber, reason: string | null = null): MetricValue {
  return { value: finite(value) ? value : null, nullReason: finite(value) ? null : reason ?? 'Missing required input.' };
}

function sumRange(values: Series, start = 0, end = values.length - 1): NullableNumber {
  if (start < 0 || end >= values.length || end < start) return null;
  let sum = 0;
  for (let i = start; i <= end; i += 1) {
    const v = values[i];
    if (!finite(v)) return null;
    sum += v;
  }
  return sum;
}

function discountToToday(t: number, discountRate: number): number {
  return 1 / ((1 + discountRate) ** t);
}

function deriveInitialCapexUSD(capexUSD: Series, tp: number | null): NullableNumber {
  if (!Number.isInteger(tp) || tp === null) return null;
  let found = false;
  let sum = 0;
  for (let i = 0; i < tp; i += 1) {
    const v = capexUSD[i];
    if (!finite(v)) return null;
    if (v < 0) {
      found = true;
      sum += -v;
    }
  }
  return found ? sum : null;
}

function avg(values: Array<number>): NullableNumber {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function computeProjectViewMetrics(input: ProjectViewInputs): ProjectViewMetrics {
  const fx = finite(input.fxUSDToTarget) && input.fxUSDToTarget > 0 ? input.fxUSDToTarget : null;
  const sharesCurrent = finite(input.sharesCurrent) && input.sharesCurrent > 0 ? input.sharesCurrent : null;
  const priceCurrent = finite(input.priceCurrentTarget) && input.priceCurrentTarget > 0 ? input.priceCurrentTarget : null;
  const cashCurrent = finite(input.cashCurrentTarget) ? input.cashCurrentTarget : null;
  const debtCurrent = finite(input.debtCurrentTarget) ? input.debtCurrentTarget : null;
  const enterpriseAdjustments = finite(input.enterpriseAdjustmentsTarget) ? input.enterpriseAdjustmentsTarget : 0;

  const debtFrac = Math.max(0, Math.min(1, input.financing.debtPct / 100));
  const equityFracRaw = Math.max(0, Math.min(1, input.financing.equityPct / 100));
  const normBase = debtFrac + equityFracRaw;
  const equityFrac = normBase > 0 ? equityFracRaw / normBase : 1;
  const normDebtFrac = normBase > 0 ? debtFrac / normBase : 0;

  const initialCapexUSD = deriveInitialCapexUSD(input.capexUSD, input.productionStartPeriod);
  const initialCapexTarget = initialCapexUSD !== null && fx !== null ? initialCapexUSD * fx : null;
  const cashUsedTarget = initialCapexTarget !== null && cashCurrent !== null
    ? Math.min(Math.max(0, input.financing.cashUsedInput), cashCurrent)
    : null;
  const remainingNeedTarget = initialCapexTarget !== null && cashUsedTarget !== null ? Math.max(0, initialCapexTarget - cashUsedTarget) : null;
  const debtAddedTarget = remainingNeedTarget !== null ? remainingNeedTarget * normDebtFrac : null;
  const equityRaiseTarget = remainingNeedTarget !== null ? remainingNeedTarget * equityFrac : null;
  const newShares = equityRaiseTarget !== null && priceCurrent !== null ? equityRaiseTarget / priceCurrent : null;
  const sharesPf = sharesCurrent !== null ? sharesCurrent + (newShares ?? 0) : null;
  const debtT0 = debtCurrent !== null ? debtCurrent + (debtAddedTarget ?? 0) : null;
  const cashT0 = cashCurrent !== null && cashUsedTarget !== null ? cashCurrent - cashUsedTarget : null;

  const marketCapCurrent = sharesCurrent !== null && priceCurrent !== null ? sharesCurrent * priceCurrent : null;
  const evTarget = marketCapCurrent !== null && debtT0 !== null && cashT0 !== null
    ? marketCapCurrent + debtT0 - cashT0 + enterpriseAdjustments
    : null;

  const npvTodayUSD = (() => {
    const tValues: number[] = [];
    for (let i = 0; i < input.fcfUSD.length; i += 1) {
      const v = input.fcfUSD[i];
      if (!finite(v)) return null;
      tValues.push(v * discountToToday(i, 0.05));
    }
    return tValues.reduce((s, v) => s + v, 0);
  })();
  const npvTarget = npvTodayUSD !== null && fx !== null ? npvTodayUSD * fx : null;
  const navTarget = npvTarget !== null && cashT0 !== null && debtT0 !== null ? npvTarget + (cashT0 - debtT0) : null;
  const cfLomUSD = sumRange(input.fcfUSD, 0, input.fcfUSD.length - 1);
  const cfLomTarget = cfLomUSD !== null && fx !== null ? cfLomUSD * fx : null;

  const tp = Number.isInteger(input.productionStartPeriod) ? (input.productionStartPeriod as number) : null;
  const dcfProdStartExCapexUSD = tp !== null ? (() => {
    let sum = 0;
    for (let i = tp; i < input.fcfUSD.length; i += 1) {
      const v = input.fcfUSD[i];
      if (!finite(v)) return null;
      sum += v / ((1 + 0.05) ** (i - tp));
    }
    return sum;
  })() : null;
  const dcfProdStartPresentUSD = dcfProdStartExCapexUSD !== null && tp !== null ? dcfProdStartExCapexUSD * discountToToday(tp, 0.05) : null;
  const dcfTarget = dcfProdStartPresentUSD !== null && fx !== null ? dcfProdStartPresentUSD * fx : null;
  const aueqLom = sumRange(input.payableAuEqOz, 0, input.payableAuEqOz.length - 1);
  const prodYears = tp !== null ? Math.max(1, input.payableAuEqOz.length - tp) : null;
  const aueqYr = aueqLom !== null && prodYears !== null ? aueqLom / prodYears : null;
  const aiscLom = (() => {
    const costs: number[] = [];
    for (let i = 0; i < input.sustainingCostUSD.length; i += 1) {
      const v = input.sustainingCostUSD[i];
      if (finite(v)) costs.push(v);
    }
    return costs.length > 0 ? avg(costs as number[]) : null;
  })();
  const capexPerAnnual = initialCapexUSD !== null && aueqYr !== null && aueqYr > 0 ? initialCapexUSD / aueqYr : null;

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
  const irr = null;
  const ebitFinite = input.ebitUSD.filter((v): v is number => finite(v));
  const avgEbit = ebitFinite.length > 0 ? avg(ebitFinite) : null;

  return {
    marketBox: {
      marketCapCurrent: mv(marketCapCurrent, 'Missing market price or current shares.'),
      evCurrent: mv(evTarget, 'Requires MarketCap, debt_t0, cash_t0.'),
      sharesCurrent: mv(sharesCurrent, 'Current shares missing.'),
      sharesPf: mv(sharesPf, 'Post-financing shares unavailable.'),
    },
    list2: {
      NPV_Target: mv(npvTarget, 'NPV requires FCF series and FX.'),
      NPV_perShare: mv(npvTarget !== null && sharesPf !== null && sharesPf > 0 ? npvTarget / sharesPf : null, 'Needs NPV_Target and shares PF.'),
      NAV_Target: mv(navTarget, 'NAV needs NPV_Target, cash_t0, debt_t0.'),
      NAV_perShare: mv(navTarget !== null && sharesPf !== null && sharesPf > 0 ? navTarget / sharesPf : null, 'Needs NAV_Target and shares PF.'),
      CF_LOM_Target: mv(cfLomTarget, 'CF LOM requires FCF series and FX.'),
      DCF_Target: mv(dcfTarget, 'Requires production start, FCF series and FX.'),
      DCF_perShare: mv(dcfTarget !== null && sharesPf !== null && sharesPf > 0 ? dcfTarget / sharesPf : null, 'Needs DCF_Target and shares PF.'),
      EV_over_NPV: mv(evTarget !== null && npvTarget !== null && npvTarget !== 0 ? evTarget / npvTarget : null, 'Needs EV and NPV.'),
      EV_over_NAV: mv(evTarget !== null && navTarget !== null && navTarget !== 0 ? evTarget / navTarget : null, 'Needs EV and NAV.'),
      P_over_NAV: mv(marketCapCurrent !== null && navTarget !== null && navTarget !== 0 ? marketCapCurrent / navTarget : null, 'Needs MarketCap and NAV.'),
      NPV_over_ETLV: mv(npvTodayUSD !== null && cfLomUSD !== null && cfLomUSD !== 0 ? npvTodayUSD / cfLomUSD : null, 'Needs NPV today and CF LOM USD.'),
      DCF_over_ETLV: mv(dcfProdStartPresentUSD !== null && cfLomUSD !== null && cfLomUSD !== 0 ? dcfProdStartPresentUSD / cfLomUSD : null, 'Needs DCF present and CF LOM USD.'),
      LOM: mv(prodYears, 'Production start missing.'),
      TP: mv(tp, 'Production start missing.'),
      AuEq_LOM: mv(aueqLom, 'AuEq series missing.'),
      AuEq_YR: mv(aueqYr, 'Requires AuEq LOM and LOM.'),
      AISC_LOM: mv(aiscLom, 'Sustaining cost series missing.'),
      BreakEven_AuEq: mv(aiscLom, 'Proxy uses AISC LOM.'),
      CAPEX_per_Annual_AuEq: mv(capexPerAnnual, 'Needs initial capex and annual AuEq.'),
    },
    list3: {
      Payback_approx: mv(paybackApprox, 'No payback reached in FCF path.'),
      Payback_real: mv(paybackApprox, 'Discounted path unavailable in strict mode.'),
      IRR: mv(irr, 'IRR requires valid sign change; not available.'),
      ROI_10Y: mv(null, '10Y ROI unavailable with strict null gating.'),
      LOM_avg_EBIT_ROCE: mv(avgEbit, 'EBIT series missing.'),
      LOM_discounted_EBIT_ROCE: mv(null, 'Discounted EBIT ROCE unavailable.'),
      Corporate_ROIC: mv(null, 'Corporate ROIC not provided in project scope.'),
      LOM_avg_NOPAT_ROIC: mv(null, 'NOPAT series unavailable.'),
      Kapitalavkastning_LOM: mv(null, 'Source metric unavailable.'),
      Kapitalavkastning_per_Year: mv(null, 'Source metric unavailable.'),
    },
    list4: {
      InSitu_10Y_USD: mv(inSitu10YUSD, 'Requires 10 full production years with no missing values.'),
      InSitu_10Y_perShare_USD: mv(inSitu10YUSD !== null && sharesPf !== null && sharesPf > 0 ? inSitu10YUSD / sharesPf : null, 'Needs 10Y In Situ and shares PF.'),
      EV_over_10Y_InSitu: mv(evUsd !== null && inSitu10YUSD !== null && inSitu10YUSD !== 0 ? evUsd / inSitu10YUSD : null, 'Needs EV_USD and 10Y In Situ USD.'),
      AuEq_10Y: mv(auEq10Y, 'Requires 10 full production years.'),
      AuEq_10Y_perShare: mv(auEq10Y !== null && sharesPf !== null && sharesPf > 0 ? auEq10Y / sharesPf : null, 'Needs 10Y AuEq and shares PF.'),
    },
    list5: {
      Initial_CAPEX_Target: mv(initialCapexTarget, 'No construction capex found or FX missing.'),
      cash_used_Target: mv(cashUsedTarget, 'Cash/current CAPEX unavailable.'),
      remaining_need_Target: mv(remainingNeedTarget, 'Cannot compute remaining need.'),
      Debt_Added_Target: mv(debtAddedTarget, 'Remaining need missing.'),
      Equity_Raise_Target: mv(equityRaiseTarget, 'Remaining need missing.'),
      New_Shares: mv(newShares, 'Requires equity raise and current price.'),
      debt_t0: mv(debtT0, 'Current debt missing.'),
      cash_t0: mv(cashT0, 'Current cash missing.'),
    },
    list6: {
      NAV_Mult: mv(null, 'M&A comparables not provided in current dataset.'),
      InSitu_10Y_Mult: mv(null, 'M&A comparables not provided in current dataset.'),
      AuEq_10Y_Mult: mv(null, 'M&A comparables not provided in current dataset.'),
      MA_Median: mv(null, 'M&A comparables not provided in current dataset.'),
      Premium_vs_EV: mv(null, 'M&A comparables not provided in current dataset.'),
    },
  };
}
