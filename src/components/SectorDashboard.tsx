import { useEffect, useMemo, useState } from "react";
import InfoPopover from "./InfoPopover";
import { buildMacroAssetMap } from "../lib/macro/macroAssetMap";
import { buildMacroSectorMap, type MacroSectorMapItem } from "../lib/macro/macroSectorMap";
import {
  buildMacroSectorQualityMap,
  type MacroSignalQuality,
  type RegimeCoherenceLevel,
  type TransitionRiskLevel,
} from "../lib/macro/macroSectorQuality";
import { getSectorDashboardUniverse, getSubsectorMacroRouting } from "../lib/macro/macroSectorUniverse";
import { buildSubsectorCoverageAuditReport } from "../lib/macro/subsectorCoverageAudit";
import { buildCopperInterpretation } from "../lib/sector/commodityProfiles/copperInterpretation";
import { buildGoldInterpretation } from "../lib/sector/commodityProfiles/goldInterpretation";
import DirectionalSpine from "./DirectionalSpine";
import CommodityTrendSwipeSection from "./CommodityTrendSwipeSection";
import CompanyPicker from "./CompanyPicker";

type ManualInput = {
  input_type: string;
  value: string;
  source?: string | null;
  note?: string | null;
  created_at: string;
};

type OverviewPayload = {
  todo?: string[];
  metrics?: Array<Record<string, unknown>>;
  computedMetrics?: Array<{ metric: string; value: number; sampleSize?: number }>;
  missingMetrics?: string[];
  suggestedFmpEndpoints?: string[];
  commodityExposure?: {
    mappedCompanies: number;
    companiesWithExposure: number;
    manualOverrideCount: number;
    sampleProfiles: Array<{
      companyId: string;
      ticker: string | null;
      primaryCommodity: string | null;
      basis: string;
      confidence: number;
      isDiversified: boolean;
      note: string | null;
      source: string | null;
      canonicalSectorId: string;
      canonicalSubsectorId: string | null;
      defaultProfile: {
        basis: string;
        confidence: number;
        exposures: Array<{
          commodity: string;
          weight: number;
          evidence: string;
          confidence: number;
          notes?: string;
        }>;
      };
      manualOverrideProfile: {
        basis: string;
        confidence: number;
        exposures: Array<{ commodity: string; weight: number }>;
      } | null;
      finalProfile: {
        basis: string;
        confidence: number;
        exposures: Array<{
          commodity: string;
          weight: number;
          evidence: string;
          confidence: number;
        }>;
      };
    }>;
  };
};

type MacroOverlay = { score: number | null };

type MacroSnapshotPayload = {
  globalMacro?: {
    regime?: { coreRegimeLabel?: string | null };
    macroRegimeProbability?: {
      primaryRegime?: string | null;
      decisiveness?: number | null;
      supportingOverlays?: string[];
      modulatingOverlays?: string[];
      contradictingOverlays?: string[];
      regimeMomentum?: { direction?: string | null; driftTowardRegime?: string | null };
    };
    overlayBundle?: {
      overlays?: Record<string, MacroOverlay>;
    };
    overlays?: {
      overlays?: Record<string, MacroOverlay>;
    };
  };
};

type CommoditySnapshotPayload = {
  ok: boolean;
  commodity?: string;
  trendPriceHistory?: Array<{
    date: string;
    value: number | null;
  }>;
  trendPriceMeta?: {
    lookbackYearsRequested?: number;
    observationCount?: number;
    fromDate?: string | null;
    toDate?: string | null;
  };
  pmiDebug?: {
    chinaCli?: {
      valueLatest: number | null;
      change3m: number | null;
      change1m: number | null;
      asOf: string | null;
      selectedRegion: string | null;
      used?: boolean;
    };
    pmiUs?: {
      valueLatest: number | null;
      change3m: number | null;
      change1m: number | null;
      asOf: string | null;
      selectedRegion: string | null;
      used?: "supplemental_only";
    };
  };
  debug?: {
    mode?: string;
    externalFetchAttempted?: boolean;
    externalFetchReason?: string;
    indicatorKeysRequested?: string[];
    indicatorSelection?: Array<{
      key: string;
      selectedRegion: string | null;
      selectedAsOf: string | null;
      candidates: Array<{ region: string; asOf: string }>;
      note: string;
    }>;
    priceSeriesKey?: string;
    priceSeriesWindow10y?: {
      observationCount?: number;
      mean10y?: number | null;
      std10y?: number | null;
      latest?: number | null;
    };
    chinaCliAvailable?: boolean;
    pmiUsAvailable?: boolean;
    blockers?: string[];
  };
  snapshot?: {
    commodity: string;
    category: string;
    phase: string;
    phaseScore: number | null;
    status: "ok" | "partial" | "insufficient";
    profileVersion: string;
    asOf: string;
    goldRegime?: "Monetary Stress" | "Disinflation / Real Yield Rising" | "Risk-Off (deflationary)" | "Neutral / Competing Assets";
    copperRegime?: "Demand expansion" | "Demand contraction" | "Supply tightness" | "Supply expansion";
    regimeConfidence?: number;
    trendSignal?: {
      structure: string;
      expansion: string;
      momentumState?: string;
      longTrendDirection?: string;
      shortTrendMomentum?: string;
      trendCombinedInterpretation?: string;
      completeness: "full" | "partial" | "insufficient";
      score: number | null;
    };
    regimeAgreementWithPrice?: "confirming" | "diverging" | "neutral";
    regimeDrivers?: Array<{ id: string; label: string; signal: "supportive" | "headwind" | "neutral"; note: string }>;
    confidence: {
      score: number;
      tier: "high" | "medium" | "low";
      breakdown: {
        dataCompleteness: number;
        signalCoherence: number;
        fallbackPenalty: number;
      };
      confidenceComponents: {
        dataCompleteness: number;
        signalCoherence: number;
        fallbackPenalty: number;
      };
      reasons: string[];
    };
    drivers: Array<{ id: string; label: string; signal: "bullish" | "bearish" | "neutral"; weight: number; note?: string }>;
    blockScores: Array<{ blockId: string; label: string; score: number | null; status: "used" | "missing" | "not_used" }>;
    diagnostics: {
      usedIndicators: string[];
      missingIndicators: string[];
      fallbackIndicators: string[];
      usedOverlays: string[];
      missingOverlays: string[];
      ignoredOverlays: string[];
      overlayContribution: {
        score: number | null;
        classification: "supportive" | "partial_support" | "neutral" | "partial_conflict" | "conflict" | "unavailable";
        note: string;
      };
      overlayAgreement: "supportive" | "partial_support" | "neutral" | "partial_conflict" | "conflict" | "unavailable";
      overlayConflict: string[];
      overlayLayerDiagnostics?: {
        goldMonetaryStressOverlay: {
          score: number | null;
          direction: "supportive" | "neutral" | "opposing";
          confidence: number;
        };
        marketRiskOffOverlay: {
          score: number | null;
          direction: "supportive" | "neutral" | "opposing";
          confidence: number;
        };
        primaryDecisionDriver: "goldMonetaryStressOverlay" | "marketRiskOffOverlay" | "none";
        overlaysDiverging: boolean;
        regimeOverrideApplied?: boolean;
        baseRegime?: "Monetary Stress" | "Disinflation / Real Yield Rising" | "Risk-Off (deflationary)" | "Neutral / Competing Assets";
        regimeOverrideReason?: string | null;
      };
      confidenceReasons: string[];
      phaseStrength: "strong" | "moderate" | "weak";
      phaseReasoning: string[];
      trendInfluence?: {
        trendStructureState: string;
        trendExpansionState: string;
        trendMomentumState?: string;
        longTrendDirection?: string;
        shortTrendMomentum?: string;
        trendCombinedInterpretation?: string;
        trendDataCompleteness: "full" | "partial" | "insufficient";
        trendScore: number | null;
        trendInfluenceOnPhase: string;
        trendInfluenceOnConfidence: string;
      };
      notes: string[];
    };
    screeningAdjustments: {
      bias: "supportive" | "neutral" | "defensive" | "caution";
      notes?: string[];
      thresholdAdjustments?: {
        valuationMultipleFloorDeltaPct?: number;
        maxPositionSizeDeltaPct?: number;
      };
    };
  };
  error?: string;
};

