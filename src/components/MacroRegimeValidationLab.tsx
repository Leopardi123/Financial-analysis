import { useEffect, useMemo, useState } from "react";
import { MACRO_LAB_EVENT_ZONES, MacroEventZone, MacroLabRegion } from "../data/macroLabEventZones";
import { buildMacroCompareExplanation, type MacroExplanation } from "../lib/macro/explanationLayer";

type BlockKey = "A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY";
type OverlayKey = "growth" | "stress" | "hardAsset";
type ChartId = "macro" | "blocks" | "overlay" | "inflationSplit" | "lyn" | "gap";

type MacroHistoryPoint = {
  asOfDate: string;
  macroScoreTotal: number | null;
  fiscalScore: number | null;
  monetaryScore: number | null;
  inflationScore: number | null;
  credibilityScore: number | null;
  growthOverlay: string;
  stressOverlay: string;
  hardAssetOverlay: string;
  coreRegimeLabel: string;
  topDrivers: Array<{ indicatorId: string; title: string; contribution: number; block?: BlockKey }>;
};

type InflationPoint = {
  date: string;
  actualInflation: number | null;
  monetaryInflation: number | null;
  goodsInflation: number | null;
  monetaryPressure: number | null;
  monetaryInflationGap: number | null;
  assetInflation?: number | null;
  commodityInflation?: number | null;
  consumerInflation?: number | null;
};

type MacroLabPayload = { macroHistory?: { points?: MacroHistoryPoint[] }; inflationAnalysis?: { points?: InflationPoint[] }; globalMacro?: { macroExplanation?: MacroExplanation } };

type SubComponentControl = { weight: number; off: boolean; baselineWeight: number };

type SandboxConfig = {
  blockWeights: Record<BlockKey, number>;
  thresholds: { highInflation: number; stress: number; highPositiveGap: number };
  smoothingWindow: 1 | 3 | 6;
  lookbackYears: 10 | 20 | 25;
  normalization: "none" | "zscore-lite";
  disabledBlocks: Record<BlockKey, boolean>;
  disabledOverlays: Record<OverlayKey, boolean>;
  subComponents: Record<BlockKey, Record<string, SubComponentControl>>;
  inflation: {
    split: {
      goodsWeight: number;
      monetaryWeight: number;
      smoothing: 1 | 3 | 6;
      normalization: "none" | "zscore-lite";
      goodsActualRef: "actualInflation" | "goodsInflation" | "consumerInflation";
      goodsSubs: Record<string, SubComponentControl>;
      monetarySubs: Record<string, SubComponentControl>;
    };
    lyn: {
      smoothing: 1 | 3 | 6;
      normalization: "none" | "zscore-lite";
      chains: Record<"monetaryPressure" | "assetInflation" | "commodityInflation" | "consumerInflation", SubComponentControl>;
    };
    gap: {
      smoothing: 1 | 3 | 6;
      normalization: "none" | "zscore-lite";
      monetarySeries: "monetaryInflation" | "monetaryPressure";
      actualSeries: "actualInflation" | "goodsInflation" | "consumerInflation";
    };
  };
};

const REGION_BLOCK_DEFAULTS: Record<MacroLabRegion, Record<BlockKey, string[]>> = {
  US: {
    A_FISCAL: ["debt_gdp", "deficit_gdp", "interest_cost", "fiscal_impulse"],
    B_MONETARY: ["real_yields", "yield_curve", "balance_sheet", "money_supply", "credit_conditions"],
    C_INFLATION: ["goods_inflation", "monetary_inflation", "inflation_breadth", "actual_inflation_ref"],
    D_CREDIBILITY: ["gold", "spreads", "usd_strength", "policy_divergence"],
  },
  EA: {
    A_FISCAL: ["debt_gdp", "deficit_gdp", "interest_burden", "fiscal_space"],
    B_MONETARY: ["real_yields", "curve_slope", "ecb_balance_sheet", "m3_growth", "credit_impulse"],
    C_INFLATION: ["goods_inflation", "monetary_inflation", "wage_pressure", "actual_inflation_ref"],
    D_CREDIBILITY: ["gold", "peripheral_spreads", "eur_external", "policy_divergence"],
  },
};

const BASELINE: SandboxConfig = {
  blockWeights: { A_FISCAL: 1, B_MONETARY: 1, C_INFLATION: 1, D_CREDIBILITY: 1 },
  thresholds: { highInflation: 3.5, stress: 0.5, highPositiveGap: 1.5 },
  smoothingWindow: 3,
  lookbackYears: 25,
  normalization: "none",
  disabledBlocks: { A_FISCAL: false, B_MONETARY: false, C_INFLATION: false, D_CREDIBILITY: false },
  disabledOverlays: { growth: false, stress: false, hardAsset: false },
  subComponents: { A_FISCAL: {}, B_MONETARY: {}, C_INFLATION: {}, D_CREDIBILITY: {} },
  inflation: {
    split: {
      goodsWeight: 1,
      monetaryWeight: 1,
      smoothing: 3,
      normalization: "none",
      goodsActualRef: "actualInflation",
      goodsSubs: {
        food: { weight: 1, off: false, baselineWeight: 1 },
        energy: { weight: 1, off: false, baselineWeight: 1 },
        core_goods: { weight: 1, off: false, baselineWeight: 1 },
      },
      monetarySubs: {
        money_supply: { weight: 1, off: false, baselineWeight: 1 },
        credit: { weight: 1, off: false, baselineWeight: 1 },
        liquidity: { weight: 1, off: false, baselineWeight: 1 },
      },
    },
    lyn: {
      smoothing: 3,
      normalization: "none",
      chains: {
        monetaryPressure: { weight: 1, off: false, baselineWeight: 1 },
        assetInflation: { weight: 1, off: false, baselineWeight: 1 },
        commodityInflation: { weight: 1, off: false, baselineWeight: 1 },
        consumerInflation: { weight: 1, off: false, baselineWeight: 1 },
      },
    },
    gap: {
      smoothing: 3,
      normalization: "none",
      monetarySeries: "monetaryInflation",
      actualSeries: "actualInflation",
    },
  },
};

