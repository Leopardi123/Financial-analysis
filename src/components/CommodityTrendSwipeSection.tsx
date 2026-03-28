import { useMemo, useState } from "react";
import InfoPopover from "./InfoPopover";
import { buildCommodityTrendStructure, type CommodityPricePoint } from "../lib/sector/commodityTrendStructure";

type Props = {
  priceHistory: CommodityPricePoint[];
  commodityLabel: string;
  debugMode?: boolean;
};

type SeriesSpec = { label: string; color: string; values: Array<number | null> };
type SpreadAreaSpec = {
  label: string;
  positiveColor: string;
  negativeColor: string;
  positiveOpacity: number;
  negativeOpacity: number;
  values: Array<number | null>;
};

function validSeries(series: SeriesSpec[]): SeriesSpec[] {
  return series
    .map((item) => ({ ...item, values: item.values.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null)) }))
    .filter((item) => item.values.some((value) => typeof value === "number"));
}

function FallbackState({ message }: { message: string }) {
  return <div className="commodity-trend-fallback-state">{message}</div>;
}

function TrendLineChart({
  dates,
  series,
  height = 210,
  showZero = false,
}: {
  dates: string[];
  series: SeriesSpec[];
  height?: number;
  showZero?: boolean;
}) {
  const cleaned = validSeries(series);
  if (cleaned.length === 0 || dates.length === 0) {
    return <FallbackState message="Otillräcklig historik för att rita grafen." />;
  }

  const width = 960;
  const top = 16;
  const bottom = 24;
  const left = 24;
  const right = 10;
  const values = cleaned.flatMap((item) => item.values).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) {
    return <FallbackState message="Serierna innehåller inga giltiga datapunkter." />;
  }

  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const min = showZero ? Math.min(minRaw, 0) : minRaw;
  const max = showZero ? Math.max(maxRaw, 0) : maxRaw;
  const range = Math.max(1e-6, max - min);
  const pad = range * 0.1;
  const domainMin = min - pad;
  const domainMax = max + pad;

  const x = (index: number) => left + (index / Math.max(1, dates.length - 1)) * (width - left - right);
  const y = (value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return height - bottom - ((value - domainMin) / Math.max(1e-6, domainMax - domainMin)) * (height - top - bottom);
  };
  const zeroY = y(0);

  return (
    <div className="commodity-trend-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Trendstruktur graf" style={{ width: "100%", height: `${height}px`, display: "block" }}>
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#94a3b8" strokeWidth="1" />
        {showZero && typeof zeroY === "number" ? <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="#64748b" strokeDasharray="4 4" strokeWidth="1" /> : null}
        {cleaned.map((item) => {
          let hasStarted = false;
          const path = item.values
            .map((value, index) => {
              const yPos = y(value);
              if (yPos === null) {
                hasStarted = false;
                return "";
              }
              const command = hasStarted ? "L" : "M";
              hasStarted = true;
              return `${command}${x(index)},${yPos}`;
            })
            .filter(Boolean)
            .join(" ");
          return <path key={item.label} d={path} fill="none" stroke={item.color} strokeWidth="2" />;
        })}
      </svg>
      <div className="commodity-trend-axis-labels">
        <span>{dates[0] ?? ""}</span>
        <span>{dates[dates.length - 1] ?? ""}</span>
      </div>
      <div className="commodity-trend-legend">
        {cleaned.map((item) => <span key={item.label} style={{ color: item.color }}>— {item.label}</span>)}
      </div>
    </div>
  );
}

function buildLinePath(values: Array<number | null>, x: (index: number) => number, y: (value: number | null) => number | null): string {
  let hasStarted = false;
  return values
    .map((value, index) => {
      const yPos = y(value);
      if (yPos === null) {
        hasStarted = false;
        return "";
      }
      const command = hasStarted ? "L" : "M";
      hasStarted = true;
      return `${command}${x(index)},${yPos}`;
    })
    .filter(Boolean)
    .join(" ");
}

function buildAreaPath(values: Array<number | null>, baseline: number, x: (index: number) => number, y: (value: number | null) => number | null): string {
  const segments: string[] = [];
  let points: Array<{ x: number; y: number }> = [];

  const flush = () => {
    if (points.length === 0) return;
    const first = points[0];
    const last = points[points.length - 1];
    const body = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    segments.push(`${body} L${last.x},${baseline} L${first.x},${baseline} Z`);
    points = [];
  };

  values.forEach((value, index) => {
    const yPos = y(value);
    if (yPos === null) {
      flush();
      return;
    }
    points.push({ x: x(index), y: yPos });
  });
  flush();

  return segments.join(" ");
}

