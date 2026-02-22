import { useEffect, useMemo, useState } from "react";
import Admin from "./Admin";
import Viewer from "./Viewer";
import ChartCard from "./ChartCard";
import CompanyPicker from "./CompanyPicker";
import InfoPopover from "./InfoPopover";
import useCompanyData from "../hooks/useCompanyData";
import {
  buildSeries,
  buildSeriesData,
  buildRoeSeries,
  buildCurrentRatioSeries,
  buildDebtToEquitySeries,
  buildAdjustedDebtToEquitySeries,
  buildLongTermDebtToNetEarningsSeries,
  buildCashVsNetEarningsSeries,
  buildOperatingProfitVsDepSeries,
  buildOperatingIncomeVsInterestSeries,
  buildNetEarningsPerShareSeries,
  computeNetEarningsSeries,
  buildCapitalExpenditureVsNetEarningsSeries,
  buildBuybacksDividendsSeries,
  buildRevenueGrowthSeries,
  buildFreeCashFlowPerShareSeries,
} from "../utils/financial";

const CATEGORIES = ["Välj En Kategori", "Tech", "Industrials", "Consumer"];
const SUBCATEGORIES = ["Välj En Subkategori", "Software", "Hardware", "Services"];



type ProducerCorePanel = {
  efficiency?: {
    margin_structure?: { operating_margin?: number | null };
    returns?: { roe?: number | null };
    balance_sheet?: { net_debt?: number | null; interest_coverage?: number | null };
  };
};

type RrOverlayPanel = {
  rr_scale_flag?: string | null;
  rr_roce_flag?: string | null;
  rr_fortress_flag?: boolean | null;
  rr_classification?: string | null;
  rr_interest_coverage?: number | null;
  rr_cost_quartile_flags?: { missing_benchmark?: boolean };
  rr_reserve_life_flags?: { missing_reserves?: boolean };
  [key: string]: unknown;
};

function formatPanelValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "—";
}



type CompactMetric = { label: string; value: unknown; info?: string[] };

function renderCompactMetrics(
  sectionKey: string,
  metrics: CompactMetric[],
  openInfoId: string | null,
  setOpenInfoId: (next: string | null | ((prev: string | null) => string | null)) => void,
) {
  return metrics.map((metric) => {
    const metricId = `${sectionKey}-${metric.label}`;
    return (
      <div key={metricId} className="compact-metric-row">
        <span className="compact-metric-label-wrap">
          <span className="compact-metric-label">{metric.label}</span>
          {metric.info && metric.info.length > 0 ? (
            <InfoPopover
              id={metricId}
              openId={openInfoId}
              onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
              onClose={() => setOpenInfoId(null)}
              title={metric.label}
              content={metric.info}
            />
          ) : null}
        </span>
        <span className="compact-metric-dots" />
        <span className="compact-metric-value">{formatPanelValue(metric.value)}</span>
      </div>
    );
  });
}

type AnalysisMode = "revenue" | "prerevenue";

function readModeFromUrl(): AnalysisMode {
  if (typeof window === "undefined") return "revenue";
  const params = new URLSearchParams(window.location.search);
  const mode = (params.get("mode") ?? "").toLowerCase();
  return mode === "prerevenue" ? "prerevenue" : "revenue";
}

const EFFICIENCY_INFO = [
  "Operational quality and capital productivity; trend quality over 5Y matters.",
  "Margins + cash conversion show structural strength vs temporary strength.",
  "OCF consistently above NI suggests higher earnings quality.",
  "If margins expand while debt rises, treat as caution.",
  "Flags summarize positive structural markers vs risk markers.",
];

const RESILIENCE_INFO = [
  "Downcycle survivability lens: leverage, liquidity, and cash-flow stability.",
  "Buffett lens: fortress balance sheet is preferred.",
  "RR lens: NetDebt/FCF below 1.5 and strong interest coverage.",
  "Metrics indicate stress survival probability, not just point-in-time strength.",
];

const VALUE_INFO = [
  "Valuation links current price to earnings power and cash generation.",
  "Syding lens: implied return approximates earnings yield plus growth.",
  "Equity-basis metrics use market cap; enterprise-basis metrics use EV.",
  "5Y medians are cycle-smoothing references for valuation context.",
];

const RR_INFO = [
  "Institutional quality filter inspired by Rick Rule.",
  "Tests scale, efficiency, and financial robustness in one panel.",
  "Cost quartile and reserve-life fields remain explicit MVP placeholders.",
  "Classification is a composite of scale, ROCE, fortress, and value context.",
];

