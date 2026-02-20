import type { CompanyResponse } from "../components/Viewer";

type StatementKey = "income" | "balance" | "cashflow";

type SeriesRow = (string | number | Date | null)[];

type SeriesResult = {
  headers: string[];
  rows: SeriesRow[];
};

const EMPTY_RESULT: SeriesResult = { headers: ["Year"], rows: [] };

function toYearLabel(year: number) {
  return year;
}

function safeNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "n/a") {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

export function getFieldSeries(
  data: CompanyResponse | null,
  statement: StatementKey,
  field: string,
): (number | null)[] {
  if (!data) {
    return [];
  }
  const source = data[statement]?.[field] ?? [];
  return source.map((value) => safeNumber(value));
}



function getEbitSeries(data: CompanyResponse | null) {
  const directEbit = getFieldSeries(data, "income", "ebit");
  const grossProfit = getFieldSeries(data, "income", "grossProfit");
  const operatingExpenses = getFieldSeries(data, "income", "operatingExpenses");
  const depreciation = getFieldSeries(data, "income", "depreciationAndAmortization");

  return (data?.years ?? []).map((_, index) => {
    const ebit = directEbit[index];
    if (typeof ebit === "number") {
      return ebit;
    }

    const gp = grossProfit[index];
    const opEx = operatingExpenses[index];
    if (typeof gp === "number" && typeof opEx === "number") {
      const dep = depreciation[index];
      // FMP can include D&A either in operatingExpenses or separately.
      // We use GP - OpEx as baseline to avoid double counting D&A by default.
      if (typeof dep === "number" && Math.abs(dep) > Math.abs(gp - opEx) * 2) {
        return gp - opEx - dep;
      }
      return gp - opEx;
    }
    return null;
  });
}

export function buildSeries(
  data: CompanyResponse | null,
  fields: Array<{ label: string; statement: StatementKey; field: string }>,
): SeriesResult {
  if (!data) {
    return EMPTY_RESULT;
  }
  const headers = ["Year", ...fields.map((item) => item.label)];
  const rows = data.years.map((year, index) => {
    const row: SeriesRow = [toYearLabel(year)];
    fields.forEach((item) => {
      const values = data[item.statement]?.[item.field] ?? [];
      row.push(safeNumber(values[index]));
    });
    return row;
  });
  return { headers, rows };
}

export function buildRevenueGrowthSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const revenue = getFieldSeries(data, "income", "revenue");
  const headers = ["Year", "Revenue Growth"];
  const rows = data.years.map((year, index) => {
    if (index === 0) {
      return [toYearLabel(year), null] as SeriesRow;
    }
    const current = revenue[index];
    const previous = revenue[index - 1];
    const growth =
      typeof current === "number" && typeof previous === "number" && previous !== 0
        ? current / previous - 1
        : null;
    return [toYearLabel(year), growth] as SeriesRow;
  });
  return { headers, rows };
}

export function computeNetEarningsSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const fallbackNetIncome = getFieldSeries(data, "income", "netIncome");
  const ebitSeries = getEbitSeries(data);
  const interestExpense = getFieldSeries(data, "income", "interestExpense");
  const interestIncome = getFieldSeries(data, "income", "interestIncome");
  const otherIncome = getFieldSeries(data, "income", "totalOtherIncomeExpensesNet");
  const incomeTax = getFieldSeries(data, "income", "incomeTaxExpense");

  const headers = ["Year", "Net Earnings"];
  const rows = data.years.map((year, index) => {
    const direct = fallbackNetIncome[index];
    if (typeof direct === "number") {
      return [toYearLabel(year), direct] as SeriesRow;
    }

    const ebit = ebitSeries[index];
    const tax = incomeTax[index];
    const intExp = interestExpense[index] ?? 0;
    const intInc = interestIncome[index] ?? 0;
    const other = otherIncome[index] ?? 0;

    const rebuilt =
      typeof ebit === "number" && typeof tax === "number"
        ? ebit - intExp + intInc + other - tax
        : null;

    return [toYearLabel(year), rebuilt] as SeriesRow;
  });

  return { headers, rows };
}

export function buildRoeSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const netIncome = getFieldSeries(data, "income", "netIncome");
  const equity = getFieldSeries(data, "balance", "totalStockholdersEquity");
  const headers = ["Year", "ROE"];
  const rows = data.years.map((year, index) => {
    const ni = netIncome[index];
    const eq = equity[index];
    const value = typeof ni === "number" && typeof eq === "number" && eq !== 0 ? ni / eq : null;
    return [toYearLabel(year), value] as SeriesRow;
  });
  return { headers, rows };
}