function TrendSpreadAreaChart({ dates, series, height = 210 }: { dates: string[]; series: SpreadAreaSpec[]; height?: number }) {
  const cleaned = series
    .map((item) => ({ ...item, values: item.values.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null)) }))
    .filter((item) => item.values.some((value) => typeof value === "number"));
  if (cleaned.length === 0 || dates.length === 0) return <FallbackState message="Otillräcklig historik för att rita grafen." />;

  const width = 960;
  const top = 16;
  const bottom = 24;
  const left = 24;
  const right = 10;
  const values = cleaned.flatMap((item) => item.values).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return <FallbackState message="Serierna innehåller inga giltiga datapunkter." />;

  const minRaw = Math.min(...values, 0);
  const maxRaw = Math.max(...values, 0);
  const range = Math.max(1e-6, maxRaw - minRaw);
  const pad = range * 0.12;
  const domainMin = minRaw - pad;
  const domainMax = maxRaw + pad;

  const x = (index: number) => left + (index / Math.max(1, dates.length - 1)) * (width - left - right);
  const y = (value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return height - bottom - ((value - domainMin) / Math.max(1e-6, domainMax - domainMin)) * (height - top - bottom);
  };
  const zeroY = y(0) ?? height - bottom;

  return (
    <div className="commodity-trend-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Trendexpansion spread-graf" style={{ width: "100%", height: `${height}px`, display: "block" }}>
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="#94a3b8" strokeWidth="1" />
        <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="#94a3b8" strokeWidth="1" />
        {cleaned.map((item) => {
          const positiveValues = item.values.map((value) => (typeof value === "number" ? Math.max(0, value) : null));
          const negativeValues = item.values.map((value) => (typeof value === "number" ? Math.min(0, value) : null));
          const positiveAreaPath = buildAreaPath(positiveValues, zeroY, x, y);
          const negativeAreaPath = buildAreaPath(negativeValues, zeroY, x, y);
          const linePath = buildLinePath(item.values, x, y);
          return (
            <g key={item.label}>
              {positiveAreaPath ? <path d={positiveAreaPath} fill={item.positiveColor} fillOpacity={item.positiveOpacity} stroke="none" /> : null}
              {negativeAreaPath ? <path d={negativeAreaPath} fill={item.negativeColor} fillOpacity={item.negativeOpacity} stroke="none" /> : null}
              {linePath ? <path d={linePath} fill="none" stroke={item.positiveColor} strokeOpacity={0.75} strokeWidth="1.2" /> : null}
            </g>
          );
        })}
      </svg>
      <div className="commodity-trend-axis-labels">
        <span>{dates[0] ?? ""}</span>
        <span>{dates[dates.length - 1] ?? ""}</span>
      </div>
      <div className="commodity-trend-legend">
        {cleaned.map((item) => <span key={item.label} style={{ color: item.positiveColor }}>■ {item.label}</span>)}
        <span style={{ color: "#b91c1c" }}>■ Negativ spread</span>
      </div>
    </div>
  );
}

