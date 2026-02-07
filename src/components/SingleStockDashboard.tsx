import { useEffect, useState } from "react";
import Admin from "./Admin";
import Viewer from "./Viewer";
import ChartCard from "./ChartCard";
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
const STOCKS = ["Välj En Aktie", "AAPL", "MSFT", "ERIC-B.ST"];

export default function SingleStockDashboard() {
  const { ticker, setTicker, loading, error, data, fetchCompany } = useCompanyData("AAPL");
  const [formTicker, setFormTicker] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [formNote, setFormNote] = useState("");
  const [priceData, setPriceData] = useState<{
    long: { price: (string | number | null)[][]; volume: (string | number | null)[][] } | null;
    short: { price: (string | number | null)[][]; volume: (string | number | null)[][] } | null;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadPrice() {
      try {
        const response = await fetch(`/api/company/price?ticker=${encodeURIComponent(ticker)}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load price data.");
        }
        if (isMounted) {
          setPriceData({
            long: payload.long ?? null,
            short: payload.short ?? null,
          });
        }
      } catch {
        if (isMounted) {
          setPriceData(null);
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

  const revenueData = buildSeriesData(
    buildSeries(data, [{ label: "Revenue", statement: "income", field: "revenue" }]),
  );
  const revenueGrowthData = buildSeriesData(buildRevenueGrowthSeries(data));
  const grossProfitRatioData = buildSeriesData(
    buildSeries(data, [{ label: "Gross Profit Ratio", statement: "income", field: "grossProfitRatio" }]),
  );
  const ebitdaMarginData = buildSeriesData(
    buildSeries(data, [{ label: "EBITDA Margin", statement: "income", field: "ebitdaratio" }]),
  );
  const netIncomeMarginData = buildSeriesData(
    buildSeries(data, [{ label: "Net Income Margin", statement: "income", field: "netIncomeRatio" }]),
  );
  const cashFromOperationsData = buildSeriesData(
    buildSeries(data, [{ label: "Operating Cash Flow", statement: "cashflow", field: "operatingCashFlow" }]),
  );
  const cashFromInvestingData = buildSeriesData(
    buildSeries(data, [{ label: "Cash From Investing", statement: "cashflow", field: "netCashUsedForInvestingActivites" }]),
  );
  const freeCashFlowData = buildSeriesData(
    buildSeries(data, [{ label: "Free Cash Flow", statement: "cashflow", field: "freeCashFlow" }]),
  );
  const freeCashFlowPerShareData = buildSeriesData(buildFreeCashFlowPerShareSeries(data));
  const equityData = buildSeriesData(
    buildSeries(data, [{ label: "Total Equity", statement: "balance", field: "totalStockholdersEquity" }]),
  );
  const roeData = buildSeriesData(buildRoeSeries(data));

  const shortAxis = { vAxis: { format: "short" } };
  const lineBehindBars = {
    seriesType: "bars",
    series: {
      0: { type: "line", lineWidth: 2 },
    },
    colors: ["#6b7a5b", "#0f1d40", "#2b2b2b", "#4b2e2e", "#3b3f5c"],
    isStacked: true,
    vAxis: { format: "short" },
  };

  const revenueVsCostData = buildSeriesData(
    buildSeries(data, [
      { label: "Revenue", statement: "income", field: "revenue" },
      { label: "Cost of Revenue", statement: "income", field: "costOfRevenue" },
    ]),
  );
  const grossProfitVsExpensesData = buildSeriesData(
    buildSeries(data, [
      { label: "Gross Profit", statement: "income", field: "grossProfit" },
      { label: "Selling & Marketing", statement: "income", field: "sellingAndMarketingExpenses" },
      { label: "G&A", statement: "income", field: "generalAndAdministrativeExpenses" },
      { label: "R&D", statement: "income", field: "researchAndDevelopmentExpenses" },
      { label: "Other Expenses", statement: "income", field: "otherExpenses" },
    ]),
  );
  const operatingProfitVsDepData = buildSeriesData(buildOperatingProfitVsDepSeries(data));
  const ebitVsInterestData = buildSeriesData(buildOperatingIncomeVsInterestSeries(data));
  const netEarningsData = buildSeriesData(computeNetEarningsSeries(data));
  const netEarningsPerShareData = buildSeriesData(buildNetEarningsPerShareSeries(data));

  const cashVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "cashAndShortTermInvestments"),
  );
  const cashVsShortTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "Total Current Liabilities", statement: "balance", field: "totalCurrentLiabilities" },
      { label: "Cash & Short Term Investments", statement: "balance", field: "cashAndShortTermInvestments" },
    ]),
  );
  const inventoryVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "inventory"),
  );
  const ppeVsDepData = buildSeriesData(
    buildSeries(data, [
      { label: "Property Plant Equipment", statement: "balance", field: "propertyPlantEquipmentNet" },
      { label: "Depreciation", statement: "income", field: "depreciationAndAmortization" },
    ]),
  );
  const goodwillData = buildSeriesData(
    buildSeries(data, [{ label: "Goodwill", statement: "balance", field: "goodwill" }]),
  );
  const debtMixData = buildSeriesData(
    buildSeries(data, [
      { label: "Short Term Debt", statement: "balance", field: "shortTermDebt" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
  );
  const ebitdaVsLongTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "EBITDA", statement: "income", field: "ebitda" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
  );
  const currentRatioData = buildSeriesData(buildCurrentRatioSeries(data));
  const longTermDebtToNetEarningsData = buildSeriesData(buildLongTermDebtToNetEarningsSeries(data));
  const debtToEquityData = buildSeriesData(buildDebtToEquitySeries(data));
  const adjustedDebtToEquityData = buildSeriesData(buildAdjustedDebtToEquitySeries(data));
  const retainedEarningsData = buildSeriesData(
    buildSeries(data, [
      { label: "Net Income", statement: "income", field: "netIncome" },
      { label: "Retained Earnings", statement: "balance", field: "retainedEarnings" },
    ]),
  );

  const capexVsNetEarningsData = buildSeriesData(
    buildCapitalExpenditureVsNetEarningsSeries(data),
  );
  const buybacksDividendsData = buildSeriesData(
    buildBuybacksDividendsSeries(data),
  );

  return (
    <div className="single-stock-dashboard">
      <div className="stock-selector">
        <div className="stock-selector-row">
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
            defaultValue={STOCKS[0]}
            onChange={(event) => {
              const value = event.target.value;
              if (value !== STOCKS[0]) {
                void fetchCompany(value);
              }
            }}
          >
            {STOCKS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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

      <Admin />

      <div className="breadcontainersinglecolumn">
        <h1 id="SingleStock_Stock_Name" className="subrub">{data?.ticker ?? ""}</h1>
        <p className="bread">
          Här visas en enstaka aktie och dess analytiska instrumentbräda. Välj ticker och kör
          refresh i admin om data saknas.
        </p>
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Price History</h2>
        <p className="bread">
          Pris- och volymgrafer laddas från backend när historik finns tillgänglig.
        </p>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          chartType="AreaChart"
          title="Aktieprishistoria"
          data={priceData?.long?.price ?? null}
          height={260}
        />
        <ChartCard
          chartType="AreaChart"
          title="Aktieprishistoria (kort)"
          data={priceData?.short?.price ?? null}
          height={260}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Volume"
          data={priceData?.long?.volume ?? null}
          height={200}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Volume (kort)"
          data={priceData?.short?.volume ?? null}
          height={200}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Sydings Analytik</h1>
        <p className="bread">
          Här visas marginaler och kassaflöden över tid för att se varaktig lönsamhet.
        </p>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          chartType="ColumnChart"
          title="Revenue"
          data={revenueData}
          options={shortAxis}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Revenue Growth"
          data={revenueGrowthData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Gross Profit Ratio"
          data={grossProfitRatioData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          chartType="ColumnChart"
          title="EBITDA Margin"
          data={ebitdaMarginData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Net Income Margin"
          data={netIncomeMarginData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Operating Cash Flow"
          data={cashFromOperationsData}
          options={shortAxis}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Cash From Investing"
          data={cashFromInvestingData}
          options={shortAxis}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Free Cash Flow"
          data={freeCashFlowData}
          options={shortAxis}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Free Cash Flow/Share"
          data={freeCashFlowPerShareData}
          options={shortAxis}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Total Equity"
          data={equityData}
          options={shortAxis}
        />
        <ChartCard
          chartType="ColumnChart"
          title="ROE"
          data={roeData}
          options={{ vAxis: { format: "percent" } }}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Buffetologisk Analytik</h1>
        <p className="bread">
          Här jämförs intäkter, kostnader och kapitalstruktur för att förstå bolagets uthållighet.
        </p>
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Income Statement</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          chartType="ComboChart"
          title="Revenue vs Cost of Revenue"
          data={revenueVsCostData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="Gross Profit vs Expenses"
          data={grossProfitVsExpensesData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="Operating Profit vs Depreciation"
          data={operatingProfitVsDepData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="EBIT vs Interest"
          data={ebitVsInterestData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="Net Earnings"
          data={netEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
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
          chartType="ComboChart"
          title="Cash vs Net Earnings"
          data={cashVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="Cash vs Short Term Debt"
          data={cashVsShortTermDebtData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="Net Earnings vs Inventory"
          data={inventoryVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="PPE vs Depreciation"
          data={ppeVsDepData}
          options={lineBehindBars}
        />
        <ChartCard chartType="ColumnChart" title="Goodwill" data={goodwillData} />
        <ChartCard
          chartType="ComboChart"
          title="Short Term vs Long Term Debt"
          data={debtMixData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="EBITDA vs Long Term Debt"
          data={ebitdaVsLongTermDebtData}
          options={lineBehindBars}
        />
        <ChartCard chartType="ColumnChart" title="Current Ratio" data={currentRatioData} />
        <ChartCard
          chartType="ColumnChart"
          title="Long Term Debt to Net Earnings"
          data={longTermDebtToNetEarningsData}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Debt to Equity"
          data={debtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          chartType="ColumnChart"
          title="Adjusted Debt to Equity"
          data={adjustedDebtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          chartType="ComboChart"
          title="Retained Earnings vs Net Income"
          data={retainedEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
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
          chartType="ComboChart"
          title="Capital Expenditure vs Net Earnings"
          data={capexVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          chartType="ComboChart"
          title="Buybacks + Dividends vs Net Earnings"
          data={buybacksDividendsData}
          options={lineBehindBars}
        />
      </div>
    </div>
  );
}
