import { memo, useEffect, useMemo, useRef } from "react";
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

const EMPTY_OPTIONS: Record<string, unknown> = {};

function debugChartsOn(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugCharts") === "1";
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

type ChartBodyProps = {
  id: string;
  chartType: ChartCardProps["chartType"];
  data: ChartDataCell[][];
  height: number;
  options: Record<string, unknown>;
};

function buildDataSignature(data: ChartDataCell[][]) {
  const header = Array.isArray(data[0]) ? data[0] : [];
  const rows = data.length > 1 ? data.slice(1) : [];
  const lastX = rows.length ? rows[rows.length - 1]?.[0] : null;
  const sample = rows.length ? rows[Math.floor(rows.length / 2)] : [];
  const sampleNumber = sample.find((value) => typeof value === "number") ?? null;
  return `h=${header.length}|r=${rows.length}|x=${String(lastX)}|n=${String(sampleNumber)}`;
}

function buildOptionSignature(chartType: ChartCardProps["chartType"], options: Record<string, unknown>) {
  const vAxis = (options.vAxis as Record<string, unknown> | undefined) ?? {};
  const vAxes = (options.vAxes as Record<string, unknown> | undefined) ?? {};
  const series = (options.series as Record<string, unknown> | undefined) ?? {};
  return `t=${chartType}|va=${String(vAxis.title ?? "")}|vas=${Object.keys(vAxes).length}|s=${Object.keys(series).length}`;
}

const ChartBody = memo(function ChartBody({ id, chartType, data, height, options }: ChartBodyProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const previousSizeRef = useRef<{ width: number; height: number } | null>(null);
  const DEBUG = debugChartsOn();
  const dataSig = useMemo(() => buildDataSignature(data), [data]);
  const optSig = useMemo(() => buildOptionSignature(chartType, options), [chartType, options]);

  useEffect(() => {
    if (!DEBUG || !wrapperRef.current || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const heightSize = Math.round(entry.contentRect.height);
      const previousSize = previousSizeRef.current;
      const changed = previousSize ? previousSize.width !== width || previousSize.height !== heightSize : true;
      previousSizeRef.current = { width, height: heightSize };
      console.log(`[ChartRO] id=${id} w=${width} h=${heightSize} changed=${changed}`);
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [DEBUG, id]);

  return (
    <div ref={wrapperRef}>
      <Chart
        chartType={chartType}
        data={data}
        width="100%"
        height={`${height}px`}
        options={options}
        chartEvents={DEBUG ? [{
          eventName: "ready",
          callback: () => {
            console.log(`[ChartDraw] id=${id} dataSig=${dataSig} optSig=${optSig}`);
          },
        }] : undefined}
      />
    </div>
  );
});

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
  options: optionsProp,
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
  const DEBUG = debugChartsOn();
  const chartId = id ?? title;
  const options = optionsProp ?? EMPTY_OPTIONS;
  const previousDataRef = useRef<(string | number | Date | null)[][] | null | undefined>(undefined);
  const previousOptionsRef = useRef<Record<string, unknown> | undefined>(undefined);

  const hasInfo = Boolean(infoSections?.length && onToggleInfo && onCloseInfo);

  const optionVAxis = (options.vAxis as Record<string, unknown> | undefined) ?? EMPTY_OPTIONS;
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

  const normalized = useMemo(() => normalizeChartData(data, fiscalYearEndMonth), [data, fiscalYearEndMonth]);
  const optionHAxis = (options.hAxis as Record<string, unknown> | undefined) ?? EMPTY_OPTIONS;
  const optionVAxes = (options.vAxes as Record<string, unknown> | undefined) ?? undefined;

  if (DEBUG) {
    const headerTypes = normalized.data[0]?.map((item) => (typeof item === "object" ? "obj" : typeof item)).join(",") ?? "none";
    const rowCount = Math.max(0, normalized.data.length - 1);
    const lastX = rowCount > 0 ? normalized.data[normalized.data.length - 1]?.[0] : "none";
    const vAxisTitle = typeof optionVAxis.title === "string" ? optionVAxis.title : "";
    const seriesCount = Object.keys(((options.series as Record<string, unknown> | undefined) ?? EMPTY_OPTIONS)).length;
    const dataSig = `${headerTypes}|rows:${rowCount}|xlast:${String(lastX)}`;
    const optSig = `${chartType}|vAxis:${vAxisTitle}|series:${seriesCount}`;
    console.log(`[ChartRender] id=${chartId} dataRef=${previousDataRef.current !== data ? "NEW" : "SAME"} optRef=${previousOptionsRef.current !== options ? "NEW" : "SAME"} dataSig=${dataSig} optSig=${optSig}`);
  }
  previousDataRef.current = data;
  previousOptionsRef.current = options;

  const chartOptions = useMemo(
    () => ({
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
    }),
    [normalized.ticks, optionHAxis, optionVAxes, optionVAxis, options, resolvedUnitLabel, y2AxisTitle, yAxisTitle],
  );

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
            openId={infoIsOpen ? chartId : null}
            onToggle={onToggleInfo!}
            onClose={onCloseInfo!}
            title={title}
            sections={infoSections}
          />
        )}
      </div>
      <ChartBody id={chartId} chartType={chartType} data={normalized.data as ChartDataCell[][]} height={height} options={chartOptions} />
    </div>
  );
}

export default memo(ChartCard);
