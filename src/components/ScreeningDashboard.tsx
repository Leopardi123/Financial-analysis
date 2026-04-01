import { useMemo, useState } from "react";
import { evaluateScreen } from "../screening/engine";
import { SCREENING_FIELDS, SCREENING_FIELD_MAP } from "../screening/fieldCatalog";
import { getPresetById, SCREENING_PRESETS } from "../screening/presets";
import type { CompanySnapshot, RuleOperator, ScreenDefinition, ScreenRule, ScreeningMode, ScreeningResult, UniverseType } from "../screening/types";

const WATCHLIST = ["AAPL", "MSFT", "BRK.B", "COST", "NVO"];
const SAFE_TICKER_PATTERN = /^[A-Z0-9.\-_/]+$/;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Request failed"));
  }
  return payload;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
      if (index % 20 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function parseManualJson(value: string) {
  if (!value.trim()) {
    return {} as Record<string, Record<string, number>>;
  }
  try {
    return JSON.parse(value) as Record<string, Record<string, number>>;
  } catch {
    return {} as Record<string, Record<string, number>>;
  }
}

function normalizeTicker(raw: string): string | null {
  const ticker = String(raw ?? "").trim().toUpperCase();
  if (!ticker) return null;
  return SAFE_TICKER_PATTERN.test(ticker) ? ticker : null;
}

function unitLabel(unit: "percent" | "ratio" | "absolute" | "state") {
  if (unit === "percent") return "Värde (%)";
  if (unit === "ratio") return "Värde (x)";
  if (unit === "absolute") return "Värde";
  return "Värde";
}

function unitSuffix(unit: "percent" | "ratio" | "absolute" | "state") {
  if (unit === "percent") return "%";
  if (unit === "ratio") return "x";
  return "";
}

function buildAdvancedScreen(rules: ScreenRule[]): ScreenDefinition {
  return {
    id: "advanced-custom",
    name: "Advanced custom screen",
    category: "Advanced",
    description: "Hypotesdriven screening via mustHave-regler (AND).",
    checks: ["Alla regler i mustHave måste passera"],
    ignores: ["Preset-opinionering"],
    requiredFields: rules.map((rule) => rule.field),
    optionalFields: [],
    fallback: "Saknade värden markeras som not evaluated.",
    rules: { mustHave: rules },
  };
}

function defaultRuleValue(fieldKey: string): ScreenRule["value"] {
  const def = SCREENING_FIELD_MAP.get(fieldKey);
  if (!def) return 0;
  if (def.inputKind === "categorical") return def.enumValues?.[0] ?? "";
  return 0;
}

function allowedOperatorsFor(fieldKey: string): RuleOperator[] {
  return SCREENING_FIELD_MAP.get(fieldKey)?.allowedOperators ?? [">", ">=", "<", "<=", "==", "!=", "in"];
}

function normalizeRuleForField(rule: ScreenRule, nextField: string): ScreenRule {
  const ops = allowedOperatorsFor(nextField);
  const nextOperator = ops.includes(rule.operator) ? rule.operator : ops[0];
  return {
    ...rule,
    field: nextField,
    operator: nextOperator,
    value: defaultRuleValue(nextField),
  };
}

async function fetchCorporateSnapshot(symbol: string, sharesCurrent: number | null, priceCurrent: number | null) {
  if (!sharesCurrent || !priceCurrent) return null;
  const payload = await fetchJson("/api/snapshot/corporate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      targetCurrency: "USD",
      discountRate: 0.1,
      scenario: { mode: "spot" },
      fx: { source: "auto", anchor: "today", scenario: { mode: "spot" } },
      market: {
        shares_current: sharesCurrent,
        price_current_TargetCurrency: priceCurrent,
      },
    }),
  }).catch(() => null);

  const snapshot = payload?.snapshot ?? null;
  if (!snapshot || typeof snapshot !== "object") return null;
  const asObj = snapshot as Record<string, unknown>;
  return {
    ...asObj,
    shares_post_financing: typeof asObj.shares_post_financing === "number"
      ? asObj.shares_post_financing
      : (typeof sharesCurrent === "number" ? sharesCurrent : null),
    price_current_TargetCurrency: priceCurrent,
  };
}

