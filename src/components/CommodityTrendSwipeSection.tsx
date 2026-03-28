import { useMemo, useState } from "react";
import InfoPopover from "./InfoPopover";
import { buildCommodityTrendStructure, type CommodityPricePoint } from "../lib/sector/commodityTrendStructure";

type Props = {
  priceHistory: CommodityPricePoint[];
  commodityLabel: string;
  debugMode?: boolean;
};

type SeriesSpec = { label: string; color: string; values: Array<number | null> };

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
  const width = 960;
  const top = 16;
  const bottom = 24;
  const left = 24;
  const right = 10;
  const values = series.flatMap((item) => item.values).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minRaw = values.length ? Math.min(...values) : -1;
  const maxRaw = values.length ? Math.max(...values) : 1;
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
        {showZero && typeof zeroY === "number" ? (
          <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1" />
        ) : null}
        {series.map((item) => {
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
        {series.map((item) => (
          <span key={item.label} style={{ color: item.color }}>— {item.label}</span>
        ))}
      </div>
    </div>
  );
}

export default function CommodityTrendSwipeSection({ priceHistory, commodityLabel, debugMode = false }: Props) {
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const trend = useMemo(() => buildCommodityTrendStructure(priceHistory, 5), [priceHistory]);

  const trendSeries: SeriesSpec[] = [
    { label: "SMA50 (index)", color: "#2563eb", values: trend.points.map((point) => point.indexSma50) },
    { label: "SMA200 (index)", color: "#475569", values: trend.points.map((point) => point.indexSma200) },
    { label: "SMA500 (index)", color: "#7c3aed", values: trend.points.map((point) => point.indexSma500) },
  ];
  const spreadSeries: SeriesSpec[] = [
    { label: "SMA50 - SMA200", color: "#0f766e", values: trend.points.map((point) => point.spread50_200) },
    { label: "SMA200 - SMA500", color: "#b45309", values: trend.points.map((point) => point.spread200_500) },
  ];

  return (
    <section className="commodity-trend-carousel-card" aria-label={`Trendvisualisering för ${commodityLabel}`}>
      <div className="commodity-trend-carousel-head">
        <h3>Trendstruktur för {commodityLabel}</h3>
        <p>Ny visualisering ovanpå råvarudata (ingen prisgraf).</p>
      </div>

      <div className="commodity-trend-carousel" role="region" aria-label="Swipebara trendgrafer">
        <article className="commodity-trend-page">
          <div className="commodity-trend-title-row">
            <h4>Trendstruktur, 5 månader</h4>
            <InfoPopover
              id="commodity-trend-structure-info"
              openId={openInfoId}
              onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
              onClose={() => setOpenInfoId(null)}
              title="Trendstruktur, 5 månader"
              content={[
                "Grafen visar trendens struktur, inte prisnivån.",
                "När SMA50 ligger över SMA200 och SMA500 är den korta trenden stark relativt den långa.",
                "När linjerna dras ihop ökar sannolikheten för kompression, trendbrott eller ny acceleration.",
              ]}
            />
          </div>
          <p className="commodity-trend-subtitle">SMA50, SMA200, SMA500, indexerat från startpunkt</p>
          {trend.points.length === 0 ? <div className="commodity-trend-empty">Saknar datapunkter för de senaste fem månaderna.</div> : <TrendLineChart dates={trend.points.map((point) => point.date)} series={trendSeries} />}
          {!trend.hasSma500Coverage ? <div className="commodity-trend-warning">{trend.missingHistoryReason}</div> : null}
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
                "Grafen visar om trenden expanderar eller tappar kraft.",
                "När båda spreads ökar stärks trenden brett.",
                "När SMA50-SMA200 faller medan SMA200-SMA500 håller sig positiv tyder det på kortsiktig svaghet i en intakt längre trend.",
              ]}
            />
          </div>
          <p className="commodity-trend-subtitle">Spread mellan kort, mellan och lång trend</p>
          {trend.points.length === 0 ? <div className="commodity-trend-empty">Saknar datapunkter för spreads i femmånadersfönstret.</div> : <TrendLineChart dates={trend.points.map((point) => point.date)} series={spreadSeries} showZero />}
        </article>
      </div>

      <div className="commodity-trend-dots" aria-hidden>
        <span />
        <span />
      </div>

      {debugMode ? (
        <div className="commodity-trend-debug">
          <div><strong>SMA-order:</strong> {trend.debug.orderingLatest}</div>
          <div><strong>Kort spread:</strong> {trend.debug.shortSpreadDirection}</div>
          <div><strong>Lång spread:</strong> {trend.debug.longSpreadDirection}</div>
        </div>
      ) : null}
    </section>
  );
}