export function buildCurrentRatioSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const assets = getFieldSeries(data, "balance", "totalCurrentAssets");
  const liabilities = getFieldSeries(data, "balance", "totalCurrentLiabilities");
  const headers = ["Year", "Current Ratio"];
  const rows = data.years.map((year, index) => {
    const asset = assets[index];
    const liability = liabilities[index];
    const value = typeof asset === "number" && typeof liability === "number" && liability !== 0
      ? asset / liability
      : null;
    return [toYearLabel(year), value] as SeriesRow;
  });
  return { headers, rows };
}

export function buildLongTermDebtToNetEarningsSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const netEarnings = computeNetEarningsSeries(data).rows.map((row) => row[1] as number | null);
  const nonCurrentLiabilities = getFieldSeries(data, "balance", "totalNonCurrentLiabilities");
  const headers = ["Year", "Long Term Debt / Net Earnings"];
  const rows = data.years.map((year, index) => {
    const debt = nonCurrentLiabilities[index];
    const earnings = netEarnings[index];
    const value = typeof debt === "number" && typeof earnings === "number" && earnings !== 0
      ? debt / earnings
      : null;
    return [toYearLabel(year), value] as SeriesRow;
  });
  return { headers, rows };
}

export function buildDebtToEquitySeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const liabilities = getFieldSeries(data, "balance", "totalLiabilities");
  const equity = getFieldSeries(data, "balance", "totalStockholdersEquity");
  const headers = ["Year", "Debt to Equity"];
  const rows = data.years.map((year, index) => {
    const debt = liabilities[index];
    const eq = equity[index];
    const value = typeof debt === "number" && typeof eq === "number" && eq !== 0
      ? debt / eq
      : null;
    return [toYearLabel(year), value] as SeriesRow;
  });
  return { headers, rows };
}

export function buildAdjustedDebtToEquitySeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  // Equity-basis ratio: liabilities over common equity (not enterprise value debt stack).
  const liabilities = getFieldSeries(data, "balance", "totalLiabilities");
  const equity = getFieldSeries(data, "balance", "totalStockholdersEquity");
  const buybacks = getFieldSeries(data, "cashflow", "commonStockRepurchased");
  const treasuryStock = getFieldSeries(data, "balance", "treasuryStock");
  let cumulative = 0;

  const headers = ["Year", "Adjusted Debt to Equity"];
  const rows = data.years.map((year, index) => {
    const buyback = buybacks[index];
    if (typeof buyback === "number") {
      cumulative += Math.abs(buyback);
    }
    const debt = liabilities[index];
    const eq = equity[index];
    const treasury = treasuryStock[index];
    const treasuryAdj = typeof treasury === "number" ? Math.abs(treasury) : 0;
    const adjustedEquity = typeof eq === "number" ? eq + cumulative + treasuryAdj : null;
    const value =
      typeof debt === "number" && typeof adjustedEquity === "number" && adjustedEquity !== 0
        ? debt / adjustedEquity
        : null;
    return [toYearLabel(year), value] as SeriesRow;
  });
  return { headers, rows };
}

export function buildCashVsNetEarningsSeries(data: CompanyResponse | null, field: string) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const netEarnings = computeNetEarningsSeries(data).rows.map((row) => row[1] as number | null);
  const cashOrInventory = getFieldSeries(data, "balance", field);

  const headers = ["Year", "Net Earnings", field];
  const rows = data.years.map((year, index) => {
    return [
      toYearLabel(year),
      netEarnings[index] ?? null,
      cashOrInventory[index] ?? null,
    ] as SeriesRow;
  });
  return { headers, rows };
}

export function buildOperatingProfitVsDepSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const ebitSeries = getEbitSeries(data);
  const depreciation = getFieldSeries(data, "income", "depreciationAndAmortization");

  const headers = ["Year", "Operating Profit", "Depreciation"];
  const rows = data.years.map((year, index) => {
    const dep = depreciation[index];
    const operatingProfit = ebitSeries[index];
    return [toYearLabel(year), operatingProfit ?? null, dep ?? null] as SeriesRow;
  });
  return { headers, rows };
}

export function buildOperatingIncomeVsInterestSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const ebitSeries = getEbitSeries(data);
  const interestExpense = getFieldSeries(data, "income", "interestExpense");
  const interestIncome = getFieldSeries(data, "income", "interestIncome");

  const headers = ["Year", "EBIT", "Interest Expense", "Interest Income"];
  const rows = data.years.map((year, index) => {
    const ebit = ebitSeries[index];
    const interestIncomeAdjusted = typeof interestIncome[index] === "number"
      ? -interestIncome[index]
      : null;
    return [
      toYearLabel(year),
      ebit,
      interestExpense[index] ?? null,
      interestIncomeAdjusted,
    ] as SeriesRow;
  });
  return { headers, rows };
}

export function buildNetEarningsPerShareSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const netEarnings = computeNetEarningsSeries(data).rows.map((row) => row[1] as number | null);
  const shares = getFieldSeries(data, "income", "weightedAverageShsOut");
  const revenue = getFieldSeries(data, "income", "revenue");

  const headers = ["Year", "Revenue/Share", "Net Earnings/Share"];
  const rows = data.years.map((year, index) => {
    const sh = shares[index];
    const rev = revenue[index];
    const ne = netEarnings[index];
    const revPerShare = typeof rev === "number" && typeof sh === "number" && sh !== 0
      ? rev / sh
      : null;
    const nePerShare = typeof ne === "number" && typeof sh === "number" && sh !== 0
      ? ne / sh
      : null;
    return [toYearLabel(year), revPerShare, nePerShare] as SeriesRow;
  });
  return { headers, rows };
}

export function buildCapitalExpenditureVsNetEarningsSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const netEarnings = computeNetEarningsSeries(data).rows.map((row) => row[1] as number | null);
  const capex = getFieldSeries(data, "cashflow", "capitalExpenditure");

  const headers = ["Year", "Net Earnings", "Capital Expenditure"];
  const rows = data.years.map((year, index) => {
    const cap = capex[index];
    const normalizedCap = typeof cap === "number" ? Math.abs(cap) : null;
    return [toYearLabel(year), netEarnings[index] ?? null, normalizedCap] as SeriesRow;
  });
  return { headers, rows };
}

export function buildBuybacksDividendsSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const netEarnings = computeNetEarningsSeries(data).rows.map((row) => row[1] as number | null);
  const buybacks = getFieldSeries(data, "cashflow", "commonStockRepurchased");
  const dividends = getFieldSeries(data, "cashflow", "dividendsPaid");

  const headers = ["Year", "Net Earnings", "Buybacks", "Dividends"];
  const rows = data.years.map((year, index) => {
    const buyback = buybacks[index];
    const dividend = dividends[index];
    return [
      toYearLabel(year),
      netEarnings[index] ?? null,
      typeof buyback === "number" ? Math.abs(buyback) : null,
      typeof dividend === "number" ? Math.abs(dividend) : null,
    ] as SeriesRow;
  });
  return { headers, rows };
}

export function buildFreeCashFlowPerShareSeries(data: CompanyResponse | null) {
  if (!data) {
    return EMPTY_RESULT;
  }
  const freeCashFlow = getFieldSeries(data, "cashflow", "freeCashFlow");
  const shares = getFieldSeries(data, "income", "weightedAverageShsOut");

  const headers = ["Year", "Free Cash Flow/Share"];
  const rows = data.years.map((year, index) => {
    const fcf = freeCashFlow[index];
    const sh = shares[index];
    const value = typeof fcf === "number" && typeof sh === "number" && sh !== 0
      ? fcf / sh
      : null;
    return [toYearLabel(year), value] as SeriesRow;
  });
  return { headers, rows };
}

function parseRowDate(value: SeriesRow[0]) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }
  return null;
}

function selectRecentRows(rows: SeriesRow[], maxRows: number) {
  if (rows.length <= maxRows) {
    return rows;
  }
  const sorted = [...rows].sort((a, b) => {
    const aDate = parseRowDate(a[0]);
    const bDate = parseRowDate(b[0]);
    if (aDate === null || bDate === null) {
      return 0;
    }
    return aDate - bDate;
  });
  const slice = sorted.slice(sorted.length - maxRows);
  return slice;
}

export function buildSeriesData(result: SeriesResult, maxRows = 12) {
  if (!result.rows.length) {
    return null;
  }
  const normalizedRows = result.rows
    .map((row) => {
      const domain = parseRowDate(row[0]);
      if (domain === null || Number.isNaN(domain)) {
        return null;
      }
      return [domain, ...row.slice(1)] as SeriesRow;
    })
    .filter((row): row is SeriesRow => row !== null);

  if (normalizedRows.length === 0) {
    return null;
  }

  const rows = selectRecentRows(normalizedRows, maxRows);
  const hasValues = rows.some((row) => row.slice(1).some((value) => value !== null));
  if (!hasValues) {
    return null;
  }
  return [result.headers, ...rows];
}
