import { useEffect, useMemo, useState } from "react";
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
  const [macroSnapshot, setMacroSnapshot] = useState<MacroSnapshotPayload | null>(null);
  const [macroLens, setMacroLens] = useState<MacroToneFilter>("all");
  const [macroStrength, setMacroStrength] = useState<MacroStrengthFilter>("all");
  const debugMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debug") === "1";
  }, []);
  const debugMacroMapping = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("macroDebug") === "1";
  }, []);
  const subsectorCoverageAudit = useMemo(() => {
    if (!debugMode) return null;
    return buildSubsectorCoverageAuditReport();
  }, [debugMode]);

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
    if (sector === "energy" && subsector === "oil_gas_producers") {
      return [...GENERIC_QUESTIONS, ...OIL_QUESTIONS];
    }
    return GENERIC_QUESTIONS;
  }, [sector, subsector]);

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
      </div>

      <div className="sector-grid">
        <div className="sector-card">
          <h3>Sector Overview</h3>
          <p className="bread">
            Automatiska sektormått saknas ännu. Dessa ska komma från befintlig backend (EV/EBITDA,
            FCF yield, ROIC, CAPEX/OCF m.m.).
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
            Fyll i manuella inputs för cykelbedömning. Alla svar sparas med tidsstämpel och kopplas
            till sektor/undersektor.
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
            Koppla tickers till vald sektor/undersektor för att beräkna automatiska sektormått.
          </p>
          <label htmlFor="mapping-category">Kategori</label>
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
        </div>

        <div className="sector-card">
          <h3>Cykelbedömning</h3>
          <p className="bread">
            Cykelstatus genereras först när både automatiska datapunkter och manuella inputs finns.
            Just nu saknas automatiska datapunkter, så status visas som TODO.
          </p>
          <div className="cycle-status">TODO: Kombinera datapunkter och manuella inputs.</div>
        </div>

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

      {debugMode && subsectorCoverageAudit ? (
        <details className="sector-debug-panel" style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Debug: subsector → driver coverage matrix
          </summary>
          <p className="bread" style={{ marginTop: 8 }}>
            Full diagnostics payload (matrix, differentiation checks, overlay gap ranking). Endast synlig med <code>?debug=1</code>.
          </p>
          <pre style={{ maxHeight: 520, overflow: "auto", fontSize: 11, background: "#f8fafc", padding: 12, borderRadius: 8 }}>
            {JSON.stringify(subsectorCoverageAudit, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
