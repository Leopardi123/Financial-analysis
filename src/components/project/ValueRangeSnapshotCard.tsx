import { useMemo } from "react";
import { buildValuationChartModel, type ValuationMetricMap } from "./valuationChartMetrics";

type Props = {
  metrics: ValuationMetricMap;
  currencyCode?: string;
  debugEnabled?: boolean;
};

const WIDTH = 340;
const HEIGHT = 190;

function formatValue(value: number): string {
  return value.toLocaleString("sv-SE", { minimumFractionDigits: Math.abs(value) < 100 ? 1 : 0, maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0 });
}

/** A categorical visualization of the exact List 2 table metrics; no financial values are recomputed here. */
export default function ValueRangeSnapshotCard({ metrics, currencyCode, debugEnabled = false }: Props) {
  const model = useMemo(() => buildValuationChartModel(metrics), [metrics]);
  if (!model.points.length) return <p className="status empty" style={{ margin: 0 }}>Saknar värderingsdata per aktie</p>;

  if (debugEnabled) console.table(model.points.map((point) => ({ metric: point.metric, value: point.value, x: point.x, calculatedY: point.y, renderedY: point.y, labelY: point.labelY, label: point.label })));

  return (
    <div className="project-value-snapshot-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Värderingsmått per aktie vid Nu och Produktionsstart" style={{ width: "100%", height: "100%" }}>
        <line x1={82} y1={18} x2={82} y2={160} stroke="#cbd5e1" />
        <line x1={250} y1={18} x2={250} y2={160} stroke="#cbd5e1" />
        <text x={82} y={178} textAnchor="middle" fontSize={11} fill="#475569">Nu</text>
        <text x={250} y={178} textAnchor="middle" fontSize={11} fill="#475569">Produktionsstart</text>
        {model.series.map((series) => series.points.length === 2 ? <line key={`line-${series.id}`} x1={series.points[0].x} y1={series.points[0].y} x2={series.points[1].x} y2={series.points[1].y} stroke={series.color} strokeWidth={2} /> : null)}
        {model.points.map((point) => (
          <g key={point.id}>
            {Math.abs(point.labelY - point.y) > .5 && <line x1={point.x} y1={point.y} x2={point.x + (point.stage === 'now' ? -8 : 8)} y2={point.labelY} stroke="#94a3b8" strokeWidth={.75} />}
            <circle cx={point.x} cy={point.y} r={4} fill={model.series.find((series) => series.id === point.series)?.color ?? '#334155'} />
            <text x={point.x + (point.stage === 'now' ? -9 : 9)} y={point.labelY + 4} textAnchor={point.stage === 'now' ? 'end' : 'start'} fontSize={9.5} fill="#1f2937">{point.label}: {formatValue(point.value)}</text>
          </g>
        ))}
        {currencyCode && <text x={6} y={12} fontSize={9} fill="#64748b">{currencyCode}/aktie</text>}
      </svg>
    </div>
  );
}
