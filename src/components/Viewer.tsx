import { useMemo } from "react";

export type CompanyResponse = {
  ticker: string;
  period: string;
  years: number[];
  income: Record<string, Array<number | null>>;
  balance: Record<string, Array<number | null>>;
  cashflow: Record<string, Array<number | null>>;
  error?: string;
};

type Metric = {
  label: string;
  statement: "income" | "balance" | "cashflow";
  field: string;
};

const METRICS: Metric[] = [
  { label: "Revenue", statement: "income", field: "revenue" },
  { label: "Net Income", statement: "income", field: "netIncome" },
  { label: "Total Assets", statement: "balance", field: "totalAssets" },
  { label: "Operating Cash Flow", statement: "cashflow", field: "operatingCashFlow" },
];

type ViewerProps = {
  ticker: string;
  loading: boolean;
  error: string | null;
  data: CompanyResponse | null;
  onTickerChange: (value: string) => void;
  onFetch: (overrideTicker?: string) => void;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function formatValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return numberFormatter.format(value);
}

export default function Viewer({
  ticker,
  loading,
  error,
  data,
  onTickerChange,
  onFetch,
}: ViewerProps) {
  const hasData = useMemo(() => {
    if (!data || data.years.length === 0) {
      return false;
    }
    return METRICS.some((metric) => {
      const source = data[metric.statement];
      return Array.isArray(source?.[metric.field]) && source[metric.field].some((value) => value !== null);
    });
  }, [data]);

  const balanceFields = useMemo(() => {
    if (!data) {
      return [];
    }
    return Object.keys(data.balance ?? {}).sort((a, b) => a.localeCompare(b));
  }, [data]);

  return (
    <div className="viewer">
      <div className="viewer-controls">
        <div className="viewer-field">
          <label htmlFor="viewer-ticker">Ticker</label>
          <input
            id="viewer-ticker"
            value={ticker}
            onChange={(event) => onTickerChange(event.target.value)}
          />
        </div>
        <button type="button" onClick={() => onFetch()} disabled={loading}>
          {loading ? "Loading..." : "Fetch"}
        </button>
      </div>

      {error && <div className="status error">{error}</div>}

      {!hasData && !loading && (
        <div className="status empty">No data yet – run refresh below.</div>
      )}

      {hasData && data && (
        <div className="viewer-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">Metric</th>
                  {data.years.map((year) => (
                    <th key={year}>{year}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => {
                  const source = data[metric.statement];
                  const values = source?.[metric.field] ?? [];
                  return (
                    <tr key={metric.field}>
                      <td className="sticky-col">{metric.label}</td>
                      {data.years.map((year, index) => (
                        <td key={`${metric.field}-${year}`}>
                          {formatValue(values[index])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && balanceFields.length > 0 && (
        <div className="viewer-table">
          <h3 className="subrub small">Balance Sheet</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">Field</th>
                  {data.years.map((year) => (
                    <th key={`balance-${year}`}>{year}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balanceFields.map((field) => (
                  <tr key={field}>
                    <td className="sticky-col">{field}</td>
                    {data.years.map((year, index) => (
                      <td key={`${field}-${year}`}>
                        {formatValue(data.balance[field]?.[index])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
