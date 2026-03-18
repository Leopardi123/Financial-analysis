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

type OverlaySemanticType =
  | "liquidity_system"
  | "financial_conditions"
  | "real_economy_cost"
  | "risk_sentiment"
  | "inflation_pressure"
  | "supply_chain"
  | "geopolitical"
  | "other";

type OverlayRole = "confirming" | "modulating" | "contradicting" | "neutral";
type OverlayPattern =
  | "defensive_uncertainty"
  | "system_support_intact"
  | "cost_driven_inflation"
  | "non_energy_inflation_pressure"
  | "contained_supply_friction"
  | "localized_geopolitical_risk"
  | "mixed_overlay_picture";

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
  overlayInterpretation: {
    dominantPattern: OverlayPattern;
    secondaryPatterns: OverlayPattern[];
    narrative: string;
    overlayStates: Array<{
      overlayId: string;
      semanticType: OverlaySemanticType;
      score: number | null;
      label: string;
      qualitativeState: string;
      role: OverlayRole;
    }>;
    regimeProbabilityImpact: {
      confirming: string[];
      modulating: string[];
      contradicting: string[];
      adjustments: Array<{ regime: string; adjustmentBp: number; reason: string }>;
      note: string;
    };
    trace: string[];
  };
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

const OVERLAY_SEMANTIC_MAP: Record<string, OverlaySemanticType> = {
  liquidityOverlay: "liquidity_system",
  creditFundingOverlay: "financial_conditions",
  energyShockOverlay: "real_economy_cost",
  safeHavenRiskOffOverlay: "risk_sentiment",
  inflationCostShockOverlay: "inflation_pressure",
  tradeSupplyChainStressOverlay: "supply_chain",
  localUnrestOverlay: "geopolitical",
};

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

function scoreBucket(score: number | null) {
  if (typeof score !== "number") return "unknown" as const;
  if (score > 70) return "high" as const;
  if (score >= 50) return "mid" as const;
  if (score >= 30) return "low" as const;
  return "stress" as const;
}

function describeOverlayState(overlayId: string, score: number | null) {
  const bucket = scoreBucket(score);
  const byOverlay: Record<string, Record<typeof bucket, string>> = {
    liquidityOverlay: {
      high: "Likviditetssystemet är stödjande",
      mid: "Likviditetssystemet är blandat",
      low: "Likviditetssystemet är pressat",
      stress: "Likviditetssystemet är tydligt stressat",
      unknown: "Likviditetssystemet saknar tydlig signal",
    },
    creditFundingOverlay: {
      high: "Finansiella villkor är stödjande",
      mid: "Finansiella villkor är neutrala/blandade",
      low: "Finansiella villkor är stramare",
      stress: "Finansiella villkor är tydligt stressade",
      unknown: "Finansiella villkor saknar tydlig signal",
    },
    safeHavenRiskOffOverlay: {
      high: "Riskaptiten är relativt lugn",
      mid: "Riskbilden är blandad",
      low: "Defensivt kapitalbeteende ökar",
      stress: "Tydligt risk-off / defensivt kapitalbeteende",
      unknown: "Riskaptitsignal saknas",
    },
    energyShockOverlay: {
      high: "Ingen bred energichock dominerar",
      mid: "Energisignal är neutral/blandad",
      low: "Energikostnader pressar realekonomin",
      stress: "Bred energikostnadschock är aktiv",
      unknown: "Energichocksignal saknas",
    },
    inflationCostShockOverlay: {
      high: "Kostnadssidan är inte huvuddrivare",
      mid: "Inflationskostnadssignalen är blandad",
      low: "Kostnadsdriven inflation ökar",
      stress: "Kostnadschock driver inflation tydligt",
      unknown: "Inflationskostnadssignal saknas",
    },
    tradeSupplyChainStressOverlay: {
      high: "Supply chain fungerar relativt väl",
      mid: "Supply chain-läget är blandat",
      low: "Supply chain-friktion ökar",
      stress: "Supply chain-stress är tydlig",
      unknown: "Supply chain-signal saknas",
    },
    localUnrestOverlay: {
      high: "Lokal/geopolitisk stress är begränsad",
      mid: "Lokal/geopolitisk risk är blandad",
      low: "Lokal/geopolitisk stress ökar",
      stress: "Lokal/geopolitisk stress är tydlig",
      unknown: "Lokal/geopolitisk signal saknas",
    },
  };
  return (byOverlay[overlayId]?.[bucket] ?? (bucket === "high" ? "Stödjande" : bucket === "mid" ? "Neutral/blandad" : bucket === "low" ? "Pressad" : bucket === "stress" ? "Stressad" : "Signal saknas"));
}