function readPathValue(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function resolveCorporateDebugMetric(snapshot: Record<string, unknown> | null | undefined, field: string) {
  if (field === "corp_cash_over_market_cap") {
    const cashCandidates = [
      "reportedQuarterlyBalance.cashAndCashEquivalents",
      "reportedQuarterlyBalance.cashAndShortTermInvestments",
      "reportedQuarterlyBalance.cashAndCashEquivalentsAndShortTermInvestments",
    ];
    const marketCapCandidates = [
      "profile.mktCap",
      "profile.marketCap",
      "profile.price * profile.sharesOutstanding",
    ];
    if (!snapshot) {
      return {
        resolvedPath: `${cashCandidates[0]} / ${marketCapCandidates[0]}`,
        sourceObject: "screeningPayload",
        rawValue: null,
        normalizedValue: null,
        missingReason: "corporateSnapshot saknas i payload",
        cashSourcePathUsed: null,
        marketCapSourcePathUsed: null,
        usedReportedQuarterlyCash: false,
        usedModeledMarketCap: false,
        usedPostFinancingShares: false,
      };
    }

    let cashValue: number | null = null;
    let cashSourcePathUsed: string | null = null;
    for (const path of cashCandidates) {
      const raw = readPathValue(snapshot, path);
      if (!Array.isArray(raw)) continue;
      for (let i = raw.length - 1; i >= 0; i -= 1) {
        const value = raw[i];
        if (typeof value === "number" && Number.isFinite(value)) {
          cashValue = value;
          cashSourcePathUsed = path;
          break;
        }
      }
      if (cashSourcePathUsed) break;
    }

    const profileMktCap = Number(readPathValue(snapshot, "profile.mktCap"));
    const profileMarketCap = Number(readPathValue(snapshot, "profile.marketCap"));
    const profilePrice = Number(readPathValue(snapshot, "profile.price"));
    const profileShares = Number(readPathValue(snapshot, "profile.sharesOutstanding"));
    const marketCapFromPriceShares = Number.isFinite(profilePrice) && profilePrice > 0 && Number.isFinite(profileShares) && profileShares > 0
      ? profilePrice * profileShares
      : null;

    const marketCapResolved = Number.isFinite(profileMktCap) && profileMktCap > 0
      ? { value: profileMktCap, path: "profile.mktCap" }
      : (Number.isFinite(profileMarketCap) && profileMarketCap > 0
        ? { value: profileMarketCap, path: "profile.marketCap" }
        : (marketCapFromPriceShares !== null
          ? { value: marketCapFromPriceShares, path: "profile.price * profile.sharesOutstanding" }
          : null));

    const normalizedValue = cashValue !== null && marketCapResolved && marketCapResolved.value > 0
      ? cashValue / marketCapResolved.value
      : null;

    return {
      resolvedPath: `${cashSourcePathUsed ?? cashCandidates.join(" | ")} / ${marketCapResolved?.path ?? marketCapCandidates.join(" | ")}`,
      sourceObject: "screeningPayload",
      rawValue: normalizedValue,
      normalizedValue,
      missingReason: normalizedValue === null ? "cash eller current market cap saknas/ogiltig" : null,
      cashSourcePathUsed,
      marketCapSourcePathUsed: marketCapResolved?.path ?? null,
      usedReportedQuarterlyCash: cashSourcePathUsed !== null,
      usedModeledMarketCap: false,
      usedPostFinancingShares: false,
    };
  }

  const candidatesByField: Record<string, string[]> = {
    corp_ev_over_nav: ["EV_over_NAV", "marketValue.EV_over_NAV", "marketValue.ev_over_nav"],
    corp_ev_over_npv: ["EV_over_NPV", "marketValue.EV_over_NPV", "marketValue.ev_over_npv"],
    corp_p_over_nav: ["P_over_NAV", "marketValue.P_over_NAV", "marketValue.p_over_nav"],
  };
  const candidates = candidatesByField[field] ?? [];
  if (!snapshot) {
    return {
      resolvedPath: candidates[0] ?? "n/a",
      sourceObject: "screeningPayload",
      rawValue: null,
      normalizedValue: null,
      missingReason: "corporateSnapshot saknas i payload",
    };
  }
  for (const path of candidates) {
    const raw = readPathValue(snapshot, path);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return { resolvedPath: path, sourceObject: "screeningPayload", rawValue: raw, normalizedValue: raw, missingReason: null };
    }
    if (Array.isArray(raw)) {
      for (let i = raw.length - 1; i >= 0; i -= 1) {
        const value = raw[i];
        if (typeof value === "number" && Number.isFinite(value)) {
          return { resolvedPath: path, sourceObject: "screeningPayload", rawValue: value, normalizedValue: value, missingReason: null };
        }
      }
    }
  }
  return {
    resolvedPath: candidates.join(" | "),
    sourceObject: "screeningPayload",
    rawValue: null,
    normalizedValue: null,
    missingReason: "ingen finite siffra hittades på förväntade paths",
  };
}