const SECTORS = getSectorDashboardUniverse();

const GENERIC_QUESTIONS = [
  {
    inputType: "market_structure",
    label: "Marknadsstruktur",
    options: ["Underutbud", "Balans", "Överutbud"],
  },
  {
    inputType: "inventory_data",
    label: "Finns lagerdata? (nivå/trend + källa)",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "capex_trend",
    label: "CAPEX-trend",
    options: ["Accelererande", "Stabil", "Fallande"],
  },
  {
    inputType: "management_tone",
    label: "Bolagens kommunikation",
    options: ["Expansiv", "Försiktig", "Defensiv"],
  },
  {
    inputType: "geopolitics",
    label: "Geopolitik (ja/nej + kommentar)",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "regulatory_risk",
    label: "Regulatoriska risker",
    options: ["Låg", "Medel", "Hög"],
  },
  {
    inputType: "structural_drivers",
    label: "Strukturella efterfrågedrivare",
    options: ["Starka", "Neutrala", "Svaga"],
  },
];

const GOLD_QUESTIONS = [
  {
    inputType: "gold_physical_market",
    label: "Fysisk marknad (guld)",
    options: ["Tight", "Balans", "Löst"],
  },
  {
    inputType: "gold_inventory_data",
    label: "Lagerdata (LBMA/ETF/centralbanker)",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "central_bank_buying",
    label: "Centralbanksköp",
    options: ["Stigande", "Stabil", "Fallande"],
  },
  {
    inputType: "jewelry_demand",
    label: "Smycken/industriell efterfrågan",
    options: ["Stark", "Neutral", "Svag"],
  },
  {
    inputType: "gold_supply_projects",
    label: "Nya projekt online 3–5 år",
    options: ["Ja", "Nej"],
  },
  {
    inputType: "mine_life_trend",
    label: "Mine life-trend",
    options: ["Sjunkande", "Stabil", "Ökande"],
  },
  {
    inputType: "capital_discipline",
    label: "Kapitaldisciplin",
    options: ["Försiktiga", "Opportunistiska", "Slösaktiga"],
  },
  {
    inputType: "management_focus",
    label: "Ledningens fokus",
    options: ["Avkastning", "Volym", "Tillväxt till varje pris"],
  },
];

const COPPER_QUESTIONS = [
  {
    inputType: "copper_demand_trend",
    label: "PMI / demand-trend",
    options: ["Accelererande", "Stabil", "Avtagande"],
  },
  {
    inputType: "copper_supply_balance",
    label: "Supply balance (koppar)",
    options: ["Tight", "Balans", "Överskott"],
  },
  {
    inputType: "copper_capex_cycle",
    label: "CAPEX-cykel (koppar)",
    options: ["Expanderar", "Neutral", "Kontraherar"],
  },
];

const OIL_QUESTIONS = [
  {
    inputType: "opec_discipline",
    label: "OPEC-disciplin",
    options: ["Hög", "Medel", "Låg"],
  },
  {
    inputType: "shale_response",
    label: "Shale-respons",
    options: ["Snabb", "Måttlig", "Trög"],
  },
  {
    inputType: "demand_elasticity",
    label: "Efterfrågeelasticitet",
    options: ["Hög", "Medel", "Låg"],
  },
  {
    inputType: "energy_policy",
    label: "Energipolitik/reglering",
    options: ["Stram", "Neutral", "Stödjande"],
  },
  {
    inputType: "inventory_oecd",
    label: "OECD/SPR lagerdata",
    options: ["Hög", "Normal", "Låg"],
  },
];

const COMPANY_CATEGORIES = [
  "Major",
  "Producer",
  "Junior developer",
  "Junior explorer - fyndighet",
  "Junior explorer - pre descovery",
];

type MacroToneFilter = "all" | "favored" | "neutral" | "underPressure";
type MacroStrengthFilter = "all" | MacroSectorMapItem["strength"];

function macroKeysForSector(sectorId: string, subsectorId: string): string[] {
  const sector = SECTORS.find((item) => item.id === sectorId);
  if (!sector) return [];
  const subsector = sector.subsectors.find((item) => item.id === subsectorId);
  if (!subsector) return [sectorId];
  const broadFallbacks = [sectorId];
  return [...subsector.macroTargetIds, ...broadFallbacks];
}

function resolveSectorMacroTag(
  tagMap: Map<string, {
    tone: "favored" | "neutral" | "underPressure";
    strength: MacroSectorMapItem["strength"];
    quality: MacroSignalQuality;
  }>,
  sectorId: string,
  subsectorId: string
) {
  return macroKeysForSector(sectorId, subsectorId).map((key) => tagMap.get(key)).find(Boolean) ?? null;
}

function resolveSectorMacroTagWithPath(
  tagMap: Map<string, {
    tone: "favored" | "neutral" | "underPressure";
    strength: MacroSectorMapItem["strength"];
    quality: MacroSignalQuality;
  }>,
  sectorId: string,
  subsectorId: string
) {
  const routing = getSubsectorMacroRouting(sectorId, subsectorId);
  const explicit = routing.explicitTargetIds.find((id) => tagMap.has(id));
  if (explicit) {
    return { tag: tagMap.get(explicit) ?? null, path: "explicit_subsector" as const, matchedTargetId: explicit, coverage: routing.coverage };
  }
  if (routing.sectorFallbackId && tagMap.has(routing.sectorFallbackId)) {
    return { tag: tagMap.get(routing.sectorFallbackId) ?? null, path: "sector_fallback" as const, matchedTargetId: routing.sectorFallbackId, coverage: routing.coverage };
  }
  const macroBucketFallback = routing.macroBucketFallbackIds.find((id) => tagMap.has(id));
  if (macroBucketFallback) {
    return { tag: tagMap.get(macroBucketFallback) ?? null, path: "macro_bucket_fallback" as const, matchedTargetId: macroBucketFallback, coverage: routing.coverage };
  }
  return { tag: null, path: "unmapped" as const, matchedTargetId: null, coverage: routing.coverage };
}

