import { Chart } from "react-google-charts";
import InfoPopover from "./InfoPopover";

type ChartDataCell = string | number | Date | null | { type: string; role: string };

type ChartCardProps = {
  id?: string;
  title: string;
  data: (string | number | Date | null)[][] | null;
  chartType: "ColumnChart" | "ComboChart" | "AreaChart" | "LineChart" | "ScatterChart";
  height?: number;
  options?: Record<string, unknown>;
  fiscalYearEndMonth?: number | null;
  infoSections?: { heading: string; lines: string[] }[];
  openInfoId?: string | null;
  onToggleInfo?: (id: string) => void;
  onCloseInfo?: () => void;
  unitLabel?: string;
  unitKind?: "money" | "percent" | "months" | "ratio" | "shares" | "index" | "unknown";
  yAxisTitle?: string;
  y2AxisTitle?: string;
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



function parseStrictIsoDate(value: string): Date | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeNumberCell(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "n/a" || trimmed === "—") return null;
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
  chartType: ChartCardProps["chartType"],
  fiscalYearEndMonth?: number | null,
) {
  const [headers, ...rows] = data;

  if (chartType === "ScatterChart") {
    const scatterRows = rows
      .map((row) => {
        const x = normalizeNumberCell(row[0]);
        const y = normalizeNumberCell(row[1]);
        if (x === null || y === null) {
          return null;
        }
        return [x, y] as ChartDataCell[];
      })
      .filter((row): row is ChartDataCell[] => row !== null);

    return {
      data: [headers as ChartDataCell[], ...scatterRows],
      ticks: undefined,
    };
  }

  const normalizedRows = rows
    .map((row) => {
      const rawDate = row[0];
      const parsedDate = rawDate instanceof Date
        ? (Number.isNaN(rawDate.getTime()) ? null : rawDate)
        : typeof rawDate === "string"
          ? parseStrictIsoDate(rawDate)
          : null;
      if (!parsedDate) {
        return null;
      }
      const values = row.slice(1).map((value) => normalizeNumberCell(value));
      return [parsedDate, ...values] as ChartDataCell[];
    })
    .filter((row): row is ChartDataCell[] => row !== null);

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
  id,
  title,
  data,
  chartType,
  height = 300,
  options = {},
  fiscalYearEndMonth,
  infoSections,
  openInfoId,
  onToggleInfo,
  onCloseInfo,
  unitLabel,
  unitKind,
  yAxisTitle,
  y2AxisTitle,
}: ChartCardProps) {
  const chartId = id ?? title;
  const hasInfo = Boolean(infoSections?.length && onToggleInfo && onCloseInfo);

  const optionVAxis = (options.vAxis as Record<string, unknown> | undefined) ?? {};
  const resolvedUnitLabel = unitLabel ?? (typeof optionVAxis.title === "string" && optionVAxis.title.trim() ? optionVAxis.title : "unknown");
  const hasUnknownUnit = resolvedUnitLabel === "unknown" || unitKind === "unknown";

  if (!data) {
    return (
      <div className="chart-card chart-empty">
        <div className="chart-title">{title} <span style={{ fontSize: "10px" }}>({resolvedUnitLabel})</span></div>
        <div className="chart-placeholder">No data yet.</div>
      </div>
    );
  }

  const normalized = normalizeChartData(data, chartType, fiscalYearEndMonth);
  const rowsBefore = data.length > 0 ? data.length - 1 : 0;
  const rowsAfter = normalized.data.length > 0 ? normalized.data.length - 1 : 0;
  const allScatterPointsDropped = chartType === "ScatterChart" && rowsBefore > 0 && rowsAfter === 0;
  const optionHAxis = (options.hAxis as Record<string, unknown> | undefined) ?? {};
  const optionVAxes = (options.vAxes as Record<string, unknown> | undefined) ?? undefined;

  return (
    <div className="chart-card">
      <div className="producer-core-title-row" style={{ marginBottom: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div className="chart-title" style={{ marginBottom: 0 }}>{title}</div>
          <span style={{ fontSize: "10px", padding: "2px 6px", border: "1px solid rgba(0,0,0,0.35)", borderRadius: "10px", background: "#f3f6e9" }}>{resolvedUnitLabel}</span>
          {hasUnknownUnit && <span style={{ fontSize: "10px", color: "#7a4f01" }}>⚠</span>}
        </div>
        {hasInfo && (
          <InfoPopover
            id={chartId}
            openId={openInfoId ?? null}
            onToggle={onToggleInfo!}
            onClose={onCloseInfo!}
            title={title}
            sections={infoSections}
          />
        )}
      </div>
      {allScatterPointsDropped && (
        <p className="status empty" style={{ margin: "4px 0 8px" }}>No valid points (runwayMonths or dilutionYoY missing/invalid). Before: {rowsBefore}, after sanitization: {rowsAfter}.</p>
      )}
      <Chart
        chartType={chartType}
        data={normalized.data}
        width="100%"
        height={`${height}px`}
        options={{
          ...DEFAULT_OPTIONS,
          ...options,
          title: undefined,
          tooltip: { trigger: "focus" },
          vAxis: {
            ...optionVAxis,
            title: (optionVAxis.title as string | undefined) ?? yAxisTitle ?? resolvedUnitLabel,
          },
          ...(optionVAxes ? { vAxes: optionVAxes } : y2AxisTitle ? { vAxes: { 0: { title: yAxisTitle ?? resolvedUnitLabel }, 1: { title: y2AxisTitle } } } : {}),
          hAxis: {
            ...DEFAULT_OPTIONS.hAxis,
            ...optionHAxis,
            ...(normalized.ticks ? { ticks: normalized.ticks } : {}),
            format: undefined,
          },
        }}
      />
    </div>
  );
}