async function loadSnapshot(
  ticker: string,
  manualData: Record<string, Record<string, number>>,
  includeCorporateSnapshot: boolean,
  includeQuarterlyReportedCash: boolean,
) {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) return null;

  const [companyPayload, quarterlyPayload, profilePayload, pricePayload, priceNowPayload] = await Promise.all([
    fetchJson(`/api/company?ticker=${encodeURIComponent(normalizedTicker)}&period=fy`).catch(() => null),
    includeQuarterlyReportedCash
      ? fetchJson(`/api/company?ticker=${encodeURIComponent(normalizedTicker)}&period=q`)
        .catch(() => fetchJson(`/api/company?ticker=${encodeURIComponent(normalizedTicker)}&period=quarterly`).catch(() => null))
      : Promise.resolve(null),
    fetchJson(`/api/company/profile?ticker=${encodeURIComponent(normalizedTicker)}`).catch(() => null),
    fetchJson(`/api/screening/price-snapshot?symbol=${encodeURIComponent(normalizedTicker)}`).catch(() => null),
    includeCorporateSnapshot
      ? fetchJson(`/api/company/price?ticker=${encodeURIComponent(normalizedTicker)}`).catch(() => null)
      : Promise.resolve(null),
  ]);

  const profile = profilePayload?.profile ?? null;
  const snapshotPrice = typeof pricePayload?.snapshot?.close === "number" && Number.isFinite(pricePayload.snapshot.close)
    ? Number(pricePayload.snapshot.close)
    : null;
  const profileShares = Number(profile?.sharesOutstanding);
  const sharesCurrent = Number.isFinite(profileShares) && profileShares > 0 ? profileShares : null;
  const profilePriceRaw = Number(profile?.price);
  const profilePrice = Number.isFinite(profilePriceRaw) && profilePriceRaw > 0 ? profilePriceRaw : null;
  const quotePrice = typeof priceNowPayload?.short?.price?.[1]?.[1] === "number" && Number.isFinite(priceNowPayload.short.price[1][1])
    ? Number(priceNowPayload.short.price[1][1])
    : null;
  const marketCapRaw = Number(profile?.mktCap);
  const marketCap = Number.isFinite(marketCapRaw) && marketCapRaw > 0 ? marketCapRaw : null;
  const derivedPriceFromMarketCap = marketCap !== null && sharesCurrent !== null && sharesCurrent > 0
    ? marketCap / sharesCurrent
    : null;
  const fallbackPrice = quotePrice ?? profilePrice ?? derivedPriceFromMarketCap ?? snapshotPrice;
  const fallbackShares = marketCap !== null && fallbackPrice !== null && fallbackPrice > 0
    ? marketCap / fallbackPrice
    : null;
  const sharesResolved = sharesCurrent ?? fallbackShares;
  const priceCurrent = fallbackPrice;

  const corporateSnapshot = includeCorporateSnapshot
    ? await fetchCorporateSnapshot(normalizedTicker, sharesResolved, priceCurrent)
    : null;

  const snapshot: CompanySnapshot = {
    ticker,
    years: Array.isArray(companyPayload?.years) ? companyPayload.years : [],
    income: companyPayload?.income ?? {},
    balance: companyPayload?.balance ?? {},
    reportedQuarterlyBalance: quarterlyPayload?.balance ?? {},
    cashflow: companyPayload?.cashflow ?? {},
    profile,
    manual: manualData[normalizedTicker] ?? {},
    price: pricePayload?.snapshot ?? null,
    corporateSnapshot,
  };
  return snapshot;
}

