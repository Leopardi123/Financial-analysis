import { memo, useLayoutEffect, useRef } from "react";
import { Chart } from "react-google-charts";
import InfoPopover from "./InfoPopover";

type ChartDataCell = string | number | Date | null | { type: string; role: string };

type ChartCardProps = {
  id?: string;
  title: string;
  data: (string | number | Date | null)[][] | null;
  chartType: "ColumnChart" | "ComboChart" | "AreaChart" | "LineChart";
  height?: number;
  options?: Record<string, unknown>;
  fiscalYearEndMonth?: number | null;
  infoSections?: { heading: string; lines: string[] }[];
  infoIsOpen?: boolean;
  onToggleInfo?: (id: string) => void;
  onCloseInfo?: () => void;
  unitLabel?: string;
  unitKind?: "money" | "percent" | "months" | "ratio" | "shares" | "index" | "unknown";
  yAxisTitle?: string;
  y2AxisTitle?: string;
};

const DEBUG_CHART_RERENDERS = false;

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isDate(value);
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (isDate(a) && isDate(b)) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!areValuesEqual(a[index], b[index])) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!(key in b) || !areValuesEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function areChartCardPropsEqual(prev: ChartCardProps, next: ChartCardProps) {
  return (
    prev.id === next.id
    && prev.title === next.title
    && prev.chartType === next.chartType
    && prev.height === next.height
    && prev.fiscalYearEndMonth === next.fiscalYearEndMonth
    && prev.infoIsOpen === next.infoIsOpen
    && prev.onToggleInfo === next.onToggleInfo
    && prev.onCloseInfo === next.onCloseInfo
    && prev.unitLabel === next.unitLabel
    && prev.unitKind === next.unitKind
    && prev.yAxisTitle === next.yAxisTitle
    && prev.y2AxisTitle === next.y2AxisTitle
    && areValuesEqual(prev.infoSections, next.infoSections)
    && areValuesEqual(prev.data, next.data)
    && areValuesEqual(prev.options ?? {}, next.options ?? {})
  );
}

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

function ChartCard({
  id,
  title,
  data,
  chartType,
  height = 300,
  options = {},
  fiscalYearEndMonth,
  infoSections,
  infoIsOpen = false,
  onToggleInfo,
  onCloseInfo,
  unitLabel,
  unitKind,
  yAxisTitle,
  y2AxisTitle,
}: ChartCardProps) {
  const chartId = id ?? title;
  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const previousDataRef = useRef<(string | number | Date | null)[][] | null | undefined>(undefined);
  const previousOptionsRef = useRef<Record<string, unknown> | undefined>(undefined);

  if (DEBUG_CHART_RERENDERS) {
    const dataRefToken = previousDataRef.current === data ? "same" : "new";
    const optionsRefToken = previousOptionsRef.current === options ? "same" : "new";
    console.log(`[ChartCardRender] id=${chartId} infoIsOpen=${String(infoIsOpen)} dataRef=${dataRefToken} optionsRef=${optionsRefToken}`);
  }

  useLayoutEffect(() => {
    if (!DEBUG_CHART_RERENDERS || !chartCardRef.current) {
      return;
    }
    console.log(
      `[ChartCardSize] id=${chartId} w=${chartCardRef.current.clientWidth} h=${chartCardRef.current.clientHeight}`,
    );
  });

  previousDataRef.current = data;
  previousOptionsRef.current = options;

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

  const normalized = normalizeChartData(data, fiscalYearEndMonth);
  const optionHAxis = (options.hAxis as Record<string, unknown> | undefined) ?? {};
  const optionVAxes = (options.vAxes as Record<string, unknown> | undefined) ?? undefined;

  return (
    <div className="chart-card" ref={chartCardRef}>
      <div className="producer-core-title-row" style={{ marginBottom: "4px", minHeight: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div className="chart-title" style={{ marginBottom: 0 }}>{title}</div>
          <span style={{ fontSize: "10px", padding: "2px 6px", border: "1px solid rgba(0,0,0,0.35)", borderRadius: "10px", background: "#f3f6e9" }}>{resolvedUnitLabel}</span>
          {hasUnknownUnit && <span style={{ fontSize: "10px", color: "#7a4f01" }}>⚠</span>}
        </div>
        {hasInfo && (
          <InfoPopover
            id={chartId}
            openId={infoIsOpen ? chartId : null}
            onToggle={onToggleInfo!}
            onClose={onCloseInfo!}
            title={title}
            sections={infoSections}
          />
        )}
      </div>
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
            ticks: normalized.ticks,
            format: undefined,
          },
        }}
      />
    </div>
  );
}

export default memo(ChartCard, areChartCardPropsEqual);
