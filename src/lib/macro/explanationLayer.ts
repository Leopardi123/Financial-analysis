import type { MacroBlock, MacroDriverDirection } from "./types";

export type DriverItem = {
  id: string;
  title: string;
  type: "block_driver" | "overlay" | "structural_weakness" | "missing_component";
  blockId?: MacroBlock;
  overlayId?: string;
  direction: MacroDriverDirection | "up" | "down" | "neutral";
  contributionHint: number;
  source?: string;
  exactSource?: string;
  note?: string;
};

export type MacroExplanation = {
  region: string;
  asOfDate: string;
  summary: {
    macroScore: number | null;
    regimeLabel: string;
    confidence: number;
    runtimeCompleteness: number;
    structuralQualityLabel: "robust" | "usable_with_caveats" | "fragile";
    shortNarrative: string;
  };
  blockBreakdown: Array<{
    blockId: MacroBlock;
    blockScore: number | null;
    direction: "up" | "down" | "neutral";
    confidence: number;
    status: "pass" | "partial" | "missing" | "proxy-heavy" | "structurally-incomplete";
    topPositiveDrivers: DriverItem[];
    topNegativeDrivers: DriverItem[];
    includedComponents: string[];
    excludedComponents: string[];
    missingComponents: string[];
    proxyComponents: string[];
    fallbackComponents: string[];
    narrative: string;
  }>;
  overlayBreakdown: Array<{
    overlayId: string;
    score: number | null;
    label: string;
    confidence: number;
    runtimeCompleteness: number;
    specFidelity: "high" | "medium" | "low";
    robustness: "high" | "medium" | "low";
    proxyDependence: "low" | "medium" | "high";
    includedBlocks: string[];
    excludedBlocks: string[];
    missingComponents: string[];
    narrative: string;
  }>;
  topDrivers: DriverItem[];
  structuralQuality: {
    activeCoreBlocks: number;
    partialCoreBlocks: number;
    activeOverlays: number;
    partialOverlays: number;
    proxyHeavyOverlays: number;
    missingCriticalInputs: string[];
    notes: string[];
  };
  narrative: {
    short: string;
    medium: string;
    long: string;
  };
  compareMode?: {
    baselineScore: number;
    modifiedScore: number;
    delta: number;
    blockDeltaLeader: string;
    overlayDeltaLeader: string;
    largestComponentDelta: string;
    narrative: string;
  };
};

type BuildInput = {
  region: string;
  asOfDate: string;
  regime: {
    macroScoreTotal: number | null;
    coreRegimeLabel: string;
    macroConfidence: number;
    blockScores: Record<MacroBlock, number | null>;
    topDrivers: Array<{
      indicatorId: string;
      title: string;
      block: MacroBlock;
      contribution: number;
      direction: MacroDriverDirection | string;
      driverNote: string | null;
    }>;
  };
  indicators: Array<{ indicatorId: string; title: string; block: MacroBlock; score: number | null; nullReason?: string | null }>;
  overlayBundle?: {
    overlays?: Record<string, {
      score: number | null;
      label: string;
      confidence: number;
      blockScores: Record<string, number | null>;
      components: Array<{ id: string; title: string; source: string; exactSource: string; score: number | null; missing: boolean; proxy: boolean; includedInTotal: boolean; note: string }>;
      runtime?: { status?: string; includedBlocksInTotal?: string[]; excludedBlocks?: string[]; includedBlocks?: string[]; activeProductionBlockCount?: number };
    }>;
  };
  debug?: {
    blockStatus?: Record<string, { status: "Scorable" | "Insufficient"; scored: number; total: number; reasons: string[] }>;
    overlayDataStatus?: Record<string, { usesFallback: boolean; blockedIndicators: Array<{ indicatorId: string; reason: string }> }>;
  };
};

const BLOCKS: MacroBlock[] = ["A_FISCAL", "B_MONETARY", "C_INFLATION", "D_CREDIBILITY"];


function normalizeDirection(input: string): MacroDriverDirection | "neutral" {
  if (input === "rising" || input === "falling" || input === "stable" || input === "accelerating" || input === "decelerating") return input;
  return "neutral";
}

function dirFromScore(score: number | null): "up" | "down" | "neutral" {
  if (score === null) return "neutral";
  if (score > 0.2) return "up";
  if (score < -0.2) return "down";
  return "neutral";
}