export default function ScreeningDashboard() {
  const [mode, setMode] = useState<ScreeningMode>("simple");
  const [universe, setUniverse] = useState<UniverseType>("all");
  const [presetId, setPresetId] = useState(SCREENING_PRESETS[0].id);
  const [sectorFilter, setSectorFilter] = useState("");
  const [manualTickers, setManualTickers] = useState("AAPL, MSFT");
  const [manualJson, setManualJson] = useState('{"AAPL":{"founderFlag":1},"MSFT":{"insiderScore":1}}');
  const [showManualOverrides, setShowManualOverrides] = useState(false);
  const [advancedRules, setAdvancedRules] = useState<ScreenRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [showPassedOnly, setShowPassedOnly] = useState(false);
  const [universeInfo, setUniverseInfo] = useState<{
    selectedUniverseCount: number;
    screenedCount: number;
    passedCount: number;
    failedCount: number;
    missingCount: number;
    requiredFields: string[];
    requiredSources: string[];
    manualUsed: boolean;
    manualFieldsUsed: string[];
    manualTickersApplied: number;
    notes: string[];
  } | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "ticker">("score");

  const preset = useMemo(() => getPresetById(presetId), [presetId]);

  const sortedResults = useMemo(() => {
    const filtered = showPassedOnly ? results.filter((item) => item.evaluationStatus === "passed") : results;
    const next = [...filtered];
    if (sortBy === "score") {
      next.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
    } else {
      next.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }
    return next;
  }, [results, sortBy, showPassedOnly]);

  const activeScreen = useMemo(() => {
    if (mode === "advanced") {
      return buildAdvancedScreen(advancedRules);
    }
    return preset;
  }, [mode, preset, advancedRules]);

  const visibleColumns = useMemo(() => {
    const ruleFields = activeScreen.rules.mustHave.map((rule) => rule.field);
    return [...new Set(ruleFields)].slice(0, 4);
  }, [activeScreen]);

  const selectedRule = useMemo(() => advancedRules.find((rule) => rule.id === selectedRuleId) ?? advancedRules[0] ?? null, [advancedRules, selectedRuleId]);
  const selectedField = selectedRule ? SCREENING_FIELD_MAP.get(selectedRule.field) : null;

  async function resolveUniverse(requiredFields: string[]): Promise<{ tickers: string[]; notes: string[] }> {
    const notes: string[] = [];
    const requiresPriceSnapshot = requiredFields.some((field) => SCREENING_FIELD_MAP.get(field)?.source === "price_screen_snapshot");

    let baseUniverse: string[] = [];
    if (universe === "watchlist") {
      baseUniverse = WATCHLIST.map(normalizeTicker).filter((ticker): ticker is string => Boolean(ticker));
    } else if (universe === "manual") {
      baseUniverse = manualTickers.split(",").map(normalizeTicker).filter((ticker): ticker is string => Boolean(ticker));
    } else {
      const payload = await fetchJson("/api/company/list");
      const list = Array.isArray(payload.tickers)
        ? payload.tickers.map((item: string) => normalizeTicker(String(item))).filter((ticker: string | null): ticker is string => Boolean(ticker))
        : [];
      if (universe === "sector") {
        if (!sectorFilter.trim()) return { tickers: [], notes: ["Sector-universe kräver sektorfilter."] };
        const filtered: string[] = [];
        for (const ticker of list) {
          const profilePayload = await fetchJson(`/api/company/profile?ticker=${encodeURIComponent(ticker)}`).catch(() => null);
          const sector = String(profilePayload?.profile?.sector ?? "").toLowerCase();
          if (sector.includes(sectorFilter.trim().toLowerCase())) filtered.push(ticker);
        }
        baseUniverse = filtered;
      } else {
        baseUniverse = list;
      }
    }

    if (!requiresPriceSnapshot) return { tickers: baseUniverse, notes };

    const priceSnapshotPayload = await fetchJson("/api/screening/price-snapshot").catch(() => null);
    const availablePriceSymbols = new Set(
      Array.isArray(priceSnapshotPayload?.rows)
        ? priceSnapshotPayload.rows
          .map((row: Record<string, unknown>) => normalizeTicker(String(row.symbol ?? "")))
          .filter((ticker: string | null): ticker is string => Boolean(ticker))
        : [],
    );

    if (availablePriceSymbols.size === 0) {
      notes.push("Inga price snapshots hittades ännu. Kör /api/admin/refresh-price-screen innan price-baserad screening.");
      return { tickers: [], notes };
    }

    const filteredByPrice = baseUniverse.filter((ticker) => availablePriceSymbols.has(ticker));
    notes.push(`Price snapshot coverage: ${filteredByPrice.length}/${baseUniverse.length} tickers i valt universe.`);
    return { tickers: filteredByPrice, notes };
  }

  function resolveParams(screen: ScreenDefinition): Record<string, number> {
    return screen.defaults ?? {};
  }

  async function runScreening() {
    setLoading(true);
    setError(null);
    try {
      const requiredFields = [...new Set(activeScreen.rules.mustHave.map((rule) => rule.field))];
      const requiresCorporateSnapshot = requiredFields.some((field) => SCREENING_FIELD_MAP.get(field)?.source === "corporate_snapshot");
      const requiresQuarterlyReportedCash = requiredFields.includes("corp_cash_over_market_cap");
      const resolvedUniverse = await resolveUniverse(requiredFields);
      const tickers = resolvedUniverse.tickers;
      const manualData = parseManualJson(manualJson);
      const params = resolveParams(activeScreen);
      const requiredSources = requiredFields
        .map((field) => SCREENING_FIELD_MAP.get(field)?.source ?? "unknown")
        .filter((value, idx, arr) => arr.indexOf(value) === idx);
      const manualFieldsUsed = requiredFields.filter((field) => SCREENING_FIELD_MAP.get(field)?.group === "manual");
      const manualUsed = manualFieldsUsed.length > 0;
      const manualTickersApplied = manualUsed
        ? Object.values(manualData).filter((record) => manualFieldsUsed.some((field) => typeof record[field] === "number")).length
        : 0;

      if (tickers.length === 0) {
        setResults([]);
        setUniverseInfo({
          selectedUniverseCount: 0,
          screenedCount: 0,
          passedCount: 0,
          failedCount: 0,
          missingCount: 0,
          requiredFields,
          requiredSources,
          manualUsed,
          manualFieldsUsed,
          manualTickersApplied,
          notes: [...resolvedUniverse.notes, "Inga bolag kunde väljas för den aktiva screenen med nuvarande datatäckning."],
        });
        return;
      }

      let skippedFetchErrors = 0;
      const snapshots = await mapWithConcurrency(tickers, 4, async (ticker) => {
        try {
          return await loadSnapshot(ticker, manualData, requiresCorporateSnapshot, requiresQuarterlyReportedCash);
        } catch {
          skippedFetchErrors += 1;
          return null;
        }
      });

      const evaluated = snapshots
        .filter((snapshot): snapshot is CompanySnapshot => snapshot !== null)
        .map((snapshot) => {
          const score = evaluateScreen({ snapshot, screen: activeScreen, params });
          return {
            ticker: snapshot.ticker,
            presetId: activeScreen.id,
            matched: score.matched,
            score: score.score,
            evaluationStatus: score.evaluationStatus,
            missingRequiredFields: score.missingRequiredFields,
            includeReasons: score.includeReasons,
            excludeReasons: score.excludeReasons,
            metrics: score.metrics,
            ruleResults: score.ruleResults,
          } as ScreeningResult;
        });

      setResults(evaluated);
      const screenedCount = evaluated.filter((item) => item.evaluationStatus !== "not_evaluated").length;
      const passedCount = evaluated.filter((item) => item.evaluationStatus === "passed").length;
      const failedCount = evaluated.filter((item) => item.evaluationStatus === "failed").length;
      const missingCount = evaluated.filter((item) => item.evaluationStatus === "not_evaluated").length;
      const notes: string[] = [...resolvedUniverse.notes];
      if (requiresCorporateSnapshot) notes.push("Corporate metrics beräknas via /api/snapshot/corporate med symbol-mode per bolag.");
      if (requiresCorporateSnapshot) {
        const corporatePresent = snapshots.filter((item): item is CompanySnapshot => Boolean(item?.corporateSnapshot)).length;
        notes.push(`[corp-debug] corporateSnapshot coverage=${corporatePresent}/${tickers.length}`);
      }
      const requestedCorporateFields = requiredFields.filter((field) => SCREENING_FIELD_MAP.get(field)?.source === "corporate_snapshot");
      if (requestedCorporateFields.length > 0) {
        const sampleSnapshot = snapshots.find((item): item is CompanySnapshot => Boolean(item?.corporateSnapshot));
        for (const corporateField of requestedCorporateFields) {
          const debugSource = sampleSnapshot
            ? {
              ...(sampleSnapshot.corporateSnapshot ?? {}),
              reportedQuarterlyBalance: sampleSnapshot.reportedQuarterlyBalance ?? {},
              profile: sampleSnapshot.profile ?? {},
            }
            : null;
          const debug = resolveCorporateDebugMetric(debugSource as Record<string, unknown> | null | undefined, corporateField);
          const extra = corporateField === "corp_cash_over_market_cap"
            ? ` cashSourcePathUsed=${String((debug as { cashSourcePathUsed?: string | null }).cashSourcePathUsed ?? "null")} marketCapSourcePathUsed=${String((debug as { marketCapSourcePathUsed?: string | null }).marketCapSourcePathUsed ?? "null")} usedReportedQuarterlyCash=${String((debug as { usedReportedQuarterlyCash?: boolean }).usedReportedQuarterlyCash ?? false)} usedModeledMarketCap=${String((debug as { usedModeledMarketCap?: boolean }).usedModeledMarketCap ?? false)} usedPostFinancingShares=${String((debug as { usedPostFinancingShares?: boolean }).usedPostFinancingShares ?? false)}`
            : "";
          notes.push(
            `[corp-debug] field=${corporateField} source=${debug.sourceObject} path=${debug.resolvedPath} raw=${debug.rawValue === null ? "null" : String(debug.rawValue)} normalized=${debug.normalizedValue === null ? "null" : String(debug.normalizedValue)} reason=${debug.missingReason ?? "ok"}${extra}`,
          );
        }
      }
      if (missingCount > 0) notes.push(`Aktiv regel kräver ${requiredFields.join(", ")}; ${missingCount} bolag saknade obligatorisk data.`);
      if (skippedFetchErrors > 0) notes.push(`${skippedFetchErrors} bolag hoppades över p.g.a. otillgänglig tickerdata.`);
      if (!manualUsed) notes.push("Denna screening använder inte analyst overrides.");

      setUniverseInfo({
        selectedUniverseCount: tickers.length,
        screenedCount,
        passedCount,
        failedCount,
        missingCount,
        requiredFields,
        requiredSources,
        manualUsed,
        manualFieldsUsed,
        manualTickersApplied,
        notes,
      });
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
      setUniverseInfo(null);
    } finally {
      setLoading(false);
    }
  }

  function openTicker(ticker: string) {
    window.dispatchEvent(new CustomEvent("screening:open-ticker", { detail: { ticker } }));
    window.location.hash = "singlestock";
  }

  function openPresetInAdvanced() {
    setAdvancedRules([...preset.rules.mustHave]);
    setSelectedRuleId(preset.rules.mustHave[0]?.id ?? null);
    setMode("advanced");
  }

  function addAdvancedRule() {
    const field = SCREENING_FIELDS.find((item) => item.advanced)?.key ?? "return_20d";
    const ops = allowedOperatorsFor(field);
    const nextRule = { id: `rule-${Date.now()}`, field, operator: ops[0], value: defaultRuleValue(field) } as ScreenRule;
    setAdvancedRules((prev) => [...prev, nextRule]);
    setSelectedRuleId(nextRule.id);
  }

  function updateAdvancedRule(index: number, patch: Partial<ScreenRule>) {
    setAdvancedRules((prev) => prev.map((rule, idx) => {
      if (idx !== index) return rule;
      if (patch.field && patch.field !== rule.field) return normalizeRuleForField(rule, patch.field);
      return { ...rule, ...patch };
    }));
  }

  function removeAdvancedRule(index: number) {
    setAdvancedRules((prev) => prev.filter((_rule, idx) => idx !== index));
  }

  return (
    <div className="screening-dashboard screening-compact-layout">
      <div className="screening-card">
        <h3 className="subrub small">Screening är kandidatjakt, inte köp/sälj-signal</h3>
        <p className="bread">Simple = opinionerade presets. Advanced = hypotesdriven regelbyggnad på samma motor.</p>
        <div className="screening-inline-grid">
          <div>
            <label>Universe</label>
            <select value={universe} onChange={(event) => setUniverse(event.target.value as UniverseType)}>
              <option value="all">All</option>
              <option value="watchlist">Watchlist</option>
              <option value="sector">Sector</option>
              <option value="manual">Manual list</option>
            </select>
          </div>
          <div>
            <label>Mode</label>
            <select value={mode} onChange={(event) => setMode(event.target.value as ScreeningMode)}>
              <option value="simple">Simple</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          {mode === "simple" && (
            <div>
              <label>Preset</label>
              <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
                {SCREENING_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {universe === "sector" && <input value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)} placeholder="Sector filter, t.ex. Technology" />}
        {universe === "manual" && <input value={manualTickers} onChange={(event) => setManualTickers(event.target.value)} placeholder="AAPL, MSFT, ..." />}
      </div>

      <div className="screening-card">
        {mode === "simple" ? (
          <>
            <p className="bread"><strong>{preset.name}:</strong> {preset.description}</p>
            <p className="bread"><strong>Tittar på:</strong> {preset.checks.join(" • ")}</p>
            <button type="button" onClick={openPresetInAdvanced}>Öppna preset i Advanced</button>
          </>
        ) : (
          <>
            <div className="screening-rule-header">
              <strong>Advanced rules (AND)</strong>
              <button type="button" onClick={addAdvancedRule}>+ Lägg till regel</button>
            </div>
            {advancedRules.length === 0 && <p className="bread">Inga regler ännu. Lägg till en regel för att köra Advanced-screening.</p>}
            <div className="screening-rules-list">
              {advancedRules.map((rule, index) => {
                const fieldDef = SCREENING_FIELD_MAP.get(rule.field);
                const operators = allowedOperatorsFor(rule.field);
                const valueText = Array.isArray(rule.value) ? rule.value.join(",") : typeof rule.value === "object" ? "" : String(rule.value);
                const enumValues = fieldDef?.enumValues ?? [];
                const isCategorical = fieldDef?.inputKind === "categorical";
                return (
                  <div key={rule.id} className={`screening-rule-row ${selectedRule?.id === rule.id ? "is-selected" : ""}`} onClick={() => setSelectedRuleId(rule.id)}>
                    <select value={rule.field} onChange={(event) => updateAdvancedRule(index, { field: event.target.value })}>
                      {SCREENING_FIELDS.filter((field) => field.advanced).map((field) => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                    </select>
                    <select value={rule.operator} onChange={(event) => updateAdvancedRule(index, { operator: event.target.value as RuleOperator })}>
                      {operators.map((operator) => <option key={operator} value={operator}>{operator === "in" ? "in" : operator}</option>)}
                    </select>
                    {isCategorical ? (
                      <>
                        {rule.operator === "in" ? (
                          <select
                            value={Array.isArray(rule.value) ? String(rule.value[0] ?? "") : String(rule.value)}
                            onChange={(event) => updateAdvancedRule(index, { value: [event.target.value] })}
                          >
                            {enumValues.map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        ) : (
                          <select value={String(rule.value)} onChange={(event) => updateAdvancedRule(index, { value: event.target.value })}>
                            {enumValues.map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        )}
                      </>
                    ) : (
                      <div className="screening-value-wrap">
                        <input
                          type="number"
                          value={valueText}
                          onChange={(event) => {
                            const raw = event.target.value;
                            const asNum = Number(raw);
                            if (Number.isFinite(asNum)) updateAdvancedRule(index, { value: asNum });
                            else updateAdvancedRule(index, { value: raw });
                          }}
                          placeholder={fieldDef?.valueFormatHint ?? unitLabel(fieldDef?.unit ?? "absolute")}
                        />
                        {fieldDef && unitSuffix(fieldDef.unit) && <span className="bread">{unitSuffix(fieldDef.unit)}</span>}
                      </div>
                    )}
                    <button type="button" onClick={() => removeAdvancedRule(index)}>✕</button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="screening-card screening-info-box">
        <h4 className="subrub small">Om detta mått</h4>
        {selectedField ? (
          <>
            <p className="bread"><strong>{selectedField.label}</strong></p>
            <p className="bread"><strong>Hur värdet tolkas:</strong> {selectedField.interpretation ?? selectedField.valueFormatHint ?? "Ange numeriskt värde enligt enheten."}</p>
            {selectedField.description && <p className="bread"><strong>Definition:</strong> {selectedField.description}</p>}
            {selectedField.example && <p className="bread"><strong>Exempel:</strong> {selectedField.example}</p>}
            <p className="bread"><strong>Källa:</strong> {selectedField.source}</p>
          </>
        ) : (
          <p className="bread">Välj en advanced-regel för att se fältspecifik hjälptext.</p>
        )}
      </div>

      <div className="screening-card">
        <div className="screening-rule-header">
          <div>
            <button type="button" onClick={() => setShowManualOverrides((prev) => !prev)}>
              {showManualOverrides ? "Dölj" : "Visa"} Analyst / Manual overrides
            </button>
            {showManualOverrides && (
              <textarea className="manual-json" value={manualJson} onChange={(event) => setManualJson(event.target.value)} />
            )}
          </div>
          <div className="screening-inline-actions">
            <button type="button" onClick={() => void runScreening()} disabled={loading}>{loading ? "Kör screening..." : "Kör screening"}</button>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "score" | "ticker")}>
              <option value="score">Sort: Score</option>
              <option value="ticker">Sort: Ticker</option>
            </select>
            <label className="bread"><input type="checkbox" checked={showPassedOnly} onChange={(event) => setShowPassedOnly(event.target.checked)} /> Endast pass</label>
          </div>
        </div>

        {error && <p className="status error">{error}</p>}
        {universeInfo && <p className="bread"><strong>Screened:</strong> {universeInfo.screenedCount} • <strong>Passed:</strong> {universeInfo.passedCount} • <strong>Failed:</strong> {universeInfo.failedCount} • <strong>Not evaluated:</strong> {universeInfo.missingCount}</p>}

        <div className="viewer-table">
          {sortedResults.length === 0 && !loading ? (
            <p className="status empty">Inga resultat ännu. Kör en screen för att se kandidater.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="sticky-col">Ticker</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Include</th>
                    <th>Exclude / Missing</th>
                    {visibleColumns.map((column) => <th key={column}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((result) => (
                    <tr key={`${result.presetId}-${result.ticker}`}>
                      <td className="sticky-col"><button type="button" onClick={() => openTicker(result.ticker)}>{result.ticker}</button></td>
                      <td>{result.score.toFixed(1)}</td>
                      <td>{result.evaluationStatus === "not_evaluated" ? "Not evaluated" : result.matched ? "Pass" : "Fail"}</td>
                      <td>{result.includeReasons.slice(0, 2).join(" ") || "-"}</td>
                      <td>{result.evaluationStatus === "not_evaluated" ? `Missing: ${result.missingRequiredFields.join(", ")}` : result.excludeReasons.slice(0, 2).join(" ") || "-"}</td>
                      {visibleColumns.map((column) => {
                        const metric = result.metrics.find((item) => item.key === column);
                        return <td key={`${result.ticker}-${column}`}>{metric?.value === null || metric?.value === undefined ? "-" : String(metric.value)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {universeInfo && (
        <div className="screening-card screening-debug-box">
          <h4 className="subrub small">Debug / coverage</h4>
          <p className="bread"><strong>Universe:</strong> {universe}, {universeInfo.selectedUniverseCount} bolag.</p>
          <p className="bread"><strong>Required sources:</strong> {universeInfo.requiredSources.join(" + ") || "okänd"}</p>
          {universeInfo.notes.map((note) => <p className="bread" key={note}>{note}</p>)}
        </div>
      )}
    </div>
  );
}