export default function SectorDashboard() {
  const [sector, setSector] = useState(SECTORS[0]?.id ?? "");
  const [subsector, setSubsector] = useState(SECTORS[0]?.subsectors[0]?.id ?? "");
  const [manualInputs, setManualInputs] = useState<ManualInput[]>([]);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [inputSource, setInputSource] = useState("");
  const [inputNote, setInputNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [mappingTickers, setMappingTickers] = useState("");
  const [mappingCategory, setMappingCategory] = useState(COMPANY_CATEGORIES[0]);
  const [overrideTicker, setOverrideTicker] = useState("");
  const [overrideWeights, setOverrideWeights] = useState("gold:1.0");
  const [overrideSource, setOverrideSource] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [overviewReloadNonce, setOverviewReloadNonce] = useState(0);
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [activeCompanyTicker, setActiveCompanyTicker] = useState("");
  const [macroSnapshot, setMacroSnapshot] = useState<MacroSnapshotPayload | null>(null);
  const [commoditySnapshot, setCommoditySnapshot] = useState<CommoditySnapshotPayload | null>(null);
  const [macroLens, setMacroLens] = useState<MacroToneFilter>("all");
  const [macroStrength, setMacroStrength] = useState<MacroStrengthFilter>("all");
  const [openCopperInfoId, setOpenCopperInfoId] = useState<string | null>(null);
  const subsectorCoverageAudit = useMemo(() => buildSubsectorCoverageAuditReport(), []);
  const debugMacroMapping = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("macroDebug") === "1";
  }, []);

  const activeOverlayBundle = macroSnapshot?.globalMacro?.overlayBundle ?? macroSnapshot?.globalMacro?.overlays ?? null;
  const regimeProbability = macroSnapshot?.globalMacro?.macroRegimeProbability ?? null;
  const primaryRegime = String(
    regimeProbability?.primaryRegime ?? macroSnapshot?.globalMacro?.regime?.coreRegimeLabel ?? "Balanced"
  );

  const regimeInterpretation = useMemo(() => {
    const decisiveness = typeof regimeProbability?.decisiveness === "number" ? regimeProbability.decisiveness : null;
    const momentumDirection = String(regimeProbability?.regimeMomentum?.direction ?? "");
    const driftToward = String(regimeProbability?.regimeMomentum?.driftTowardRegime ?? "");
    const supportingCount = Array.isArray(regimeProbability?.supportingOverlays)
      ? regimeProbability.supportingOverlays.length
      : 0;
    const modulatingCount = Array.isArray(regimeProbability?.modulatingOverlays)
      ? regimeProbability.modulatingOverlays.length
      : 0;
    const contradictingCount = Array.isArray(regimeProbability?.contradictingOverlays)
      ? regimeProbability.contradictingOverlays.length
      : 0;

    let riskClimate: "Neutral" | "Neutral to risk-off" | "Risk-off" = primaryRegime === "FiscalDominanceRisk"
      ? "Risk-off"
      : primaryRegime === "FiscalPressureBuilding"
        ? "Neutral to risk-off"
        : "Neutral";
    const softenRiskOff = driftToward === "Balanced" || /toward_balanced/i.test(momentumDirection) || modulatingCount >= 3;
    if (softenRiskOff) {
      if (riskClimate === "Risk-off") riskClimate = "Neutral to risk-off";
      else if (riskClimate === "Neutral to risk-off") riskClimate = "Neutral";
    }

    const hasDirectionalSupport = supportingCount >= 3;
    const reducedConviction = modulatingCount >= 2 && contradictingCount >= 1;
    const sectorBias = hasDirectionalSupport && !reducedConviction
      ? "Broad risk-on"
      : (contradictingCount >= 2 || reducedConviction ? "Defensive" : "Selective");

    if (decisiveness !== null && decisiveness < 0.2) {
      return { riskClimate, sectorBias: `${sectorBias} (low conviction)` };
    }
    return { riskClimate, sectorBias };
  }, [
    primaryRegime,
    regimeProbability?.contradictingOverlays,
    regimeProbability?.decisiveness,
    regimeProbability?.modulatingOverlays,
    regimeProbability?.regimeMomentum?.direction,
    regimeProbability?.regimeMomentum?.driftTowardRegime,
    regimeProbability?.supportingOverlays,
  ]);

  const macroSectorMap = useMemo(() => {
    const macroAssetMap = buildMacroAssetMap({
      primaryRegime,
      momentumDirection: String(regimeProbability?.regimeMomentum?.direction ?? ""),
      overlays: activeOverlayBundle?.overlays,
    });
    return buildMacroSectorMap(macroAssetMap);
  }, [activeOverlayBundle?.overlays, primaryRegime, regimeProbability?.regimeMomentum?.direction]);

  const macroRegimeQuality = useMemo(() => {
    const modulatingCount = Array.isArray(regimeProbability?.modulatingOverlays)
      ? regimeProbability.modulatingOverlays.length
      : 0;
    const contradictingCount = Array.isArray(regimeProbability?.contradictingOverlays)
      ? regimeProbability.contradictingOverlays.length
      : 0;
    const coherence: RegimeCoherenceLevel = contradictingCount >= 2
      ? "low"
      : (contradictingCount === 0 && modulatingCount <= 2 ? "high" : "medium");
    const transitionRisk: TransitionRiskLevel = coherence === "low"
      ? "high"
      : (contradictingCount >= 1 ? "elevated" : "low");

    return { coherence, transitionRisk };
  }, [regimeProbability?.contradictingOverlays, regimeProbability?.modulatingOverlays]);

  const macroSectorQualityMap = useMemo(() => {
    return buildMacroSectorQualityMap(macroSectorMap, {
      regimeCoherence: macroRegimeQuality.coherence,
      transitionRisk: macroRegimeQuality.transitionRisk,
      contradictingOverlays: regimeProbability?.contradictingOverlays,
      modulatingOverlays: regimeProbability?.modulatingOverlays,
    });
  }, [
    macroRegimeQuality.coherence,
    macroRegimeQuality.transitionRisk,
    macroSectorMap,
    regimeProbability?.contradictingOverlays,
    regimeProbability?.modulatingOverlays,
  ]);

  const macroTagBySector = useMemo(() => {
    const tagMap = new Map<string, {
      tone: "favored" | "neutral" | "underPressure";
      strength: MacroSectorMapItem["strength"];
      quality: MacroSignalQuality;
    }>();
    const addTags = (
      items: Array<MacroSectorMapItem & { quality: MacroSignalQuality }>,
      tone: "favored" | "neutral" | "underPressure"
    ) => {
      items.forEach((item) => tagMap.set(item.id, { tone, strength: item.strength, quality: item.quality }));
    };
    addTags(macroSectorQualityMap.favored, "favored");
    addTags(macroSectorQualityMap.neutral, "neutral");
    addTags(macroSectorQualityMap.underPressure, "underPressure");
    return tagMap;
  }, [macroSectorQualityMap]);

  const activeSectorMacroResolution = useMemo(() => {
    return resolveSectorMacroTagWithPath(macroTagBySector, sector, subsector);
  }, [macroTagBySector, sector, subsector]);
  const activeSectorMacroTag = activeSectorMacroResolution.tag;
  const activeCoverage = subsectorCoverageAudit.matrix[subsector] ?? null;
  const activePairChecks = useMemo(() => {
    return subsectorCoverageAudit.differentiationChecks.filter((pair) => pair.pair.includes(subsector));
  }, [subsector, subsectorCoverageAudit.differentiationChecks]);

  const filteredSectorOptions = useMemo(() => {
    return SECTORS.filter((sectorItem) => {
      const hasMatchingSubsector = sectorItem.subsectors.some((subsectorItem) => {
        const macroTag = resolveSectorMacroTag(macroTagBySector, sectorItem.id, subsectorItem.id);
        if (!macroTag) return macroLens === "all" && macroStrength === "all";
        if (macroLens !== "all" && macroTag.tone !== macroLens) return false;
        if (macroStrength !== "all" && macroTag.strength !== macroStrength) return false;
        return true;
      });
      return hasMatchingSubsector;
    });
  }, [macroLens, macroStrength, macroTagBySector]);

  const subsectors = useMemo(() => {
    const selectedSector = filteredSectorOptions.find((item) => item.id === sector);
    if (!selectedSector) return [];
    return selectedSector.subsectors.filter((item) => {
      const macroTag = resolveSectorMacroTag(macroTagBySector, sector, item.id);
      if (!macroTag) return macroLens === "all" && macroStrength === "all";
      if (macroLens !== "all" && macroTag.tone !== macroLens) return false;
      if (macroStrength !== "all" && macroTag.strength !== macroStrength) return false;
      return true;
    });
  }, [filteredSectorOptions, macroLens, macroStrength, macroTagBySector, sector]);

  const questions = useMemo(() => {
    if (sector === "materials" && subsector === "gold_miners") {
      return [...GENERIC_QUESTIONS, ...GOLD_QUESTIONS];
    }
    if (sector === "materials" && subsector === "copper_miners") {
      return [...GENERIC_QUESTIONS, ...COPPER_QUESTIONS];
    }
    if (sector === "energy" && subsector === "oil_gas_producers") {
      return [...GENERIC_QUESTIONS, ...OIL_QUESTIONS];
    }
    return GENERIC_QUESTIONS;
  }, [overviewReloadNonce, sector, subsector]);
  const isGoldCommodityView = sector === "materials" && subsector === "gold_miners";
  const isCopperCommodityView = sector === "materials" && subsector === "copper_miners";
  const selectedCommodity = isGoldCommodityView ? "gold" : isCopperCommodityView ? "copper" : null;
  const isCommoditySnapshotView = selectedCommodity !== null;
  const debugMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  const manualInputStatus = manualInputs.length > 0 ? "available" : "none";
  const copperInterpretation = useMemo(() => {
    if (selectedCommodity !== "copper" || !commoditySnapshot?.snapshot) return null;
    return buildCopperInterpretation(commoditySnapshot.snapshot);
  }, [commoditySnapshot?.snapshot, selectedCommodity]);
  const goldInterpretation = useMemo(() => {
    if (selectedCommodity !== "gold" || !commoditySnapshot?.snapshot) return null;
    return buildGoldInterpretation(commoditySnapshot.snapshot);
  }, [commoditySnapshot?.snapshot, selectedCommodity]);
  const activeInterpretation = selectedCommodity === "gold" ? goldInterpretation : copperInterpretation;

  const directionalSpineInput = useMemo(() => {
    if (!commoditySnapshot?.snapshot) return null;
    const momentumDriver = commoditySnapshot.snapshot.drivers.find((driver) =>
      /momentum|price/i.test(driver.id) || /momentum|price/i.test(driver.label),
    );
    const supplyDriver = commoditySnapshot.snapshot.drivers.find((driver) =>
      /supply|inventory|stock/i.test(driver.id) || /supply|inventory|stock/i.test(driver.label),
    );
    const pricePercentileFromPhase = commoditySnapshot.snapshot.phaseScore === null
      ? 0.5
      : Math.max(0, Math.min(1, (commoditySnapshot.snapshot.phaseScore + 1) / 2));
    const demandState = commoditySnapshot.snapshot.phase.toLowerCase().includes("expansion")
      ? "expansion"
      : commoditySnapshot.snapshot.phase.toLowerCase().includes("contraction")
        ? "contraction"
        : "neutral";
    const divergenceType = commoditySnapshot.snapshot.regimeAgreementWithPrice === "diverging"
      ? "diverging"
      : commoditySnapshot.snapshot.regimeAgreementWithPrice === "confirming"
        ? "confirming"
        : "none";
    return {
      price_percentile: pricePercentileFromPhase,
      momentum_12m: momentumDriver
        ? (momentumDriver.signal === "bullish" ? 0.8 : momentumDriver.signal === "bearish" ? -0.8 : 0)
        : null,
      china_cli: commoditySnapshot.pmiDebug?.chinaCli?.change3m ?? commoditySnapshot.pmiDebug?.chinaCli?.valueLatest ?? null,
      demand_state: demandState as "expansion" | "contraction" | "neutral",
      divergenceType: divergenceType as "diverging" | "confirming" | "none",
      confidence: commoditySnapshot.snapshot.confidence.score,
      supplySignal: supplyDriver
        ? (supplyDriver.signal === "bullish" ? 0.7 : supplyDriver.signal === "bearish" ? -0.7 : 0)
        : null,
    };
  }, [commoditySnapshot]);

  useEffect(() => {
    if (!filteredSectorOptions.some((item) => item.id === sector)) {
      setSector(filteredSectorOptions[0]?.id ?? "");
    }
  }, [filteredSectorOptions, sector]);

  useEffect(() => {
    if (!subsectors.some((item) => item.id === subsector)) {
      setSubsector(subsectors[0]?.id ?? "");
    }
  }, [subsector, subsectors]);

  useEffect(() => {
    let active = true;
    async function loadCompanyList() {
      const response = await fetch("/api/company/list");
      const payload = await response.json();
      if (active && response.ok) {
        setAvailableTickers(Array.isArray(payload.tickers) ? payload.tickers.map((ticker: unknown) => String(ticker)) : []);
      }
    }
    void loadCompanyList();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sector || !subsector) {
      setOverview(null);
      return;
    }
    let active = true;
    async function loadOverview() {
      const response = await fetch(
        `/api/sector/overview?sector=${encodeURIComponent(sector)}&subsector=${encodeURIComponent(subsector)}`
      );
      const payload = await response.json();
      if (active) {
        setOverview(payload);
      }
    }
    void loadOverview();

    return () => {
      active = false;
    };
  }, [sector, subsector]);

  useEffect(() => {
    if (!selectedCommodity) {
      setCommoditySnapshot(null);
      return;
    }
    let active = true;
    async function loadCommoditySnapshot() {
      const response = await fetch(`/api/sector/commodity-snapshot?commodity=${selectedCommodity}${debugMode ? "&debug=1" : ""}`);
      const payload = (await response.json()) as CommoditySnapshotPayload;
      if (active) {
        setCommoditySnapshot(payload);
      }
    }
    void loadCommoditySnapshot();
    return () => {
      active = false;
    };
  }, [selectedCommodity, debugMode]);

  useEffect(() => {
    let active = true;
    async function loadMacroBackdrop() {
      const response = await fetch("/api/sector/global-macro?region=GLOBAL");
      const payload = await response.json();
      if (active && response.ok) {
        setMacroSnapshot(payload);
      }
    }
    void loadMacroBackdrop();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sector || !subsector) {
      setManualInputs([]);
      return;
    }
    let active = true;
    async function loadManualInputs() {
      const response = await fetch(
        `/api/sector/manual-input?sector=${encodeURIComponent(sector)}&subsector=${encodeURIComponent(subsector)}`
      );
      const payload = await response.json();
      if (active) {
        setManualInputs(payload.inputs ?? []);
      }
    }
    void loadManualInputs();
    return () => {
      active = false;
    };
  }, [sector, subsector]);


  async function submitInput(inputType: string, value: string) {
    if (!value) {
      setStatus("Välj ett värde innan du sparar.");
      return;
    }
    setStatus("Sparar...");
    const response = await fetch("/api/sector/manual-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sector,
        subsector,
        inputType,
        value,
        source: inputSource,
        note: inputNote,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error ?? "Misslyckades att spara.");
      return;
    }
    setStatus("Sparad.");
    setManualInputs((prev) => [
      {
        input_type: inputType,
        value,
        source: inputSource,
        note: inputNote,
        created_at: payload.createdAt,
      },
      ...prev,
    ]);
  }

  async function saveCommodityOverride() {
    const ticker = overrideTicker.trim().toUpperCase();
    if (!ticker) {
      setStatus("Ange ticker för manuell commodity override.");
      return;
    }
    const parsed = overrideWeights
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [commodity, weightRaw] = item.split(":").map((part) => part.trim());
        return { commodity, weight: Number(weightRaw) };
      })
      .filter((item) => item.commodity && Number.isFinite(item.weight) && item.weight > 0);
    if (parsed.length === 0) {
      setStatus("Ange minst en rad i formatet commodity:weight (ex. uranium:0.7,vanadium:0.3).");
      return;
    }
    setStatus("Sparar commodity override...");
    const response = await fetch("/api/sector/company-commodity-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        source: overrideSource,
        note: overrideNote,
        exposures: parsed,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error ?? "Misslyckades att spara override.");
      return;
    }
    setStatus(`Commodity override sparad för ${payload.ticker}.`);
    setOverviewReloadNonce((prev) => prev + 1);
  }

  function applyActiveCompanyTicker(ticker: string) {
    const normalized = ticker.trim().toUpperCase();
    setActiveCompanyTicker(normalized);
    setMappingTickers(normalized);
    setOverrideTicker(normalized);
  }

  return (
    <div className="sector-dashboard">
      <div className="macro-backdrop-banner" aria-live="polite">
        <strong>Macro backdrop</strong>
        <span>Regime: {primaryRegime}</span>
        <span>Risk climate: {regimeInterpretation.riskClimate}</span>
        <span>Sector bias: {regimeInterpretation.sectorBias}</span>
        <div className="macro-lens-controls">
          <label htmlFor="macro-lens-filter">Macro lens:</label>
          <select
            id="macro-lens-filter"
            value={macroLens}
            onChange={(event) => setMacroLens(event.target.value as MacroToneFilter)}
          >
            <option value="all">All</option>
            <option value="favored">Favored</option>
            <option value="neutral">Neutral</option>
            <option value="underPressure">Under pressure</option>
          </select>
          <label htmlFor="macro-strength-filter">Strength:</label>
          <select
            id="macro-strength-filter"
            value={macroStrength}
            onChange={(event) => setMacroStrength(event.target.value as MacroStrengthFilter)}
          >
            <option value="all">All</option>
            <option value="strong">Strong</option>
            <option value="moderate">Moderate</option>
            <option value="weak">Weak</option>
          </select>
        </div>
      </div>
      {filteredSectorOptions.length === 0 ? (
        <div className="status empty macro-lens-empty">No sectors match the current macro lens.</div>
      ) : null}
      <div className="sector-header">
        <div>
          <label htmlFor="sector-select">Sektor</label>
          <select
            id="sector-select"
            value={sector}
            onChange={(event) => setSector(event.target.value)}
            disabled={filteredSectorOptions.length === 0}
          >
            {filteredSectorOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="subsector-select">Undersektor</label>
          <select
            id="subsector-select"
            value={subsector}
            onChange={(event) => setSubsector(event.target.value)}
            disabled={subsectors.length === 0}
          >
            {subsectors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <a className="sector-link" href="#singlestock">
          Gå till Single Stock Dashboard →
        </a>
        {activeSectorMacroTag ? (
          <div className={`sector-macro-tag sector-macro-tag-${activeSectorMacroTag.tone}`}>
            {activeSectorMacroTag.tone === "favored" && "Macro favored"}
            {activeSectorMacroTag.tone === "neutral" && "Macro neutral"}
            {activeSectorMacroTag.tone === "underPressure" && "Macro under pressure"}
            {activeSectorMacroTag.strength ? ` (${activeSectorMacroTag.strength}, ${activeSectorMacroTag.quality})` : ""}
          </div>
        ) : null}
        {debugMacroMapping ? (
          <div style={{ fontSize: 11, color: activeSectorMacroTag ? "#475569" : "#64748b", marginTop: 4 }}>
            debug: path={activeSectorMacroResolution.path}, matched={activeSectorMacroResolution.matchedTargetId ?? "none"}, coverage={activeSectorMacroResolution.coverage}
          </div>
        ) : null}
        {activeCoverage ? (
          <details className="sector-coverage-debug" open={debugMacroMapping}>
            <summary>Coverage diagnostics (dev)</summary>
            <div className="sector-coverage-debug-grid">
              <div>
                <strong>Coverage</strong>: {activeCoverage.currentCoverageLevel} · {activeCoverage.interpretationPath}
              </div>
              <div>
                <strong>Fallback</strong>: {activeCoverage.fallbackOnly.routingCoverage}
              </div>
              <div>
                <strong>Explicit drivers</strong>: {activeCoverage.explicitDrivers.join(", ") || "none"}
              </div>
              <div>
                <strong>Sector fallback</strong>: {activeCoverage.sectorFallbackDrivers.join(", ") || "none"}
              </div>
              <div>
                <strong>Bucket fallback</strong>: {activeCoverage.macroBucketFallbackDrivers.join(", ") || "none"}
              </div>
              <div>
                <strong>Overlays used</strong>: {activeCoverage.driverTypes.overlays.join(", ") || "none"}
              </div>
              <div>
                <strong>Regime/block inputs</strong>: {activeCoverage.driverTypes.regimeBlockInputs.join(", ") || "none"}
              </div>
              <div>
                <strong>Blind spots</strong>: {activeCoverage.likelyBlindSpots.join(", ") || "none"}
              </div>
              {activePairChecks.length > 0 ? (
                <div className="sector-coverage-debug-pairs">
                  <strong>Differentiation checks</strong>
                  <ul>
                    {activePairChecks.map((pair) => (
                      <li key={pair.pair.join("_")}>
                        {pair.pair[0]} vs {pair.pair[1]}: {pair.quality}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>

      {isCommoditySnapshotView ? (
        <CommodityTrendSwipeSection
          priceHistory={commoditySnapshot?.trendPriceHistory ?? []}
          commodityLabel={selectedCommodity === "gold" ? "guld" : "koppar"}
          debugMode={debugMode}
        />
      ) : null}

      <div className="sector-grid">
        <div className="sector-card">
          <h3>Sector Overview</h3>
          <p className="bread">
            Sector Dashboard bygger på en kanonisk sektor-/undersektorstruktur där bolag mappas via
            company_sector_map. Nyckeltal beräknas från mappade bolag och tillgängliga fundamentals.
          </p>
          <p className="bread">
            Vissa mått saknas fortfarande i datalagret (t.ex. EV/EBITDA, FCF yield, ROIC,
            CAPEX/OCF). Commodity exposure och company stage är ännu inte implementerade.
          </p>
          <ul className="todo-list">
            {(overview?.todo ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {overview?.computedMetrics && overview.computedMetrics.length > 0 && (
            <div className="metric-list">
              <h4>Beräknade metrics</h4>
              <ul>
                {overview.computedMetrics.map((metric) => (
                  <li key={metric.metric}>
                    {metric.metric}: {metric.value.toFixed(3)}
                    {metric.sampleSize ? ` (n=${metric.sampleSize})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {overview?.missingMetrics && overview.missingMetrics.length > 0 && (
            <div className="metric-list">
              <h4>Missing metrics</h4>
              <ul>
                {overview.missingMetrics.map((metric) => (
                  <li key={metric}>{metric}</li>
                ))}
              </ul>
            </div>
          )}
          {overview?.suggestedFmpEndpoints && overview.suggestedFmpEndpoints.length > 0 && (
            <div className="metric-list">
              <h4>FMP endpoints</h4>
              <ul>
                {overview.suggestedFmpEndpoints.map((endpoint) => (
                  <li key={endpoint}>{endpoint}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="sector-card">
          <h3>Manual inputs</h3>
          <p className="bread">
            Manuella inputs är ett valfritt analystlager som kompletterar den automatiska
            commodity-bedömningen. Alla svar sparas med tidsstämpel och kopplas till
            sektor/undersektor.
          </p>
          <div className="manual-inputs">
            {questions.map((question) => (
              <div key={question.inputType} className="manual-input-row">
                <div>
                  <label htmlFor={question.inputType}>{question.label}</label>
                  <select
                    id={question.inputType}
                    value={inputValues[question.inputType] ?? ""}
                    onChange={(event) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [question.inputType]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Välj</option>
                    {question.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void submitInput(question.inputType, inputValues[question.inputType] ?? "")
                  }
                >
                  Spara
                </button>
              </div>
            ))}
          </div>
          <div className="manual-meta">
            <div>
              <label htmlFor="manual-source">Källa</label>
              <input
                id="manual-source"
                value={inputSource}
                onChange={(event) => setInputSource(event.target.value)}
                placeholder="LBMA, OPEC, årsredovisning ..."
              />
            </div>
            <div>
              <label htmlFor="manual-note">Kommentar</label>
              <input
                id="manual-note"
                value={inputNote}
                onChange={(event) => setInputNote(event.target.value)}
                placeholder="Kort notering"
              />
            </div>
          </div>
          {status && <div className="status">{status}</div>}
        </div>

        <div className="sector-card">
          <h3>Map companies</h3>
          <p className="bread">
            Välj ett bolag en gång och använd samma val för både mapping och manuell commodity override.
          </p>
          <CompanyPicker
            label="Sök bolag"
            placeholder="T.ex. Apple"
            onSelect={(company) => applyActiveCompanyTicker(company.symbol)}
          />
          <label htmlFor="company-select">Välj bolag</label>
          <select
            id="company-select"
            value={activeCompanyTicker}
            onChange={(event) => applyActiveCompanyTicker(event.target.value)}
          >
            <option value="">Inga alternativ</option>
            {availableTickers.map((ticker) => (
              <option key={`ticker-${ticker}`} value={ticker}>
                {ticker}
              </option>
            ))}
          </select>
          <div><strong>Aktivt bolag:</strong> {activeCompanyTicker || "Inget valt"}</div>
          <label htmlFor="mapping-category">Kategori (ej klassificering)</label>
          <select
            id="mapping-category"
            value={mappingCategory}
            onChange={(event) => setMappingCategory(event.target.value)}
          >
            {COMPANY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            value={mappingTickers}
            onChange={(event) => setMappingTickers(event.target.value)}
            placeholder="AAPL, MSFT, ... "
          />
          <button
            type="button"
            onClick={async () => {
              if (!mappingTickers.trim()) {
                setStatus("Ange minst en ticker.");
                return;
              }
              setStatus("Sparar mappings...");
              const response = await fetch("/api/sector/map-companies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sector,
                  subsector,
                  category: mappingCategory,
                  tickers: mappingTickers
                    .split(",")
                    .map((ticker) => ticker.trim().toUpperCase())
                    .filter(Boolean),
                }),
              });
              const payload = await response.json();
              if (!response.ok) {
                setStatus(payload.error ?? "Misslyckades att spara mappings.");
                return;
              }
              setStatus(`Mappade ${payload.mapped} tickers.`);
            }}
          >
            Spara mapping
          </button>
          <div className="metric-list">
            <h4>Default commodity mapping</h4>
            <div>
              <strong>Coverage:</strong>{" "}
              {(overview?.commodityExposure?.companiesWithExposure ?? 0)}/
              {(overview?.commodityExposure?.mappedCompanies ?? 0)} bolag med defaultprofil.
            </div>
            <div>
              <strong>Basis:</strong> deterministisk canonical mapping (ej exakt bolagssplit)
            </div>
            <div>
              <strong>Manual overrides:</strong> {overview?.commodityExposure?.manualOverrideCount ?? 0}
            </div>
            {(overview?.commodityExposure?.sampleProfiles ?? []).slice(0, 4).map((profile) => (
              <div key={`exp-${profile.companyId}`}>
                {profile.ticker ?? profile.companyId}: final={profile.primaryCommodity ?? "unknown"},{" "}
                basis={profile.basis}, confidence={Math.round(profile.confidence * 100)}%
              </div>
            ))}
          </div>
          <div className="metric-list">
            <h4>Manual commodity override (admin/dev)</h4>
            <input
              value={overrideTicker}
              onChange={(event) => setOverrideTicker(event.target.value)}
              placeholder="Ticker (ex. CCJ)"
            />
            <input
              value={overrideWeights}
              onChange={(event) => setOverrideWeights(event.target.value)}
              placeholder="commodity:weight, commodity:weight"
            />
            <input
              value={overrideSource}
              onChange={(event) => setOverrideSource(event.target.value)}
              placeholder="Källa (valfri)"
            />
            <input
              value={overrideNote}
              onChange={(event) => setOverrideNote(event.target.value)}
              placeholder="Notering (valfri)"
            />
            <button type="button" onClick={() => void saveCommodityOverride()}>
              Spara commodity override
            </button>
          </div>
        </div>

        <div className="sector-card">
          <h3>Cykelbedömning</h3>
          {isCommoditySnapshotView ? (
            !commoditySnapshot?.ok || !commoditySnapshot.snapshot ? (
              <>
                <p className="bread">
                  Commodity snapshot är source of truth för denna råvaruvy, men kunde inte laddas nu.
                </p>
                <div className="cycle-status">Status: snapshot unavailable.</div>
              </>
            ) : (
              <>
                <p className="bread">
                  Automatisk commodity-bedömning är primär source of truth. Manuella inputs är ett
                  kompletterande analystlager och blockerar inte grundfasen.
                </p>
                {directionalSpineInput ? (
                  <DirectionalSpine
                    price_percentile={directionalSpineInput.price_percentile}
                    momentum_12m={directionalSpineInput.momentum_12m}
                    china_cli={directionalSpineInput.china_cli}
                    demand_state={directionalSpineInput.demand_state}
                    divergenceType={directionalSpineInput.divergenceType}
                    confidence={directionalSpineInput.confidence}
                    supplySignal={directionalSpineInput.supplySignal}
                  />
                ) : null}
                <div className="metric-list">
                  <div>
                    <strong>Phase:</strong> {commoditySnapshot.snapshot.phase}
                    {copperInterpretation ? (
                      <InfoPopover
                        id="copper-phase-interpretation"
                        openId={openCopperInfoId}
                        onToggle={(id) => setOpenCopperInfoId((prev) => (prev === id ? null : id))}
                        onClose={() => setOpenCopperInfoId(null)}
                        title="Copper phase interpretation"
                        content={[copperInterpretation.phaseInterpretation]}
                      />
                    ) : null}
                  </div>
                  <div>
                    <strong>Confidence:</strong> {(commoditySnapshot.snapshot.confidence.score * 100).toFixed(0)}% ({commoditySnapshot.snapshot.confidence.tier})
                    {copperInterpretation ? (
                      <InfoPopover
                        id="copper-confidence-interpretation"
                        openId={openCopperInfoId}
                        onToggle={(id) => setOpenCopperInfoId((prev) => (prev === id ? null : id))}
                        onClose={() => setOpenCopperInfoId(null)}
                        title="Copper confidence interpretation"
                        content={[copperInterpretation.confidenceInterpretation]}
                      />
                    ) : null}
                  </div>
                  <div>
                    <strong>Bias:</strong> {commoditySnapshot.snapshot.screeningAdjustments.bias}
                    {copperInterpretation ? (
                      <InfoPopover
                        id="copper-bias-interpretation"
                        openId={openCopperInfoId}
                        onToggle={(id) => setOpenCopperInfoId((prev) => (prev === id ? null : id))}
                        onClose={() => setOpenCopperInfoId(null)}
                        title="Copper screening interpretation"
                        content={[copperInterpretation.biasInterpretation]}
                      />
                    ) : null}
                  </div>
                  <div>
                    <strong>Status:</strong> {commoditySnapshot.snapshot.status}
                    {copperInterpretation ? (
                      <InfoPopover
                        id="copper-status-interpretation"
                        openId={openCopperInfoId}
                        onToggle={(id) => setOpenCopperInfoId((prev) => (prev === id ? null : id))}
                        onClose={() => setOpenCopperInfoId(null)}
                        title="Copper status interpretation"
                        content={[copperInterpretation.statusInterpretation]}
                      />
                    ) : null}
                  </div>
                  <div>
                    <strong>Regime:</strong> {commoditySnapshot.snapshot.goldRegime ?? commoditySnapshot.snapshot.copperRegime ?? "n/a"}
                    {copperInterpretation ? (
                      <InfoPopover
                        id="copper-regime-interpretation"
                        openId={openCopperInfoId}
                        onToggle={(id) => setOpenCopperInfoId((prev) => (prev === id ? null : id))}
                        onClose={() => setOpenCopperInfoId(null)}
                        title="Copper regime interpretation"
                        content={[copperInterpretation.regimeInterpretation]}
                      />
                    ) : null}
                  </div>
                  {activeInterpretation ? (
                    <div>
                      <strong>Interpretation:</strong> {activeInterpretation.interpretationText}
                      <InfoPopover
                        id="copper-overall-interpretation"
                        openId={openCopperInfoId}
                        onToggle={(id) => setOpenCopperInfoId((prev) => (prev === id ? null : id))}
                        onClose={() => setOpenCopperInfoId(null)}
                        title="Copper interpretation"
                        content={selectedCommodity === "gold"
                          ? [activeInterpretation.summarySentences.join(" ")]
                          : [copperInterpretation?.overallInterpretation ?? "n/a"]}
                      />
                    </div>
                  ) : null}
                  {activeInterpretation ? (
                    <div>
                      <strong>Summary:</strong> {activeInterpretation.summarySentences.join(" ")}
                    </div>
                  ) : null}
                  <div><strong>Regime confidence:</strong> {commoditySnapshot.snapshot.regimeConfidence !== undefined ? `${(commoditySnapshot.snapshot.regimeConfidence * 100).toFixed(0)}%` : "n/a"}</div>
                  <div><strong>Regime vs price:</strong> {commoditySnapshot.snapshot.regimeAgreementWithPrice ?? "n/a"}</div>
                  <div><strong>Trend signal:</strong> structure={commoditySnapshot.snapshot.trendSignal?.structure ?? "n/a"}, expansion={commoditySnapshot.snapshot.trendSignal?.expansion ?? "n/a"}, momentum={commoditySnapshot.snapshot.trendSignal?.momentumState ?? "n/a"}, longDirection={commoditySnapshot.snapshot.trendSignal?.longTrendDirection ?? "n/a"}, shortMomentum={commoditySnapshot.snapshot.trendSignal?.shortTrendMomentum ?? "n/a"}, completeness={commoditySnapshot.snapshot.trendSignal?.completeness ?? "n/a"}, score={commoditySnapshot.snapshot.trendSignal?.score?.toFixed(2) ?? "n/a"}</div>
                  <div><strong>Trend synthesis:</strong> {commoditySnapshot.snapshot.trendSignal?.trendCombinedInterpretation ?? "n/a"}</div>
                  <div><strong>Phase reasoning:</strong> {activeInterpretation ? activeInterpretation.phaseReasoningHuman.join(" | ") : commoditySnapshot.snapshot.diagnostics.phaseReasoning.join(" | ") || "none"}</div>
                  <div><strong>Analyst layer:</strong> {manualInputStatus === "available" ? "supplemental available" : "enhancement missing (system-driven only)"}</div>
                </div>
              </>
            )
          ) : (
            <>
              <p className="bread">
                Cykelstatus för denna vy är ännu inte kopplad till commodity snapshot.
              </p>
              <div className="cycle-status">TODO: Integrera snapshot-baserad cykelbedömning för fler råvaruvyer.</div>
            </>
          )}
        </div>

        {isCommoditySnapshotView ? (
          <div className="sector-card">
            <h3>Commodity snapshot ({selectedCommodity === "gold" ? "Gold" : "Copper"}) – debug/readout</h3>
            {!commoditySnapshot?.ok || !commoditySnapshot.snapshot ? (
              <div className="status empty">
                {commoditySnapshot?.error ?? "Ingen commodity snapshot tillgänglig."}
              </div>
            ) : (
              <div className="metric-list">
                <div><strong>Phase:</strong> {commoditySnapshot.snapshot.phase}</div>
                <div><strong>Phase score:</strong> {commoditySnapshot.snapshot.phaseScore?.toFixed(2) ?? "n/a"}</div>
                <div><strong>Status:</strong> {commoditySnapshot.snapshot.status}</div>
                <div><strong>Confidence:</strong> {(commoditySnapshot.snapshot.confidence.score * 100).toFixed(0)}% ({commoditySnapshot.snapshot.confidence.tier})</div>
                <div><strong>Bias:</strong> {commoditySnapshot.snapshot.screeningAdjustments.bias}</div>
                <div><strong>Source of truth:</strong> commodity snapshot</div>
                <div><strong>Manual input status:</strong> {manualInputStatus}</div>
                <div><strong>Manual impact on snapshot:</strong> none (supplemental layer only in current phase)</div>
                <div><strong>Regime:</strong> {(commoditySnapshot.snapshot.goldRegime ?? commoditySnapshot.snapshot.copperRegime ?? "n/a")} ({commoditySnapshot.snapshot.regimeAgreementWithPrice ?? "n/a"})</div>
                  <div><strong>Trend signal:</strong> structure={commoditySnapshot.snapshot.trendSignal?.structure ?? "n/a"}, expansion={commoditySnapshot.snapshot.trendSignal?.expansion ?? "n/a"}, momentum={commoditySnapshot.snapshot.trendSignal?.momentumState ?? "n/a"}, longDirection={commoditySnapshot.snapshot.trendSignal?.longTrendDirection ?? "n/a"}, shortMomentum={commoditySnapshot.snapshot.trendSignal?.shortTrendMomentum ?? "n/a"}, completeness={commoditySnapshot.snapshot.trendSignal?.completeness ?? "n/a"}, trendScore={commoditySnapshot.snapshot.trendSignal?.score?.toFixed(2) ?? "n/a"}</div>
                  <div><strong>Trend synthesis:</strong> {commoditySnapshot.snapshot.trendSignal?.trendCombinedInterpretation ?? "n/a"}</div>
                  <div><strong>Trend influence on phase:</strong> {commoditySnapshot.snapshot.diagnostics.trendInfluence?.trendInfluenceOnPhase ?? "n/a"}</div>
                  <div><strong>Trend influence on confidence:</strong> {commoditySnapshot.snapshot.diagnostics.trendInfluence?.trendInfluenceOnConfidence ?? "n/a"}</div>
                <details>
                  <summary>Diagnostics (debug)</summary>
                  {commoditySnapshot.debug ? (
                    <>
                      <div><strong>Debug mode:</strong> {commoditySnapshot.debug.mode ?? "n/a"} (query: {debugMode ? "debug=1" : "off"})</div>
                      <div><strong>External fetch attempted:</strong> {String(commoditySnapshot.debug.externalFetchAttempted ?? false)}</div>
                      <div><strong>External fetch note:</strong> {commoditySnapshot.debug.externalFetchReason ?? "n/a"}</div>
                      <div><strong>Requested indicators:</strong> {commoditySnapshot.debug.indicatorKeysRequested?.join(", ") || "none"}</div>
                      <div><strong>Price series:</strong> {commoditySnapshot.debug.priceSeriesKey ?? "n/a"} (obs={commoditySnapshot.debug.priceSeriesWindow10y?.observationCount ?? 0}, latest={commoditySnapshot.debug.priceSeriesWindow10y?.latest ?? "n/a"})</div>
                      <div><strong>China signal availability:</strong> china_cli={String(commoditySnapshot.debug.chinaCliAvailable ?? false)}, pmi_us={String(commoditySnapshot.debug.pmiUsAvailable ?? false)}</div>
                      <div><strong>China CLI (selected row):</strong> china_cli={commoditySnapshot.pmiDebug?.chinaCli?.valueLatest ?? "n/a"} (chg3m={commoditySnapshot.pmiDebug?.chinaCli?.change3m ?? "n/a"}, region={commoditySnapshot.pmiDebug?.chinaCli?.selectedRegion ?? "n/a"}, asOf={commoditySnapshot.pmiDebug?.chinaCli?.asOf ?? "n/a"}, used={String(commoditySnapshot.pmiDebug?.chinaCli?.used ?? false)})</div>
                      <div><strong>US PMI supplemental:</strong> pmi_us={commoditySnapshot.pmiDebug?.pmiUs?.valueLatest ?? "n/a"} (chg3m={commoditySnapshot.pmiDebug?.pmiUs?.change3m ?? "n/a"}, region={commoditySnapshot.pmiDebug?.pmiUs?.selectedRegion ?? "n/a"}, asOf={commoditySnapshot.pmiDebug?.pmiUs?.asOf ?? "n/a"}, used={commoditySnapshot.pmiDebug?.pmiUs?.used ?? "supplemental_only"})</div>
                      <div><strong>Blockers:</strong> {commoditySnapshot.debug.blockers?.join(" | ") || "none"}</div>
                      <div><strong>Indicator selection:</strong></div>
                      <ul>
                        {(commoditySnapshot.debug.indicatorSelection ?? []).map((item) => (
                          <li key={`sel-${item.key}`}>
                            {item.key}: selected={item.selectedRegion ?? "none"}@{item.selectedAsOf ?? "n/a"}; candidates={item.candidates.map((candidate) => `${candidate.region}@${candidate.asOf}`).join(", ") || "none"}; note={item.note}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div><strong>Debug mode:</strong> off (lägg till <code>?debug=1</code> i URL för källa/rad-förklaring).</div>
                  )}
                  <div><strong>Regime drivers:</strong></div>
                  <ul>
                    {(commoditySnapshot.snapshot.regimeDrivers ?? []).map((driver) => (
                      <li key={driver.id}>
                        {driver.label}: {driver.signal} — {driver.note}
                      </li>
                    ))}
                  </ul>
                  <div><strong>Drivers:</strong></div>
                  <ul>
                    {commoditySnapshot.snapshot.drivers.map((driver) => (
                      <li key={driver.id}>
                        {driver.label}: {driver.signal} (w={driver.weight.toFixed(2)})
                        {driver.note ? ` — ${driver.note}` : ""}
                      </li>
                    ))}
                  </ul>
                  <div><strong>Used indicators:</strong> {commoditySnapshot.snapshot.diagnostics.usedIndicators.join(", ") || "none"}</div>
                  <div><strong>Missing indicators:</strong> {commoditySnapshot.snapshot.diagnostics.missingIndicators.join(", ") || "none"}</div>
                  <div><strong>Used overlays:</strong> {commoditySnapshot.snapshot.diagnostics.usedOverlays.join(", ") || "none"}</div>
                  <div><strong>Missing overlays:</strong> {commoditySnapshot.snapshot.diagnostics.missingOverlays.join(", ") || "none"}</div>
                  <div><strong>Ignored overlays:</strong> {commoditySnapshot.snapshot.diagnostics.ignoredOverlays.join(", ") || "none"}</div>
                  <div><strong>Overlay contribution:</strong> {commoditySnapshot.snapshot.diagnostics.overlayContribution.classification} ({commoditySnapshot.snapshot.diagnostics.overlayContribution.score?.toFixed(2) ?? "n/a"}) — {commoditySnapshot.snapshot.diagnostics.overlayContribution.note}</div>
                  <div><strong>Overlay agreement/conflict:</strong> {commoditySnapshot.snapshot.diagnostics.overlayAgreement}{commoditySnapshot.snapshot.diagnostics.overlayConflict.length > 0 ? ` | ${commoditySnapshot.snapshot.diagnostics.overlayConflict.join(" | ")}` : ""}</div>
                  {selectedCommodity === "gold" ? (
                    <>
                      <div><strong>Gold Monetary Stress Overlay:</strong> {commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.goldMonetaryStressOverlay.score?.toFixed(2) ?? "n/a"} ({commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.goldMonetaryStressOverlay.direction ?? "n/a"}, conf={commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.goldMonetaryStressOverlay.confidence.toFixed(2) ?? "n/a"})</div>
                      <div><strong>Market Risk-Off Overlay:</strong> {commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.marketRiskOffOverlay.score?.toFixed(2) ?? "n/a"} ({commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.marketRiskOffOverlay.direction ?? "n/a"}, conf={commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.marketRiskOffOverlay.confidence.toFixed(2) ?? "n/a"})</div>
                      <div><strong>Primary overlay driver:</strong> {commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.primaryDecisionDriver ?? "n/a"} | diverging={String(commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.overlaysDiverging ?? false)}</div>
                      <div><strong>Regime override:</strong> {String(commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.regimeOverrideApplied ?? false)} (base={commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.baseRegime ?? "n/a"}){commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics?.regimeOverrideReason ? ` — ${commoditySnapshot.snapshot.diagnostics.overlayLayerDiagnostics.regimeOverrideReason}` : ""}</div>
                    </>
                  ) : (
                    <div><strong>Copper note:</strong> Monetary overlay diagnostics är ej relevanta för copper-profilen.</div>
                  )}
                  <div><strong>Block scores:</strong></div>
                  <ul>
                    {commoditySnapshot.snapshot.blockScores.map((block) => (
                      <li key={block.blockId}>
                        {block.label}: {block.score?.toFixed(2) ?? "n/a"} ({block.status})
                      </li>
                    ))}
                  </ul>
                  <div><strong>Confidence breakdown:</strong> completeness={commoditySnapshot.snapshot.confidence.breakdown.dataCompleteness.toFixed(2)}, coherence={commoditySnapshot.snapshot.confidence.breakdown.signalCoherence.toFixed(2)}, fallbackPenalty={commoditySnapshot.snapshot.confidence.breakdown.fallbackPenalty.toFixed(2)}</div>
                  <div><strong>Confidence overlay impact:</strong> overlay agreement={commoditySnapshot.snapshot.diagnostics.overlayAgreement}, coherence={commoditySnapshot.snapshot.confidence.confidenceComponents.signalCoherence.toFixed(2)}</div>
                  <div><strong>Resolved phase:</strong> {commoditySnapshot.snapshot.phase} ({commoditySnapshot.snapshot.diagnostics.phaseStrength})</div>
                  <div><strong>Phase reasoning:</strong> {commoditySnapshot.snapshot.diagnostics.phaseReasoning.join(" | ") || "none"}</div>
                  {copperInterpretation ? (
                    <>
                      <div><strong>Interpretation case (debug):</strong> {copperInterpretation.interpretationCase}</div>
                      <div><strong>missingSignalSummary:</strong> {copperInterpretation.debug.missingSignalSummary}</div>
                      <div><strong>conflictSummary:</strong> {copperInterpretation.debug.conflictSummary}</div>
                      <div><strong>demandDriver:</strong> {copperInterpretation.debug.demandDriver}</div>
                      <div><strong>priceDriver:</strong> {copperInterpretation.debug.priceDriver}</div>
                      <div><strong>phaseCause:</strong> {copperInterpretation.debug.phaseCause}</div>
                      <div><strong>screeningCause:</strong> {copperInterpretation.debug.screeningCause}</div>
                    </>
                  ) : null}
                  {goldInterpretation ? (
                    <>
                      <div><strong>Gold primaryHeadwind (debug):</strong> {goldInterpretation.debug.primaryHeadwind}</div>
                      <div><strong>Gold primarySupport (debug):</strong> {goldInterpretation.debug.primarySupport}</div>
                      <div><strong>Gold divergenceType (debug):</strong> {goldInterpretation.debug.divergenceType}</div>
                      <div><strong>Gold driver summary (debug):</strong> {goldInterpretation.debug.driverSummary}</div>
                      <div><strong>Gold divergence explanation (debug):</strong> {goldInterpretation.debug.divergenceExplanation}</div>
                      <div><strong>Gold trend explanation (debug):</strong> {goldInterpretation.debug.trendExplanation}</div>
                    </>
                  ) : null}
                  <div><strong>Screening adjustments:</strong> {commoditySnapshot.snapshot.screeningAdjustments.notes?.join(" | ") ?? "none"}</div>
                  <div><strong>Threshold adjustments:</strong> valuation floor Δ={commoditySnapshot.snapshot.screeningAdjustments.thresholdAdjustments?.valuationMultipleFloorDeltaPct ?? 0}%, max position Δ={commoditySnapshot.snapshot.screeningAdjustments.thresholdAdjustments?.maxPositionSizeDeltaPct ?? 0}%</div>
                  <div><strong>Profile version:</strong> {commoditySnapshot.snapshot.profileVersion}</div>
                </details>
              </div>
            )}
          </div>
        ) : null}

        <div className="sector-card">
          <h3>Senaste inputs</h3>
          {manualInputs.length === 0 ? (
            <div className="status empty">Inga manuella inputs sparade än.</div>
          ) : (
            <ul className="input-log">
              {manualInputs.map((input) => (
                <li key={`${input.input_type}-${input.created_at}`}>
                  <strong>{input.input_type}</strong>: {input.value}
                  {input.source ? ` (Källa: ${input.source})` : ""}
                  <div className="input-meta">{new Date(input.created_at).toLocaleString()}</div>
                  {input.note ? <div className="input-note">{input.note}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {debugMode ? (
        <details className="sector-coverage-debug" open>
          <summary>Sector mapping debug</summary>
          <div className="sector-coverage-debug-grid">
            <div>
              <strong>Canonical sector (id)</strong>: {sector || "n/a"}
            </div>
            <div>
              <strong>Canonical subsector (id)</strong>: {subsector || "n/a"}
            </div>
            <div>
              <strong>Mapping source</strong>: company_sector_map
            </div>
            <div>
              <strong>Provider sector</strong>: FMP (metadata only)
            </div>
            <div>
              <strong>Commodity exposure samples</strong>:
              {(overview?.commodityExposure?.sampleProfiles ?? []).length === 0 ? (
                " none"
              ) : null}
            </div>
            {(overview?.commodityExposure?.sampleProfiles ?? []).slice(0, 6).map((profile) => (
              <div key={`debug-exp-${profile.companyId}`}>
                {profile.ticker ?? profile.companyId}: sector={profile.canonicalSectorId}, subsector={profile.canonicalSubsectorId ?? "n/a"}, diversified={String(profile.isDiversified)}, basis={profile.basis}
                {profile.source ? `, source=${profile.source}` : ""}
                {profile.note ? `, note=${profile.note}` : ""}
                {profile.defaultProfile.exposures.length > 0
                  ? `, default=${profile.defaultProfile.exposures.map((exposure) => `${exposure.commodity}:${exposure.weight.toFixed(2)} (${exposure.evidence}, c=${exposure.confidence.toFixed(2)})`).join(" | ")}`
                  : ", default=none"}
                {profile.manualOverrideProfile?.exposures?.length
                  ? `, manual=${profile.manualOverrideProfile.exposures.map((exposure) => `${exposure.commodity}:${exposure.weight.toFixed(2)}`).join(" | ")}`
                  : ", manual=none"}
                {profile.finalProfile.exposures.length > 0
                  ? `, final=${profile.finalProfile.exposures.map((exposure) => `${exposure.commodity}:${exposure.weight.toFixed(2)}`).join(" | ")}`
                  : ", final=none"}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
