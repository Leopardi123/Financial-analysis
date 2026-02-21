import { Chart } from "react-google-charts";

type ChartDataCell = string | number | Date | null | { type: string; role: string };

type ChartCardProps = {
  title: string;
  data: (string | number | Date | null)[][] | null;
  chartType: "ColumnChart" | "ComboChart" | "AreaChart" | "LineChart";
  height?: number;
  options?: Record<string, unknown>;
  fiscalYearEndMonth?: number | null;
};

const DEFAULT_OPTIONS = {
  backgroundColor: "#e0e9ce",
  legend: { position: "bottom" },
  titleTextStyle: {
    fontSize: 16,
    bold: true,
  },
  colors: ["#0b0b0b"],
  hAxis: {
    slantedText: true,
    slantedTextAngle: 45,
    textStyle: {
      fontSize: 12,
    },
  },
};

type Tick = { v: Date; f: string };

function toUtcDateParts(value: Date) {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function formatIsoDate(value: Date) {
  const { year, month, day } = toUtcDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isQuarterlySeries(dates: Date[]) {
  if (dates.length < 2) {
    return false;
  }
  const countsByYear = new Map<number, number>();
  dates.forEach((date) => {
    const { year } = toUtcDateParts(date);
    countsByYear.set(year, (countsByYear.get(year) ?? 0) + 1);
  });
  return Array.from(countsByYear.values()).some((count) => count > 1);
}

export function computeFiscalQuarterLabel(endDate: Date, fiscalYearEndMonth: number) {
  const { year: endYear, month: endMonth } = toUtcDateParts(endDate);
  const fyStartMonth = (fiscalYearEndMonth % 12) + 1;
  const idx = (endMonth - fyStartMonth + 12) % 12;
  const fiscalQuarter = Math.floor(idx / 3) + 1;
  const fiscalYearLabel = endYear + (endMonth > fiscalYearEndMonth ? 1 : 0);
  return `FY${fiscalYearLabel} Q${fiscalQuarter}`;
}

function formatQuarterLabel(date: Date, fiscalYearEndMonth?: number | null) {
  if (!fiscalYearEndMonth || fiscalYearEndMonth < 1 || fiscalYearEndMonth > 12) {
    const { year, month } = toUtcDateParts(date);
    const quarter = Math.floor((month - 1) / 3) + 1;
    return `${year} Q${quarter}`;
  }
  return computeFiscalQuarterLabel(date, fiscalYearEndMonth);
}

function formatAxisLabel(value: Date, quarterly: boolean, fiscalYearEndMonth?: number | null) {
  if (!quarterly) {
    return formatIsoDate(value);
  }
  return formatQuarterLabel(value, fiscalYearEndMonth);
}

function buildTicks(dates: Date[], quarterly: boolean, fiscalYearEndMonth?: number | null): Tick[] {
  if (dates.length === 0) {
    return [];
  }
  const indexes = new Set<number>([0, Math.floor((dates.length - 1) / 2), dates.length - 1]);
  return Array.from(indexes)
    .sort((a, b) => a - b)
    .map((index) => ({
      v: dates[index],
      f: formatAxisLabel(dates[index], quarterly, fiscalYearEndMonth),
    }));
}

function normalizeChartData(
  data: (string | number | Date | null)[][],
  fiscalYearEndMonth?: number | null,
) {
  const [headers, ...rows] = data;
  const normalizedRows = rows.filter((row) => row[0] instanceof Date) as (string | number | Date | null)[][];
  const dates = normalizedRows.map((row) => row[0] as Date);
  const quarterly = isQuarterlySeries(dates);

  const rowsWithTooltips = normalizedRows.map((row) => {
    const date = row[0] as Date;
    const exactDate = formatIsoDate(date);
    const tooltipLabel = quarterly
      ? `${exactDate} (${formatQuarterLabel(date, fiscalYearEndMonth)})`
      : exactDate;
    return [row[0], ...row.slice(1), tooltipLabel] as ChartDataCell[];
  });

  const withTooltipHeaders: ChartDataCell[] = [...headers, { type: "string", role: "tooltip" }];

  return {
    data: [withTooltipHeaders, ...rowsWithTooltips],
    ticks: buildTicks(dates, quarterly, fiscalYearEndMonth),
  };
}

export default function ChartCard({
  title,
  data,
  chartType,
  height = 300,
  options = {},
  fiscalYearEndMonth,
}: ChartCardProps) {
  if (!data) {
    return (
      <div className="chart-card chart-empty">
        <div className="chart-title">{title}</div>
        <div className="chart-placeholder">No data yet.</div>
      </div>
    );
  }

  const normalized = normalizeChartData(data, fiscalYearEndMonth);
  const optionHAxis = (options.hAxis as Record<string, unknown> | undefined) ?? {};

  return (
    <div className="chart-card">
      <Chart
        chartType={chartType}
        data={normalized.data}
        width="100%"
        height={`${height}px`}
        options={{
          ...DEFAULT_OPTIONS,
          ...options,
          title,
          tooltip: { trigger: "focus" },
          hAxis: {
            ...DEFAULT_OPTIONS.hAxis,
            ...optionHAxis,
            ticks: normalized.ticks,
            format: undefined,
          },
        }}
      />
    </div>
  );
}
