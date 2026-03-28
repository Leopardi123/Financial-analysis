type CopperSnapshot = {
  phase: string;
  phaseScore: number | null;
  copperRegime?: "Demand expansion" | "Demand contraction" | "Supply tightness" | "Supply expansion";
  regimeAgreementWithPrice?: "confirming" | "diverging" | "neutral";
  confidence: {
    score: number;
    tier: "high" | "medium" | "low";
    breakdown: {
      dataCompleteness: number;
      signalCoherence: number;
      fallbackPenalty: number;
    };
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
  };
  drivers: Array<{ signal: "bullish" | "bearish" | "neutral" }>;
  blockScores: Array<{ blockId: string; score: number | null }>;
};

type CopperInterpretation = {
  interpretationCase: string;
  phaseInterpretation: string;
  regimeInterpretation: string;
  confidenceInterpretation: string;
  biasInterpretation: string;
  overallInterpretation: string;
};

function parseDiagnosticTag(notes: string[], key: string): string | null {
  const taggedNote = notes.find((note) => note.startsWith(`${key}=`));
  if (!taggedNote) return null;
  return taggedNote.slice(`${key}=`.length).trim();
}

export function buildCopperInterpretation(snapshot: CopperSnapshot): CopperInterpretation {
  const demandState = parseDiagnosticTag(snapshot.diagnostics.notes, "demand_state");
  const priceState = parseDiagnosticTag(snapshot.diagnostics.notes, "price_state");
  const divergenceType = parseDiagnosticTag(snapshot.diagnostics.notes, "divergenceType");
  const regimeAgreement = snapshot.regimeAgreementWithPrice ?? "neutral";
  const hasBullishDriver = snapshot.drivers.some((driver) => driver.signal === "bullish");
  const demandBlockScore = snapshot.blockScores.find((block) => block.blockId === "macro_monetary")?.score ?? null;
  const phaseScoreText = snapshot.phaseScore === null ? "okänd styrka" : `fasstyrkan är ${snapshot.phaseScore.toFixed(2)}`;

  let interpretationCase = "fallback_mixed";
  let phaseInterpretation = "Signalbilden är blandad. Modellen pekar inte på en tydlig cykelfas just nu.";

  if (
    snapshot.phase === "Late Cycle"
    && regimeAgreement === "diverging"
    && (demandState === "weakening" || demandState === "contraction")
    && priceState === "high"
  ) {
    interpretationCase = "late_cycle_diverging_china_weak";
    phaseInterpretation = "Kopparpriset är mycket starkt, men den China-ledda cykelsignalen är svag och försämras. Det talar för sen cykel snarare än fortsatt sund expansion.";
  } else if (
    snapshot.phase === "Early Cycle"
    && (demandState === "expansion" || demandState === "expansion_strong")
    && (priceState === "low" || priceState === "mid")
  ) {
    interpretationCase = "early_cycle_improving_china_not_overheated";
    phaseInterpretation = "Kinas efterfrågesignal förbättras samtidigt som priset ännu inte är överhettat. Det talar för tidig cykel snarare än toppfas.";
  } else if (
    snapshot.phase === "Mid Cycle"
    && (demandState === "expansion" || demandState === "expansion_strong")
    && priceState === "mid"
    && regimeAgreement !== "diverging"
  ) {
    interpretationCase = "mid_cycle_balanced_expansion";
    phaseInterpretation = "Koppar visar fortsatt sund expansionsmiljö med stöd från Kina-signalen. Bilden talar mer för fortsatt medcykel än för omedelbar topp.";
  } else if (
    (snapshot.phase === "Recession" || snapshot.phase === "Compression")
    && demandState === "contraction"
    && (priceState === "low" || !hasBullishDriver)
  ) {
    interpretationCase = "recession_weak_demand_weak_price";
    phaseInterpretation = "Den China-ledda efterfrågesignalen är svag och prisbilden saknar stöd. Det talar mer för recessionär råvarumiljö än för återhämtning.";
  } else if (snapshot.phase === "Late Cycle") {
    interpretationCase = "late_cycle_generic";
    phaseInterpretation = "Priset ligger högt i cykeln och risk/reward blir mindre förlåtande. Det talar för senfasdisciplin snarare än aggressiv risk.";
  } else if (snapshot.phase === "Mid Cycle") {
    interpretationCase = "mid_cycle_generic";
    phaseInterpretation = "Bilden pekar mot pågående expansion utan tydligt överhettad toppsignal. Bas-scenariot är fortsatt medcykel.";
  } else if (snapshot.phase === "Early Cycle") {
    interpretationCase = "early_cycle_generic";
    phaseInterpretation = "Signalen pekar mot återhämtningsfas med utrymme för fortsatt förbättring. Det stödjer selektivt cykliskt risktagande.";
  }

  const regimeInterpretation = regimeAgreement === "confirming"
    ? `Regimen (${snapshot.copperRegime ?? "n/a"}) bekräftar prisbilden, vilket stärker fasläsningen.`
    : regimeAgreement === "diverging"
      ? `Regimen (${snapshot.copperRegime ?? "n/a"}) divergerar mot priset, vilket ökar risken för feltolkad styrka i spotpriset.`
      : `Regimen (${snapshot.copperRegime ?? "n/a"}) ger varken tydligt stöd eller tydlig motvind till prisbilden.`;

  const confidenceInterpretation = snapshot.confidence.tier === "low"
    ? "Tilliten till signalen är låg eftersom viktiga datapunkter saknas eller pekar åt olika håll."
    : snapshot.confidence.tier === "medium"
      ? `Signalerna är användbara men inte entydiga; ${phaseScoreText} och kräver löpande bekräftelse från nya data.`
      : `Tilliten är relativt hög: datatäckningen är god och signalerna pekar i huvudsak åt samma håll (${phaseScoreText}).`;

  const biasAdjustments: string[] = [];
  const maxPosDelta = snapshot.screeningAdjustments.thresholdAdjustments?.maxPositionSizeDeltaPct;
  const valuationDelta = snapshot.screeningAdjustments.thresholdAdjustments?.valuationMultipleFloorDeltaPct;
  if (typeof maxPosDelta === "number" && maxPosDelta !== 0) {
    biasAdjustments.push(`maxposition ${maxPosDelta > 0 ? "höjs" : "sänks"} ${Math.abs(maxPosDelta)}%`);
  }
  if (typeof valuationDelta === "number" && valuationDelta !== 0) {
    biasAdjustments.push(`värderingsgolv ${valuationDelta > 0 ? "höjs" : "sänks"} ${Math.abs(valuationDelta)}%`);
  }

  const biasBase = snapshot.screeningAdjustments.bias === "supportive"
    ? "Screening-bias är stödjande, vilket talar för mer offensiv selektion inom kopparrelaterade case."
    : snapshot.screeningAdjustments.bias === "caution"
      ? "Screening-bias är försiktig, vilket talar för högre kvalitetskrav och striktare riskkontroll."
      : snapshot.screeningAdjustments.bias === "defensive"
        ? "Screening-bias är defensiv, vilket talar för tydlig riskreduktion i kopparkänsliga exponeringar."
        : "Screening-bias är neutral och ger ingen stark tilt i urvalet just nu.";
  const biasInterpretation = biasAdjustments.length > 0
    ? `${biasBase} Just nu ${biasAdjustments.join(" och ")}.`
    : biasBase;

  const divergenceClause = divergenceType && divergenceType !== "none"
    ? ` Divergensen (${divergenceType}) sänker övertygelsen i ett rent prisdrivet case.`
    : "";
  const demandClause = demandState
    ? ` Demandläget klassas som ${demandState}${demandBlockScore === null ? "" : ` (blockscore ${demandBlockScore.toFixed(2)}).`}`
    : "";
  const overallInterpretation = `${phaseInterpretation} ${regimeInterpretation}${demandClause}${divergenceClause}`.trim();

  return {
    interpretationCase,
    phaseInterpretation,
    regimeInterpretation,
    confidenceInterpretation,
    biasInterpretation,
    overallInterpretation,
  };
}