const METRIC_INFO: Record<string, string[]> = {
  "Gross margin": ["Revenue minus direct production costs divided by revenue.", "Shows structural cost advantage and pricing power when stable."],
  "Operating margin": ["Operating income divided by revenue.", "Shows operational discipline before financing effects."],
  "Net margin": ["Net income divided by revenue.", "Shows full-cycle profitability including financing and tax impact."],
  "OCF / NI": ["Operating cash flow divided by net income.", "Above 1.0 suggests strong earnings quality."],
  "FCF / NI": ["Free cash flow relative to net income.", "Shows distributable earnings after sustaining investment."],
  "Capex / Revenue": ["Capital expenditure divided by revenue.", "Shows capital intensity and reinvestment burden."],
  "ROE": ["Net income divided by shareholder equity.", "Shows equity capital productivity."],
  "ROIC pre-tax": ["EBIT divided by invested capital.", "Shows enterprise-level capital efficiency."],
  "Shares trend 5Y": ["Compound change in shares outstanding over five years.", "Higher values can indicate dilution risk."],
  "Retained vs NI": ["Retained earnings vs cumulative net income.", "Shows whether profit retention compounds productively."],
  "Invalid capital employed": ["Sanity flag for ROCE denominator validity."],
  "EV formula check": ["Internal EV consistency check using MarketCap + Debt - Cash."],
  "Net debt / EBITDA": ["Debt relative to earnings capacity.", "Shows leverage sustainability."],
  "Interest coverage": ["EBIT divided by interest expense.", "Shows debt servicing capacity."],
  "Current ratio": ["Current assets divided by current liabilities.", "Shows short-term liquidity buffer."],
  "Cash vs short debt": ["Cash divided by short-term debt.", "Shows immediate liquidity resilience."],
  "FCF volatility 5Y": ["Std. dev. of FCF relative to mean FCF.", "Shows cyclical sensitivity."],
  "P/E": ["Price divided by earnings per share.", "Shows how much market pays per unit of earnings."],
  "Earnings yield": ["Net income divided by market cap.", "Shows implied return on current earnings."],
  "EV/EBIT": ["Enterprise value divided by operating earnings.", "Shows capital-adjusted valuation multiple."],
  "EV/FCF": ["Enterprise value divided by free cash flow.", "Shows full-capital-structure cash valuation."],
  "Implied return": ["Approximation: earnings yield + growth estimate."],
  "10Y recoverable value": ["Approx proxy: annual production * price * 10.", "Shows institutional scale suitability."],
  "ROCE": ["EBIT divided by capital employed.", "RR heuristic: above 25% can signal elite capital quality."],
  "Net debt / FCF": ["Debt relative to sustaining free cash flow.", "Lower values indicate stronger balance-sheet resilience."],
  "Margin buffer": ["(Current price - AISC) / current price.", "Shows downside protection buffer."],
  "Fair value 1": ["Owner earnings approximation using discounted operating cash proxy."],
  "Fair value 2": ["Flat 10-year DCF using margin assumption and discount rate."],
  "RR classification": ["Composite of scale, ROCE, and balance-sheet strength."],
};

const PRICE_SERIES_COLORS = {
  close: "#0b0b0b",
  sma200: "#3a3a3a",
  sma50: "#3e5f8a",
  sma20: "#4b7f5a",
};

function parseFiscalYearEndMonth(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 2) {
    return null;
  }
  const month = Number(digits.slice(0, 2));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return month;
}

function normalizeDateSeries(data: (string | number | null)[][] | null) {
  if (!data || data.length === 0) {
    return data;
  }
  const [headers, ...rows] = data;
  const normalizedRows = rows.map((row) => {
    const [rawDate, ...rest] = row;
    const parsedDate = typeof rawDate === "string" || typeof rawDate === "number"
      ? new Date(rawDate)
      : null;
    const dateValue = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
    return [dateValue, ...rest] as (string | number | Date | null)[];
  });
  return [headers, ...normalizedRows];
}