const BLOCK_LABELS: Record<BlockKey, string> = {
  A_FISCAL: "A_FISCAL",
  B_MONETARY: "B_MONETARY",
  C_INFLATION: "C_INFLATION",
  D_CREDIBILITY: "D_CREDIBILITY",
};

function avg(values: Array<number | null>) {
  const valid = values.filter((v): v is number => typeof v === "number");
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function movingAvg(series: Array<number | null>, window: number) {
  return series.map((_, i) => avg(series.slice(Math.max(0, i - window + 1), i + 1)));
}

function normalizeLite(series: Array<number | null>, mode: "none" | "zscore-lite") {
  if (mode === "none") return series;
  const valid = series.filter((v): v is number => typeof v === "number");
  if (valid.length < 2) return series;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length;
  const std = Math.sqrt(variance) || 1;
  return series.map((v) => (v === null ? null : ((v - mean) / std) * 10));
}

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

function getBlockScore(point: MacroHistoryPoint, block: BlockKey): number {
  if (block === "A_FISCAL") return point.fiscalScore ?? 0;
  if (block === "B_MONETARY") return point.monetaryScore ?? 0;
  if (block === "C_INFLATION") return point.inflationScore ?? 0;
  return point.credibilityScore ?? 0;
}

function toOverlayScore(point: MacroHistoryPoint) {
  const growth = point.growthOverlay === "High" ? 25 : point.growthOverlay === "Medium" ? 12 : 4;
  const stress = point.stressOverlay === "High" ? 35 : point.stressOverlay === "Medium" ? 18 : 5;
  const hardAsset = point.hardAssetOverlay === "High" ? 22 : point.hardAssetOverlay === "Medium" ? 12 : 4;
  return growth + stress + hardAsset;
}

function buildSubComponentState(names: string[]): Record<string, SubComponentControl> {
  return names.reduce<Record<string, SubComponentControl>>((acc, item) => {
    acc[item] = { weight: 1, off: false, baselineWeight: 1 };
    return acc;
  }, {});
}

function inferBlockSubComponents(region: MacroLabRegion, points: MacroHistoryPoint[]): Record<BlockKey, string[]> {
  const inferred = { ...REGION_BLOCK_DEFAULTS[region] };
  const byBlock = new Map<BlockKey, Set<string>>();

  points.forEach((point) => {
    point.topDrivers.forEach((d) => {
      if (!d.block) return;
      if (!byBlock.has(d.block)) byBlock.set(d.block, new Set<string>());
      byBlock.get(d.block)?.add((d.indicatorId || d.title || "unknown").replace(/\s+/g, "_").toLowerCase());
    });
  });

  (Object.keys(inferred) as BlockKey[]).forEach((block) => {
    const dynamic = Array.from(byBlock.get(block) ?? []);
    if (dynamic.length > 0) inferred[block] = dynamic.slice(0, 8);
  });

  return inferred;
}

function MiniSeries({
  id,
  title,
  dates,
  lines,
  selectedRange,
  onSelectRange,
  expanded,
  onToggleExpand,
  showZeroLine = false,
  symmetricAroundZero = false,
}: {
  id: ChartId;
  title: string;
  dates: string[];
  lines: Array<{ label: string; color: string; data: Array<number | null>; dashed?: boolean }>;
  selectedRange: { startDate: string; endDate: string } | null;
  onSelectRange: (s: string, e: string) => void;
  expanded: boolean;
  onToggleExpand: (id: ChartId) => void;
  showZeroLine?: boolean;
  symmetricAroundZero?: boolean;
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
        <button className="macro-lab-expand" onClick={() => onToggleExpand(id)} title={expanded ? "Collapse" : "Expand"}>{expanded ? "⤢" : "⤡"}</button>
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

function AccordionHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return <button className="macro-lab-accordion-head" onClick={onToggle}>{open ? "▾" : "▸"} {title}</button>;
}

export default function MacroRegimeValidationLab() {
  const [region, setRegion] = useState<MacroLabRegion>("US");
  const [payload, setPayload] = useState<MacroLabPayload | null>(null);
  const [config, setConfig] = useState<SandboxConfig>(BASELINE);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [expandedCharts, setExpandedCharts] = useState<Record<ChartId, boolean>>({ macro: false, blocks: false, overlay: false, inflationSplit: false, lyn: false, gap: false });
  const [openBlocks, setOpenBlocks] = useState<Record<BlockKey, boolean>>({ A_FISCAL: false, B_MONETARY: false, C_INFLATION: false, D_CREDIBILITY: false });
  const [inflationPanels, setInflationPanels] = useState({ split: false, lyn: false, gap: false });

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/sector/global-macro?region=${region}&historyResolution=MONTHLY&historyRangeYears=MAX`);
      const json = (await res.json()) as MacroLabPayload;
      if (!active) return;
      setPayload(json);
      const inferred = inferBlockSubComponents(region, json?.macroHistory?.points ?? []);
      setConfig((prev) => ({
        ...prev,
        subComponents: {
          A_FISCAL: Object.keys(prev.subComponents.A_FISCAL).length ? prev.subComponents.A_FISCAL : buildSubComponentState(inferred.A_FISCAL),
          B_MONETARY: Object.keys(prev.subComponents.B_MONETARY).length ? prev.subComponents.B_MONETARY : buildSubComponentState(inferred.B_MONETARY),
          C_INFLATION: Object.keys(prev.subComponents.C_INFLATION).length ? prev.subComponents.C_INFLATION : buildSubComponentState(inferred.C_INFLATION),
          D_CREDIBILITY: Object.keys(prev.subComponents.D_CREDIBILITY).length ? prev.subComponents.D_CREDIBILITY : buildSubComponentState(inferred.D_CREDIBILITY),
        },
      }));
    })();
    return () => { active = false; };
  }, [region]);

  const allEvents = useMemo(() => MACRO_LAB_EVENT_ZONES.filter((z) => z.region === region || z.region === "GLOBAL"), [region]);
  const points = payload?.macroHistory?.points ?? [];
  const inflation = payload?.inflationAnalysis?.points ?? [];
  const labExplanation = payload?.globalMacro?.macroExplanation;
  const labBlocks = Array.isArray(labExplanation?.blockBreakdown) ? labExplanation.blockBreakdown : [];
  const labOverlays = Array.isArray(labExplanation?.overlayBreakdown) ? labExplanation.overlayBreakdown : [];


  const lookbackStart = useMemo(() => {
    const latest = points[points.length - 1]?.asOfDate;
    if (!latest) return null;
    const d = new Date(`${latest}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - config.lookbackYears);
    return d.toISOString().slice(0, 10);
  }, [points, config.lookbackYears]);

  const filtered = useMemo(() => points.filter((p) => !lookbackStart || p.asOfDate >= lookbackStart), [points, lookbackStart]);
  const dates = filtered.map((p) => p.asOfDate);

  const blockSubMultipliers = useMemo(() => {
    return (Object.keys(BLOCK_LABELS) as BlockKey[]).reduce<Record<BlockKey, number>>((acc, block) => {
      const comps = Object.values(config.subComponents[block] ?? {});
      const enabled = comps.filter((c) => !c.off);
      const weighted = enabled.length ? enabled.reduce((a, c) => a + c.weight, 0) / enabled.length : 0;
      acc[block] = weighted;
      return acc;
    }, { A_FISCAL: 1, B_MONETARY: 1, C_INFLATION: 1, D_CREDIBILITY: 1 });
  }, [config.subComponents]);

  const baselineMacro = movingAvg(normalizeLite(filtered.map((p) => p.macroScoreTotal), config.normalization), config.smoothingWindow);
  const modifiedMacro = movingAvg(normalizeLite(filtered.map((p) => {
    const fiscal = config.disabledBlocks.A_FISCAL ? 0 : (p.fiscalScore ?? 0) * config.blockWeights.A_FISCAL * blockSubMultipliers.A_FISCAL;
    const mon = config.disabledBlocks.B_MONETARY ? 0 : (p.monetaryScore ?? 0) * config.blockWeights.B_MONETARY * blockSubMultipliers.B_MONETARY;
    const inf = config.disabledBlocks.C_INFLATION ? 0 : (p.inflationScore ?? 0) * config.blockWeights.C_INFLATION * blockSubMultipliers.C_INFLATION;
    const cred = config.disabledBlocks.D_CREDIBILITY ? 0 : (p.credibilityScore ?? 0) * config.blockWeights.D_CREDIBILITY * blockSubMultipliers.D_CREDIBILITY;
    const stressAdj = config.disabledOverlays.stress ? 0 : ((p.stressOverlay === "High" ? 10 : p.stressOverlay === "Medium" ? 3 : 0) * config.thresholds.stress);
    return (fiscal + mon + inf + cred) / 4 + stressAdj;
  }), config.normalization), config.smoothingWindow);

  const blockComposite = movingAvg(normalizeLite(filtered.map((p) => {
    const blocks = (Object.keys(BLOCK_LABELS) as BlockKey[]).map((key) => {
      if (config.disabledBlocks[key]) return 0;
      return getBlockScore(p, key) * config.blockWeights[key] * blockSubMultipliers[key];
    });
    return avg(blocks) ?? 0;
  }), config.normalization), config.smoothingWindow);

  const overlayComposite = movingAvg(normalizeLite(filtered.map((p) => toOverlayScore(p)), config.normalization), config.smoothingWindow);

  const inflationFiltered = inflation.filter((p) => !lookbackStart || p.date >= lookbackStart);
  const inflDates = inflationFiltered.map((p) => p.date);

  const goodsSub = config.inflation.split.goodsSubs;
  const monSub = config.inflation.split.monetarySubs;
  const goodsMultiplier = (Object.values(goodsSub).filter((x) => !x.off).reduce((a, b) => a + b.weight, 0) || 0) / Math.max(1, Object.values(goodsSub).filter((x) => !x.off).length);
  const monMultiplier = (Object.values(monSub).filter((x) => !x.off).reduce((a, b) => a + b.weight, 0) || 0) / Math.max(1, Object.values(monSub).filter((x) => !x.off).length);

  const refInflation = (p: InflationPoint) => {
    if (config.inflation.split.goodsActualRef === "goodsInflation") return p.goodsInflation;
    if (config.inflation.split.goodsActualRef === "consumerInflation") return p.consumerInflation ?? p.actualInflation;
    return p.actualInflation;
  };

  const inflationSplitBaseline = movingAvg(normalizeLite(inflationFiltered.map((p) => (p.monetaryInflation ?? 0) - (p.goodsInflation ?? 0)), config.inflation.split.normalization), config.inflation.split.smoothing);
  const inflationSplitModified = movingAvg(normalizeLite(inflationFiltered.map((p) => {
    const goods = (p.goodsInflation ?? 0) * config.inflation.split.goodsWeight * goodsMultiplier;
    const monetary = (p.monetaryInflation ?? 0) * config.inflation.split.monetaryWeight * monMultiplier;
    const ref = refInflation(p) ?? 0;
    return monetary - goods + ref * 0.1;
  }), config.inflation.split.normalization), config.inflation.split.smoothing);

  const lynRaw = {
    monetaryPressure: inflationFiltered.map((p) => p.monetaryPressure),
    assetInflation: inflationFiltered.map((p) => p.assetInflation ?? 0),
    commodityInflation: inflationFiltered.map((p) => p.commodityInflation ?? 0),
    consumerInflation: inflationFiltered.map((p) => p.consumerInflation ?? p.actualInflation ?? 0),
  };

  const lynSeries = (Object.keys(config.inflation.lyn.chains) as Array<keyof typeof lynRaw>).reduce<Record<string, Array<number | null>>>((acc, k) => {
    const ctl = config.inflation.lyn.chains[k];
    const weighted = ctl.off ? lynRaw[k].map(() => 0) : lynRaw[k].map((v) => (v ?? 0) * ctl.weight);
    acc[k] = movingAvg(normalizeLite(weighted, config.inflation.lyn.normalization), config.inflation.lyn.smoothing);
    return acc;
  }, {});

  const gapMonSeries = inflationFiltered.map((p) => config.inflation.gap.monetarySeries === "monetaryPressure" ? p.monetaryPressure : p.monetaryInflation);
  const gapActualSeries = inflationFiltered.map((p) => {
    if (config.inflation.gap.actualSeries === "goodsInflation") return p.goodsInflation;
    if (config.inflation.gap.actualSeries === "consumerInflation") return p.consumerInflation ?? p.actualInflation;
    return p.actualInflation;
  });
  const gapSeries = movingAvg(normalizeLite(gapMonSeries.map((v, i) => (v ?? 0) - (gapActualSeries[i] ?? 0)), config.inflation.gap.normalization), config.inflation.gap.smoothing);

  const selectedEvent: MacroEventZone | null = allEvents.find((e) => e.id === selectedEventId) ?? null;

  const selectedPointIdx = useMemo(() => {
    if (!filtered.length) return -1;
    if (!selectedRange) return filtered.length - 1;
    let idx = -1;
    for (let i = filtered.length - 1; i >= 0; i -= 1) {
      if (filtered[i].asOfDate <= selectedRange.endDate) { idx = i; break; }
    }
    return idx >= 0 ? idx : filtered.length - 1;
  }, [filtered, selectedRange]);

  const compareExplanation = useMemo(() => {
    if (selectedPointIdx < 0) return null;
    const baseline = baselineMacro[selectedPointIdx] ?? 0;
    const modified = modifiedMacro[selectedPointIdx] ?? 0;
    const point = filtered[selectedPointIdx];
    const blockDeltas: Record<string, number> = {
      A_FISCAL: (config.disabledBlocks.A_FISCAL ? 0 : (point?.fiscalScore ?? 0) * config.blockWeights.A_FISCAL * blockSubMultipliers.A_FISCAL) - (point?.fiscalScore ?? 0),
      B_MONETARY: (config.disabledBlocks.B_MONETARY ? 0 : (point?.monetaryScore ?? 0) * config.blockWeights.B_MONETARY * blockSubMultipliers.B_MONETARY) - (point?.monetaryScore ?? 0),
      C_INFLATION: (config.disabledBlocks.C_INFLATION ? 0 : (point?.inflationScore ?? 0) * config.blockWeights.C_INFLATION * blockSubMultipliers.C_INFLATION) - (point?.inflationScore ?? 0),
      D_CREDIBILITY: (config.disabledBlocks.D_CREDIBILITY ? 0 : (point?.credibilityScore ?? 0) * config.blockWeights.D_CREDIBILITY * blockSubMultipliers.D_CREDIBILITY) - (point?.credibilityScore ?? 0),
    };
    const overlayDeltas: Record<string, number> = {
      stress: (config.disabledOverlays.stress ? 0 : ((point?.stressOverlay === "High" ? 10 : point?.stressOverlay === "Medium" ? 3 : 0) * config.thresholds.stress)) - (point?.stressOverlay === "High" ? 10 : point?.stressOverlay === "Medium" ? 3 : 0),
      growth: 0,
      hardAsset: 0,
    };
    const largestComponentDelta = Object.entries({ ...blockDeltas, ...overlayDeltas }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] ?? "n/a";
    return buildMacroCompareExplanation({ baselineScore: baseline, modifiedScore: modified, blockDeltas, overlayDeltas, largestComponentDelta });
  }, [selectedPointIdx, baselineMacro, modifiedMacro, filtered, config, blockSubMultipliers]);

  const replay = useMemo(() => {
    const scenarios = ["global-gfc", "ea-euro-crisis", "global-covid-shock", "global-inflation-spike"];
    return scenarios.map((id) => {
      const ev = MACRO_LAB_EVENT_ZONES.find((z) => z.id === id);
      if (!ev) return null;
      const chunk = points.filter((p) => p.asOfDate >= ev.startDate && p.asOfDate <= ev.endDate);
      const top = chunk.flatMap((p) => p.topDrivers ?? []).reduce<Record<string, number>>((acc, d) => {
        acc[d.title] = (acc[d.title] ?? 0) + Math.abs(d.contribution ?? 0);
        return acc;
      }, {});
      const topDriver = Object.entries(top).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a";
      const regimes = new Set(chunk.map((p) => p.coreRegimeLabel));
      return { ev, topDriver, regimeShifts: regimes.size, stressHigh: chunk.filter((p) => p.stressOverlay === "High").length };
    }).filter(Boolean) as Array<{ ev: MacroEventZone; topDriver: string; regimeShifts: number; stressHigh: number }>;
  }, [points]);

  const sensitivity = useMemo(() => {
    const delta = modifiedMacro.map((v, i) => (v ?? 0) - (baselineMacro[i] ?? 0));
    return { meanAbsDelta: avg(delta.map((d) => Math.abs(d))) ?? 0, maxDelta: Math.max(...delta.map((d) => Math.abs(d)), 0) };
  }, [baselineMacro, modifiedMacro]);

  const stability = useMemo(() => {
    let flips = 0;
    for (let i = 1; i < modifiedMacro.length; i += 1) {
      const prev = (modifiedMacro[i - 1] ?? 0) > config.thresholds.highInflation;
      const curr = (modifiedMacro[i] ?? 0) > config.thresholds.highInflation;
      if (prev !== curr) flips += 1;
    }
    return { flipCount: flips, flipRatePct: modifiedMacro.length ? (flips / modifiedMacro.length) * 100 : 0 };
  }, [modifiedMacro, config.thresholds.highInflation]);

  const driverDependency = useMemo(() => {
    const map = filtered.flatMap((p) => p.topDrivers ?? []).reduce<Record<string, number>>((acc, d) => {
      acc[d.title] = (acc[d.title] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  const eventAlignmentScore = useMemo(() => {
    const checks: number[] = replay.map((r) => ((r.ev.id === "global-gfc" ? r.stressHigh > 0 : r.regimeShifts > 0) ? 1 : 0));
    const total = checks.length || 1;
    return Math.round((checks.reduce((a, b) => a + b, 0) / total) * 100);
  }, [replay]);

  const toggleChart = (id: ChartId) => setExpandedCharts((prev) => ({ ...prev, [id]: !prev[id] }));

  const subComponentsVisible = inferBlockSubComponents(region, points);

  return (
    <div className="macro-lab">
      <h3>Macro Regime Validation Lab (Sandbox)</h3>
      <p className="bread">Frikopplad testsida: läser data read-only och modifierar endast lokala sandbox-parametrar. Inga writes till production snapshots/scoring.</p>

      <div className="macro-lab-topbar">
        <div className="macro-lab-segmented">
          {(["US", "EA"] as const).map((r) => (
            <button key={r} className={r === region ? "active" : ""} onClick={() => setRegion(r)}>{r}</button>
          ))}
        </div>
        <div className="macro-lab-controls">
          <label>Lookback
            <select value={config.lookbackYears} onChange={(e) => setConfig((p) => ({ ...p, lookbackYears: Number(e.target.value) as 10 | 20 | 25 }))}>
              <option value={10}>10Y</option><option value={20}>20Y</option><option value={25}>25Y</option>
            </select>
          </label>
          <label>Macro smoothing
            <select value={config.smoothingWindow} onChange={(e) => setConfig((p) => ({ ...p, smoothingWindow: Number(e.target.value) as 1 | 3 | 6 }))}>
              <option value={1}>1m</option><option value={3}>3m</option><option value={6}>6m</option>
            </select>
          </label>
          <label>Macro normalization
            <select value={config.normalization} onChange={(e) => setConfig((p) => ({ ...p, normalization: e.target.value as SandboxConfig["normalization"] }))}><option value="none">None</option><option value="zscore-lite">zscore-lite</option></select>
          </label>
        </div>
      </div>

      <div className="macro-lab-timeline">
        {allEvents.map((ev) => (
          <button key={ev.id} style={{ borderColor: ev.color }} className={selectedEventId === ev.id ? "active" : ""} onMouseEnter={() => setSelectedRange({ startDate: ev.startDate, endDate: ev.endDate })} onClick={() => { setSelectedEventId(ev.id); setSelectedRange({ startDate: ev.startDate, endDate: ev.endDate }); }}>
            <span>{ev.icon}</span> {ev.name}
          </button>
        ))}
      </div>

      <div className="macro-lab-grid">
        <MiniSeries id="macro" title="Macro score history (baseline vs modified)" dates={dates} lines={[{ label: "Baseline", color: "#1d4ed8", data: baselineMacro }, { label: "Modified", color: "#dc2626", data: modifiedMacro, dashed: true }]} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} expanded={expandedCharts.macro} onToggleExpand={toggleChart} />
        <MiniSeries id="blocks" title="Block history composite" dates={dates} lines={[{ label: "Block composite", color: "#2563eb", data: blockComposite }]} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} expanded={expandedCharts.blocks} onToggleExpand={toggleChart} />
        <MiniSeries id="overlay" title="Overlay history" dates={dates} lines={[{ label: "Overlay composite", color: "#7c3aed", data: overlayComposite }]} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} expanded={expandedCharts.overlay} onToggleExpand={toggleChart} />
        <MiniSeries id="inflationSplit" title="Inflation split (baseline vs modified)" dates={inflDates} lines={[{ label: "Baseline split", color: "#0f766e", data: inflationSplitBaseline }, { label: "Modified split", color: "#b91c1c", data: inflationSplitModified, dashed: true }]} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} expanded={expandedCharts.inflationSplit} onToggleExpand={toggleChart} showZeroLine />
        <MiniSeries id="lyn" title="LynAldenology: Inflation" dates={inflDates} lines={[{ label: "Monetary pressure", color: "#0ea5e9", data: lynSeries.monetaryPressure ?? [] }, { label: "Asset inflation", color: "#6366f1", data: lynSeries.assetInflation ?? [] }, { label: "Commodity inflation", color: "#f97316", data: lynSeries.commodityInflation ?? [] }, { label: "Consumer inflation", color: "#16a34a", data: lynSeries.consumerInflation ?? [] }]} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} expanded={expandedCharts.lyn} onToggleExpand={toggleChart} showZeroLine />
        <MiniSeries id="gap" title="Monetary Inflation Gap" dates={inflDates} lines={[{ label: "Gap", color: "#1d4ed8", data: gapSeries }]} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} expanded={expandedCharts.gap} onToggleExpand={toggleChart} showZeroLine symmetricAroundZero />
      </div>

      <div className="macro-lab-layout">
        <div className="macro-lab-panel">
          <h4>Sandbox: Macro score controls</h4>
          {(Object.keys(BLOCK_LABELS) as BlockKey[]).map((key) => (
            <div key={key} className="macro-lab-block">
              <div className="macro-lab-row">
                <AccordionHeader title={BLOCK_LABELS[key]} open={openBlocks[key]} onToggle={() => setOpenBlocks((p) => ({ ...p, [key]: !p[key] }))} />
                <label>weight <input type="range" min={0} max={2} step={0.1} value={config.blockWeights[key]} onChange={(e) => setConfig((p) => ({ ...p, blockWeights: { ...p.blockWeights, [key]: Number(e.target.value) } }))} /></label>
                <label><input type="checkbox" checked={config.disabledBlocks[key]} onChange={(e) => setConfig((p) => ({ ...p, disabledBlocks: { ...p.disabledBlocks, [key]: e.target.checked } }))} /> off</label>
              </div>
              {openBlocks[key] && (
                <div className="macro-lab-subcontrols">
                  {(subComponentsVisible[key] ?? []).map((sub) => {
                    const value = config.subComponents[key][sub] ?? { weight: 1, off: false, baselineWeight: 1 };
                    return (
                      <div className="macro-lab-row macro-lab-subrow" key={`${key}-${sub}`}>
                        <span>{sub} <small>(base {value.baselineWeight.toFixed(1)})</small></span>
                        <label>weight <input type="range" min={0} max={2} step={0.1} value={value.weight} onChange={(e) => setConfig((p) => ({ ...p, subComponents: { ...p.subComponents, [key]: { ...p.subComponents[key], [sub]: { ...value, weight: Number(e.target.value) } } } }))} /></label>
                        <label><input type="checkbox" checked={value.off} onChange={(e) => setConfig((p) => ({ ...p, subComponents: { ...p.subComponents, [key]: { ...p.subComponents[key], [sub]: { ...value, off: e.target.checked } } } }))} /> off</label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <div className="macro-lab-row">
            <label>Stress threshold <input type="number" step={0.1} value={config.thresholds.stress} onChange={(e) => setConfig((p) => ({ ...p, thresholds: { ...p.thresholds, stress: Number(e.target.value) } }))} /></label>
            <label>High inflation threshold <input type="number" step={0.1} value={config.thresholds.highInflation} onChange={(e) => setConfig((p) => ({ ...p, thresholds: { ...p.thresholds, highInflation: Number(e.target.value) } }))} /></label>
          </div>
        </div>

        <div className="macro-lab-panel">
          <h4>Sandbox: Inflation controls</h4>
          <div className="macro-lab-block">
            <AccordionHeader title="Inflation split" open={inflationPanels.split} onToggle={() => setInflationPanels((p) => ({ ...p, split: !p.split }))} />
            {inflationPanels.split && (
              <div className="macro-lab-subcontrols">
                <div className="macro-lab-row"><label>Goods weight <input type="range" min={0} max={2} step={0.1} value={config.inflation.split.goodsWeight} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, goodsWeight: Number(e.target.value) } } }))} /></label><label>Monetary weight <input type="range" min={0} max={2} step={0.1} value={config.inflation.split.monetaryWeight} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, monetaryWeight: Number(e.target.value) } } }))} /></label></div>
                <div className="macro-lab-row"><label>Actual ref <select value={config.inflation.split.goodsActualRef} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, goodsActualRef: e.target.value as SandboxConfig["inflation"]["split"]["goodsActualRef"] } } }))}><option value="actualInflation">actualInflation</option><option value="goodsInflation">goodsInflation</option><option value="consumerInflation">consumerInflation</option></select></label><label>Smoothing <select value={config.inflation.split.smoothing} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, smoothing: Number(e.target.value) as 1 | 3 | 6 } } }))}><option value={1}>1m</option><option value={3}>3m</option><option value={6}>6m</option></select></label><label>Normalization <select value={config.inflation.split.normalization} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, normalization: e.target.value as "none" | "zscore-lite" } } }))}><option value="none">none</option><option value="zscore-lite">zscore-lite</option></select></label></div>
                <div className="macro-lab-subgroup"><strong>Goods undercomponents</strong>{Object.entries(config.inflation.split.goodsSubs).map(([k, ctl]) => <div key={k} className="macro-lab-row macro-lab-subrow"><span>{k} <small>(base {ctl.baselineWeight})</small></span><label>weight <input type="range" min={0} max={2} step={0.1} value={ctl.weight} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, goodsSubs: { ...p.inflation.split.goodsSubs, [k]: { ...ctl, weight: Number(e.target.value) } } } } }))} /></label><label><input type="checkbox" checked={ctl.off} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, goodsSubs: { ...p.inflation.split.goodsSubs, [k]: { ...ctl, off: e.target.checked } } } } }))} /> off</label></div>)}</div>
                <div className="macro-lab-subgroup"><strong>Monetary undercomponents</strong>{Object.entries(config.inflation.split.monetarySubs).map(([k, ctl]) => <div key={k} className="macro-lab-row macro-lab-subrow"><span>{k} <small>(base {ctl.baselineWeight})</small></span><label>weight <input type="range" min={0} max={2} step={0.1} value={ctl.weight} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, monetarySubs: { ...p.inflation.split.monetarySubs, [k]: { ...ctl, weight: Number(e.target.value) } } } } }))} /></label><label><input type="checkbox" checked={ctl.off} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, split: { ...p.inflation.split, monetarySubs: { ...p.inflation.split.monetarySubs, [k]: { ...ctl, off: e.target.checked } } } } }))} /> off</label></div>)}</div>
              </div>
            )}
          </div>

          <div className="macro-lab-block">
            <AccordionHeader title="LynAldenology: Inflation" open={inflationPanels.lyn} onToggle={() => setInflationPanels((p) => ({ ...p, lyn: !p.lyn }))} />
            {inflationPanels.lyn && (
              <div className="macro-lab-subcontrols">
                <div className="macro-lab-row"><label>Smoothing <select value={config.inflation.lyn.smoothing} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, lyn: { ...p.inflation.lyn, smoothing: Number(e.target.value) as 1 | 3 | 6 } } }))}><option value={1}>1m</option><option value={3}>3m</option><option value={6}>6m</option></select></label><label>Normalization <select value={config.inflation.lyn.normalization} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, lyn: { ...p.inflation.lyn, normalization: e.target.value as "none" | "zscore-lite" } } }))}><option value="none">none</option><option value="zscore-lite">zscore-lite</option></select></label></div>
                {Object.entries(config.inflation.lyn.chains).map(([k, ctl]) => <div key={k} className="macro-lab-row macro-lab-subrow"><span>{k} <small>(base {ctl.baselineWeight})</small></span><label>weight <input type="range" min={0} max={2} step={0.1} value={ctl.weight} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, lyn: { ...p.inflation.lyn, chains: { ...p.inflation.lyn.chains, [k]: { ...ctl, weight: Number(e.target.value) } } } } }))} /></label><label><input type="checkbox" checked={ctl.off} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, lyn: { ...p.inflation.lyn, chains: { ...p.inflation.lyn.chains, [k]: { ...ctl, off: e.target.checked } } } } }))} /> off</label></div>)}
              </div>
            )}
          </div>

          <div className="macro-lab-block">
            <AccordionHeader title="Monetary Inflation Gap" open={inflationPanels.gap} onToggle={() => setInflationPanels((p) => ({ ...p, gap: !p.gap }))} />
            {inflationPanels.gap && (
              <div className="macro-lab-subcontrols">
                <div className="macro-lab-row"><label>Monetary series <select value={config.inflation.gap.monetarySeries} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, gap: { ...p.inflation.gap, monetarySeries: e.target.value as "monetaryInflation" | "monetaryPressure" } } }))}><option value="monetaryInflation">monetaryInflation</option><option value="monetaryPressure">monetaryPressure</option></select></label><label>Actual series <select value={config.inflation.gap.actualSeries} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, gap: { ...p.inflation.gap, actualSeries: e.target.value as "actualInflation" | "goodsInflation" | "consumerInflation" } } }))}><option value="actualInflation">actualInflation</option><option value="goodsInflation">goodsInflation</option><option value="consumerInflation">consumerInflation</option></select></label></div>
                <div className="macro-lab-row"><label>Smoothing <select value={config.inflation.gap.smoothing} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, gap: { ...p.inflation.gap, smoothing: Number(e.target.value) as 1 | 3 | 6 } } }))}><option value={1}>1m</option><option value={3}>3m</option><option value={6}>6m</option></select></label><label>Normalization <select value={config.inflation.gap.normalization} onChange={(e) => setConfig((p) => ({ ...p, inflation: { ...p.inflation, gap: { ...p.inflation.gap, normalization: e.target.value as "none" | "zscore-lite" } } }))}><option value="none">none</option><option value="zscore-lite">zscore-lite</option></select></label><label>High +gap threshold <input type="number" step={0.1} value={config.thresholds.highPositiveGap} onChange={(e) => setConfig((p) => ({ ...p, thresholds: { ...p.thresholds, highPositiveGap: Number(e.target.value) } }))} /></label></div>
              </div>
            )}
          </div>
        </div>

        <div className="macro-lab-panel">
          <h4>Event details + compare mode</h4>
          {selectedEvent ? <p><strong>{selectedEvent.name}</strong> ({selectedEvent.startDate} → {selectedEvent.endDate}) · {selectedEvent.category}<br />{selectedEvent.description}</p> : <p>Välj eventzon.</p>}
          {labExplanation && (
            <div className="macro-lab-note" style={{ marginBottom: 8 }}>
              <strong>Driver breakdown (selected date/runtime):</strong><br />
              {String(labExplanation.narrative?.medium ?? "")}
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer" }}>Visa block/overlay breakdown</summary>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  <strong>Core blocks</strong>
                  <ul>
                    {labBlocks.map((block) => (
                      <li key={`lab-block-${block.blockId}`}>
                        {block.blockId}: score {typeof block.blockScore === "number" ? block.blockScore.toFixed(1) : "—"}, {block.status}, confidence {block.confidence}%.
                        + {block.topPositiveDrivers.map((d) => d.title).join(", ") || "—"} / − {block.topNegativeDrivers.map((d) => d.title).join(", ") || "—"}.
                      </li>
                    ))}
                  </ul>
                  <strong>Overlays</strong>
                  <ul>
                    {labOverlays.map((overlay) => (
                      <li key={`lab-overlay-${overlay.overlayId}`}>
                        {overlay.overlayId}: score {typeof overlay.score === "number" ? overlay.score.toFixed(1) : "—"}, completeness {overlay.runtimeCompleteness}%, proxy {overlay.proxyDependence}, missing {overlay.missingComponents.join(", ") || "—"}.
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </div>
          )}
          {compareExplanation && (
            <div className="macro-lab-note" style={{ marginBottom: 8 }}>
              <strong>Compare delta explanation:</strong><br />
              {compareExplanation.narrative} (Δ {compareExplanation.delta.toFixed(2)}, block leader {compareExplanation.blockDeltaLeader}, overlay leader {compareExplanation.overlayDeltaLeader}, component {compareExplanation.largestComponentDelta}).
            </div>
          )}
          <ul>
            <li>Compare mode: blå = baseline, röd streckad = modified.</li>
            <li>Sensitivity: mean Δ {sensitivity.meanAbsDelta.toFixed(2)} · max Δ {sensitivity.maxDelta.toFixed(2)}</li>
            <li>Stability: regime flips {stability.flipCount} ({stability.flipRatePct.toFixed(1)}%)</li>
            <li>Event alignment score: {eventAlignmentScore}/100</li>
          </ul>
          <h5>Driver dependency</h5>
          <ol>{driverDependency.map(([name, count]) => <li key={name}>{name}: {count}</li>)}</ol>
          <h5>Scenario replay</h5>
          <ul>{replay.map((r) => <li key={r.ev.id}><strong>{r.ev.name}</strong> · regime labels {r.regimeShifts} · stress high points {r.stressHigh} · top driver {r.topDriver}</li>)}</ul>
          <p className="bread">Aktiva ändringar gäller bara i Macro Lab och påverkar inte ordinarie snapshots/scoring.</p>
        </div>
      </div>
    </div>
  );
}
