import { useEffect, useMemo, useState } from "react";
import { MACRO_LAB_EVENT_ZONES, MacroEventZone, MacroLabRegion } from "../data/macroLabEventZones";

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
  topDrivers: Array<{ indicatorId: string; title: string; contribution: number }>;
};

type InflationPoint = {
  date: string;
  actualInflation: number | null;
  monetaryInflation: number | null;
  goodsInflation: number | null;
  monetaryPressure: number | null;
  monetaryInflationGap: number | null;
};

type MacroLabPayload = { macroHistory?: { points?: MacroHistoryPoint[] }; inflationAnalysis?: { points?: InflationPoint[] } };

type SandboxConfig = {
  blockWeights: Record<"A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY", number>;
  overlaysWeight: number;
  inflationSubWeight: number;
  thresholds: { highInflation: number; stress: number };
  smoothingWindow: 1 | 3 | 6;
  lookbackYears: 10 | 20 | 25;
  normalization: "none" | "zscore-lite";
  disabledBlocks: Record<"A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY", boolean>;
  disabledOverlays: Record<"growth" | "stress" | "hardAsset", boolean>;
};

const BASELINE: SandboxConfig = {
  blockWeights: { A_FISCAL: 1, B_MONETARY: 1, C_INFLATION: 1, D_CREDIBILITY: 1 },
  overlaysWeight: 1,
  inflationSubWeight: 1,
  thresholds: { highInflation: 3.5, stress: 0.5 },
  smoothingWindow: 3,
  lookbackYears: 25,
  normalization: "none",
  disabledBlocks: { A_FISCAL: false, B_MONETARY: false, C_INFLATION: false, D_CREDIBILITY: false },
  disabledOverlays: { growth: false, stress: false, hardAsset: false },
};

