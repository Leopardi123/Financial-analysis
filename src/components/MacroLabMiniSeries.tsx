type MiniSeriesLine = { label: string; color: string; data: Array<number | null>; dashed?: boolean };

function calculateAutoscale(series: Array<Array<number | null>>, opts?: { includeZero?: boolean; symmetricAroundZero?: boolean }) {
  const values = series.flat().filter((v): v is number => typeof v === "number");
  if (!values.length) return { min: -1, max: 1 };

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (opts?.includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }

  const range = max - min;
  const safeRange = range < 1e-6 ? Math.max(Math.abs(max), 1) * 0.2 : range;
  const pad = safeRange * 0.12;

  if (opts?.symmetricAroundZero) {
    const extent = Math.max(Math.abs(min), Math.abs(max), safeRange * 0.6);
    return { min: -extent - pad * 0.3, max: extent + pad * 0.3 };
  }

  return { min: min - pad, max: max + pad };
}

export default function MacroLabMiniSeries({
  id,
  title,
  dates,
  lines,
  selectedRange,
  onSelectRange,
  expanded,
  onToggleExpand,
  rightControls,
  showZeroLine = false,
  symmetricAroundZero = false,
  expandGlyphCollapsed = "⤡",
  expandGlyphExpanded = "⤢",
}: {
  id: string;
  title: string;
  dates: string[];
  lines: MiniSeriesLine[];
  selectedRange: { startDate: string; endDate: string } | null;
  onSelectRange: (s: string, e: string) => void;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  rightControls?: React.ReactNode;
  showZeroLine?: boolean;
  symmetricAroundZero?: boolean;
  expandGlyphCollapsed?: string;
  expandGlyphExpanded?: string;
}) {
  const w = 980;
  const h = expanded ? 300 : 150;
  const domain = calculateAutoscale(lines.map((line) => line.data), { includeZero: showZeroLine, symmetricAroundZero });
  const topPad = 14;
  const bottomPad = 24;
  const y = (v: number | null) => (v === null ? null : h - bottomPad - ((v - domain.min) / ((domain.max - domain.min) || 1)) * (h - topPad - bottomPad));
  const x = (i: number) => 35 + (i / Math.max(dates.length - 1, 1)) * (w - 55);

  const path = (series: Array<number | null>) => series.map((v, i) => (y(v) === null ? "" : `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)).join(" ");
  const selectRect = (() => {
    if (!selectedRange) return null;
    const i1 = dates.findIndex((d) => d >= selectedRange.startDate);
    const i2 = dates.findIndex((d) => d >= selectedRange.endDate);
    if (i1 < 0 || i2 < 0) return null;
    return { x1: x(i1), x2: x(i2) };
  })();
  const zeroY = y(0);

  return (
    <div className={`macro-lab-chart ${expanded ? "is-expanded" : ""}`}>
      <div className="macro-lab-chart-head">
        <div className="macro-lab-chart-title">{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {rightControls}
          <button className="macro-lab-expand" onClick={() => onToggleExpand(id)} title={expanded ? "Collapse" : "Expand"}>{expanded ? expandGlyphExpanded : expandGlyphCollapsed}</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: `${h}px`, display: "block" }} onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const idx = Math.max(0, Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1))));
        const i2 = Math.min(dates.length - 1, idx + Math.max(2, Math.round(dates.length * 0.05)));
        onSelectRange(dates[idx], dates[i2]);
      }}>
        {selectRect && <rect x={Math.min(selectRect.x1, selectRect.x2)} y={topPad} width={Math.abs(selectRect.x2 - selectRect.x1)} height={h - topPad - bottomPad} fill="rgba(14,165,233,0.18)" />}
        {showZeroLine && typeof zeroY === "number" && zeroY > topPad && zeroY < h - bottomPad && <line x1={35} y1={zeroY} x2={w - 20} y2={zeroY} stroke="#64748b" strokeDasharray="3 3" />}
        <line x1={35} y1={h - bottomPad} x2={w - 20} y2={h - bottomPad} stroke="#475569" />
        {lines.map((line) => <path key={line.label} d={path(line.data)} fill="none" stroke={line.color} strokeWidth="2" strokeDasharray={line.dashed ? "6 4" : undefined} />)}
      </svg>
      <div className="macro-lab-legend">{lines.map((line) => <span key={line.label} style={{ color: line.color }}>{line.dashed ? "▭" : "—"} {line.label}</span>)}</div>
    </div>
  );
}