export default function CommodityTrendSwipeSection({ priceHistory, commodityLabel, debugMode = false }: Props) {
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const trend = useMemo(() => buildCommodityTrendStructure(priceHistory, 5), [priceHistory]);

  const dates = trend.points.map((point) => point.date);
  const trendSeries: SeriesSpec[] = [
    trend.hasSma50Coverage ? { label: "SMA50 (index)", color: "#2563eb", values: trend.points.map((point) => point.indexSma50) } : null,
    trend.hasSma200Coverage ? { label: "SMA200 (index)", color: "#475569", values: trend.points.map((point) => point.indexSma200) } : null,
    trend.hasSma500Coverage ? { label: "SMA500 (index)", color: "#7c3aed", values: trend.points.map((point) => point.indexSma500) } : null,
  ].filter((item): item is SeriesSpec => item !== null);

  const spreadSeries: SpreadAreaSpec[] = [
    trend.hasSma200Coverage && trend.hasSma500Coverage
      ? { label: "SMA200 - SMA500", positiveColor: "#b45309", negativeColor: "#dc2626", positiveOpacity: 0.25, negativeOpacity: 0.2, values: trend.points.map((point) => point.spread200_500) }
      : null,
    trend.hasSma50Coverage && trend.hasSma200Coverage
      ? { label: "SMA50 - SMA200", positiveColor: "#0f766e", negativeColor: "#b91c1c", positiveOpacity: 0.6, negativeOpacity: 0.38, values: trend.points.map((point) => point.spread50_200) }
      : null,
  ].filter((item): item is SpreadAreaSpec => item !== null);

  const relationClass = trend.trendStructureState === "bullish_aligned" || trend.trendStructureState === "bullish_but_narrowing"
    ? "is-bullish"
    : trend.trendStructureState === "bearish_short_term"
      ? "is-bearish"
      : "";

  const spreadHasRenderableData = spreadSeries.some((line) => line.values.some((value) => typeof value === "number" && Number.isFinite(value)));

  return (
    <section className="commodity-trend-carousel-card" aria-label={`Trendvisualisering för ${commodityLabel}`}>
      <div className="commodity-trend-carousel-head">
        <h3>Trendstruktur för {commodityLabel}</h3>
        <p>Visualisering av trendkvalitet (ingen prisnivågraf).</p>
      </div>

      <div className="commodity-trend-carousel" role="region" aria-label="Swipebara trendgrafer">
        <article className={`commodity-trend-page ${relationClass}`}>
          <div className="commodity-trend-title-row">
            <h4>Trendstruktur, 5 månader</h4>
            <InfoPopover
              id="commodity-trend-structure-info"
              openId={openInfoId}
              onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
              onClose={() => setOpenInfoId(null)}
              title="Trendstruktur, 5 månader"
              content={trend.structureInfoLines}
            />
          </div>
          <p className="commodity-trend-subtitle">Tillgängliga SMA-serier indexerade från startpunkt (100)</p>
          {trendSeries.length > 0 && dates.length > 0
            ? <TrendLineChart dates={dates} series={trendSeries} />
            : <FallbackState message="Otillräcklig historik för att visa trendstruktur." />}
          <p className="commodity-trend-interpretation">{trend.structureInterpretation}</p>
          {trend.missingHistoryReason ? <div className="commodity-trend-warning">{trend.missingHistoryReason}</div> : null}
        </article>

        <article className="commodity-trend-page">
          <div className="commodity-trend-title-row">
            <h4>Trendexpansion, 5 månader</h4>
            <InfoPopover
              id="commodity-trend-expansion-info"
              openId={openInfoId}
              onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
              onClose={() => setOpenInfoId(null)}
              title="Trendexpansion, 5 månader"
              content={[
                "Grafen visar avståndet mellan kort, mellan och lång trend.",
                "När avståndet växer stärks trenden. När det krymper avtar momentum.",
                ...trend.expansionInfoLines,
              ]}
            />
          </div>
          <p className="commodity-trend-subtitle">Spread visualiserad som area mot 0-linje: tjockare area = starkare trendexpansion.</p>
          {spreadHasRenderableData
            ? <TrendSpreadAreaChart dates={dates} series={spreadSeries} />
            : <FallbackState message="Trendexpansion kan inte visas fullt ut eftersom SMA-underlag saknas." />}
          <p className="commodity-trend-interpretation">{trend.expansionInterpretation}</p>
          {trend.degradationLevel === "medium" ? <div className="commodity-trend-warning">Lång spread kan inte beräknas ännu – visar endast kort vs mellantrend.</div> : null}
        </article>
      </div>

      <div className="commodity-trend-dots" aria-hidden>
        <span />
        <span />
      </div>

      {debugMode ? (
        <div className="commodity-trend-debug">
          <div><strong>Raw obs:</strong> {trend.debug.rawObservationCount} ({trend.debug.rawFromDate ?? "n/a"} → {trend.debug.rawToDate ?? "n/a"})</div>
          <div><strong>Window obs:</strong> {trend.debug.windowObservationCount}</div>
          <div><strong>SMA computable:</strong> 50={String(trend.debug.sma50Computable)}, 200={String(trend.debug.sma200Computable)}, 500={String(trend.debug.sma500Computable)}</div>
          <div><strong>Spreads valid:</strong> 50-200={trend.debug.spread50_200ValidPoints}, 200-500={trend.debug.spread200_500ValidPoints}</div>
          <div><strong>Degradation:</strong> {trend.degradationLevel} | completeness={trend.trendDataCompleteness}</div>
          <div><strong>States:</strong> structure={trend.trendStructureState}, expansion={trend.trendExpansionState}</div>
          <div><strong>Fallback reason:</strong> {trend.debug.fallbackReason ?? "none"}</div>
        </div>
      ) : null}
    </section>
  );
}