function avg(values: Array<number | null>) {
  const valid = values.filter((v): v is number => typeof v === "number");
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function movingAvg(series: Array<number | null>, window: number) {
  return series.map((_, i) => avg(series.slice(Math.max(0, i - window + 1), i + 1)));
}

function MiniSeries({ title, dates, baseline, modified, selectedRange, onSelectRange }: { title: string; dates: string[]; baseline: Array<number | null>; modified?: Array<number | null>; selectedRange: { startDate: string; endDate: string } | null; onSelectRange: (s: string, e: string) => void }) {
  const w = 980;
  const h = 150;
  const min = Math.min(...baseline.concat(modified ?? []).filter((n): n is number => typeof n === "number"), 0);
  const max = Math.max(...baseline.concat(modified ?? []).filter((n): n is number => typeof n === "number"), 100);
  const y = (v: number | null) => (v === null ? null : h - 20 - ((v - min) / ((max - min) || 1)) * (h - 40));
  const x = (i: number) => 35 + (i / Math.max(dates.length - 1, 1)) * (w - 55);

  const path = (series: Array<number | null>) => series.map((v, i) => (y(v) === null ? "" : `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)).join(" ");
  const selectRect = (() => {
    if (!selectedRange) return null;
    const i1 = dates.findIndex((d) => d >= selectedRange.startDate);
    const i2 = dates.findIndex((d) => d >= selectedRange.endDate);
    if (i1 < 0 || i2 < 0) return null;
    return { x1: x(i1), x2: x(i2) };
  })();

  return (
    <div className="macro-lab-chart">
      <div className="macro-lab-chart-title">{title}</div>
      <svg viewBox={`0 0 ${w} ${h}`} onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const idx = Math.max(0, Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1))));
        const i2 = Math.min(dates.length - 1, idx + Math.max(2, Math.round(dates.length * 0.05)));
        onSelectRange(dates[idx], dates[i2]);
      }}>
        {selectRect && <rect x={Math.min(selectRect.x1, selectRect.x2)} y={18} width={Math.abs(selectRect.x2 - selectRect.x1)} height={h - 35} fill="rgba(14,165,233,0.18)" />}
        <line x1={35} y1={h - 20} x2={w - 20} y2={h - 20} stroke="#475569" />
        <path d={path(baseline)} fill="none" stroke="#1d4ed8" strokeWidth="2" />
        {modified && <path d={path(modified)} fill="none" stroke="#dc2626" strokeDasharray="6 4" strokeWidth="2" />}
      </svg>
    </div>
  );
}

export default function MacroRegimeValidationLab() {
  const [region, setRegion] = useState<MacroLabRegion>("US");
  const [payload, setPayload] = useState<MacroLabPayload | null>(null);
  const [config, setConfig] = useState<SandboxConfig>(BASELINE);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/sector/global-macro?region=${region}&historyResolution=MONTHLY&historyRangeYears=MAX`);
      const json = (await res.json()) as MacroLabPayload;
      if (active) setPayload(json);
    })();
    return () => { active = false; };
  }, [region]);

  const allEvents = useMemo(() => MACRO_LAB_EVENT_ZONES.filter((z) => z.region === region || z.region === "GLOBAL"), [region]);
  const points = payload?.macroHistory?.points ?? [];
  const inflation = payload?.inflationAnalysis?.points ?? [];

  const lookbackStart = useMemo(() => {
    const latest = points[points.length - 1]?.asOfDate;
    if (!latest) return null;
    const d = new Date(`${latest}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - config.lookbackYears);
    return d.toISOString().slice(0, 10);
  }, [points, config.lookbackYears]);

  const filtered = useMemo(() => points.filter((p) => !lookbackStart || p.asOfDate >= lookbackStart), [points, lookbackStart]);
  const dates = filtered.map((p) => p.asOfDate);
  const baselineMacro = movingAvg(filtered.map((p) => p.macroScoreTotal), config.smoothingWindow);
  const modifiedMacro = movingAvg(filtered.map((p) => {
    const fiscal = config.disabledBlocks.A_FISCAL ? 0 : (p.fiscalScore ?? 0) * config.blockWeights.A_FISCAL;
    const mon = config.disabledBlocks.B_MONETARY ? 0 : (p.monetaryScore ?? 0) * config.blockWeights.B_MONETARY;
    const inf = config.disabledBlocks.C_INFLATION ? 0 : (p.inflationScore ?? 0) * config.blockWeights.C_INFLATION;
    const cred = config.disabledBlocks.D_CREDIBILITY ? 0 : (p.credibilityScore ?? 0) * config.blockWeights.D_CREDIBILITY;
    const base = (fiscal + mon + inf + cred) / 4;
    const stressAdj = config.disabledOverlays.stress ? 0 : ((p.stressOverlay === "High" ? 10 : 0) * config.overlaysWeight);
    return base + stressAdj;
  }), config.smoothingWindow);

  const blockSeries = {
    fiscal: movingAvg(filtered.map((p) => p.fiscalScore), config.smoothingWindow),
    monetary: movingAvg(filtered.map((p) => p.monetaryScore), config.smoothingWindow),
    inflation: movingAvg(filtered.map((p) => p.inflationScore), config.smoothingWindow),
    credibility: movingAvg(filtered.map((p) => p.credibilityScore), config.smoothingWindow),
  };

  const inflationFiltered = inflation.filter((p) => !lookbackStart || p.date >= lookbackStart);
  const inflDates = inflationFiltered.map((p) => p.date);
  const inflationSplit = movingAvg(inflationFiltered.map((p) => (p.monetaryInflation ?? 0) * config.inflationSubWeight - (p.goodsInflation ?? 0)), config.smoothingWindow);
  const inflationGap = movingAvg(inflationFiltered.map((p) => p.monetaryInflationGap), config.smoothingWindow);

  const selectedEvent: MacroEventZone | null = allEvents.find((e) => e.id === selectedEventId) ?? null;

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
    for (let i = 1; i < baselineMacro.length; i += 1) {
      const prev = (baselineMacro[i - 1] ?? 0) > config.thresholds.highInflation;
      const curr = (baselineMacro[i] ?? 0) > config.thresholds.highInflation;
      if (prev !== curr) flips += 1;
    }
    return { flipCount: flips, flipRatePct: baselineMacro.length ? (flips / baselineMacro.length) * 100 : 0 };
  }, [baselineMacro, config.thresholds.highInflation]);

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

  return (
    <div className="macro-lab">
      <h3>Macro Regime Validation Lab (Sandbox)</h3>
      <p className="bread">Frikopplad testsida: läser data read-only och modifierar endast lokala sandbox-parametrar.</p>
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
          <label>Smoothing
            <select value={config.smoothingWindow} onChange={(e) => setConfig((p) => ({ ...p, smoothingWindow: Number(e.target.value) as 1 | 3 | 6 }))}>
              <option value={1}>1m</option><option value={3}>3m</option><option value={6}>6m</option>
            </select>
          </label>
          <label>Normalization
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
        <MiniSeries title="Macro score history (baseline vs modified)" dates={dates} baseline={baselineMacro} modified={modifiedMacro} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} />
        <MiniSeries title="Block history" dates={dates} baseline={blockSeries.fiscal} modified={blockSeries.monetary} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} />
        <MiniSeries title="Overlay history proxy (stress as score)" dates={dates} baseline={filtered.map((p) => p.stressOverlay === "High" ? 100 : p.stressOverlay === "Medium" ? 50 : 15)} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} />
        <MiniSeries title="Inflation split (monetary - goods)" dates={inflDates} baseline={inflationSplit} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} />
        <MiniSeries title="LynAldenology: Inflation proxy" dates={inflDates} baseline={movingAvg(inflationFiltered.map((p) => p.monetaryPressure), config.smoothingWindow)} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} />
        <MiniSeries title="Monetary Inflation Gap" dates={inflDates} baseline={inflationGap} selectedRange={selectedRange} onSelectRange={(s, e) => setSelectedRange({ startDate: s, endDate: e })} />
      </div>

      <div className="macro-lab-layout">
        <div className="macro-lab-panel">
          <h4>Sandbox controls (temporary)</h4>
          {(["A_FISCAL", "B_MONETARY", "C_INFLATION", "D_CREDIBILITY"] as const).map((key) => (
            <div key={key} className="macro-lab-row">
              <label>{key} weight <input type="range" min={0} max={2} step={0.1} value={config.blockWeights[key]} onChange={(e) => setConfig((p) => ({ ...p, blockWeights: { ...p.blockWeights, [key]: Number(e.target.value) } }))} /></label>
              <label><input type="checkbox" checked={config.disabledBlocks[key]} onChange={(e) => setConfig((p) => ({ ...p, disabledBlocks: { ...p.disabledBlocks, [key]: e.target.checked } }))} /> off</label>
            </div>
          ))}
          <div className="macro-lab-row">
            <label>Overlay weight <input type="range" min={0} max={2} step={0.1} value={config.overlaysWeight} onChange={(e) => setConfig((p) => ({ ...p, overlaysWeight: Number(e.target.value) }))} /></label>
            <label>Inflation sub weight <input type="range" min={0} max={2} step={0.1} value={config.inflationSubWeight} onChange={(e) => setConfig((p) => ({ ...p, inflationSubWeight: Number(e.target.value) }))} /></label>
          </div>
          <div className="macro-lab-row">
            <label>High inflation threshold <input type="number" value={config.thresholds.highInflation} step={0.1} onChange={(e) => setConfig((p) => ({ ...p, thresholds: { ...p.thresholds, highInflation: Number(e.target.value) } }))} /></label>
            <label>Stress threshold <input type="number" value={config.thresholds.stress} step={0.1} onChange={(e) => setConfig((p) => ({ ...p, thresholds: { ...p.thresholds, stress: Number(e.target.value) } }))} /></label>
          </div>
        </div>

        <div className="macro-lab-panel">
          <h4>Event details + compare mode</h4>
          {selectedEvent ? <p><strong>{selectedEvent.name}</strong> ({selectedEvent.startDate} → {selectedEvent.endDate}) · {selectedEvent.category}<br />{selectedEvent.description}</p> : <p>Välj eventzon.</p>}
          <ul>
            <li>Compare mode: blå = baseline, röd streckad = modified.</li>
            <li>Sensitivity: mean Δ {sensitivity.meanAbsDelta.toFixed(2)} · max Δ {sensitivity.maxDelta.toFixed(2)}</li>
            <li>Stability: regime flips {stability.flipCount} ({stability.flipRatePct.toFixed(1)}%)</li>
            <li>Event alignment score: {eventAlignmentScore}/100</li>
          </ul>
          <h5>Driver dependency</h5>
          <ol>{driverDependency.map(([name, count]) => <li key={name}>{name}: {count}</li>)}</ol>
        </div>

        <div className="macro-lab-panel">
          <h4>Scenario replay</h4>
          <ul>
            {replay.map((r) => (
              <li key={r.ev.id}><strong>{r.ev.name}</strong> · regime labels {r.regimeShifts} · stress high points {r.stressHigh} · top driver {r.topDriver}</li>
            ))}
          </ul>
          <p className="bread">Aktiva ändringar gäller bara i Macro Lab och påverkar inte ordinarie snapshots/scoring.</p>
        </div>
      </div>
    </div>
  );
}
