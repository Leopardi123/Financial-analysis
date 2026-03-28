type CopperSnapshot = {
  phase: string;
  phaseScore: number | null;
  status: "ok" | "partial" | "insufficient";
  copperRegime?: "Demand expansion" | "Demand contraction" | "Supply tightness" | "Supply expansion";
  regimeAgreementWithPrice?: "confirming" | "diverging" | "neutral";
  confidence: {
    score: number;
    tier: "high" | "medium" | "low";
  };
  screeningAdjustments: {
    bias: "supportive" | "neutral" | "defensive" | "caution";
    notes?: string[];
    thresholdAdjustments?: {
      valuationMultipleFloorDeltaPct?: number;
      maxPositionSizeDeltaPct?: number;
    };
  };
  diagnostics: {
    notes: string[];
    missingIndicators: string[];
    usedIndicators: string[];
    overlayConflict: string[];
    phaseReasoning?: string[];
    trendInfluence?: {
      trendStructureState: string;
      trendExpansionState: string;
      trendDataCompleteness: "full" | "partial" | "insufficient";
      trendScore: number | null;
      trendInfluenceOnPhase: string;
      trendInfluenceOnConfidence: string;
    };
  };
  drivers: Array<{ id: string; signal: "bullish" | "bearish" | "neutral"; note?: string }>;
  blockScores: Array<{ blockId: string; score: number | null }>;
};

type CopperInterpretation = {
  interpretationCase: string;
  interpretationText: string;
  summarySentences: string[];
  phaseReasoningHuman: string[];
  phaseInterpretation: string;
  regimeInterpretation: string;
  confidenceInterpretation: string;
  biasInterpretation: string;
  statusInterpretation: string;
  overallInterpretation: string;
  debug: {
    missingSignalSummary: string;
    conflictSummary: string;
    demandDriver: string;
    priceDriver: string;
    phaseCause: string;
    screeningCause: string;
  };
};

const INDICATOR_LABELS: Record<string, string> = {
  copper_lme_inventory: "lager (copper_lme_inventory)",
  copper_capex_proxy: "capex (copper_capex_proxy)",
  china_cli: "China CLI (china_cli)",
  copper_usd: "kopparpris (copper_usd)",
  pmi_us: "US PMI (pmi_us, endast supplement)",
};

function parseDiagnosticTag(notes: string[], key: string): string | null {
  const haystack = notes.join(" | ");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|[\\s,;|])${escapedKey}=([^,;|]+)`);
  const match = haystack.match(regex);
  const value = match?.[1]?.trim() ?? null;
  return value ? value.replace(/\.$/, "") : null;
}

function parseNumberOrNull(value: string | null): number | null {
  if (!value || value === "n/a") return null;
  const numericPrefix = value.match(/-?\d+(?:\.\d+)?/);
  const parsed = Number(numericPrefix?.[0] ?? value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatList(items: string[]): string {
  if (items.length === 0) return "inga";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} och ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} och ${items[items.length - 1]}`;
}

