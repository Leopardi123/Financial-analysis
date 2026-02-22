export type StatementMap = Record<string, Array<number | null> | undefined>;

export type ProducerInput = {
  income: StatementMap;
  balance: StatementMap;
  cashflow: StatementMap;
  fiscalDates: string[];
  years: number[];
  price?: number | null;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
  macro_flags?: string[];
  sector_flags?: string[];
  cycle_flags?: string[];
};

type NumberLike = number | null;

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickSeries(source: StatementMap, fields: string[]): Array<number | null> {
  for (const field of fields) {
    const series = source[field];
    if (Array.isArray(series)) {
      return series.map((value) => safeNumber(value));
    }
  }
  return [];
}

function latest(series: Array<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function sumLast(series: Array<number | null>, count: number): number | null {
  if (series.length < count) return null;
  const slice = series.slice(-count);
  if (slice.some((v) => v === null)) return null;
  return slice.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}

function safeDiv(numerator: NumberLike, denominator: NumberLike): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function abs(value: number | null): number | null {
  return value === null ? null : Math.abs(value);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stddev(values: number[]): number | null {
  const avg = mean(values);
  if (avg === null || values.length < 2) return null;
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function slope(values: Array<number | null>): number | null {
  const points = values
    .map((value, index) => (value === null ? null : { x: index + 1, y: value }))
    .filter((v): v is { x: number; y: number } => v !== null);
  if (points.length < 2) return null;
  const xMean = points.reduce((acc, p) => acc + p.x, 0) / points.length;
  const yMean = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  const num = points.reduce((acc, p) => acc + (p.x - xMean) * (p.y - yMean), 0);
  const den = points.reduce((acc, p) => acc + (p.x - xMean) ** 2, 0);
  if (den === 0) return null;
  return num / den;
}

function cagr(series: Array<number | null>, periods: number): number | null {
  if (series.length < periods) return null;
  const slice = series.slice(-periods);
  const start = slice[0];
  const end = slice[slice.length - 1];
  if (start === null || end === null || start <= 0) return null;
  return (end / start) ** (1 / (slice.length - 1)) - 1;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function latestMarketCap(input: ProducerInput, sharesSeries: Array<number | null>): number | null {
  if (input.marketCap != null) return input.marketCap;
  const marketCapSeries = pickSeries(input.balance, ["marketCap"]).concat(pickSeries(input.income, ["marketCap"]));
  const direct = latest(marketCapSeries);
  if (direct !== null) return direct;
  const price = input.price ?? null;
  const shares = latest(sharesSeries) ?? input.sharesOutstanding ?? null;
  if (price === null || shares === null) return null;
  return price * shares;
}

export function computeProducerCore(input: ProducerInput) {
  const revenue = pickSeries(input.income, ["revenue"]);
  const grossProfit = pickSeries(input.income, ["grossProfit"]);
  const operatingIncome = pickSeries(input.income, ["operatingIncome"]);
  const netIncome = pickSeries(input.income, ["netIncome"]);
  const interestExpense = pickSeries(input.income, ["interestExpense"]);
  const ebitda = pickSeries(input.income, ["ebitda", "EBITDA"]);

  const operatingCashFlow = pickSeries(input.cashflow, ["operatingCashFlow"]);
  const freeCashFlow = pickSeries(input.cashflow, ["freeCashFlow"]);
  const capex = pickSeries(input.cashflow, ["capitalExpenditure"]);

  const totalAssets = pickSeries(input.balance, ["totalAssets"]);
  const totalCurrentLiabilities = pickSeries(input.balance, ["totalCurrentLiabilities"]);
  const cash = pickSeries(input.balance, ["cashAndCashEquivalents", "cashAndShortTermInvestments", "cashAndCashEquivalentsAtCarryingValue"]);
  const totalDebt = pickSeries(input.balance, ["totalDebt"]);
  const shortTermDebt = pickSeries(input.balance, ["shortTermDebt"]);
  const longTermDebt = pickSeries(input.balance, ["longTermDebt"]);
  const equity = pickSeries(input.balance, ["totalStockholdersEquity"]);
  const currentAssets = pickSeries(input.balance, ["totalCurrentAssets"]);
  const sharesFromIncome = pickSeries(input.income, ["weightedAverageShsOut", "weightedAverageShsOutDil"]);
  const sharesFromBalance = pickSeries(input.balance, ["commonStockSharesOutstanding", "sharesOutstanding", "weightedAverageShsOut"]);
  const shares = sharesFromIncome.length > 0 ? sharesFromIncome : sharesFromBalance;
  const retainedEarnings = pickSeries(input.balance, ["retainedEarnings"]);
  const ppe = pickSeries(input.balance, ["propertyPlantEquipmentNet"]);

  const annualCount = input.years.length;
  const needed5Y = 5;

  const latestDebt = latest(totalDebt) ?? ((latest(shortTermDebt) ?? 0) + (latest(longTermDebt) ?? 0) || null);
  const latestCash = latest(cash);
  const netDebt = latestDebt === null || latestCash === null ? null : latestDebt - latestCash;
  const latestEbitda = latest(ebitda);

  const ebitTtm = sumLast(operatingIncome, 4) ?? latest(operatingIncome);
  const interestTtm = sumLast(interestExpense, 4) ?? latest(interestExpense);

  const capitalEmployed = latest(totalAssets) !== null && latest(totalCurrentLiabilities) !== null
    ? (latest(totalAssets) as number) - (latest(totalCurrentLiabilities) as number)
    : null;
  const invalidCapitalEmployed = capitalEmployed !== null && capitalEmployed <= 0;
  const roce = invalidCapitalEmployed ? null : safeDiv(ebitTtm, capitalEmployed);

  const investedCapitalExCash = latest(totalAssets) !== null && latest(totalCurrentLiabilities) !== null && latestCash !== null
    ? (latest(totalAssets) as number) - (latest(totalCurrentLiabilities) as number) - latestCash
    : null;
  const invalidInvestedCapital = investedCapitalExCash !== null && investedCapitalExCash <= 0;

  const marketCap = latestMarketCap(input, shares);
  const ev = marketCap !== null && latestDebt !== null && latestCash !== null ? marketCap + latestDebt - latestCash : null;

  const latestRevenue = latest(revenue);
  const latestGrossProfit = latest(grossProfit);
  const latestOperatingIncome = latest(operatingIncome);
  const latestNetIncome = latest(netIncome);

  const operatingMargin = safeDiv(latestOperatingIncome, latestRevenue);
  const marginSlope = annualCount >= needed5Y ? slope(revenue.map((_, idx) => safeDiv(operatingIncome[idx] ?? null, revenue[idx] ?? null))) : null;

  const ocfToNi = safeDiv(latest(operatingCashFlow), latestNetIncome);
  const fcfToNi = safeDiv(latest(freeCashFlow), latestNetIncome);

  const windows = annualCount >= needed5Y ? 5 : 0;
  const ocfLast = windows ? operatingCashFlow.slice(-5) : [];
  const niLast = windows ? netIncome.slice(-5) : [];
  const accrualCount = ocfLast.reduce<number>((acc, v, i) => (v !== null && niLast[i] !== null && v < (niLast[i] as number) ? acc + 1 : acc), 0);
  const accrualFlag = windows ? accrualCount >= 3 : false;

  const capexAbsLatest = abs(latest(capex));
  const capexToRevenue = safeDiv(capexAbsLatest, latestRevenue);
  const capexToOcf = safeDiv(capexAbsLatest, latest(operatingCashFlow));
  const ppeGrowth = annualCount >= needed5Y ? cagr(ppe, 5) : null;
  const revenueGrowth = annualCount >= needed5Y ? cagr(revenue, 5) : null;

  let ppeSignal: string | null = null;
  if (ppeGrowth !== null && revenueGrowth !== null) {
    if (ppeGrowth - revenueGrowth > 0.05) ppeSignal = "overinvestment_risk";
    else if (Math.abs(ppeGrowth - revenueGrowth) <= 0.02) ppeSignal = "balanced";
    else ppeSignal = "neutral";
  }

  const roe = safeDiv(latestNetIncome, latest(equity));
  const roicPreTax = invalidInvestedCapital ? null : safeDiv(ebitTtm, investedCapitalExCash);
  const roeTrend5Y = annualCount >= needed5Y ? slope(netIncome.map((value, idx) => safeDiv(value, equity[idx] ?? null))) : null;
  const sharesTrend5Y = annualCount >= needed5Y ? cagr(shares, 5) : null;

  let retainedSignal: string | null = null;
  if (retainedEarnings.length >= needed5Y && netIncome.length >= needed5Y) {
    const retainedGrowth = (retainedEarnings[retainedEarnings.length - 1] ?? 0) - (retainedEarnings[retainedEarnings.length - 5] ?? 0);
    const cumulativeNi = netIncome.slice(-5).reduce<number>((acc, value) => acc + (value ?? 0), 0);
    retainedSignal = retainedGrowth < cumulativeNi ? "leakage" : "retained";
  }

  const interestCoverage = interestTtm !== null && interestTtm > 0 ? safeDiv(ebitTtm, interestTtm) : null;

  const netDebtSeries = totalDebt.map((value, idx) => {
    const debtV = value ?? ((shortTermDebt[idx] ?? 0) + (longTermDebt[idx] ?? 0));
    const cashV = cash[idx];
    return debtV === null || cashV === null ? null : debtV - cashV;
  });
  const debtTrend = annualCount >= needed5Y ? slope(netDebtSeries.slice(-5)) : null;
  const debtTrendLabel = debtTrend === null ? "stable" : debtTrend > 0 ? "increasing" : debtTrend < 0 ? "decreasing" : "stable";

  const fcfLast = windows ? freeCashFlow.slice(-5) : [];
  const fcfNegCount = fcfLast.reduce<number>((acc, value) => (value !== null && value < 0 ? acc + 1 : acc), 0);

  const latestShares = latest(shares) ?? input.sharesOutstanding ?? null;
  const latestFcf = latest(freeCashFlow);
  const latestPrice = input.price ?? null;
  const eps = latestNetIncome !== null && latestShares !== null && latestShares > 0 ? latestNetIncome / latestShares : null;
  const pe = latestPrice !== null && eps !== null && latestNetIncome !== null && latestNetIncome > 0 ? latestPrice / eps : null;
  const earningsYield = marketCap !== null && marketCap > 0 ? safeDiv(latestNetIncome, marketCap) : null;
  const pFcf = marketCap !== null && marketCap > 0 && latestFcf !== null && latestFcf > 0 ? marketCap / latestFcf : null;
  const fcfYield = marketCap !== null && marketCap > 0 ? safeDiv(latestFcf, marketCap) : null;
  const evEbitda = ev !== null && latestEbitda !== null && latestEbitda > 0 ? ev / latestEbitda : null;
  const evEbit = ev !== null && ebitTtm !== null && ebitTtm > 0 ? ev / ebitTtm : null;
  const evFcf = ev !== null && latestFcf !== null && latestFcf > 0 ? ev / latestFcf : null;
  const netDebtOverEv = ev !== null && ev > 0 ? safeDiv(netDebt, ev) : null;

  const quality_flags: string[] = [];
  const risk_flags: string[] = [];
  if (windows && accrualCount <= 2) quality_flags.push("ocf_ge_ni_3y");
  if (roe !== null && roe > 0.15) quality_flags.push("roe_above_15pct");
  if (debtTrendLabel === "decreasing") quality_flags.push("net_debt_decreasing");
  if (marginSlope !== null && marginSlope >= 0) quality_flags.push("margins_expanding_or_stable");
  if (sharesTrend5Y !== null && sharesTrend5Y <= 0) quality_flags.push("non_dilutive_shares");

  if (windows && fcfNegCount >= 3) risk_flags.push("fcf_negative_flag");
  if (debtTrendLabel === "increasing" && operatingMargin !== null && operatingMargin > 0.2) risk_flags.push("debt_up_high_margin_period");
  if (marginSlope !== null && marginSlope < -0.02) risk_flags.push("margin_compression");
  if (accrualFlag) risk_flags.push("accrual_flag");
  if (sharesTrend5Y !== null && sharesTrend5Y > 0.03) risk_flags.push("dilution_flag");

  const producer_core = {
    efficiency: {
      margin_structure: {
        gross_margin: safeDiv(latestGrossProfit, latestRevenue),
        operating_margin: operatingMargin,
        net_margin: safeDiv(latestNetIncome, latestRevenue),
        margin_trend_label: marginSlope === null ? "stable" : marginSlope > 0 ? "expanding" : marginSlope < 0 ? "compressing" : "stable",
      },
      cash_quality: {
        ocf_to_ni: ocfToNi,
        fcf_to_ni: fcfToNi,
        accrual_flag: accrualFlag,
      },
      capital_intensity: {
        capex_to_revenue: capexToRevenue,
        capex_to_ocf: capexToOcf,
        ppe_vs_revenue_signal: ppeSignal,
      },
      balance_sheet: {
        net_debt: netDebt,
        net_debt_to_ebitda: safeDiv(netDebt, latestEbitda),
        interest_coverage: interestCoverage,
        debt_trend_label: debtTrendLabel,
      },
      returns: {
        roe,
        roic_pre_tax: roicPreTax,
        roe_trend_5Y: roeTrend5Y,
        invalid_invested_capital: invalidInvestedCapital,
      },
      allocation: {
        shares_trend_5Y: sharesTrend5Y,
        retained_vs_ni_signal: retainedSignal,
      },
      quality_flags,
      risk_flags,
      diagnostics: {
        invalid_capital_employed: invalidCapitalEmployed,
        ev_formula_check: ev,
        accounting_anomaly: latestRevenue !== null && latestGrossProfit !== null && latestOperatingIncome !== null && latestNetIncome !== null
          ? !(latestRevenue >= latestGrossProfit && latestGrossProfit >= latestOperatingIncome && latestOperatingIncome >= latestNetIncome)
          : null,
      },
    },
    resilience: {
      leverage: {
        net_debt: netDebt,
        net_debt_to_ebitda: safeDiv(netDebt, latestEbitda),
        interest_coverage: interestCoverage,
      },
      liquidity: {
        current_ratio: safeDiv(latest(currentAssets), latest(totalCurrentLiabilities)),
        cash_vs_short_term_debt: safeDiv(latestCash, latest(shortTermDebt)),
      },
      stability: {
        fcf_volatility_5Y: annualCount >= needed5Y
          ? safeDiv(stddev(freeCashFlow.slice(-5).filter((v): v is number => v !== null)), Math.abs(mean(freeCashFlow.slice(-5).filter((v): v is number => v !== null)) ?? 0))
          : null,
      },
    },
    value: {
      multiples: {
        pe,
        earnings_yield: earningsYield,
        p_fcf: pFcf,
        fcf_yield: fcfYield,
        ev_ebitda: evEbitda,
        ev_ebit: evEbit,
        ev_fcf: evFcf,
        net_debt_over_ev: netDebtOverEv,
      },
      medians_5Y: {
        median_ni: annualCount >= needed5Y ? median(netIncome.slice(-5).filter((v): v is number => v !== null)) : null,
        median_ebit_margin: annualCount >= needed5Y
          ? median(revenue.slice(-5).map((_, idx) => safeDiv(operatingIncome[operatingIncome.length - 5 + idx] ?? null, revenue[revenue.length - 5 + idx] ?? null)).filter((v): v is number => v !== null))
          : null,
        median_fcf: annualCount >= needed5Y ? median(freeCashFlow.slice(-5).filter((v): v is number => v !== null)) : null,
      },
      implied_return: (() => {
        const ey = earningsYield;
        if (ey === null || revenueGrowth === null) return null;
        return ey + revenueGrowth;
      })(),
      value_band: "unknown",
    },
    context: {
      macro_flags: input.macro_flags ?? [],
      sector_flags: input.sector_flags ?? [],
      cycle_flags: input.cycle_flags ?? [],
    },
    primitives: {
      ebit_ttm: ebitTtm,
      capital_employed: capitalEmployed,
      roce,
      market_cap: marketCap,
      ev,
      net_debt: netDebt,
      interest_coverage: interestCoverage,
      latest_annual_revenue: latestRevenue,
      operating_margin: operatingMargin,
      operating_cash_flow: latest(operatingCashFlow),
      capex_abs: capexAbsLatest,
      free_cash_flow: latest(freeCashFlow),
      interest_expense_ttm: interestTtm,
      invalid_capital_employed: invalidCapitalEmployed,
    },
  };

  return producer_core;
}
