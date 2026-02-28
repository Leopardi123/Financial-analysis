import { useMemo } from "react";

type ValueRangeSnapshotCardProps = {
  priceToday?: number | null;
  npvLow?: number | null;
  npvHigh?: number | null;
  tpLow?: number | null;
  tpHigh?: number | null;
  currencyCode?: string;
};

const Y_TOP = 40;
const Y_BOTTOM = 150;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCompactValue(value: number, currencyCode?: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const symbol = currencyCode ? `${currencyCode} ` : "";
  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(1)}mdr`;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}mn`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${symbol}${abs.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}`;
}

export default function ValueRangeSnapshotCard(props: ValueRangeSnapshotCardProps) {
  const {
    priceToday,
    npvLow,
    npvHigh,
    tpLow,
    tpHigh,
    currencyCode,
  } = props;

  const npvRange = useMemo(() => {
    const low = isFiniteNumber(npvLow) ? npvLow : null;
    const high = isFiniteNumber(npvHigh) ? npvHigh : null;
    if (low !== null && high !== null) return { low: Math.min(low, high), high: Math.max(low, high) };
    if (low !== null) return { low, high: low };
    if (high !== null) return { low: high, high };
    return null;
  }, [npvLow, npvHigh]);

  const tpRange = useMemo(() => {
    const low = isFiniteNumber(tpLow) ? tpLow : null;
    const high = isFiniteNumber(tpHigh) ? tpHigh : null;
    if (low !== null && high !== null) return { low: Math.min(low, high), high: Math.max(low, high) };
    if (low !== null) return { low, high: low };
    if (high !== null) return { low: high, high };
    return null;
  }, [tpLow, tpHigh]);

  const points = useMemo(() => {
    const domain = [priceToday, npvRange?.low, npvRange?.high, tpRange?.low, tpRange?.high].filter(isFiniteNumber);
    const min = domain.length > 0 ? Math.min(...domain) : null;
    const max = domain.length > 0 ? Math.max(...domain) : null;

    const toY = (value: number | null): number | null => {
      if (value === null || min === null || max === null) return null;
      if (max === min) return 100;
      const t = (value - min) / (max - min);
      const y = Y_BOTTOM + (Y_TOP - Y_BOTTOM) * t;
      return clamp(y, Y_TOP, Y_BOTTOM);
    };

    return {
      npvLowY: toY(npvRange?.low ?? null),
      npvHighY: toY(npvRange?.high ?? null),
      tpLowY: toY(tpRange?.low ?? null),
      tpHighY: toY(tpRange?.high ?? null),
      priceY: toY(isFiniteNumber(priceToday) ? priceToday : null),
    };
  }, [npvRange, priceToday, tpRange]);

  const hasNpv = npvRange !== null && points.npvLowY !== null && points.npvHighY !== null;
  const hasTp = tpRange !== null && points.tpLowY !== null && points.tpHighY !== null;
  const hasPrice = isFiniteNumber(priceToday) && points.priceY !== null;

  return (
    <div style={{ marginTop: 8 }}>
      {!hasNpv && !hasTp ? (
        <p className="status empty" style={{ margin: 0 }}>Saknar intervall-data (NPV/TP)</p>
      ) : (
        <div className="project-value-snapshot-wrap">
          <svg viewBox="0 0 360 190" role="img" aria-label="Snapshot med NPV- och TP-intervall per aktie" style={{ width: "100%", height: "100%" }}>
            {hasNpv && hasTp && (
              <polygon
                points={`110,${points.npvHighY!} 270,${points.tpHighY!} 270,${points.tpLowY!} 110,${points.npvLowY!}`}
                fill="rgba(59, 130, 246, 0.16)"
                stroke="rgba(59, 130, 246, 0.35)"
                strokeWidth={1.25}
              />
            )}

            {hasNpv ? (
              <>
                <line x1={110} y1={points.npvHighY!} x2={110} y2={points.npvLowY!} stroke="#2563eb" strokeWidth={10} strokeLinecap="round" />
                <text x={30} y={points.npvHighY! + 4} fontSize={11} fill="#1f2937">{formatCompactValue(npvRange.high, currencyCode)}</text>
                <text x={30} y={points.npvLowY! + 4} fontSize={11} fill="#1f2937">{formatCompactValue(npvRange.low, currencyCode)}</text>
              </>
            ) : (
              <text x={95} y={105} fontSize={11} fill="#6b7280">n/a</text>
            )}

            {hasTp ? (
              <>
                <line x1={270} y1={points.tpHighY!} x2={270} y2={points.tpLowY!} stroke="#0f766e" strokeWidth={10} strokeLinecap="round" />
                <text x={282} y={points.tpHighY! + 4} fontSize={11} fill="#1f2937">{formatCompactValue(tpRange.high, currencyCode)}</text>
                <text x={282} y={points.tpLowY! + 4} fontSize={11} fill="#1f2937">{formatCompactValue(tpRange.low, currencyCode)}</text>
              </>
            ) : (
              <text x={255} y={105} fontSize={11} fill="#6b7280">n/a</text>
            )}

            {hasPrice && (
              <>
                <circle cx={110} cy={points.priceY!} r={5} fill="#dc2626" />
                <text x={30} y={points.priceY! - 6} fontSize={11} fill="#dc2626">{formatCompactValue(priceToday, currencyCode)}</text>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}