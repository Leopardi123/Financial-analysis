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
  };
  drivers: Array<{ id: string; signal: "bullish" | "bearish" | "neutral"; note?: string }>;
  blockScores: Array<{ blockId: string; score: number | null }>;
};

type CopperInterpretation = {
  interpretationCase: string;
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
  const parsed = Number(value);
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

  const phaseInterpretation = `${demandSentence} ${priceSentence} ${divergenceSentence} Slutsats: fasen ${snapshot.phase} drivs av kombinationen demand + pris, inte en isolerad prisnivå.`;
  const regimeInterpretation = `Regim=${snapshot.copperRegime ?? "n/a"} och regimeAgreementWithPrice=${snapshot.regimeAgreementWithPrice ?? "n/a"}; detta visar hur regimlagret bekräftar eller motsäger prisläsningen.`;

  const confidenceInterpretation = [
    `Tillit=${snapshot.confidence.tier} (${(snapshot.confidence.score * 100).toFixed(0)}%).`,
    missingSignals.length > 0
      ? `Saknade datapunkter: ${formatList(missingSignals)}.`
      : "Saknade datapunkter: inga.",
    conflictParts.length > 0
      ? `Divergerande datapunkter: ${conflictParts.join(", ")}.`
      : "Divergerande datapunkter: inga explicit flaggade.",
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

  const interpretationCase = [
    `phase=${snapshot.phase}`,
    `price_state=${priceState ?? "n/a"}`,
    `demand_state=${demandState ?? "n/a"}`,
    `divergence=${divergenceType ?? "n/a"}`,
    `missing=${snapshot.diagnostics.missingIndicators.join("|") || "none"}`,
  ].join("__");

  return {
    interpretationCase,
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