export default function SingleStockDashboard() {
  const { ticker, setTicker, loading, error, data, fetchCompany } = useCompanyData("AAPL");
  const [formTicker, setFormTicker] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [formNote, setFormNote] = useState("");
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [tickersError, setTickersError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [priceData, setPriceData] = useState<{
    long: {
      price: (string | number | Date | null)[][] | null;
      volume: (string | number | Date | null)[][] | null;
    } | null;
    short: {
      price: (string | number | Date | null)[][] | null;
      volume: (string | number | Date | null)[][] | null;
    } | null;
  } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(() => readModeFromUrl());
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const [rrAiscInput, setRrAiscInput] = useState<string>("");
  const [rrDiscountRateInput, setRrDiscountRateInput] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    async function loadPrice() {
      try {
        setPriceLoading(true);
        setPriceError(null);
        const response = await fetch(`/api/company/price?ticker=${encodeURIComponent(ticker)}`);
        const contentType = response.headers.get("content-type") ?? "";
        const rawPayload = await response.text();
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new Error(
            `Expected JSON from /api/company/price (status=${response.status}, content-type=${contentType || "unknown"}, body=${rawPayload.slice(0, 120)})`
          );
        }
        const payload = rawPayload ? JSON.parse(rawPayload) : {};
        if (!response.ok) {
          const message = String(payload.error ?? "Failed to load price data.");
          const unsupported =
            response.status === 404 || message.toLowerCase().includes("not found");
          throw new Error(unsupported ? "Ticker not supported by data provider." : message);
        }
        if (isMounted) {
          const longPayload = payload.long ?? null;
          const shortPayload = payload.short ?? null;
          setPriceData({
            long: longPayload
              ? {
                price: normalizeDateSeries(longPayload.price),
                volume: normalizeDateSeries(longPayload.volume),
              }
              : null,
            short: shortPayload
              ? {
                price: normalizeDateSeries(shortPayload.price),
                volume: normalizeDateSeries(shortPayload.volume),
              }
              : null,
          });
          if (!longPayload && !shortPayload) {
            setPriceData(null);
          }
        }
      } catch (error) {
        if (isMounted) {
          setPriceData(null);
          setPriceError((error as Error).message);
        }
      } finally {
        if (isMounted) {
          setPriceLoading(false);
        }
      }
    }

    if (ticker) {
      void loadPrice();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);


  useEffect(() => {
    function onScreeningOpen(event: Event) {
      const custom = event as CustomEvent<{ ticker?: string }>;
      const nextTicker = custom.detail?.ticker?.trim().toUpperCase();
      if (!nextTicker) {
        return;
      }
      void fetchCompany(nextTicker);
    }
    window.addEventListener("screening:open-ticker", onScreeningOpen as EventListener);
    return () => {
      window.removeEventListener("screening:open-ticker", onScreeningOpen as EventListener);
    };
  }, [fetchCompany]);

  const loadTickers = async () => {
    try {
      setTickersError(null);
      const response = await fetch("/api/company/list");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load tickers.");
      }
      const list = Array.isArray(payload.tickers) ? payload.tickers : [];
      setAvailableTickers(list);
    } catch (error) {
      setTickersError((error as Error).message);
      console.error("Failed to load tickers", error);
    }
  };

  useEffect(() => {
    void loadTickers();
  }, []);



  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("mode", analysisMode);
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [analysisMode]);
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const response = await fetch(`/api/company/profile?ticker=${encodeURIComponent(ticker)}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load company profile.");
        }
        if (isMounted) {
          setProfile(payload.profile ?? null);
        }
      } catch {
        if (isMounted) {
          setProfile(null);
        }
      }
    }

    if (ticker) {
      void loadProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);

  const revenueData = buildSeriesData(
    buildSeries(data, [{ label: "Revenue", statement: "income", field: "revenue" }]),
    10,
  );
  const revenueGrowthData = buildSeriesData(buildRevenueGrowthSeries(data), 10);
  const grossProfitRatioData = buildSeriesData(
    buildSeries(data, [{ label: "Gross Profit Ratio", statement: "income", field: "grossProfitRatio" }]),
    10,
  );
  const ebitdaMarginData = buildSeriesData(
    buildSeries(data, [{ label: "EBITDA Margin", statement: "income", field: "ebitdaratio" }]),
    10,
  );
  const netIncomeMarginData = buildSeriesData(
    buildSeries(data, [{ label: "Net Income Margin", statement: "income", field: "netIncomeRatio" }]),
    10,
  );
  const cashFromOperationsData = buildSeriesData(
    buildSeries(data, [{ label: "Operating Cash Flow", statement: "cashflow", field: "operatingCashFlow" }]),
    10,
  );
  const cashFromInvestingData = buildSeriesData(
    buildSeries(data, [{ label: "Cash From Investing", statement: "cashflow", field: "netCashUsedForInvestingActivites" }]),
    10,
  );
  const freeCashFlowData = buildSeriesData(
    buildSeries(data, [{ label: "Free Cash Flow", statement: "cashflow", field: "freeCashFlow" }]),
    10,
  );
  const freeCashFlowPerShareData = buildSeriesData(buildFreeCashFlowPerShareSeries(data), 10);
  const equityData = buildSeriesData(
    buildSeries(data, [{ label: "Total Equity", statement: "balance", field: "totalStockholdersEquity" }]),
    10,
  );
  const roeData = buildSeriesData(buildRoeSeries(data), 10);

  const sydingBaseOptions = {
    colors: ["#0b0b0b"],
    trendlines: {
      0: {
        type: "linear",
        color: "#0b0b0b",
        lineWidth: 1,
        opacity: 0.6,
      },
    },
  };

  const priceChartOptions = {
    backgroundColor: "#e0e9ce",
    colors: [
      PRICE_SERIES_COLORS.close,
      PRICE_SERIES_COLORS.sma200,
      PRICE_SERIES_COLORS.sma50,
      PRICE_SERIES_COLORS.sma20,
    ],
    legend: { position: "bottom" },
    hAxis: {
      format: "yyyy",
      slantedText: true,
      slantedTextAngle: 45,
    },
    series: {
      0: { lineWidth: 2 },
      1: { lineWidth: 1 },
      2: { lineWidth: 1 },
      3: { lineWidth: 1 },
    },
  };

  const volumeChartOptions = {
    backgroundColor: "#e0e9ce",
    colors: [PRICE_SERIES_COLORS.close],
    legend: { position: "bottom" },
    hAxis: {
      format: "yyyy",
      slantedText: true,
      slantedTextAngle: 45,
    },
    vAxis: { format: "short" },
    bar: { groupWidth: "45%" },
  };

  const lineBehindBars = {
    seriesType: "bars",
    series: {
      0: { type: "area", lineWidth: 2, color: "#0b0b0b", areaOpacity: 0.25 },
    },
    colors: ["#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b"],
    isStacked: true,
    vAxis: { format: "short" },
  };

  const revenueVsCostData = buildSeriesData(
    buildSeries(data, [
      { label: "Revenue", statement: "income", field: "revenue" },
      { label: "Cost of Revenue", statement: "income", field: "costOfRevenue" },
    ]),
    15,
  );
  const grossProfitVsExpensesData = buildSeriesData(
    buildSeries(data, [
      { label: "Gross Profit", statement: "income", field: "grossProfit" },
      { label: "Selling & Marketing", statement: "income", field: "sellingAndMarketingExpenses" },
      { label: "G&A", statement: "income", field: "generalAndAdministrativeExpenses" },
      { label: "R&D", statement: "income", field: "researchAndDevelopmentExpenses" },
      { label: "Other Expenses", statement: "income", field: "otherExpenses" },
    ]),
    15,
  );
  const operatingProfitVsDepData = buildSeriesData(buildOperatingProfitVsDepSeries(data), 15);
  const ebitVsInterestData = buildSeriesData(buildOperatingIncomeVsInterestSeries(data), 15);
  const netEarningsData = buildSeriesData(computeNetEarningsSeries(data), 15);
  const netEarningsPerShareData = buildSeriesData(buildNetEarningsPerShareSeries(data), 15);

  const cashVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "cashAndShortTermInvestments"),
    15,
  );
  const cashVsShortTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "Short Term Debt", statement: "balance", field: "shortTermDebt" },
      { label: "Cash & Short Term Investments", statement: "balance", field: "cashAndShortTermInvestments" },
    ]),
    15,
  );
  const inventoryVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "inventory"),
    15,
  );
  const ppeVsDepData = buildSeriesData(
    buildSeries(data, [
      { label: "Property Plant Equipment", statement: "balance", field: "propertyPlantEquipmentNet" },
      { label: "Depreciation", statement: "income", field: "depreciationAndAmortization" },
    ]),
    15,
  );
  const goodwillData = buildSeriesData(
    buildSeries(data, [{ label: "Goodwill", statement: "balance", field: "goodwill" }]),
    15,
  );
  const debtMixData = buildSeriesData(
    buildSeries(data, [
      { label: "Short Term Debt", statement: "balance", field: "shortTermDebt" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
    15,
  );
  const ebitdaVsLongTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "EBITDA", statement: "income", field: "ebitda" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
    15,
  );
  const currentRatioData = buildSeriesData(buildCurrentRatioSeries(data), 15);
  const longTermDebtToNetEarningsData = buildSeriesData(buildLongTermDebtToNetEarningsSeries(data), 15);
  const debtToEquityData = buildSeriesData(buildDebtToEquitySeries(data), 15);
  const adjustedDebtToEquityData = buildSeriesData(buildAdjustedDebtToEquitySeries(data), 15);
  const retainedEarningsData = buildSeriesData(
    buildSeries(data, [
      { label: "Net Income", statement: "income", field: "netIncome" },
      { label: "Retained Earnings", statement: "balance", field: "retainedEarnings" },
    ]),
    15,
  );

  const capexVsNetEarningsData = buildSeriesData(
    buildCapitalExpenditureVsNetEarningsSeries(data),
    15,
  );
  const buybacksDividendsData = buildSeriesData(
    buildBuybacksDividendsSeries(data),
    15,
  );


  const producerCore = useMemo(() => (data?.producer_core as ProducerCorePanel | undefined) ?? null, [data]);
  const rrOverlay = useMemo(() => (data?.rr_overlay as RrOverlayPanel | undefined) ?? null, [data]);
  const producerCoreMissing = !producerCore || !producerCore.efficiency;
  const rrOverlayMissing = !rrOverlay || Object.keys(rrOverlay).length === 0;
  const rrAisc = rrAiscInput.trim() ? Number(rrAiscInput) : null;
  const rrDiscountRatePct = rrDiscountRateInput.trim() ? Number(rrDiscountRateInput) : null;
  const rrDiscountRate = rrDiscountRatePct !== null && Number.isFinite(rrDiscountRatePct) && rrDiscountRatePct > 0
    ? rrDiscountRatePct / 100
    : null;
  const rrOperatingCfAdjusted = typeof (rrOverlay as any)?.rr_operating_cf_adjusted === "number"
    ? Number((rrOverlay as any).rr_operating_cf_adjusted)
    : null;
  const rrNetDebt = typeof (rrOverlay as any)?.rr_net_debt === "number" ? Number((rrOverlay as any).rr_net_debt) : null;
  const rrProduction = typeof (rrOverlay as any)?.rr_production === "number" ? Number((rrOverlay as any).rr_production) : null;
  const rrCurrentPrice = (() => {
    const rows = priceData?.short?.price;
    if (!rows || rows.length < 2) return null;
    const last = rows[rows.length - 1];
    const v = last?.[1];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  })();
  const rrFv1 = rrAisc !== null && rrDiscountRate !== null && rrOperatingCfAdjusted !== null && rrNetDebt !== null
    ? rrOperatingCfAdjusted / rrDiscountRate - rrNetDebt
    : null;
  const rrFv2 = rrAisc !== null && rrDiscountRate !== null && rrCurrentPrice !== null && rrProduction !== null && rrNetDebt !== null
    ? (() => {
      const annualMargin = (rrCurrentPrice - rrAisc) * rrProduction;
      let npv = 0;
      for (let t = 1; t <= 10; t += 1) {
        npv += annualMargin / ((1 + rrDiscountRate) ** t);
      }
      return npv - rrNetDebt;
    })()
    : null;
  const rrInputsReady = rrAisc !== null && rrDiscountRate !== null && rrDiscountRate > 0;

  const fiscalYearEndMonth =
    parseFiscalYearEndMonth(data?.fiscal_year_end_month) ??
    parseFiscalYearEndMonth(data?.fiscal_year_end) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEndMonth) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEnd);

  return (
    <div className="single-stock-dashboard">
      <div className="stock-selector">
        <div className="stock-selector-row">
          <CompanyPicker
            label="Sök bolagsnamn"
            placeholder="T.ex. Apple"
            onSelect={(company) => {
              void fetchCompany(company.symbol);
            }}
          />
          <select defaultValue={CATEGORIES[0]}>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select defaultValue={SUBCATEGORIES[0]}>
            {SUBCATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            defaultValue="Välj En Aktie"
            onChange={(event) => {
              const value = event.target.value;
              if (value !== "Välj En Aktie") {
                void fetchCompany(value);
              }
            }}
          >
            <option value="Välj En Aktie">Välj En Aktie</option>
            {availableTickers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {tickersError && <p className="status error">{tickersError}</p>}
        </div>

        <div className="stock-selector-row form">
          <div>
            <label htmlFor="tickerSymbol">Ticker</label>
            <input
              id="tickerSymbol"
              type="text"
              placeholder="AAPL"
              value={formTicker}
              onChange={(event) => setFormTicker(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="category">Kategori</label>
            <input
              id="category"
              type="text"
              placeholder="Tech"
              value={formCategory}
              onChange={(event) => setFormCategory(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="subcategory">Underkategori</label>
            <input
              id="subcategory"
              type="text"
              placeholder="Software"
              value={formSubcategory}
              onChange={(event) => setFormSubcategory(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="note">Anteckning</label>
            <input
              id="note"
              type="text"
              placeholder="Notering"
              value={formNote}
              onChange={(event) => setFormNote(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const nextTicker = formTicker.trim().toUpperCase();
              if (!nextTicker) {
                return;
              }
              void fetchCompany(nextTicker);
              setFormTicker("");
              setFormCategory("");
              setFormSubcategory("");
              setFormNote("");
            }}
          >
            Lägg till ticker
          </button>
        </div>
      </div>

      <Viewer
        ticker={ticker}
        loading={loading}
        error={error}
        data={data}
        onTickerChange={setTicker}
        onFetch={fetchCompany}
      />

      <div className="divider" />

      <div className="breadcontainersinglecolumn">
        <button
          type="button"
          className="admin-toggle"
          onClick={() => setShowAdmin((prev) => !prev)}
        >
          {showAdmin ? "Dölj admin" : "Visa admin"}
        </button>
      </div>

      {showAdmin && <Admin onTickersUpserted={loadTickers} />}

      <div className="breadcontainersinglecolumn">
        <h1 id="SingleStock_Stock_Name" className="subrub">
          {profile?.companyName ? `${profile.companyName}` : data?.ticker ?? ""}
          {data?.ticker ? ` (${data.ticker})` : ""}
        </h1>
        <p className="bread">
          {profile?.description
            ? String(profile.description)
            : "Här visas en enstaka aktie och dess analytiska instrumentbräda. Välj ticker och kör refresh i admin om data saknas."}
        </p>
      </div>

      {profile && (
        <div className="breadcontainerdoublecolumn">
          <p className="bread">Sektor: {String(profile.sector ?? "-")}</p>
          <p className="bread">Industri: {String(profile.industry ?? "-")}</p>
          <p className="bread">Valuta: {String(profile.currency ?? "-")}</p>
          <p className="bread">Börs: {String(profile.exchangeShortName ?? "-")}</p>
        </div>
      )}
      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Price History</h2>
        <p className="bread">
          Pris- och volymgrafer laddas från backend när historik finns tillgänglig.
        </p>
        {priceLoading && <p className="status">Fetching data…</p>}
        {!priceLoading && priceError && <p className="status error">{priceError}</p>}
        {!priceLoading && !priceError && !priceData && (
          <p className="status empty">No historical data available.</p>
        )}
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="LineChart"
          title="Aktieprishistoria"
          data={priceData?.long?.price ?? null}
          height={260}
          options={priceChartOptions}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="LineChart"
          title="Aktieprishistoria (kort)"
          data={priceData?.short?.price ?? null}
          height={260}
          options={priceChartOptions}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Volume"
          data={priceData?.long?.volume ?? null}
          height={200}
          options={volumeChartOptions}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Volume (kort)"
          data={priceData?.short?.volume ?? null}
          height={200}
          options={volumeChartOptions}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Mode</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={() => setAnalysisMode("revenue")} disabled={analysisMode === "revenue"}>
            Revenue (Producer)
          </button>
          <button type="button" onClick={() => setAnalysisMode("prerevenue")} disabled={analysisMode === "prerevenue"}>
            Pre-Revenue
          </button>
        </div>
      </div>

      {analysisMode === "revenue" && (
        <>
          <div className="breadcontainersinglecolumn">
            <h1 className="subrub">Producer Core (PVE v2)</h1>
            <p className="bread">Efficiency, Resilience, Value och Context snapshots för MAJOR/revenue-mode.</p>
          </div>
          {producerCoreMissing ? (
            <div className="breadcontainersinglecolumn">
              <p className="status empty">Data missing for Producer Core panel.</p>
            </div>
          ) : (
            <div className="producer-core-compact-card">
              <div className="producer-core-compact-grid">
                <section className="producer-core-section efficiency">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Efficiency</h2>
                    <InfoPopover
                      id="efficiency"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Efficiency"
                      content={EFFICIENCY_INFO}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("efficiency", [
                      { label: "Gross margin", value: (producerCore as any)?.efficiency?.margin_structure?.gross_margin, info: METRIC_INFO["Gross margin"] },
                      { label: "Operating margin", value: (producerCore as any)?.efficiency?.margin_structure?.operating_margin, info: METRIC_INFO["Operating margin"] },
                      { label: "Net margin", value: (producerCore as any)?.efficiency?.margin_structure?.net_margin, info: METRIC_INFO["Net margin"] },
                      { label: "Margin trend", value: (producerCore as any)?.efficiency?.margin_structure?.margin_trend_label },
                      { label: "OCF / NI", value: (producerCore as any)?.efficiency?.cash_quality?.ocf_to_ni, info: METRIC_INFO["OCF / NI"] },
                      { label: "FCF / NI", value: (producerCore as any)?.efficiency?.cash_quality?.fcf_to_ni, info: METRIC_INFO["FCF / NI"] },
                      { label: "Accrual", value: (producerCore as any)?.efficiency?.cash_quality?.accrual_flag },
                      { label: "Capex / Revenue", value: (producerCore as any)?.efficiency?.capital_intensity?.capex_to_revenue, info: METRIC_INFO["Capex / Revenue"] },
                      { label: "Capex / OCF", value: (producerCore as any)?.efficiency?.capital_intensity?.capex_to_ocf },
                      { label: "PPE vs Revenue", value: (producerCore as any)?.efficiency?.capital_intensity?.ppe_vs_revenue_signal },
                      { label: "Net debt", value: (producerCore as any)?.efficiency?.balance_sheet?.net_debt },
                      { label: "Net debt / EBITDA", value: (producerCore as any)?.efficiency?.balance_sheet?.net_debt_to_ebitda },
                      { label: "Interest coverage", value: (producerCore as any)?.efficiency?.balance_sheet?.interest_coverage },
                      { label: "Debt trend", value: (producerCore as any)?.efficiency?.balance_sheet?.debt_trend_label },
                      { label: "ROE", value: (producerCore as any)?.efficiency?.returns?.roe, info: METRIC_INFO["ROE"] },
                      { label: "ROIC pre-tax", value: (producerCore as any)?.efficiency?.returns?.roic_pre_tax, info: METRIC_INFO["ROIC pre-tax"] },
                      { label: "ROE trend 5Y", value: (producerCore as any)?.efficiency?.returns?.roe_trend_5Y },
                      { label: "Shares trend 5Y", value: (producerCore as any)?.efficiency?.allocation?.shares_trend_5Y, info: METRIC_INFO["Shares trend 5Y"] },
                      { label: "Retained vs NI", value: (producerCore as any)?.efficiency?.allocation?.retained_vs_ni_signal, info: METRIC_INFO["Retained vs NI"] },
                      {
                        label: "Quality flags",
                        value: Array.isArray((producerCore as any)?.efficiency?.quality_flags) && (producerCore as any).efficiency.quality_flags.length
                          ? (producerCore as any).efficiency.quality_flags.join(", ")
                          : "—",
                      },
                      {
                        label: "Risk flags",
                        value: Array.isArray((producerCore as any)?.efficiency?.risk_flags) && (producerCore as any).efficiency.risk_flags.length
                          ? (producerCore as any).efficiency.risk_flags.join(", ")
                          : "—",
                      },
                      { label: "Invalid capital employed", value: (producerCore as any)?.efficiency?.diagnostics?.invalid_capital_employed, info: METRIC_INFO["Invalid capital employed"] },
                      { label: "EV formula check", value: (producerCore as any)?.efficiency?.diagnostics?.ev_formula_check, info: METRIC_INFO["EV formula check"] },
                      { label: "Accounting anomaly", value: (producerCore as any)?.efficiency?.diagnostics?.accounting_anomaly },
                    ], openInfoId, setOpenInfoId)}
                  </div>
                </section>

                <section className="producer-core-section resilience">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Resilience</h2>
                    <InfoPopover
                      id="resilience"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Resilience"
                      content={RESILIENCE_INFO}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("resilience", [
                      { label: "Net debt", value: (producerCore as any)?.resilience?.leverage?.net_debt, info: METRIC_INFO["Net debt / EBITDA"] },
                      { label: "Net debt / EBITDA", value: (producerCore as any)?.resilience?.leverage?.net_debt_to_ebitda, info: METRIC_INFO["Net debt / EBITDA"] },
                      { label: "Interest coverage", value: (producerCore as any)?.resilience?.leverage?.interest_coverage, info: METRIC_INFO["Interest coverage"] },
                      { label: "Current ratio", value: (producerCore as any)?.resilience?.liquidity?.current_ratio, info: METRIC_INFO["Current ratio"] },
                      { label: "Cash vs short debt", value: (producerCore as any)?.resilience?.liquidity?.cash_vs_short_term_debt, info: METRIC_INFO["Cash vs short debt"] },
                      { label: "FCF volatility 5Y", value: (producerCore as any)?.resilience?.stability?.fcf_volatility_5Y, info: METRIC_INFO["FCF volatility 5Y"] },
                    ], openInfoId, setOpenInfoId)}                  </div>
                </section>

                <section className="producer-core-section value">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Value</h2>
                    <InfoPopover
                      id="value"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Value"
                      content={VALUE_INFO}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("value", [
                      { label: "P/E", value: (producerCore as any)?.value?.multiples?.pe, info: METRIC_INFO["P/E"] },
                      { label: "Earnings yield", value: (producerCore as any)?.value?.multiples?.earnings_yield, info: METRIC_INFO["Earnings yield"] },
                      { label: "P/FCF", value: (producerCore as any)?.value?.multiples?.p_fcf },
                      { label: "FCF yield", value: (producerCore as any)?.value?.multiples?.fcf_yield },
                      { label: "EV/EBITDA", value: (producerCore as any)?.value?.multiples?.ev_ebitda },
                      { label: "EV/EBIT", value: (producerCore as any)?.value?.multiples?.ev_ebit, info: METRIC_INFO["EV/EBIT"] },
                      { label: "EV/FCF", value: (producerCore as any)?.value?.multiples?.ev_fcf, info: METRIC_INFO["EV/FCF"] },
                      { label: "Net debt / EV", value: (producerCore as any)?.value?.multiples?.net_debt_over_ev },
                      { label: "Median NI (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_ni },
                      { label: "Median EBIT margin (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_ebit_margin },
                      { label: "Median FCF (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_fcf },
                      { label: "Implied return", value: (producerCore as any)?.value?.implied_return, info: METRIC_INFO["Implied return"] },
                      { label: "Value band", value: (producerCore as any)?.value?.value_band },
                    ], openInfoId, setOpenInfoId)}                  </div>
                </section>
              </div>

              <div className="producer-core-divider" />

              <section className="producer-core-section rr-snapshot">
                <div className="producer-core-title-row">
                  <h2 className="subrub small">RR Snapshot (Commodity Strength — MVP)</h2>
                  <InfoPopover
                    id="rr"
                    openId={openInfoId}
                    onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                    onClose={() => setOpenInfoId(null)}
                    title="RR Snapshot"
                    content={RR_INFO}
                  />
                </div>
                <p className="bread">MVP proxies. Missing benchmark/reserve inputs visas som null + flags.</p>
                <div className="rr-input-row">
                  <label>AISC (USD per unit)
                    <input value={rrAiscInput} onChange={(e) => setRrAiscInput(e.target.value)} placeholder="e.g. 950" />
                  </label>
                  <label>Discount rate r (%)
                    <input value={rrDiscountRateInput} onChange={(e) => setRrDiscountRateInput(e.target.value)} placeholder="e.g. 10" />
                  </label>
                </div>
                {!rrInputsReady && <p className="status empty">Provide AISC and discount rate to activate</p>}
                {rrInputsReady && rrProduction === null && <p className="status empty">Production data missing – FV2 disabled</p>}
                {rrOverlayMissing ? (
                  <p className="status empty">Data missing for RR Snapshot panel.</p>
                ) : (
                  <div className="rr-grid">
                    <div className="rr-group">
                      <h4>Scale</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-scale", [
                          { label: "10Y recoverable value", value: (rrOverlay as any)?.rr_scale_10y_recoverable_value_usd, info: METRIC_INFO["10Y recoverable value"] },
                          { label: "Scale flag", value: rrOverlay?.rr_scale_flag ?? "Unknown" },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Capital</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-capital", [
                          { label: "ROCE", value: (rrOverlay as any)?.rr_roce, info: METRIC_INFO["ROCE"] },
                          { label: "ROCE flag", value: rrOverlay?.rr_roce_flag ?? "Unknown" },
                          { label: "Margin buffer", value: rrCurrentPrice !== null && rrAisc !== null && rrCurrentPrice !== 0 ? (rrCurrentPrice - rrAisc) / rrCurrentPrice : (rrOverlay as any)?.rr_margin_buffer_pct, info: METRIC_INFO["Margin buffer"] },
                          { label: "Cost quartile", value: (rrOverlay as any)?.rr_cost_quartile },
                          { label: "Reserve life", value: (rrOverlay as any)?.rr_reserve_life_years },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Balance sheet</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-balance", [
                          { label: "Net debt / FCF", value: (rrOverlay as any)?.rr_net_debt_fcf, info: METRIC_INFO["Net debt / FCF"] },
                          { label: "Interest coverage", value: rrOverlay?.rr_interest_coverage, info: METRIC_INFO["Interest coverage"] },
                          { label: "Missing benchmark", value: rrOverlay?.rr_cost_quartile_flags?.missing_benchmark ?? false },
                          { label: "Missing reserves", value: rrOverlay?.rr_reserve_life_flags?.missing_reserves ?? false },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Fair value</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-fv", [
                          { label: "Fair value 1", value: rrFv1, info: METRIC_INFO["Fair value 1"] },
                          { label: "Fair value 2", value: rrProduction === null ? null : rrFv2, info: METRIC_INFO["Fair value 2"] },
                          { label: "Fair value 3", value: "Disabled in revenue mode" },
                          { label: "RR classification", value: rrOverlay?.rr_classification, info: METRIC_INFO["RR classification"] },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Sydings Analytik</h1>
        <p className="bread">
          Sydings Analytik visar marginaler och kassaflöden över tid för att bedöma varaktig
          lönsamhet. Data hämtas via backendens materialiserade årsdata efter “Refresh Ticker”.
        </p>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Revenue"
          data={revenueData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Revenue Growth"
          data={revenueGrowthData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Gross Profit Ratio"
          data={grossProfitRatioData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="EBITDA Margin"
          data={ebitdaMarginData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Net Income Margin"
          data={netIncomeMarginData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Operating Cash Flow"
          data={cashFromOperationsData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Cash From Investing"
          data={cashFromInvestingData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Free Cash Flow"
          data={freeCashFlowData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Free Cash Flow/Share"
          data={freeCashFlowPerShareData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Total Equity"
          data={equityData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="ROE"
          data={roeData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
      </div>

      </>
      )}

      {analysisMode === "prerevenue" && (
        <div className="breadcontainersinglecolumn">
          <h1 className="subrub">Pre-Revenue</h1>
          <p className="bread">Pre-revenue view uses existing project/dilution/runway logic unchanged.</p>
        </div>
      )}

      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Buffetologisk Analytik</h1>
        <p className="bread">
          Buffetologi jämför intäkter, kostnader och kapitalstruktur för att förstå bolagets
          uthållighet. Graferna speglar samma legacy‑modell, men drivs nu av backendens
          årsvisa datapunkter.
        </p>
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Income Statement</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Revenue vs Cost of Revenue"
          data={revenueVsCostData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Gross Profit vs Expenses"
          data={grossProfitVsExpensesData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Operating Profit vs Depreciation"
          data={operatingProfitVsDepData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="EBIT vs Interest"
          data={ebitVsInterestData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Net Earnings"
          data={netEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Revenue vs Net Earnings per Share"
          data={netEarningsPerShareData}
          options={lineBehindBars}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Balance Sheet</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Cash vs Net Earnings"
          data={cashVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Cash vs Short Term Debt"
          data={cashVsShortTermDebtData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Net Earnings vs Inventory"
          data={inventoryVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="PPE vs Depreciation"
          data={ppeVsDepData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Goodwill"
          data={goodwillData}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Short Term vs Long Term Debt"
          data={debtMixData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="EBITDA vs Long Term Debt"
          data={ebitdaVsLongTermDebtData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Current Ratio"
          data={currentRatioData}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Long Term Debt to Net Earnings"
          data={longTermDebtToNetEarningsData}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Debt to Equity"
          data={debtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Adjusted Debt to Equity"
          data={adjustedDebtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Retained Earnings vs Net Income"
          data={retainedEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="ROE"
          data={roeData}
          options={{ vAxis: { format: "percent" } }}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Cashflow Statement</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Capital Expenditure vs Net Earnings"
          data={capexVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Buybacks + Dividends vs Net Earnings"
          data={buybacksDividendsData}
          options={lineBehindBars}
        />
      </div>
    </div>
  );
}