function buildOverlayInterpretation(overlayBreakdown: MacroExplanation["overlayBreakdown"], regimeLabel: string): MacroExplanation["overlayInterpretation"] {
  const byId = new Map(overlayBreakdown.map((o) => [o.overlayId, o]));
  const overlayStates = overlayBreakdown.map((overlay) => {
    const semanticType = OVERLAY_SEMANTIC_MAP[overlay.overlayId] ?? "other";
    return {
      overlayId: overlay.overlayId,
      semanticType,
      score: overlay.score,
      label: overlay.label,
      qualitativeState: describeOverlayState(overlay.overlayId, overlay.score),
      role: "neutral" as OverlayRole,
    };
  });

  const has = (id: string, fn: (score: number | null) => boolean) => fn(byId.get(id)?.score ?? null);
  const isSupportive = (score: number | null) => typeof score === "number" && score > 70;
  const isNeutralOrSupportive = (score: number | null) => typeof score === "number" && score >= 50;
  const isActive = (score: number | null) => typeof score === "number" && score < 50;
  const isSevere = (score: number | null) => typeof score === "number" && score < 30;
  const noBroadEnergy = (score: number | null) => score === null || score >= 50;

  const fired: Array<{ pattern: OverlayPattern; narrative: string; trace: string; roles: Array<{ overlayId: string; role: OverlayRole }> }> = [];

  if (has("safeHavenRiskOffOverlay", isActive) && has("energyShockOverlay", noBroadEnergy)) {
    fired.push({
      pattern: "defensive_uncertainty",
      narrative: "Kapital beter sig defensivt, men stressen drivs inte av en bred energi-/kostnadschock.",
      trace: "safeHavenRiskOffOverlay active + energyShockOverlay neutral/non-active",
      roles: [
        { overlayId: "safeHavenRiskOffOverlay", role: "modulating" },
        { overlayId: "energyShockOverlay", role: "contradicting" },
      ],
    });
  }

  if (has("creditFundingOverlay", isSupportive) && has("liquidityOverlay", isNeutralOrSupportive)) {
    fired.push({
      pattern: "system_support_intact",
      narrative: "Finansiella villkor och likviditet är fortsatt stödjande, vilket begränsar bred systemstress.",
      trace: "creditFundingOverlay supportive + liquidityOverlay neutral/supportive",
      roles: [
        { overlayId: "creditFundingOverlay", role: "confirming" },
        { overlayId: "liquidityOverlay", role: "confirming" },
      ],
    });
  }

  if (has("inflationCostShockOverlay", isActive) && has("energyShockOverlay", isActive)) {
    fired.push({
      pattern: "cost_driven_inflation",
      narrative: "Inflationstrycket förstärks av energi-/kostnadschockdynamik.",
      trace: "inflationCostShockOverlay active + energyShockOverlay active",
      roles: [
        { overlayId: "inflationCostShockOverlay", role: "confirming" },
        { overlayId: "energyShockOverlay", role: "confirming" },
      ],
    });
  }

  if (has("inflationCostShockOverlay", isActive) && has("energyShockOverlay", noBroadEnergy)) {
    fired.push({
      pattern: "non_energy_inflation_pressure",
      narrative: "Inflationstryck finns utan bred energichockbekräftelse; signalen ser mer icke-energidriven ut.",
      trace: "inflationCostShockOverlay active + energyShockOverlay neutral/non-active",
      roles: [
        { overlayId: "inflationCostShockOverlay", role: "modulating" },
        { overlayId: "energyShockOverlay", role: "contradicting" },
      ],
    });
  }

  if (has("tradeSupplyChainStressOverlay", isActive) && has("creditFundingOverlay", isNeutralOrSupportive) && has("liquidityOverlay", isNeutralOrSupportive)) {
    fired.push({
      pattern: "contained_supply_friction",
      narrative: "Varuflödes-/supply-friktion syns, men finansiell systemstress är fortfarande relativt begränsad.",
      trace: "tradeSupplyChainStressOverlay active + credit/liquidity supportive",
      roles: [
        { overlayId: "tradeSupplyChainStressOverlay", role: "modulating" },
        { overlayId: "creditFundingOverlay", role: "contradicting" },
      ],
    });
  }

  if (has("localUnrestOverlay", isSevere) && has("energyShockOverlay", noBroadEnergy) && has("inflationCostShockOverlay", noBroadEnergy) && has("tradeSupplyChainStressOverlay", noBroadEnergy)) {
    fired.push({
      pattern: "localized_geopolitical_risk",
      narrative: "Geopolitisk/lokal stress är synlig, men bred makropropagering är hittills begränsad.",
      trace: "localUnrestOverlay severe + limited propagation in energy/inflation/supply",
      roles: [
        { overlayId: "localUnrestOverlay", role: "modulating" },
      ],
    });
  }

  const dominant = fired[0] ?? {
    pattern: "mixed_overlay_picture" as OverlayPattern,
    narrative: "Overlay-bilden är blandad utan ett tydligt dominant tvär-overlaymönster.",
    trace: "no strong cross-overlay rule fired",
    roles: [] as Array<{ overlayId: string; role: OverlayRole }>,
  };

  const roleMap = new Map<string, OverlayRole>();
  for (const firedPattern of fired) {
    for (const role of firedPattern.roles) {
      if (!roleMap.has(role.overlayId)) roleMap.set(role.overlayId, role.role);
    }
  }
  const withRoles = overlayStates.map((state) => ({ ...state, role: roleMap.get(state.overlayId) ?? "neutral" }));

  const confirming = withRoles.filter((o) => o.role === "confirming").map((o) => o.overlayId);
  const modulating = withRoles.filter((o) => o.role === "modulating").map((o) => o.overlayId);
  const contradicting = withRoles.filter((o) => o.role === "contradicting").map((o) => o.overlayId);

  const adjustments: Array<{ regime: string; adjustmentBp: number; reason: string }> = [];
  if (confirming.length > 0) adjustments.push({ regime: regimeLabel, adjustmentBp: 8, reason: `overlay confirming: ${confirming.join(", ")}` });
  if (contradicting.length > 0) adjustments.push({ regime: regimeLabel, adjustmentBp: -8, reason: `overlay contradicting: ${contradicting.join(", ")}` });
  if (modulating.length > 0) adjustments.push({ regime: regimeLabel, adjustmentBp: 0, reason: `tone modulation: ${modulating.join(", ")}` });

  return {
    dominantPattern: dominant.pattern,
    secondaryPatterns: fired.slice(1).map((p) => p.pattern),
    narrative: dominant.narrative,
    overlayStates: withRoles,
    regimeProbabilityImpact: {
      confirming,
      modulating,
      contradicting,
      adjustments,
      note: "Overlay interpretation modulates narrative strongly and regime weights mildly; score-distance logic remains primary.",
    },
    trace: [dominant.trace, ...fired.slice(1).map((p) => p.trace)],
  };
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
      narrative: `${describeOverlayState(overlayId, overlay.score)}. ${includedBlocks.join(" + ") || "inga block"}${missingComponents.length > 0 ? `. Saknas: ${missingComponents.join(", ")}` : ""}.`,
    };
  });

  const overlayInterpretation = buildOverlayInterpretation(overlayBreakdown, input.regime.coreRegimeLabel);

  const topDrivers: DriverItem[] = [
    ...input.regime.topDrivers.slice(0, 6).map((d) => ({ id: d.indicatorId, title: d.title, type: "block_driver" as const, blockId: d.block, direction: normalizeDirection(String(d.direction ?? "stable")), contributionHint: d.contribution, note: d.driverNote ?? undefined })),
    ...overlayInterpretation.overlayStates.slice(0, 4).map((o) => ({ id: o.overlayId, title: o.qualitativeState, type: "overlay" as const, overlayId: o.overlayId, direction: dirFromScore(o.score), contributionHint: o.score ?? 0 })),
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

  const short = `Makroläget (${input.regime.coreRegimeLabel}) ligger på ${input.regime.macroScoreTotal ?? "n/a"} med ${input.regime.macroConfidence}% confidence. ${overlayInterpretation.narrative}`;
  const medium = `${short} Huvuddrivare: ${(topDrivers.slice(0, 3).map((d) => d.title).join(", ") || "saknas")}. Overlay dominant pattern: ${overlayInterpretation.dominantPattern}.`;
  const long = `${medium} Overlay states: ${overlayInterpretation.overlayStates.map((o) => `${o.overlayId}=${o.qualitativeState}(${o.role})`).join(" | ")}. Regime-probability interaction: ${overlayInterpretation.regimeProbabilityImpact.note}`;

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
    overlayInterpretation,
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
        `Overlay dominant pattern: ${overlayInterpretation.dominantPattern}`,
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