function formatPct(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}%`;
}

function inferPricePercentile(snapshot: CopperSnapshot): number | null {
  const priceDriver = snapshot.drivers.find((driver) => driver.id === "copper_price_trend");
  if (!priceDriver?.note) return null;
  const match = priceDriver.note.match(/percentile=([^,]+)/);
  return parseNumberOrNull(match?.[1]?.trim() ?? null);
}

export function buildCopperInterpretation(snapshot: CopperSnapshot): CopperInterpretation {
  const demandState = parseDiagnosticTag(snapshot.diagnostics.notes, "demand_state");
  const priceState = parseDiagnosticTag(snapshot.diagnostics.notes, "price_state");
  const divergenceType = parseDiagnosticTag(snapshot.diagnostics.notes, "divergenceType");
  const chinaCliLevel = parseNumberOrNull(parseDiagnosticTag(snapshot.diagnostics.notes, "china_cli"));
  const chinaCliChange3m = parseNumberOrNull(parseDiagnosticTag(snapshot.diagnostics.notes, "china_cli_change_3m"));
  const pricePercentile = inferPricePercentile(snapshot);
  const trendState = snapshot.diagnostics.trendInfluence;

  const missingSignals = snapshot.diagnostics.missingIndicators.map((key) => INDICATOR_LABELS[key] ?? `${key} (okänd etikett)`);
  const missingSignalSummary = missingSignals.length > 0
    ? `Saknade signaler: ${formatList(missingSignals)}.`
    : "Saknade signaler: inga av de definierade nyckelindikatorerna.";

  const conflictParts: string[] = [];
  if (divergenceType && divergenceType !== "none") {
    conflictParts.push(`divergens=${divergenceType}`);
  }
  if (snapshot.regimeAgreementWithPrice === "diverging") {
    conflictParts.push("regimeAgreementWithPrice=diverging");
  }
  if (snapshot.diagnostics.overlayConflict.length > 0) {
    conflictParts.push(`overlayConflict=${snapshot.diagnostics.overlayConflict.join(" | ")}`);
  }
  if (trendState?.trendInfluenceOnPhase && trendState.trendInfluenceOnPhase !== "none") {
    conflictParts.push(`trendPhaseEffect=${trendState.trendInfluenceOnPhase}`);
  }
  const conflictSummary = conflictParts.length > 0
    ? `Konflikt: ${conflictParts.join("; ")}.`
    : "Konflikt: inga explicit flaggade divergenser.";

  const demandDriver = `China-led demand: china_cli=${chinaCliLevel ?? "n/a"}, change_3m=${chinaCliChange3m ?? "n/a"}, demand_state=${demandState ?? "n/a"}.`;
  const priceDriver = `Prisdriver: price_state=${priceState ?? "n/a"}, percentile_10y=${pricePercentile ?? "n/a"}, phase=${snapshot.phase}.`;
  const phaseCause = `Kausalkedja: ${demandDriver} ${priceDriver} ${conflictSummary}`;

  const demandSentence = `China-led efterfråga är ${demandState ?? "okänd"} (china_cli=${chinaCliLevel ?? "n/a"}, 3m=${formatPct(chinaCliChange3m)}).`;
  const priceSentence = `Prisbilden är ${priceState ?? "okänd"} (10y-percentil=${pricePercentile ?? "n/a"}).`;
  const divergenceSentence = conflictParts.length > 0
    ? `Det finns explicit konflikt i modellen (${conflictParts.join(", ")}).`
    : "Inga explicit flaggade konflikter mellan pris och övriga signaler.";

  const trendSentence = trendState
    ? `Trend visar structure=${trendState.trendStructureState}, expansion=${trendState.trendExpansionState} och påverkar fasen via ${trendState.trendInfluenceOnPhase}.`
    : "Trenddata saknas eller är otillräcklig.";
  const phaseInterpretation = `${demandSentence} ${priceSentence} ${trendSentence} ${divergenceSentence} Slutsats: fasen ${snapshot.phase} drivs av demand + pris med trend som kompletterande bekräftelse/varning.`;
  const regimeInterpretation = `Regim=${snapshot.copperRegime ?? "n/a"} och regimeAgreementWithPrice=${snapshot.regimeAgreementWithPrice ?? "n/a"}; detta visar hur regimlagret bekräftar eller motsäger prisläsningen.`;

  const confidenceInterpretation = [
    `Tillit=${snapshot.confidence.tier} (${(snapshot.confidence.score * 100).toFixed(0)}%).`,
    missingSignals.length > 0
      ? `Saknade datapunkter: ${formatList(missingSignals)}.`
      : "Saknade datapunkter: inga.",
    conflictParts.length > 0
      ? `Divergerande datapunkter: ${conflictParts.join(", ")}.`
      : "Divergerande datapunkter: inga explicit flaggade.",
    trendState
      ? `Trendblock: structure=${trendState.trendStructureState}, expansion=${trendState.trendExpansionState}, completeness=${trendState.trendDataCompleteness}, score=${trendState.trendScore ?? "n/a"}.`
      : "Trendblock: n/a.",
  ].join(" ");

  const usedSignals = snapshot.diagnostics.usedIndicators.map((key) => INDICATOR_LABELS[key] ?? key);
  const statusInterpretation = `Status=${snapshot.status} eftersom modellen använder ${formatList(usedSignals)} och saknar ${missingSignals.length > 0 ? formatList(missingSignals) : "inga nyckelsignaler"}. Slutsatsen bygger på ${missingSignals.length > 0 ? "en ofullständig" : "en full"} kopparbild.`;

  const screeningAction = snapshot.screeningAdjustments.bias === "supportive"
    ? "urvalet kan öka cyklisk exponering selektivt"
    : snapshot.screeningAdjustments.bias === "caution"
      ? "urvalet bör prioritera stark balansräkning, lägre kostnadskurva och tydligt nedsideskydd"
      : snapshot.screeningAdjustments.bias === "defensive"
        ? "urvalet bör minska cyklisk risk och höja defensiva kvalitetskrav"
        : "urvalet hålls nära neutral baseline";
  const thresholdBits: string[] = [];
  const maxPos = snapshot.screeningAdjustments.thresholdAdjustments?.maxPositionSizeDeltaPct;
  const valuation = snapshot.screeningAdjustments.thresholdAdjustments?.valuationMultipleFloorDeltaPct;
  if (typeof maxPos === "number") thresholdBits.push(`maxPositionSizeDeltaPct=${maxPos}%`);
  if (typeof valuation === "number") thresholdBits.push(`valuationMultipleFloorDeltaPct=${valuation}%`);
  const screeningCause = `Bias=${snapshot.screeningAdjustments.bias}, demand_state=${demandState ?? "n/a"}, price_state=${priceState ?? "n/a"}, phase=${snapshot.phase}.`;
  const biasInterpretation = `Screening bias=${snapshot.screeningAdjustments.bias} betyder att ${screeningAction}. Orsak: ${screeningCause}${thresholdBits.length ? ` Trösklar: ${thresholdBits.join(", ")}.` : ""}`;

  const overallInterpretation = `${priceSentence} ${demandSentence} ${divergenceSentence} ${missingSignals.length > 0
    ? `Slutsatsen är ofullständig eftersom ${formatList(missingSignals)} saknas.`
    : "Slutsatsen har full täckning från tillgängliga nyckelsignaler."}`;

  const phaseReasoningHuman = (snapshot.diagnostics.phaseReasoning ?? []).map((line) => {
    if (line.includes("price_state=high + demand_state=weakening/contraction => Late Cycle")) {
      return "Högt pris tillsammans med avtagande eller kontraherande China-led demand pekar mot en sen cykelfas.";
    }
    if (line.includes("China CLI override")) {
      return "När den China-ledda signalen ligger under trend samtidigt som priset redan är högt talar det emot en tidig eller mittcyklisk tolkning.";
    }
    if (line.includes("Bearish divergence")) {
      return "Priset håller sig högt, men efterfrågedatan försvagas – en klassisk divergenseffekt.";
    }
    if (line.includes("Late Cycle retained")) {
      return "Trenden är fortfarande stödjande, men den ändrar inte huvudtolkningen att marknaden befinner sig sent i cykeln.";
    }
    if (line.includes("trend breakdown reinforces")) {
      return "Trendbrott förstärker bilden av en instabil sen fas.";
    }
    if (line.includes("unstable late cycle")) {
      return "Komprimerande trend vid hög prisnivå signalerar skör marknadsstruktur.";
    }
    if (line.includes("Early → Mid transition")) {
      return "Förbättrad efterfråga och expanderande trend motiverar en lutning från tidig till mittcykel.";
    }
    return line;
  });

  const summarySentences = [
    missingSignalSummary.replace("Saknade signaler:", "Modellen saknar"),
    conflictSummary.replace("Konflikt:", "Signalbild:"),
    trendState
      ? `Trendstrukturen är ${trendState.trendStructureState.replace(/_/g, " ")}, vilket ${trendState.trendInfluenceOnPhase === "late_softened_by_trend" ? "mildrar men inte upphäver" : "stödjer"} huvudtolkningen.`
      : "Trendstrukturen saknar tillräcklig täckning för stark slutsats.",
  ];

  const interpretationText = (() => {
    const demandPart = demandState === "contraction" || demandState === "weakening"
      ? "den China-ledda efterfrågesignalen pekar mot avmattning"
      : "den China-ledda efterfrågesignalen är fortsatt konstruktiv";
    const pricePart = priceState === "high"
      ? "Kopparpriset är fortsatt starkt"
      : priceState === "mid"
        ? "Kopparpriset ligger i ett mellanläge"
        : "Kopparpriset är fortsatt pressat";
    const trendPart = trendState?.trendInfluenceOnPhase === "late_softened_by_trend"
      ? "Trendstrukturen mildrar den negativa bilden något, men inte tillräckligt för att bekräfta en sund expansionsfas."
      : trendState?.trendInfluenceOnPhase === "late_reinforced_by_breakdown"
        ? "Trendförsvagningen förstärker risken i den sena fasen."
        : trendState?.trendInfluenceOnPhase === "unstable_late_cycle"
          ? "Den komprimerade trenden ökar risken för en skör uppgång."
          : "Trendbilden fungerar främst som kompletterande bekräftelse till pris- och efterfrågesignalen.";
    return `${pricePart}, men ${demandPart}. ${trendPart}`;
  })();

  const interpretationCase = [
    `phase=${snapshot.phase}`,
    `price_state=${priceState ?? "n/a"}`,
    `demand_state=${demandState ?? "n/a"}`,
    `divergence=${divergenceType ?? "n/a"}`,
    `missing=${snapshot.diagnostics.missingIndicators.join("|") || "none"}`,
  ].join("__");

  return {
    interpretationCase,
    interpretationText,
    summarySentences,
    phaseReasoningHuman,
    phaseInterpretation,
    regimeInterpretation,
    confidenceInterpretation,
    biasInterpretation,
    statusInterpretation,
    overallInterpretation,
    debug: {
      missingSignalSummary,
      conflictSummary,
      demandDriver,
      priceDriver,
      phaseCause,
      screeningCause,
    },
  };
}