export function buildMacroExplanation(input: BuildInput): MacroExplanation {
  const topByBlock = new Map<MacroBlock, DriverItem[]>();
  for (const block of BLOCKS) topByBlock.set(block, []);
  for (const d of input.regime.topDrivers ?? []) {
    topByBlock.get(d.block)?.push({
      id: d.indicatorId,
      title: d.title,
      type: "block_driver",
      blockId: d.block,
      direction: normalizeDirection(String(d.direction ?? "stable")),
      contributionHint: d.contribution,
      note: d.driverNote ?? undefined,
    });
  }

  const blockBreakdown = BLOCKS.map((blockId) => {
    const blockDrivers = (topByBlock.get(blockId) ?? []).sort((a, b) => Math.abs(b.contributionHint) - Math.abs(a.contributionHint));
    const positive = blockDrivers.filter((d) => d.contributionHint >= 0).slice(0, 3);
    const negative = blockDrivers.filter((d) => d.contributionHint < 0).slice(0, 3);
    const blockIndicators = input.indicators.filter((i) => i.block === blockId);
    const includedComponents = blockIndicators.filter((i) => i.score !== null).map((i) => i.indicatorId);
    const missingComponents = blockIndicators.filter((i) => i.score === null).map((i) => i.indicatorId);
    const statusFromDebug = input.debug?.blockStatus?.[blockId];
    const status: MacroExplanation["blockBreakdown"][number]["status"] =
      missingComponents.length === 0 ? "pass"
        : includedComponents.length === 0 ? "missing"
          : (statusFromDebug?.status === "Insufficient" ? "structurally-incomplete" : "partial");
    return {
      blockId,
      blockScore: input.regime.blockScores[blockId],
      direction: dirFromScore(input.regime.blockScores[blockId]),
      confidence: Math.round((includedComponents.length / Math.max(1, blockIndicators.length)) * 100),
      status,
      topPositiveDrivers: positive,
      topNegativeDrivers: negative,
      includedComponents,
      excludedComponents: missingComponents,
      missingComponents,
      proxyComponents: [],
      fallbackComponents: [],
      narrative: `${blockId} är ${dirFromScore(input.regime.blockScores[blockId]) === "up" ? "stödjande" : dirFromScore(input.regime.blockScores[blockId]) === "down" ? "dämpande" : "neutral"}; ${includedComponents.length}/${Math.max(1, blockIndicators.length)} komponenter är aktiva.`,
    };
  });

  const overlays = Object.entries(input.overlayBundle?.overlays ?? {});
  const overlayBreakdown = overlays.map(([overlayId, overlay]) => {
    const components = overlay.components ?? [];
    const missingComponents = components.filter((c) => c.missing).map((c) => c.id);
    const proxyCount = components.filter((c) => c.proxy).length;
    const complete = components.length ? (components.length - missingComponents.length) / components.length : 0;
    const includedBlocks = overlay.runtime?.includedBlocksInTotal ?? overlay.runtime?.includedBlocks ?? Object.entries(overlay.blockScores).filter(([, score]) => typeof score === "number").map(([k]) => k);
    const excludedBlocks = overlay.runtime?.excludedBlocks ?? Object.entries(overlay.blockScores).filter(([, score]) => score === null).map(([k]) => k);
    const specFidelity: "high" | "medium" | "low" = includedBlocks.length >= 3 ? "high" : includedBlocks.length === 2 ? "medium" : "low";
    const robustness: "high" | "medium" | "low" = complete >= 0.8 ? "high" : complete >= 0.5 ? "medium" : "low";
    const proxyDependence: "low" | "medium" | "high" = proxyCount === 0 ? "low" : proxyCount < 2 ? "medium" : "high";
    return {
      overlayId,
      score: overlay.score,
      label: overlay.label,
      confidence: overlay.confidence,
      runtimeCompleteness: Math.round(complete * 100),
      specFidelity,
      robustness,
      proxyDependence,
      includedBlocks,
      excludedBlocks,
      missingComponents,
      narrative: `${overlay.label || overlayId}: ${includedBlocks.join(" + ") || "inga block"}. ${missingComponents.length > 0 ? `Saknas ${missingComponents.join(", ")}.` : "Inga saknade komponenter."}`,
    };
  });

  const topDrivers: DriverItem[] = [
    ...input.regime.topDrivers.slice(0, 6).map((d) => ({ id: d.indicatorId, title: d.title, type: "block_driver" as const, blockId: d.block, direction: normalizeDirection(String(d.direction ?? "stable")), contributionHint: d.contribution, note: d.driverNote ?? undefined })),
    ...overlayBreakdown.slice(0, 3).map((o) => ({ id: o.overlayId, title: o.label || o.overlayId, type: "overlay" as const, overlayId: o.overlayId, direction: dirFromScore(o.score), contributionHint: o.score ?? 0 })),
    ...overlayBreakdown.flatMap((o) => o.missingComponents.slice(0, 1).map((m) => ({ id: `${o.overlayId}:${m}`, title: `${o.overlayId} missing ${m}`, type: "missing_component" as const, overlayId: o.overlayId, direction: "neutral" as const, contributionHint: -1 }))),
  ].sort((a, b) => Math.abs(b.contributionHint) - Math.abs(a.contributionHint));

  const activeCoreBlocks = blockBreakdown.filter((b) => b.status === "pass").length;
  const partialCoreBlocks = blockBreakdown.filter((b) => b.status !== "pass").length;
  const activeOverlays = overlayBreakdown.filter((o) => o.runtimeCompleteness >= 80).length;
  const partialOverlays = overlayBreakdown.filter((o) => o.runtimeCompleteness < 80).length;
  const proxyHeavyOverlays = overlayBreakdown.filter((o) => o.proxyDependence === "high").length;
  const missingCriticalInputs = [
    ...blockBreakdown.flatMap((b) => b.missingComponents.slice(0, 2).map((m) => `${b.blockId}:${m}`)),
    ...overlayBreakdown.flatMap((o) => o.missingComponents.slice(0, 2).map((m) => `${o.overlayId}:${m}`)),
  ];

  const structuralQualityLabel: MacroExplanation["summary"]["structuralQualityLabel"] =
    missingCriticalInputs.length <= 2 && partialOverlays <= 1 ? "robust"
      : missingCriticalInputs.length <= 6 ? "usable_with_caveats"
        : "fragile";

  const short = `Makroläget (${input.regime.coreRegimeLabel}) ligger på ${input.regime.macroScoreTotal ?? "n/a"} med ${input.regime.macroConfidence}% confidence. ${structuralQualityLabel === "robust" ? "Tolkningen är strukturellt robust." : "Tolkningen har strukturella begränsningar."}`;
  const medium = `${short} Huvuddrivare: ${(topDrivers.slice(0, 3).map((d) => d.title).join(", ") || "saknas")}. Delvisa lager: ${overlayBreakdown.filter((o) => o.runtimeCompleteness < 80).map((o) => o.overlayId).join(", ") || "inga"}.`;
  const long = `${medium} Blockstatus: ${blockBreakdown.map((b) => `${b.blockId}=${b.status}`).join(" | ")}. Missing/proxy/fallback visas explicit i respektive block och overlay.`;

  return {
    region: input.region,
    asOfDate: input.asOfDate,
    summary: {
      macroScore: input.regime.macroScoreTotal,
      regimeLabel: input.regime.coreRegimeLabel,
      confidence: input.regime.macroConfidence,
      runtimeCompleteness: Math.round(((activeCoreBlocks + activeOverlays) / Math.max(1, BLOCKS.length + Math.max(1, overlayBreakdown.length))) * 100),
      structuralQualityLabel,
      shortNarrative: short,
    },
    blockBreakdown,
    overlayBreakdown,
    topDrivers,
    structuralQuality: {
      activeCoreBlocks,
      partialCoreBlocks,
      activeOverlays,
      partialOverlays,
      proxyHeavyOverlays,
      missingCriticalInputs,
      notes: [
        `Core blocks full/partial: ${activeCoreBlocks}/${partialCoreBlocks}`,
        `Overlays full/partial: ${activeOverlays}/${partialOverlays}`,
      ],
    },
    narrative: { short, medium, long },
  };
}

export function buildMacroCompareExplanation(input: {
  baselineScore: number;
  modifiedScore: number;
  blockDeltas: Record<string, number>;
  overlayDeltas: Record<string, number>;
  largestComponentDelta: string;
}): MacroExplanation["compareMode"] {
  const blockDeltaLeader = Object.entries(input.blockDeltas).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] ?? "n/a";
  const overlayDeltaLeader = Object.entries(input.overlayDeltas).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] ?? "n/a";
  const delta = input.modifiedScore - input.baselineScore;
  return {
    baselineScore: input.baselineScore,
    modifiedScore: input.modifiedScore,
    delta,
    blockDeltaLeader,
    overlayDeltaLeader,
    largestComponentDelta: input.largestComponentDelta,
    narrative: `Modified scenario ${delta >= 0 ? "höjde" : "sänkte"} total score från ${input.baselineScore.toFixed(1)} till ${input.modifiedScore.toFixed(1)}. Störst blockdelta: ${blockDeltaLeader}. Störst overlaydelta: ${overlayDeltaLeader}.`,
  };
}
