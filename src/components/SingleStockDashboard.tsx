import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Admin from "./Admin";
import ChartCard from "./ChartCard";
import CompanyPicker from "./CompanyPicker";
import InfoPopover from "./InfoPopover";
import ValueRangeSnapshotCard from "./project/ValueRangeSnapshotCard";
import NpvSpotRangeComparisonCard from "./project/NpvSpotRangeComparisonCard";
import AlltGickFelCard from "./project/AlltGickFelCard";
import type { StressOptions } from "../lib/snapshot/applyStressModifiers.ts";
import useCompanyData from "../hooks/useCompanyData";
import type { CompanyResponse } from "./Viewer";
import type { SnapshotRequest } from "../lib/api/validateSnapshotRequest.ts";
import { getCompanyProject, getCompanyProjectsBySymbol, type CompanyProjectSummary } from "../lib/client/companyProjectsClient.ts";
import { safeParseJson } from "../lib/client/json.ts";
import { postCorporateSnapshot } from "../lib/client/snapshotClient.ts";
import { resolveCommonSharesCurrent } from "../lib/market/resolveSharesCurrent.ts";
import { EXTRA_SHARES_HELP, extraSharesStorageKey, formatExtraSharesInput, parseExtraShares } from "../lib/market/extraShares.ts";
import { parseProjectJsonV1WithContext } from "../lib/project/jsonv1/parse.ts";
import { rowHasDisplayValue } from "../lib/project/rowDisplayValue.ts";
import { extractFailingMetals, extractFallbackOrFailingPriceMetals, rowHasMetalRevenueFailure } from "./projectMetalRevenueDiagnostics.ts";
import { buildProductionDriverFirstNonZeroMap, firstNonZeroIndex, productionStartIndexCandidate } from "../lib/project/validation/productionStartAlignment.ts";
import { buildOperationsGridModel, type OperationsGridInput } from "../pages/projectOperationsGrid.ts";
import { computeProjectViewMetrics, type MetricValue } from "../lib/projectView/computeProjectPreRevenueView.ts";
import { selectValuationChart } from "../lib/valuation/canonicalValuationTimeline.ts";
import { verifyProjectCalendarAxis } from "../lib/valuation/projectCalendarAxis.ts";
import { getProjectInputs, validateProjectInputs } from "../lib/projectView/projectInputs.ts";
import { getManualMetalPriceStore, saveManualMetalPrice } from "../lib/engine/pricing/manualMetalPriceStore.ts";
import { collectDashboardTasks } from "../lib/engine/pricing/collectDashboardTasks.ts";
import { fetchUniverseSymbols } from "../lib/client/companyUniverse.ts";
import {
  buildSeries,
  buildSeriesData,
  buildRoeSeries,
  buildCurrentRatioSeries,
  buildDebtToEquitySeries,
  buildAdjustedDebtToEquitySeries,
  buildLongTermDebtToNetEarningsSeries,
  buildCashVsNetEarningsSeries,
  buildOperatingProfitVsDepSeries,
  buildOperatingIncomeVsInterestSeries,
  buildNetEarningsPerShareSeries,
  computeNetEarningsSeries,
  buildCapitalExpenditureVsNetEarningsSeries,
  buildBuybacksDividendsSeries,
  buildRevenueGrowthSeries,
  buildFreeCashFlowPerShareSeries,
  getFieldSeries,
} from "../utils/financial";

type ProducerCorePanel = {
  efficiency?: {
    margin_structure?: { operating_margin?: number | null };
    returns?: { roe?: number | null };
    balance_sheet?: { net_debt?: number | null; interest_coverage?: number | null };
  };
};

type RrOverlayPanel = {
  rr_scale_flag?: string | null;
  rr_roce_flag?: string | null;
  rr_fortress_flag?: boolean | null;
  rr_classification?: string | null;
  rr_interest_coverage?: number | null;
  rr_cost_quartile_flags?: { missing_benchmark?: boolean };
  rr_reserve_life_flags?: { missing_reserves?: boolean };
  [key: string]: unknown;
};

function formatPanelValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "—";
}

function sumFiniteSeries(values: Array<number | null> | null | undefined): number | null {
  if (!Array.isArray(values)) return null;
  let sum = 0;
  let hasFinite = false;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      hasFinite = true;
    }
  }
  return hasFinite ? sum : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCompactNumber(value: number, digits = 1): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(digits)}k`;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatMetricValue(value: MetricValue, kind: "money" | "percent" | "multiple" | "multiple_per_year" | "decimal" | "integer", unit?: string): string {
  if (value.value === null) return "n/a";
  if (kind === "percent") return `${(value.value * 100).toFixed(1)}%`;
  if (kind === "multiple") return `${value.value.toFixed(1)}x`;
  if (kind === "multiple_per_year") return `${value.value.toFixed(1)}x/år`;
  if (kind === "integer") return `${Math.round(value.value)}`;
  if (kind === "decimal") return value.value.toFixed(1);
  return `${formatCompactNumber(value.value, 1)}${unit ? ` ${unit}` : ""}`;
}

function formatAuEq10YPerShareValue(value: MetricValue): string {
  if (value.value === null) return "n/a";
  const abs = Math.abs(value.value);
  if (abs > 0 && abs < 0.01) return value.value < 0 ? ">-0.01" : "<0.01";
  return value.value.toFixed(2);
}

function formatIrrMetricValue(value: MetricValue): string {
  if (value.value === null) return "n/a";
  return `${(value.value * 100).toFixed(1)} %`;
}

function formatDebugNumericValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatDebugNumericValue(entry)).join(", ")}]`;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function requireYearsByPeriod(series: unknown): number[] {
  const y = (series as { yearsByPeriod?: unknown } | null | undefined)?.yearsByPeriod;
  if (!Array.isArray(y) || y.length === 0 || !y.every((v: unknown) => Number.isFinite(v))) {
    throw new Error("Corporate modeled requires series.yearsByPeriod (v2 time axis).");
  }
  return y as number[];
}

function yearLabel(yearsByPeriod: number[], t: number): string {
  const y = yearsByPeriod[t];
  return Number.isFinite(y) ? String(y) : "—";
}


function isDebugEnabledInClient(): boolean {
  if (typeof window === "undefined") return false;
  const fromQuery = new URLSearchParams(window.location.search).get("debug") === "1";
  const fromAdminStorage = window.localStorage.getItem("admin.debugParamEnabled") === "1";
  return fromQuery || fromAdminStorage;
}

function isDebugEnabledByQueryParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function withDebugQueryPath(path: string, debugEnabled: boolean): string {
  if (!debugEnabled || typeof window === "undefined") return path;
  const asUrl = new URL(path, window.location.origin);
  asUrl.searchParams.set("debug", "1");
  return `${asUrl.pathname}${asUrl.search}`;
}

function normalizeClientErrorMessage(message: string | null | undefined, fallback: string): string {
  const normalized = (message ?? "").trim();
  if (!normalized) return fallback;
  if (normalized.includes("did not match the expected pattern")) {
    return fallback;
  }
  return normalized;
}

function formatMetricNullReason(value: MetricValue): string {
  return value.value === null ? (value.reason ?? "Missing required input.") : "";
}

function formatDiscountRateTag(rateInput: string): string {
  const ratePct = toInputNumber(rateInput);
  if (typeof ratePct !== "number" || !Number.isFinite(ratePct)) return "";
  return `${Math.round(ratePct)}`;
}

function resolveProjectMetricLabel(metricKey: string, discountRateTag: string): string {
  const npvLabel = `NPV${discountRateTag}`;
  const metricLabels: Record<string, string> = {
    NPV_Target: npvLabel,
    NPV_perShare: `${npvLabel}/aktie`,
    NAV_Target: "NAV",
    NAV_perShare: "NAV/aktie",
    NPV_prodStart: "NPV prod start",
    NPV_prodStart_perShare: "NPV prod start/aktie",
    NAV_prodStart: "NAV prod start",
    NAV_prodStart_perShare: "NAV prod start/aktie",
    CF_LOM_Target: "CF LOM ETLV",
    CF_LOM_Target_perShare: "CF LOM ETLV/aktie",
    DCF_Target: "DCF produktionsstart",
    DCF_perShare: "DCF produktionsstart/aktie",
    DCF_Target_discounted: "DCF produktionsstart nuvärde",
    DCF_Target_discounted_perShare: "DCF produktionsstart nuvärde/aktie",
    EV_over_NPV: "EV/NPV",
    EV_over_NAV: "EV/NAV",
    P_over_NAV: "P/NAV",
    NPV_over_ETLV: "NPV/ETLV",
    DCF_over_ETLV: "DCF/ETLV",
  };
  return metricLabels[metricKey] ?? metricKey;
}

function resolveCorporateMetricLabel(metricKey: string, discountRateTag: string): string {
  const labels: Record<string, string> = {
    NPV_prodStart: "Corporate NPV vid projektstartåret",
    NPV_prodStart_perShare: "Corporate NPV vid projektstartåret/aktie",
    NAV_prodStart: "Corporate NAV vid projektstartåret",
    NAV_prodStart_perShare: "Corporate NAV vid projektstartåret/aktie",
    DCF_Target: "Corporate DCF vid projektstartåret",
    DCF_perShare: "Corporate DCF vid projektstartåret/aktie",
    DCF_Target_discounted: "Corporate DCF vid projektstartåret, nuvärde",
    DCF_Target_discounted_perShare: "Corporate DCF vid projektstartåret, nuvärde/aktie",
  };
  return labels[metricKey] ?? resolveProjectMetricLabel(metricKey, discountRateTag);
}

type ProdStartDebugData = {
  npvToday: number | null;
  npvTodayPerShare: number | null;
  navToday: number | null;
  navTodayPerShare: number | null;
  dcfProdStartDiscounted: number | null;
  dcfProdStartDiscountedPerShare: number | null;
  npvProdStart: number | null;
  npvProdStartPerShare: number | null;
  navProdStart: number | null;
  navProdStartPerShare: number | null;
  dcfProdStart: number | null;
  dcfProdStartPerShare: number | null;
};

type YearlyMetricValue = {
  year: string;
  value: number;
};

function renderProdStartDebugWindow(args: {
  data: ProdStartDebugData;
  targetCurrency: string;
  yearlyValuesByKey?: Partial<Record<"NPV_prodStart" | "NPV_prodStart_perShare" | "NAV_prodStart" | "NAV_prodStart_perShare" | "DCF_Target" | "DCF_perShare", YearlyMetricValue[]>>;
  capexWindows?: Array<{
    milestoneYear: number;
    tp_prev: number;
    tp_k: number;
    windowYears: number[];
    windowCapexUSD: Array<number | null>;
    windowCapexUSD_sum_strict: number | null;
    fx_USD_to_TargetCurrency: number | null;
    windowCapexTarget_sum_strict: number | null;
  }>;
}): ReactNode {
  const {
    data,
    targetCurrency,
    yearlyValuesByKey,
    capexWindows,
  } = args;
  const formatYearlyMoney = (rows: YearlyMetricValue[] | undefined): string | null => {
    if (!rows || rows.length === 0) return null;
    return rows.map((row) => `${row.year}: ${formatMetricValue({ value: row.value, reason: null }, "money", targetCurrency)}`).join(", ");
  };
  const formatMoneyWithYearlyFallback = (value: number | null, rows: YearlyMetricValue[] | undefined): string => {
    if (value !== null) return formatMetricValue({ value, reason: null }, "money", targetCurrency);
    const yearly = formatYearlyMoney(rows);
    return yearly ?? formatMetricValue({ value: null, reason: null }, "money", targetCurrency);
  };
  const deriveYearlyDifference = (left: YearlyMetricValue[] | undefined, right: YearlyMetricValue[] | undefined): YearlyMetricValue[] => {
    if (!left || !right) return [];
    const rightByYear = new Map(right.map((row) => [row.year, row.value]));
    return left
      .filter((row) => rightByYear.has(row.year))
      .map((row) => ({ year: row.year, value: row.value - (rightByYear.get(row.year) as number) }));
  };
  const netCashContributionToday =
    data.navToday !== null && data.npvToday !== null
      ? data.navToday - data.npvToday
      : null;
  const netCashContributionTodayPerShare =
    data.navTodayPerShare !== null && data.npvTodayPerShare !== null
      ? data.navTodayPerShare - data.npvTodayPerShare
      : null;
  const dcfDiscountedMinusNavToday =
    data.dcfProdStartDiscounted !== null && data.navToday !== null
      ? data.dcfProdStartDiscounted - data.navToday
      : null;
  const dcfDiscountedMinusNavTodayIdentity =
    data.dcfProdStartDiscounted !== null && data.npvToday !== null && netCashContributionToday !== null
      ? (data.dcfProdStartDiscounted - data.npvToday) - netCashContributionToday
      : null;

  const netCashContribution =
    data.navProdStart !== null && data.npvProdStart !== null
      ? data.navProdStart - data.npvProdStart
      : null;
  const netCashContributionPerShare =
    data.navProdStartPerShare !== null && data.npvProdStartPerShare !== null
      ? data.navProdStartPerShare - data.npvProdStartPerShare
      : null;
  const impliedInitialCapex =
    data.dcfProdStart !== null && data.npvProdStart !== null
      ? data.dcfProdStart - data.npvProdStart
      : null;
  const impliedInitialCapexPerShare =
    data.dcfProdStartPerShare !== null && data.npvProdStartPerShare !== null
      ? data.dcfProdStartPerShare - data.npvProdStartPerShare
      : null;
  const dcfMinusNav =
    data.dcfProdStart !== null && data.navProdStart !== null
      ? data.dcfProdStart - data.navProdStart
      : null;
  const dcfMinusNavIdentity =
    impliedInitialCapex !== null && netCashContribution !== null
      ? impliedInitialCapex - netCashContribution
      : null;

  const yearlyImpliedInitialCapex = deriveYearlyDifference(yearlyValuesByKey?.DCF_Target, yearlyValuesByKey?.NPV_prodStart);
  const yearlyNetCashContribution = deriveYearlyDifference(yearlyValuesByKey?.NAV_prodStart, yearlyValuesByKey?.NPV_prodStart);
  const yearlyDcfMinusNav = deriveYearlyDifference(yearlyValuesByKey?.DCF_Target, yearlyValuesByKey?.NAV_prodStart);
  const yearlyDcfMinusNavIdentity = deriveYearlyDifference(yearlyImpliedInitialCapex, yearlyNetCashContribution);

  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>Debug: NPV/NAV/DCF vid produktionsstart</summary>
      <div style={{ marginTop: 8, fontSize: 12, color: "#1f2937", display: "grid", gap: 6 }}>
        <div>
          <strong>NPV/NAV (idag, totaler):</strong>
          <br />
          NPV = diskonterad FCFF till idag
          <br />
          NAV = NPV + (kassa₀ − skuld₀)
        </div>
        <div>
          <strong>Insatta värden för NPV/NAV idag ({targetCurrency}):</strong>
          <br />
          NPV = {formatMetricValue({ value: data.npvToday, reason: null }, "money", targetCurrency)}
          <br />
          NAV = {formatMetricValue({ value: data.navToday, reason: null }, "money", targetCurrency)}
          <br />
          DCF produktionsstart nuvärde = {formatMetricValue({ value: data.dcfProdStartDiscounted, reason: null }, "money", targetCurrency)}
          <br />
          Net cash-bidrag (kassa₀ − skuld₀) = NAV − NPV = {formatMetricValue({ value: netCashContributionToday, reason: null }, "money", targetCurrency)}
        </div>
        <div>
          <strong>Likhetskontroll (DCF nuvärde vs NAV idag):</strong>
          <br />
          DCF nuvärde − NAV = {formatMetricValue({ value: dcfDiscountedMinusNavToday, reason: null }, "money", targetCurrency)}
          <br />
          Samma differens via beståndsdelar = (DCF nuvärde − NPV) − (NAV − NPV) = {formatMetricValue({ value: dcfDiscountedMinusNavTodayIdentity, reason: null }, "money", targetCurrency)}
        </div>
        <div>
          <strong>Per aktie (idag, {targetCurrency}/aktie):</strong>
          <br />
          NPV/aktie = {formatMetricValue({ value: data.npvTodayPerShare, reason: null }, "money", targetCurrency)}
          <br />
          NAV/aktie = {formatMetricValue({ value: data.navTodayPerShare, reason: null }, "money", targetCurrency)}
          <br />
          DCF produktionsstart nuvärde/aktie = {formatMetricValue({ value: data.dcfProdStartDiscountedPerShare, reason: null }, "money", targetCurrency)}
          <br />
          Net cash-bidrag/aktie (implied) = {formatMetricValue({ value: netCashContributionTodayPerShare, reason: null }, "money", targetCurrency)}
        </div>
        <div>
          <strong>Definitioner (totaler):</strong>
          <br />
          NPV prod start = DCF produktionsstart − Initial CAPEX
          <br />
          NAV prod start = NPV prod start + (kassa₀ − skuld₀)
        </div>
        <div>
          <strong>Insatta värden ({targetCurrency}):</strong>
          <br />
          DCF produktionsstart = {formatMoneyWithYearlyFallback(data.dcfProdStart, yearlyValuesByKey?.DCF_Target)}
          <br />
          NPV prod start = {formatMoneyWithYearlyFallback(data.npvProdStart, yearlyValuesByKey?.NPV_prodStart)}
          <br />
          NAV prod start = {formatMoneyWithYearlyFallback(data.navProdStart, yearlyValuesByKey?.NAV_prodStart)}
          <br />
          Implied Initial CAPEX = DCF − NPV = {formatMoneyWithYearlyFallback(impliedInitialCapex, yearlyImpliedInitialCapex)}
          <br />
          Net cash-bidrag (kassa₀ − skuld₀) = NAV − NPV = {formatMoneyWithYearlyFallback(netCashContribution, yearlyNetCashContribution)}
        </div>
        <div>
          <strong>Likhetskontroll (DCF vs NAV):</strong>
          <br />
          DCF − NAV = {formatMoneyWithYearlyFallback(dcfMinusNav, yearlyDcfMinusNav)}
          <br />
          Samma differens via beståndsdelar = Initial CAPEX − net cash-bidrag = {formatMoneyWithYearlyFallback(dcfMinusNavIdentity, yearlyDcfMinusNavIdentity)}
          <br />
          {dcfMinusNav !== null && Math.abs(dcfMinusNav) < 1e-6
            ? "Slutsats: DCF och NAV är numeriskt lika i denna snapshot."
            : "Slutsats: DCF och NAV skiljer sig med differensen ovan; fönstret visar exakt vilka komponenter som driver skillnaden."}
        </div>
        <div>
          <strong>Per aktie ({targetCurrency}/aktie):</strong>
          <br />
          DCF/aktie = {formatMetricValue({ value: data.dcfProdStartPerShare, reason: null }, "money", targetCurrency)}
          <br />
          NPV prod start/aktie = {formatMetricValue({ value: data.npvProdStartPerShare, reason: null }, "money", targetCurrency)}
          <br />
          NAV prod start/aktie = {formatMetricValue({ value: data.navProdStartPerShare, reason: null }, "money", targetCurrency)}
          <br />
          Initial CAPEX/aktie (implied) = {formatMetricValue({ value: impliedInitialCapexPerShare, reason: null }, "money", targetCurrency)}
          <br />
          Net cash-bidrag/aktie (implied) = {formatMetricValue({ value: netCashContributionPerShare, reason: null }, "money", targetCurrency)}
        </div>
        {Array.isArray(capexWindows) && capexWindows.length > 0 && (
          <div>
            <strong>CAPEX window debug:</strong>
            {capexWindows.map((entry) => (
              <div key={`capex-window-${entry.milestoneYear}-${entry.tp_k}`} style={{ marginTop: 6 }}>
                <div>Milestone {entry.milestoneYear}</div>
                <div>tp_prev = {entry.tp_prev}, tp_k = {entry.tp_k}</div>
                <div>years: {entry.windowYears.join(", ")}</div>
                <div>capexUSD: {entry.windowCapexUSD.map((value) => (value === null ? "null" : String(value))).join(", ")}</div>
                <div>sumUSD: {entry.windowCapexUSD_sum_strict === null ? "n/a" : String(entry.windowCapexUSD_sum_strict)}</div>
                <div>FX: {entry.fx_USD_to_TargetCurrency === null ? "n/a" : String(entry.fx_USD_to_TargetCurrency)}</div>
                <div>sumTarget: {entry.windowCapexTarget_sum_strict === null ? "n/a" : String(entry.windowCapexTarget_sum_strict)}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ color: "#6b7280" }}>
          Källa: list2-metriker i denna vy. Identity check används för transparens: DCF − NAV ska matcha (DCF − NPV) − (NAV − NPV).
        </div>
      </div>
    </details>
  );
}



const projectMetricUnitMeta: Record<string, { unitType: "percent" | "multiple" | "multiple_per_year" | "currency" | "decimal" | "integer"; renderSuffix: string }> = {
  ROI_10Y: { unitType: "multiple", renderSuffix: "x" },
  LOM_avg_EBIT_ROCE: { unitType: "percent", renderSuffix: "%" },
  LOM_discounted_EBIT_ROCE: { unitType: "percent", renderSuffix: "%" },
  LOM_avg_NOPAT_ROIC: { unitType: "percent", renderSuffix: "%" },
  Kapitalavkastning_LOM: { unitType: "multiple", renderSuffix: "x" },
  Kapitalavkastning_per_Year: { unitType: "multiple_per_year", renderSuffix: "x/år" },
};

const projectSectionMetricOrder: Record<"list2", string[]> = {
  list2: [
    "NPV_Target",
    "NPV_perShare",
    "NAV_Target",
    "NAV_perShare",
    "NPV_prodStart",
    "NPV_prodStart_perShare",
    "NAV_prodStart",
    "NAV_prodStart_perShare",
    "CF_LOM_Target",
    "CF_LOM_Target_perShare",
    "DCF_Target",
    "DCF_perShare",
    "DCF_Target_discounted",
    "DCF_Target_discounted_perShare",
    "EV_over_NPV",
    "EV_over_NAV",
    "P_over_NAV",
    "NPV_over_ETLV",
    "DCF_over_ETLV",
  ],
};

const PROJECT_SECTION_DEFAULT_OPEN: Record<string, boolean> = {
  list2: true,
  list2Interval: true,
  list3: false,
  list4: false,
  list6: false,
  list5: true,
};



type CompactMetric = { label: string; value: unknown; infoKey?: string };

function renderCompactMetrics(
  sectionKey: string,
  metrics: CompactMetric[],
  openInfoId: string | null,
  setOpenInfoId: (next: string | null | ((prev: string | null) => string | null)) => void,
) {
  return metrics.map((metric) => {
    const metricId = `${sectionKey}-${metric.label}`;
    const info = metricInfoMap[metric.infoKey ?? metric.label] ?? defaultMetricInfo(metric.label);
    return (
      <div key={metricId} className="compact-metric-row">
        <span className="compact-metric-label-wrap">
          <span className="compact-metric-label">{metric.label}</span>
          <InfoPopover
            id={metricId}
            openId={openInfoId}
            onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
            onClose={() => setOpenInfoId(null)}
            title={info.title}
            sections={info.sections}
          />
        </span>
        <span className="compact-metric-dots" />
        <span className="compact-metric-value">{formatPanelValue(metric.value)}</span>
      </div>
    );
  });
}



function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolveProfileTargetCurrency(profile: Record<string, unknown> | null): string {
  const profileCurrency = typeof profile?.currency === "string" ? profile.currency.trim().toUpperCase() : "";
  return profileCurrency || "USD";
}

function buildProjectsSnapshotRequest(args: {
  projects: Array<{ projectId: string; rawJson: Record<string, unknown> }>;
  profile: Record<string, unknown> | null;
  discountRate: number;
  scenario: SnapshotRequest["scenario"];
  fx: SnapshotRequest["fx"];
  market?: {
    shares_current: number;
    price_current_TargetCurrency: number;
  };
  balanceSheet?: SnapshotRequest["balanceSheet"];
  financingPlan?: SnapshotRequest["financingPlan"];
  manualMetalPrices?: SnapshotRequest["manualMetalPrices"];
  stressOptions?: SnapshotRequest["stressOptions"];
}): SnapshotRequest {
  const lockedTargetCurrency = resolveProfileTargetCurrency(args.profile);
  return {
    targetCurrency: lockedTargetCurrency,
    valuationYear: new Date().getUTCFullYear(),
    discountRate: args.discountRate,
    scenario: args.scenario,
    fx: args.fx,
    market: args.market,
    balanceSheet: args.balanceSheet,
    financingPlan: args.financingPlan,
    projects: args.projects,
    manualMetalPrices: args.manualMetalPrices,
    stressOptions: args.stressOptions,
  };
}

function toInputNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizedFinancingFractions(equityPctInput: string, debtPctInput: string): { equity: number; debt: number } {
  const equity = Math.max(0, Math.min(100, toInputNumber(equityPctInput) ?? 100));
  const debt = Math.max(0, Math.min(100, toInputNumber(debtPctInput) ?? 0));
  const total = equity + debt;
  return total > 0 ? { equity: equity / total, debt: debt / total } : { equity: 1, debt: 0 };
}

type AnalysisMode = "revenue" | "prerevenue";
type PrimaryView = "reported" | "modeled" | "projects";

function readModeFromUrl(): AnalysisMode {
  if (typeof window === "undefined") return "revenue";
  const params = new URLSearchParams(window.location.search);
  const mode = (params.get("mode") ?? "").toLowerCase();
  return mode === "prerevenue" ? "prerevenue" : "revenue";
}


function readPrimaryViewFromUrl(): PrimaryView {
  if (typeof window === "undefined") return "reported";
  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") ?? "").toLowerCase();
  if (view === "modeled") return "modeled";
  if (view === "projects") return "projects";
  return "reported";
}
const INFO_SECTION_HEADINGS = {
  measure: "Vad det mäter",
  formula: "Hur det beräknas",
  interpretation: "Hur man tolkar värdet",
  pitfalls: "Vanliga fallgropar",
  framework: "Ramverk",
} as const;

type MetricInfoSection = { heading: string; lines: string[] };
type MetricInfo = { title: string; sections: MetricInfoSection[] };



type CurrencySource = "statements" | "market" | "unknown";

type ChartUnitMeta = {
  unitLabel: string;
  unitKind: "money" | "percent" | "months" | "ratio" | "shares" | "index" | "unknown";
  yAxisTitle?: string;
  y2AxisTitle?: string;
};
function buildMetricInfo(
  title: string,
  measure: string[],
  formula: string[],
  interpretation: string[],
  pitfalls: string[],
  framework: string[],
): MetricInfo {
  return {
    title,
    sections: [
      { heading: INFO_SECTION_HEADINGS.measure, lines: measure },
      { heading: INFO_SECTION_HEADINGS.formula, lines: formula },
      { heading: INFO_SECTION_HEADINGS.interpretation, lines: interpretation },
      { heading: INFO_SECTION_HEADINGS.pitfalls, lines: pitfalls },
      { heading: INFO_SECTION_HEADINGS.framework, lines: framework },
    ],
  };
}

const metricInfoMap: Record<string, MetricInfo> = {
  Efficiency: buildMetricInfo(
    "Efficiency",
    ["Sektionen sammanfattar marginaler, kassakonvertering, kapitalintensitet och avkastning."],
    ["Bygger på rapporterad data från resultaträkning, kassaflöde och balansräkning i Producer Core."],
    ["Starkt utfall kräver både god nivå och stabilitet över flera år.", "Jämför med historik och relevanta peers för att skilja cyklisk medvind från strukturell kvalitet."],
    ["Enstaka toppår kan ge falsk trygghet.", "Isolerade nyckeltal utan korscheck mot skuld och kassaflöde ökar feltolkning."],
    ["Buffetology + Syding."]
  ),
  Resilience: buildMetricInfo(
    "Resilience",
    ["Sektionen mäter finansiell motståndskraft via skuldsättning, likviditet och stabilitet i kassaflöde."],
    ["Kombinerar nettoskuld, räntetäckning, current ratio och volatilitet i fritt kassaflöde."],
    ["Lägre belåning och högre täckningsgrader är positivt, särskilt om de håller över en hel konjunkturcykel."],
    ["Likviditet kan tillfälligt se stark ut efter kapitalanskaffning.", "Bedöm alltid tillsammans med skuldtrend och kassaflödeskvalitet."],
    ["RR + Buffetology."]
  ),
  Value: buildMetricInfo(
    "Value",
    ["Sektionen visar multiplar, kassaflödesavkastning och förenklade värderingssignaler."],
    ["Bygger på marknadsvärde/enterprise value i relation till resultat- och kassaflödesmått, plus 5-årsmedianer."],
    ["Billig multipel är mest användbar när kvalitet och balansräkning också är stabil.", "Jämför med bolagets egen historik, peers och ränteläge."],
    ["Låga multiplar kan spegla verklig risk i stället för felprissättning.", "Undvik att läsa implied return utan att kontrollera antaganden bakom vinst/FCF."],
    ["Syding + Buffetology."]
  ),
  "RR Snapshot": buildMetricInfo(
    "RR Snapshot",
    ["Sektionen sammanfattar RR-overlay med skala, kapitalavkastning, balansrisk och enkel fair value-signal."],
    ["Bygger på rr_overlay-output samt FV2-beräkning i UI för revenue mode."],
    ["Hög klassning kräver balans mellan skala, avkastning och robust balansräkning.", "Använd utfallet som triagering före djupare analys."],
    ["Null/false i flaggor kan bero på datagap snarare än låg kvalitet.", "Övertolka inte enstaka RR-mått utan stöd av Producer Core."],
    ["RR-framework."]
  ),
  gross_margin: buildMetricInfo("Gross margin", ["Bruttomarginal visar hur stor andel av intäkterna som återstår efter direkta kostnader."], ["Gross margin = Gross profit delat med Revenue."], ["Stigande och stabil nivå över tid signalerar prissättningskraft eller kostnadsfördel.", "Jämför med egen historik och peers i samma delbransch."], ["Råvarupris eller mixskifte kan driva tillfälliga hopp.", "Hög nivå ett enskilt år är svag evidens utan flerårs-stabilitet."], ["Buffetology."]),
  operating_margin: buildMetricInfo("Operating margin", ["Rörelsemarginal mäter kärnverksamhetens lönsamhet före finansiering och skatt."], ["Operating margin = Operating income delat med Revenue."], ["Förbättring över flera år tyder på effektivisering eller starkare konkurrensposition.", "Jämför mot peers eftersom normalnivå varierar kraftigt mellan branscher."], ["Engångsposter kan tillfälligt lyfta marginalen.", "Kostnadskutt kan ge kortsiktig förbättring som inte är hållbar."], ["Syding + Buffetology."]),
  net_margin: buildMetricInfo("Net margin", ["Nettomarginal visar slutlig lönsamhet efter alla kostnader inklusive räntor och skatt."], ["Net margin = Net income delat med Revenue."], ["Stabil nettomarginal över tid visar motståndskraft genom cykler.", "Använd tillsammans med operating margin för att skilja operativ effekt från finansiering/skatt."], ["Skatte- och finansieringseffekter kan ge stora svängningar.", "En hög nettomarginal utan starkt kassaflöde kan vara lågkvalitativ."], ["Syding."]),
  margin_trend_label: buildMetricInfo("Margin trend", ["Visar riktning på marginalutvecklingen de senaste fem åren."], ["Bygger på trendklassning av historiska marginalserier i Producer Core."], ["Positiv trend stärker tesen om förbättrad affärskvalitet.", "Flat eller negativ trend bör vägas mot värdering och skuldrisk."], ["Trend kan påverkas av låg bas efter svagt år.", "Trendetikett ersätter inte faktisk nivåanalys."], ["Syding."]),
  ocf_to_ni: buildMetricInfo("OCF / NI", ["Mäter hur väl redovisad vinst blir operativt kassaflöde."], ["OCF / NI = Operating cash flow delat med Net income."], ["Över cirka 1.0 över flera år är normalt ett kvalitetsbevis.", "Under 1.0 under längre perioder kräver förklaring och peer-jämförelse."], ["Working capital-svängningar kan ge tillfälliga avvikelser.", "Ett starkt år räcker inte; bedöm minst 3–5 år."], ["Buffetology."]),
  fcf_to_ni: buildMetricInfo("FCF / NI", ["Visar hur stor del av vinsten som blir fritt kassaflöde efter investeringar."], ["FCF / NI = Free cash flow delat med Net income."], ["Hög och stabil kvot indikerar god kassakvalitet och finansieringsflexibilitet.", "Låg kvot kräver kontroll av capexbehov och arbetskapital."], ["Tillväxtfaser kan pressa kvoten trots stark affär.", "Negativ FCF i enstaka år är inte alltid varningssignal utan kontext."], ["Buffetology."]),
  accrual_flag: buildMetricInfo("Accrual", ["Flaggar risk för svag kassakonvertering relativt redovisad vinst."], ["Sätts när OCF återkommande understiger NI enligt Producer Core-regeln."], ["True är en varningssignal som bör korscheckas mot kundfordringar, lager och capex.", "False minskar risken men eliminerar den inte."], ["Redovisningsförändringar kan ge brus i flaggan.", "Läs tillsammans med OCF/NI och FCF/NI, inte isolerat."], ["Buffetology."]),
  capex_to_revenue: buildMetricInfo("Capex / Revenue", ["Mäter kapitalintensitet i förhållande till omsättning."], ["Capex / Revenue = Absolutvärde av Capex delat med Revenue."], ["Hög kvot kräver att avkastningen på investerat kapital också är hög.", "Jämför med historik och peers för att avgöra om nivån är strukturell."], ["Engångsinvesteringar kan ge tillfälliga toppar.", "Låg kvot kan betyda underinvestering snarare än styrka."], ["Buffetology."]),
  capex_to_ocf: buildMetricInfo("Capex / OCF", ["Visar hur stor del av operativt kassaflöde som binds i investeringar."], ["Capex / OCF = Absolutvärde av Capex delat med Operating cash flow."], ["Lägre kvot ger mer utrymme för skuldneddragning, utdelning och återköp.", "Hög kvot kan vara sund i expansionsfas om avkastningen följer med."], ["Negativt eller mycket lågt OCF gör kvoten instabil.", "Bedöm minst en hel cykel för att undvika fel slutsatser."], ["Buffetology."]),
  ppe_vs_revenue_signal: buildMetricInfo("PPE vs Revenue", ["Signal om investeringstakt i anläggningstillgångar matchar intäktstillväxt."], ["Jämför trend i PPE mot trend i Revenue över flerårsperiod."], ["PPE som växer snabbare än revenue länge kan indikera pressad kapitalproduktivitet.", "Liknande tillväxttakt stödjer effektiv kapitalallokering."], ["Stora projekt har naturlig ledtid innan intäkter syns.", "Engångsavyttringar kan tillfälligt förvränga signalen."], ["Syding."]),
  net_debt: buildMetricInfo("Net debt", ["Nettoskuld visar räntebärande skuld efter avdrag för kassa."], ["Net debt = Total debt minus Cash och cash equivalents."], ["Lägre eller fallande nettoskuld förbättrar motståndskraft och valfrihet.", "Negativ nettoskuld innebär nettokassa och ofta lägre finansieringsrisk."], ["Tillfällig kassa från emission eller tillgångsförsäljning kan överskatta styrkan.", "Jämför alltid mot kassaflöde (exempelvis Net debt/FCF)."], ["RR + Buffetology."]),
  net_debt_to_ebitda: buildMetricInfo("Net debt / EBITDA", ["Mäter skuldbörda relativt löpande intjäningskapacitet före avskrivningar."], ["Net debt / EBITDA = Net debt delat med EBITDA."], ["<1.5x är ofta konservativt, 1.5–3x medelnivå, >3x förhöjd risk i cykliska bolag.", "Tolka alltid nivå med hänsyn till stabilitet i EBITDA och ränteläge."], ["EBITDA kan överdriva betalningsförmåga i kapitalintensiva bolag.", "Engångsvinster i EBITDA kan tillfälligt förbättra kvoten."], ["RR."]),
  interest_coverage: buildMetricInfo("Interest coverage", ["Mäter Producer Core-bolagets förmåga att täcka räntekostnader med rörelseresultat."], ["Interest coverage = EBIT delat med Interest expense."], ["<1.5x är stressat, 1.5–3x skört, 3–8x okej och >8x starkt.", "Extremt höga nivåer kan bero på tillfälligt låga räntor; korschecka mot nettoskuld och FCF."], ["Negativ EBIT gör kvoten svårtolkad och kräver djupare analys.", "Jämför över flera år och mot peers, inte bara senaste året."], ["Producer Core (RR-inspirerad balansanalys)."]),
  debt_trend_label: buildMetricInfo("Debt trend", ["Visar riktning på bolagets nettoskuld över tid."], ["Trendklassning baserad på flerårsserie för nettoskuld."], ["Nedåtgående trend är positiv om den inte drivs av kortsiktiga engångseffekter.", "Uppåtgående trend kräver att avkastning och kassaflöde förbättras samtidigt."], ["Förvärv kan öka skuld kortsiktigt men vara värdeskapande.", "Trendetikett utan nivå- och kassaflödesanalys kan bli missvisande."], ["Syding."]),
  roe: buildMetricInfo("ROE", ["Mäter avkastning på aktieägarnas bokförda kapital."], ["ROE = Net income delat med Average equity."], ["Stabilt hög ROE över flera år kan indikera konkurrensfördel.", "Jämför med peers och kontrollera att skuldsättning inte ensamt driver nivån."], ["Återköp kan lyfta ROE genom lägre eget kapitalbas.", "Engångsvinster kan ge falskt hög ROE."], ["Buffetology."]),
  roic_pre_tax: buildMetricInfo("ROIC pre-tax", ["Mäter operativ avkastning före skatt på investerat kapital."], ["ROIC pre-tax = EBIT delat med investerat kapital (proxy i Producer Core)."], ["Hög och stabil ROIC över kapitalkostnad tyder på värdeskapande.", "Jämför med historik och peers för att verifiera hållbar nivå."], ["Definitionen av investerat kapital varierar mellan datakällor.", "Engångsposter i EBIT kan tillfälligt förvränga kvoten."], ["Buffetology + RR."]),
  roe_trend_5Y: buildMetricInfo("ROE trend 5Y", ["Visar om avkastning på eget kapital förbättras eller försämras över fem år."], ["Trendklassning av historiska ROE-observationer under 5 år."], ["Positiv trend stärker tesen om bättre kapitalallokering.", "Negativ trend kan vara varning även om nuvarande ROE ser hög ut."], ["Trend från mycket låg bas kan överskatta förbättring.", "Utvärdera tillsammans med skuldnivå och marginaltrend."], ["Syding."]),
  shares_trend_5Y: buildMetricInfo("Shares trend 5Y", ["Visar förändringstakt i antal utestående aktier."], ["Beräknas som CAGR för shares outstanding över 5 år."], ["Negativ/flat trend är ofta aktieägarvänlig, positiv trend signalerar utspädning.", "Jämför med kassaflöde och avkastning för att bedöma kvaliteten i kapitalallokeringen."], ["Aktiebaserad ersättning kan skapa gradvis utspädning.", "M&A-finansiering med aktier kan vara rationell trots stigande aktieantal."], ["Buffetology."]),
  retained_vs_ni_signal: buildMetricInfo("Retained vs NI", ["Jämför återhållen vinst med redovisad nettoinkomst över tid."], ["Signal bygger på relation mellan kumulativ retained earnings och kumulativ net income."], ["Stödjande signal tyder på att vinster i större grad stannar i bolaget och kan återinvesteras.", "Avvikelse kräver kontroll av utdelning, återköp och engångsposter."], ["Kapitaltransaktioner kan påverka retained earnings utan att spegla underliggande kvalitet.", "Signalen ersätter inte analys av faktisk avkastning på återinvesterat kapital."], ["Buffetology."]),
  quality_flags: buildMetricInfo("Quality flags", ["Samlar positiva signaler kring kassakonvertering, marginaler och kapitaldisciplin."], ["Antal/utfall härleds från Producer Core-regler över flera nyckeltal."], ["Fler positiva flaggor stärker kvalitetscaset när de är konsekventa över tid.", "Bekräfta med historik, peers och värdering innan slutsats."], ["Flaggor är förenklingar och fångar inte alla nyanser.", "Hög score utan rimlig värdering kan fortfarande ge svag risk/reward."], ["Producer Core."]),
  risk_flags: buildMetricInfo("Risk flags", ["Samlar varningssignaler som svag FCF, marginalpress och möjlig utspädning."], ["Flaggor sätts av Producer Core-regler när riskmönster upptäcks i tidsserier."], ["Flera samtidiga riskflaggor talar för högre säkerhetsmarginal i värderingen.", "Kontrollera om signalerna är tillfälliga eller återkommande i flerårsdata."], ["Enskilda flaggor kan vara cykliska och reversera snabbt.", "Att ignorera flaggor i högt belånade bolag ökar nedsidesrisk."], ["Producer Core."]),
  invalid_capital_employed: buildMetricInfo("Invalid capital employed", ["Diagnostikflagga för bristfällig eller orimlig kapitalbas i avkastningsmått."], ["Sätts när kapital employed inte kan beräknas robust från tillgängliga datapunkter."], ["True innebär att ROCE/ROIC-relaterade slutsatser ska viktas ned tills data är verifierad."], ["Att behandla flaggan som neutral kan ge felklassning av kapitalavkastning."], ["Datakvalitetskontroll."]),
  ev_formula_check: buildMetricInfo("EV formula check", ["Kontrollerar att enterprise value-komponenter hänger ihop enligt intern formel."], ["Jämför EV-komponenter mot formelutfall i Producer Core-diagnostik."], ["Avvikelse indikerar att värderingsmultiplar kan vara opålitliga tills felkälla är löst."], ["Små avrundningsskillnader är normalt, stora differenser är varningssignal."], ["Datakvalitetskontroll."]),
  accounting_anomaly: buildMetricInfo("Accounting anomaly", ["Flagga för ovanliga redovisningsmönster som kan försvåra jämförelser."], ["Sätts när interna regler hittar avvikande relationer i rapporterad data."], ["True kräver extra konservatism och manuell kontroll av noter/engångsposter."], ["Anomalier behöver inte betyda manipulation men ökar osäkerheten i modellutfall."], ["Datakvalitetskontroll."]),
  current_ratio: buildMetricInfo("Current ratio", ["Likviditetsmått för kortsiktig betalningsförmåga."], ["Current ratio = Omsättningstillgångar delat med kortfristiga skulder."], ["Runt 1.2–2.0 är ofta balanserat; under 1.0 kan signalera pressad likviditet.", "För höga nivåer kan betyda ineffektivt bundet kapital."], ["Säsongsvariationer kan ge missvisande kvartalsnivåer.", "Måttet fångar inte kvaliteten i tillgångarna."], ["Resilience-analys."]),
  cash_vs_short_term_debt: buildMetricInfo("Cash vs short debt", ["Jämför kassaposition mot skulder som förfaller inom kort tid."], ["Cash vs short debt = Cash och likvida medel dividerat med short-term debt."], ["Över 1.0 innebär i regel bättre refinansieringsmarginal på kort sikt.", "Under 1.0 kräver kontroll av kreditlinor och operativt kassaflöde."], ["Tillfällig kassa runt bokslutsdatum kan ge för optimistisk bild.", "Måttet bör kombineras med räntetäckning och skuldprofil."], ["Resilience-analys."]),
  fcf_volatility_5Y: buildMetricInfo("FCF volatility 5Y", ["Visar hur stabilt fritt kassaflöde varit över fem år."], ["Volatilitet beräknas på 5-årsserie för fritt kassaflöde."], ["Lägre volatilitet ökar förutsägbarhet i skuldservice och värdering.", "Hög volatilitet kräver större säkerhetsmarginal och stresstest."], ["Cykelbolag kan naturligt ha hög volatilitet.", "Kort historik kan ge instabil uppskattning."], ["Resilience-analys."]),
  pe: buildMetricInfo("P/E", ["Värderingsmultipel mellan aktiekurs och vinst per aktie."], ["P/E = Price per share delat med Earnings per share."], ["Lågt P/E kan vara attraktivt om vinsten är hållbar.", "Högt P/E kan vara rimligt vid hög kvalitet och tillväxt med låg balansrisk."], ["Negativ eller tillfälligt uppblåst vinst gör multipeln svårtolkad.", "Jämför alltid mot historik, peers och räntemiljö."], ["Syding."]),
  earnings_yield: buildMetricInfo("Earnings yield", ["Inverterat P/E som visar vinstavkastning på priset."], ["Earnings yield = EPS delat med Price (eller 1 / P/E)."], ["Högre yield kan indikera lägre värdering relativt vinstnivå.", "Jämför mot obligationsräntor, historik och vinststabilitet."], ["Engångsvinster kan ge artificiellt hög yield.", "Låg kvalitet i vinsten minskar informationsvärdet."], ["Syding."]),
  p_fcf: buildMetricInfo("P/FCF", ["Värderingsmultipel mellan marknadsvärde och fritt kassaflöde."], ["P/FCF = Price per share delat med Free cash flow per share."], ["Lägre multipel är positiv om FCF är uthålligt och inte toppcykliskt.", "Använd flerårsmedian för att dämpa cykelbrus."], ["Negativt eller extremt svängigt FCF gör måttet instabilt.", "Tillfälligt låg capex kan överdriva styrkan."], ["Syding + Buffetology."]),
  fcf_yield: buildMetricInfo("FCF yield", ["Visar fritt kassaflöde relativt marknadsvärde."], ["FCF yield = Free cash flow delat med Market cap."], ["Högre yield är positivt när kassaflödet är stabilt och skuldnivån rimlig.", "Korschecka mot Net debt/FCF och capexbehov."], ["Cyklisk topp i FCF kan ge falskt hög yield.", "Jämför med peers för att skilja strukturell kvalitet från kortsiktig effekt."], ["Syding."]),
  ev_ebitda: buildMetricInfo("EV/EBITDA", ["Enterprise-multipel som värderar hela verksamheten mot EBITDA."], ["EV/EBITDA = Enterprise value delat med EBITDA."], ["Lägre multipel kan indikera billigare totalvärdering.", "Tolka i relation till tillväxt, marginalstabilitet och capexintensitet."], ["EBITDA bortser från investeringar och kan överskatta kassagenerering.", "Olika leasing/redovisning kan påverka jämförbarhet."], ["Syding."]),
  ev_ebit: buildMetricInfo("EV/EBIT", ["Enterprise-multipel mot rörelseresultat efter avskrivningar."], ["EV/EBIT = Enterprise value delat med EBIT."], ["Mer konservativ än EV/EBITDA i kapitalintensiva bolag.", "Lägre nivå är generellt bättre givet liknande kvalitet och risk."], ["Tillfälligt högt/lågt EBIT kan förvränga signalen.", "Redovisningsskillnader i avskrivningar påverkar jämförelse."], ["Syding."]),
  ev_fcf: buildMetricInfo("EV/FCF", ["Enterprise-multipel mot fritt kassaflöde."], ["EV/FCF = Enterprise value delat med Free cash flow."], ["Låg multipel kombinerad med stabil FCF kan ge attraktiv risk/reward.", "Jämför med historik för att undvika köp i tillfällig topp-FCF."], ["Negativt FCF gör måttet svåranvänt.", "FCF-definition (maintenance vs growth capex) måste vara konsekvent."], ["Syding + RR."]),
  net_debt_over_ev: buildMetricInfo("Net debt / EV", ["Visar hur stor del av enterprise value som utgörs av nettoskuld."], ["Net debt / EV = Net debt delat med Enterprise value."], ["Lägre kvot innebär att equity står för större del av värdet och ger mer finansiell flexibilitet.", "Hög kvot kräver starkare kassaflöde och räntetäckning."], ["Fallande EV kan höja kvoten snabbt utan att skulden ändras.", "Jämför med Net debt/FCF och maturitetsprofil."], ["Value + Resilience."]),
  median_ni_5y: buildMetricInfo("Median NI (5Y)", ["Femårsmedian av nettoresultat för att dämpa engångsvariationer."], ["Tar medianen av årliga net income-värden under de senaste fem åren."], ["Högre och stabil median stödjer robust intjäningskapacitet.", "Jämför median mot senaste år för att se om bolaget är över eller under normalnivå."], ["Kort historik eller stora strukturella skiften minskar jämförbarheten.", "Median fångar inte trendriktning på egen hand."], ["Syding."]),
  median_ebit_margin_5y: buildMetricInfo("Median EBIT margin (5Y)", ["Normaliserad rörelsemarginal baserad på femårsmedian."], ["Median EBIT margin = median av EBIT/Revenue över 5 år."], ["Ger bättre basnivå än ett enskilt år i cykliska bolag.", "Använd som ankare när du tolkar EV/EBIT och implied return."], ["Om affärsmodellen ändrats nyligen kan historisk median vara inaktuell.", "Måttet måste jämföras med peers för rätt kontext."], ["Syding."]),
  median_fcf_5y: buildMetricInfo("Median FCF (5Y)", ["Normaliserat fritt kassaflöde över fem år."], ["Median FCF (5Y) = median av årligt fritt kassaflöde under 5 år."], ["Minskar risken att värdera bolaget på topp- eller bottenår.", "Jämför mot capexbehov och skuld för att bedöma hållbarhet."], ["Snabba strukturella förändringar kan göra historisk median mindre relevant.", "Valutaeffekter och engångsposter bör justeras i djupare analys."], ["Syding + RR."]),
  implied_return: buildMetricInfo("Implied return", ["Snabbheuristik för förväntad avkastning givet nuvarande värdering och normaliserad intjäning."], ["Bygger på relationen mellan normaliserad earning power/FCF och aktuellt pris eller EV."], ["Högre implied return är positivt om antagandena om hållbar vinst och risk är rimliga.", "Jämför mot avkastningskrav och alternativa investeringar."], ["Överkänslig för antaganden om normaliserad vinst och diskonteringskrav.", "Använd inte isolerat utan stöd av kvalitets- och balansmått."], ["Syding."]),
  value_band: buildMetricInfo("Value band", ["Klassificerar värdering i zoner utifrån samlad signal från multiplar och avkastningsmått."], ["Regelbaserad klassning från Producer Core value-modul."], ["Band i attraktiv zon är mest användbart när kvalitet och balansrisk samtidigt är god.", "Gränsfall bör valideras med scenarioanalys och peer-jämförelse."], ["Band är en förenkling och kan dölja viktiga nyanser.", "Snabba marknadsrörelser kan flytta klassning utan att fundamenta ändras."], ["Value framework."]),
  rr_scale_10y_recoverable_value_usd: buildMetricInfo("10Y recoverable value", ["Proxy för återvinningsbart värde över 10 år i RR-skala."], ["Bygger på RR-overlay-data för långsiktig återvinningsbar värdebas i USD."], ["Högre nivå kan stödja institutionsskala om data är komplett.", "Jämför med marknadsvärde och reserver för rimlighetskontroll."], ["Måttet är känsligt för antaganden om reserver och långsiktiga priser.", "Datagap kan ge null utan att affären är svag."], ["RR."]),
  scale_flag: buildMetricInfo("Scale flag", ["Kvalitativ RR-klassning av bolagets institutionsskala."], ["Härleds från RR-regler som använder scale-relaterade indikatorer."], ["InstitutionalScale är positivt, Subscale signalerar begränsad skalfördel.", "Bekräfta med historisk lönsamhet och kapitaldisciplin."], ["Skala i sig säger inte om avkastningen är god.", "Flaggan kan vara oklar när underliggande data saknas."], ["RR."]),
  rr_roce: buildMetricInfo("ROCE", ["RR-kontextens avkastning på sysselsatt kapital."], ["ROCE = EBIT delat med capital employed i RR-lagret."], ["<10% svagt, 10–20% okej, 20–40% starkt, >40% mycket starkt.", "Extremt höga värden bör korscheckas mot kapitaldefinition och hållbarhet."], ["Låg kapitalbas kan blåsa upp kvoten.", "Engångsposter i EBIT kan ge missvisande toppar."], ["RR."]),
  rr_roce_flag: buildMetricInfo("ROCE flag", ["Klassificerar ROCE-nivån i RR-overlay."], ["Bygger på tröskelregler applicerade på rr_roce."], ["Hög flaggnivå är positiv när den är stabil över flera år.", "Korschecka med skuldmått för att undvika att belåning maskerar risk."], ["Flaggan förenklar ett kontinuerligt mått och tappar nyanser.", "Se upp med klassgränser nära trösklar."], ["RR."]),
  margin_buffer: buildMetricInfo("Margin buffer", ["RR-proxy för motståndskraft i marginal mot kostnads- och prisstress."], ["Bygger på operativ marginal i RR-lagret som buffertmått."], ["<10% tunn buffert, 10–25% okej, 25–40% stark, >40% mycket stark (branschberoende).", "Verifiera stabilitet över tid och mot peers."], ["Temporära prisuppgångar kan blåsa upp bufferten.", "Hög marginal utan kassakonvertering är en varningssignal."], ["RR."]),
  cost_quartile: buildMetricInfo("Cost quartile", ["Mäter kostnadsposition relativt global kostnadskurva i RR."], ["Bygger på extern benchmark för kostnadskvartil när sådan finns."], ["Lägre kvartil är bättre och indikerar högre robusthet vid prisfall.", "Null betyder oftast datagap, inte neutral kvalitet."], ["Saknad benchmark får inte tolkas som låg risk.", "Olika benchmarkkällor kan ge olika kvartilutfall."], ["RR."]),
  reserve_life: buildMetricInfo("Reserve life", ["Visar hur länge reserver kan stödja nuvarande produktion."], ["Reserve life = Reserver dividerat med årlig produktion (år), när data finns."], ["Längre reservliv minskar reinvesteringspress och produktionsrisk.", "Kort reservliv kräver tydlig plan för ersättningsreserver."], ["Null i revenue mode beror ofta på saknad projekt/reservdata.", "Lång reservlivslängd utan lönsamhet är inte tillräckligt."], ["RR."]),
  rr_net_debt_fcf: buildMetricInfo("Net debt / FCF", ["RR-mått på skuldbörda relativt uthålligt fritt kassaflöde."], ["Net debt / FCF = Net debt delat med sustaining FCF."], ["<0 nettokassa, 0–1.5x konservativt, 1.5–3x medel, >3x förhöjd risk.", "Tolka med FCF-stabilitet och refinansieringsbehov."], ["Tillfällig FCF-topp kan ge falskt trygg kvot.", "Negativ FCF gör kvoten svårtolkad och kräver scenarioanalys."], ["RR."]),
  rr_interest_coverage: buildMetricInfo("Interest coverage (RR)", ["RR-kontextens räntetäckning för kreditstressbedömning."], ["Interest coverage = EBIT delat med Interest expense i RR-lagret."], ["<1.5x stressat, 1.5–3x skört, 3–8x okej och >8x starkt.", "Extremt höga nivåer kan bero på mycket låg räntekostnad; korschecka med nettoskuld och FCF."], ["Engångseffekter i EBIT kan ge övertolkning.", "Jämför över flera år för att bedöma hållbarhet."], ["RR."]),
  fv2_enterprise: buildMetricInfo("FV2 (Enterprise, USD)", ["Förenklad enterprise valuation baserad på normaliserat fritt kassaflöde."], ["Steg 1: median FCF (5Y). Steg 2: FV2 enterprise = median FCF delat med discount rate."], ["Lägre diskonteringsränta ger högre värde och tvärtom.", "Jämför med aktuellt EV för att bedöma relativ över-/undervärdering."], ["Modellen antar perpetuitet och fångar inte cykel/regimskiften fullt ut.", "Små ändringar i r ger stor effekt på utfallet."], ["RR FV2."]),
  fv2_equity: buildMetricInfo("FV2 (Equity, USD)", ["Värde till aktieägare efter avdrag för nettoskuld."], ["Steg 1: FV2 enterprise. Steg 2: FV2 equity = FV2 enterprise minus Net debt."], ["Starkt equityvärde kräver både rimligt enterprisevärde och kontrollerad skuldsättning.", "Negativt equityvärde signalerar hög finansieringsrisk."], ["Fel i nettoskuld slår direkt på equityvärdet.", "Bör valideras mot alternativa värderingsmetoder."], ["RR FV2."]),
  fv2_per_share: buildMetricInfo("FV2 (Per share, USD)", ["Översätter FV2 equity till ett värde per aktie."], ["FV2 per share = FV2 equity delat med utestående aktier."], ["Jämför med marknadspris för snabb värderingssignal.", "Null eller extremt värde kräver kontroll av shares-data."], ["Felaktigt aktieantal ger direkt missvisande värde per aktie.", "Utspädning över tid bör beaktas i jämförelsen."], ["RR FV2."]),
  ev_over_fv2: buildMetricInfo("EV / FV2_EV", ["Relativ multipel mellan aktuellt enterprise value och FV2 enterprise."], ["EV / FV2 = Aktuellt EV delat med FV2 enterprise."], ["<0.8 kan indikera rabatt, 0.8–1.2 nära fair value, >1.2 möjlig premie.", "Tolka zon tillsammans med kvalitet och balansrisk.", "Om aktuellt EV saknas eller är <= 0 visas värdet som — (missing EV)."], ["Förenklad FV2 kan avvika kraftigt från full DCF.", "Kortsiktiga marknadsrörelser kan flytta kvoten snabbt."], ["RR FV2."]),
  rr_classification: buildMetricInfo("RR classification", ["Samlad RR-klassning av skala, avkastning och balansrobusthet."], ["Härleds från RR-overlay-regler där flera delmått vägs samman."], ["Hög klass är starkast när delmåtten pekar åt samma håll över tid.", "Använd klassningen som startpunkt för vidare analys, inte slutbeslut."], ["Klassning nära gränser kan ändras snabbt av små dataskift.", "Datagap i underliggande mått kan ge underskattad kvalitet."], ["RR."]),
  fv3_disabled: buildMetricInfo("Fair value 3", ["Markerar att FV3-modellen inte används i revenue mode."], ["FV3 kräver projekt/LOM-antaganden och är därför avstängd i denna vy."], ["Statusen 'Ej aktiv' är förväntad och inte ett systemfel."], ["Att tolka avsaknad av FV3 som negativ signal är fel.", "Använd FV2 och övriga RR-mått tills FV3-data finns."], ["UI-designregel."]),
  missing_median_fcf: buildMetricInfo("missing_median_fcf", ["Flagga för att femårsmedian av FCF saknas."], ["Sätts när inputdata inte räcker för att beräkna median FCF (5Y)."], ["True innebär att FV2 blir osäkert eller ej beräkningsbart."], ["Tolka inte false som kvalitetsbevis, endast datatillgänglighet."], ["RR datakvalitet."]),
  missing_net_debt: buildMetricInfo("missing_net_debt", ["Flagga för saknad nettoskuld i FV2-beräkningen."], ["Sätts när debt/cash-data inte räcker för Net debt."], ["True betyder att equity-härledningen i FV2 inte kan valideras robust."], ["Saknat värde är datagap, inte neutral balanssignal."], ["RR datakvalitet."]),
  missing_shares: buildMetricInfo("missing_shares", ["Flagga för saknat antal utestående aktier."], ["Sätts när shares-data saknas för beräkning av FV2 per share."], ["True gör per-share-tolkning opålitlig även om enterprise/equity finns."], ["Aldrig jämför per-share mot kurs när flaggan är true."], ["RR datakvalitet."]),
  invalid_discount_rate: buildMetricInfo("invalid_discount_rate", ["Flagga för ogiltig diskonteringsränta i FV2."], ["Sätts när discount rate är noll, negativ eller utanför tillåtet intervall."], ["True innebär att FV2-värden inte ska användas beslutsmässigt förrän input är korrigerad."], ["Små inmatningsfel i r kan ge stora värderingsfel."], ["RR datakvalitet."]),
  missing_benchmark: buildMetricInfo("Missing benchmark", ["Visar att extern benchmark för cost quartile saknas."], ["Sätts från rr_cost_quartile_flags.missing_benchmark."], ["True betyder att cost quartile-analysen är ofullständig och måste kompletteras manuellt."], ["Detta är ett datatäckningsproblem, inte en kvalitetsdom om bolaget."], ["RR datakvalitet."]),
  missing_reserves: buildMetricInfo("Missing reserves", ["Visar att reservdata saknas för reserve life-analys."], ["Sätts från rr_reserve_life_flags.missing_reserves."], ["True innebär att långsiktig produktionsuthållighet inte kan bedömas fullt ut i RR."], ["Tolka inte saknad reservdata som kort reservlivslängd."], ["RR datakvalitet."]),
};

const defaultMetricInfo = (label: string): MetricInfo => buildMetricInfo(
  label,
  ["Måttet sammanfattar en central signal i panelen."],
  ["Beräkningen baseras på rapporterad finansiell data och respektive modulregler."],
  ["Tolka nivån mot bolagets historik, peers och stabilitet över flera år."],
  ["Undvik att dra slutsatser från ett enskilt datapunkt eller enbart ett mått."],
  ["Producer Core / RR beroende på sektion."]
);



const BUFFETOLOGY_CHART_INFO_MAP: Record<string, MetricInfo> = {
  "EBITDA Margin": {
    title: "EBITDA Margin",
    sections: [
      { heading: "LEGACY", lines: [`Warren Buffett tittar inte på EBITDA som primärt mått, men han är mycket intresserad av rörelsens inneboende lönsamhet.  

EBITDA visar hur stark affärsmodellen är innan kapitalintensitet och finansiering påverkar resultatet.  

Ett bolag med stabil och hög EBITDA-marginal indikerar ofta:
- Prissättningsmakt
- Operativ hävstång
- Strukturell kostnadsfördel  

Om EBITDA är volatil eller cyklisk utan tydlig förbättring, tyder det på att bolaget saknar moat.`] },
      { heading: "CENTRAL ADDITION", lines: ["- EBITDA kan dölja reinvesteringsbehov. Tolka alltid tillsammans med Capex och Free Cash Flow för att se om lönsamheten är “kassareell”.", "- För kapitalintensiva bolag, var extra försiktig med att dra moat-slutsatser från EBITDA-marginal isolerat."] },
    ],
  },
  "Net Income Margin": {
    title: "Net Income Margin",
    sections: [
      { heading: "LEGACY", lines: [`Buffett föredrar företag som konsekvent kan behålla en hög andel av varje intäktskrona som vinst.  

Net income margin visar affärens fulla ekonomiska kraft, efter alla kostnader, inklusive ränta och skatt.  

Ett kvalitetsbolag kännetecknas av:
- Stabil eller stigande nettomarginal över lång tid
- Låg känslighet för konjunktursvängningar  

Kraftiga svängningar kan indikera svag konkurrensposition.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Nettomarginal påverkas starkt av kapitalstruktur och skatt. Jämför därför också Operating Cash Flow och skuldsättningsgrafer för att skilja affärskvalitet från finansieringsval."] },
    ],
  },
  "Cash vs Net Earnings": {
    title: "Cash vs Net Earnings",
    sections: [
      { heading: "LEGACY", lines: [`Buffett är extremt skeptisk till bokföringsvinster som inte omvandlas till kassaflöde.  

Ett av hans centrala filter:  

“Earnings must convert to cash.”  

Om Operating Cash Flow konsekvent är lika med eller större än Net Income är det ett styrketecken.  

Om vinsterna över tid inte genererar kassaflöde är det ett varningstecken för aggressiv redovisning.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Enstaka avvikelser kan bero på rörelsekapital. Titta på flera år och kombinera med Inventory-grafen och kundfordringar om de finns i datat."] },
    ],
  },
  "Free Cash Flow": {
    title: "Free Cash Flow",
    sections: [
      { heading: "LEGACY", lines: [`Detta är det viktigaste måttet i Buffett-analys.  

Free Cash Flow visar vad ägarna faktiskt kan ta ut utan att skada verksamheten.  

Buffett kallar detta för “owner earnings”.  

Ett bolag med:
- Stabil FCF
- Växande FCF
- Låg Capex relativt kassaflöde  

är ofta en kandidat för långsiktig kapitalallokering.`] },
      { heading: "CENTRAL ADDITION", lines: ["- “Owner earnings” handlar om kassaflöde efter nödvändiga investeringar för att bibehålla konkurrenskraft. Tolka därför FCF tillsammans med Depreciation vs PPE för att se om bolaget underinvesterar.", "- Återkommande “engångs-justeringar” som krävs för att få fram FCF är en varningsflagga."] },
    ],
  },
  "Capital Expenditure vs Net Earnings": {
    title: "Capital Expenditure vs Net Earnings",
    sections: [
      { heading: "LEGACY", lines: [`Buffett föredrar verksamheter som inte kräver ständigt reinvesterande av vinsten för att överleva.  

Om Capex över lång tid ≈ Net Income betyder det att:
- Hela vinsten måste återinvesteras
- Det finns lite ägarvärde kvar  

Låg kapitalintensitet är ett tecken på stark affärsmodell.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Skilj mellan underhållsinvesteringar och expansionsinvesteringar när det går. Stabil FCF trots hög Capex kan vara OK om Capex är värdeskapande expansion, men det ska synas i långsiktigt ökande FCF per aktie."] },
    ],
  },
  "Retained Earnings vs Net Income": {
    title: "Retained Earnings vs Net Income",
    sections: [
      { heading: "LEGACY", lines: [`Buffett analyserar hur väl bolag förvaltar kvarhållna vinster.  

Han ställer frågan:  

“För varje dollar som behålls i bolaget, hur mycket marknadsvärde skapas?”  

Om retained earnings växer men:
- ROE faller
- Aktiekursen inte reflekterar värdeskapande  

är kapitalallokeringen ineffektiv.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Nyckeln är att retained earnings ska leda till högre framtida “owner earnings”. Om retained earnings växer men FCF per aktie inte gör det, är det ett tydligt disciplinproblem."] },
    ],
  },
  "ROE": {
    title: "ROE",
    sections: [
      { heading: "LEGACY", lines: [`Buffett älskar bolag med hög och stabil ROE, utan överdriven skuldsättning.  

En ROE över 15% under lång tid indikerar ofta:
- Moat
- Kapitaldisciplin
- Effektiv ledning  

Men hög ROE driven av hög skuld är inte attraktiv.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Tolka alltid ROE tillsammans med Debt to Equity och räntetäckning. Ett “bra” ROE som faller kraftigt när equity växer kan signalera avtagande avkastning på återinvesterat kapital."] },
    ],
  },
  "Debt to Equity": {
    title: "Debt to Equity",
    sections: [
      { heading: "LEGACY", lines: [`Buffett undviker bolag som är beroende av skuld för att generera avkastning.  

Ett kvalitetsbolag ska kunna överleva svåra tider utan att vara beroende av kreditmarknaden.  

Låg skuld:
- Minskar risk
- Ökar optionalitet
- Förhindrar permanent kapitalförlust`] },
      { heading: "CENTRAL ADDITION", lines: ["- Hög skuld ökar risken för permanent kapitalförlust via refinansieringsstress och framtida utspädning. Det är ofta inte volatilitet som dödar ägaren, det är behovet av kapital vid fel tidpunkt."] },
    ],
  },
  "EBIT vs Interest": {
    title: "EBIT vs Interest",
    sections: [
      { heading: "LEGACY", lines: [`Buffett föredrar bolag som kan täcka sina räntekostnader flera gånger om utan stress.  

Svag räntetäckning indikerar:
- Operativ sårbarhet
- Risk vid ränteuppgång
- Potentiell equity-utspädning`] },
      { heading: "CENTRAL ADDITION", lines: ["- Om räntetäckningen ser OK ut bara i högkonjunktur, men kollapsar i sämre år, är bolaget cykliskt sårbart även om snittet ser bra ut."] },
    ],
  },
  "Gross Profit Ratio": {
    title: "Gross Profit Ratio",
    sections: [
      { heading: "LEGACY", lines: [`Buffett analyserar bruttomarginalens stabilitet för att identifiera moat.  

Hög och stabil gross margin över tid är ett av de tydligaste tecknen på:
- Prissättningsmakt
- Varumärkesstyrka
- Strukturell konkurrensfördel`] },
      { heading: "CENTRAL ADDITION", lines: ["- En gross margin som hålls uppe via tillfälliga råvarufördelar eller konjunktur kan lura. Bekräfta med flera cykler och se om Operating margin och FCF följer med."] },
    ],
  },
  "Buybacks + Dividends vs Net Earnings": {
    title: "Buybacks + Dividends vs Net Earnings",
    sections: [
      { heading: "LEGACY", lines: [`Kapitalallokering är centralt i Buffett-filosofin.  

Om ett bolag:
- Genererar överskott
- Återköper aktier under intrinsic value
- Delar ut kapital disciplinerat  

då arbetar ledningen för aktieägarna.  

Men återköp över intrinsic value förstör värde.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Kombinera med Shares Outstanding-trenden. Återköp som inte minskar aktieantalet över tid är ofta kosmetik, särskilt om SBC är hög."] },
    ],
  },
  "Total Equity": {
    title: "Total Equity",
    sections: [
      { heading: "LEGACY", lines: [`Equity ska växa organiskt via retained earnings, inte genom emissioner.  

Buffett föredrar bolag där:
- Equity växer
- ROE förblir hög
- Ingen konstant utspädning sker  

Detta är tecken på intern kapitalgenerering.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Var extra uppmärksam på perioden där equity växer men emissioner avtar. Det är ofta första visuella tecknet på att bolaget går från “finansierat” till “självfinansierande”."] },
    ],
  },
};



function buildCoreInfo(what: string, why: string, how: string, redFlags: string, dataAvailability: string): MetricInfoSection[] {
  return [
    { heading: "WHAT", lines: [what] },
    { heading: "WHY", lines: [why] },
    { heading: "HOW TO READ", lines: [how] },
    { heading: "RED FLAGS", lines: [redFlags] },
    { heading: "DATA AVAILABILITY", lines: [dataAvailability] },
  ];
}

const PRE_REVENUE_CORE_INFO: Record<string, MetricInfoSection[]> = {
  "A1 Cash Balance": buildCoreInfo("Stock measure of cash on hand at each reporting date, shown as bars.", "Cash balance is the near-term survival anchor in pre-revenue companies.", "Each bar is cash balance (in statement currency, millions). Hover shows ΔCash versus prior statement as a financing/burn proxy.", "Large repeated negative ΔCash and no offsetting inflow periods can signal rising financing pressure.", "Uses balance.cashAndCashEquivalents on statement dates. ΔCash = current cash minus prior cash and is not operating cash flow."),
  "A2 Operating Cash Flow": buildCoreInfo("Period measure from the cash flow statement: operating cash flow for each reporting period, shown as bars.", "Separates operating burn generation from financing and balance-sheet cash levels in pre-revenue survival analysis.", "Negative bars represent operating burn for that period; positive bars show operating inflow. Working-capital timing can create volatility, so a less negative period is not always structural improvement.", "Repeated deep negative bars without milestone progress or financing flexibility increase survival risk.", "Uses cashflow.operatingCashFlow by statement date. This is not ΔCash (change in cash balance); it is operating cash flow."),
  "A3 Burn vs Capital Available": buildCoreInfo("Bars show period Burn Proxy (positive, statement currency millions) and overlay shows Capital Available in the same period.", "Survival-coverage view: compares burn intensity against available capital buffer (starting cash + financing inflows).", "Burn Proxy is derived from cash flow for the period using FCF first (burn = max(0, -FCF)); fallback uses max(0, -(Operating Cash Flow - Capex)); if Capex is missing fallback is max(0, -Operating Cash Flow). Capital Available = Starting Cash (prior period cash balance) + Financing Inflows (equity and debt proceeds when fields are available).", "Higher burn bars than available-capital overlay can indicate tighter survival coverage and dependence on fresh raises versus internal buffer.", "Not a pure FCF chart. Working-capital timing can add volatility, financing fields may be incomplete, and debt inflow coverage depends on dataset availability."),
  "A4 Burn Rate TTM": buildCoreInfo("Trailing 4-period burn proxy from OCF.", "Smooths one-off period noise.", "Higher burn line means faster cash depletion.", "Acceleration in burn with flat liquidity.", "Basis: TTM (if built from quarterly points). Not enough history for TTM returns missing data."),
  "A5 Runway Months": buildCoreInfo("Cash divided by annualized burn, converted to months.", "Direct survival-to-milestone lens.", "Below ~12 months indicates financing pressure.", "Runway collapsing while dilution rises.", "Basis: TTM (if built from quarterly points). Requires cash and burn rate history; otherwise missing data."),
  "A6 Burn Decomposition": buildCoreInfo("Period burn decomposition in statement currency millions using the same Burn Proxy hierarchy as A3.", "Shows composition of burn proxy each period, instead of abs(Operating Cash Flow).", "Burn Proxy = max(0, -FCF); fallback max(0, -(Operating Cash Flow - Capex)); fallback max(0, -Operating Cash Flow). Stack components are Capex (abs), SBC proxy, R&D proxy, and residual Other within burn.", "SBC and R&D are accounting proxies (not clean cash lines), and working-capital timing can still affect burn proxy levels.", "Uses cashflow.freeCashFlow first, then cashflow.operatingCashFlow with cashflow.capitalExpenditure fallback logic. Component proxies use cashflow.capitalExpenditure (abs), cashflow.stockBasedCompensation, and income.researchAndDevelopmentExpenses."),
  "A7 Cash Bridge / Waterfall": buildCoreInfo("Cash bridge using OCF, investing, financing cash flows.", "Shows how ending cash is funded.", "Positive financing with negative operations signals dependency.", "Repeated financing dependence without burn improvement.", "Uses net cash flow lines where available."),
  "A8 Next-12M Survival Gauge": buildCoreInfo("Runway vs 12-month threshold.", "Simple survival checkpoint.", "Runway above 12m improves flexibility.", "Runway consistently below threshold.", "Derived from runway series; threshold always shown."),
  "B1 Shares Outstanding": buildCoreInfo("Outstanding shares trend.", "Captures dilution burden on owners.", "Rising shares with weak cash metrics is negative.", "Step-ups after raises with no runway extension.", "Uses balance/income share fields depending on availability."),
  "B2 Dilution Rate YoY": buildCoreInfo("Year-over-year share growth.", "Quantifies annual dilution cost.", "Sustained high positive bars indicate dilution pressure.", "Double-digit dilution repeated across years.", "Requires consecutive share observations. Extreme dilution values are hidden (>300%) to avoid unreliable artifacts from missing/incorrect share baselines."),
  "B3 Cash per Share": buildCoreInfo("Cash divided by shares outstanding.", "Per-share liquidity view.", "Falling cash/share implies weaker ownership backing.", "Cash/share down despite financing rounds.", "Needs both cash and shares."),
  "B4 Market Cap vs Shares": buildCoreInfo("Historical implied market cap series derived as Close Price × Shares Outstanding on statement anchor dates.", "Shows how market valuation moved through time relative to dilution/events.", "Each point uses fiscal statement dates; price alignment uses exact-date close when available, otherwise nearest prior trading-day close.", "Sparse or stale price history near statement dates can create gaps.", "Shares source prefers balance.commonStockSharesOutstanding with fallback to income.weightedAverageShsOut when necessary."),
  "B5 SBC": buildCoreInfo("Stock-based compensation trend in statement currency millions.", "SBC is non-cash now but dilution later.", "Rising SBC with weak progress is a warning. Values are scaled to statement currency millions for comparability.", "SBC growth without milestone delivery.", "Uses cashflow.stockBasedCompensation, scaled by 1,000,000."),
  "B6 SBC Intensity": buildCoreInfo("SBC as a share of burn (percent).", "Shows compensation leakage intensity.", "This chart shows SBC as a share of burn (percent). It does not plot SBC amounts here; see B5 for SBC in currency.", "SBC intensity trending up.", "Requires SBC and burn proxy data."),
  "B7 All-in Dilution": buildCoreInfo("Grouped period bars of equity-financing inflow and SBC expense in statement currency millions.", "Shows equity reliance (financing cash-in) and equity leakage (compensation cost proxy) side by side.", "Common Stock Issued reflects financing cash proceeds, while SBC is a non-cash accounting expense tied to equity compensation.", "Interpret as equity reliance/leakage proxy, not a pure percent dilution metric.", "Uses cashflow.commonStockIssued and cashflow.stockBasedCompensation."),
  "C1 Corporate Overhead": buildCoreInfo("G&A expense (generalAndAdministrativeExpenses) proxy for overhead.", "Tracks fixed corporate cost discipline.", "Flat/declining overhead at same output is positive.", "Overhead growth disconnected from progress.", "Income statement: generalAndAdministrativeExpenses; fallback to SG&A then operatingExpenses only if GA is unavailable."),
  "C2 Exploration / Evaluation Cash Proxy (OCF Adjusted)": [
    { heading: "WHAT", lines: ["Exploration and evaluation cash proxy derived from operating cash flow."] },
    { heading: "HOW", lines: ["Defined as:", "max(0, -Operating Cash Flow − SBC − G&A)", "Values are shown in statement currency millions."] },
    { heading: "INTERPRETATION", lines: ["Estimates project-related cash spend by removing corporate overhead and equity compensation from operational cash burn."] },
    { heading: "LIMITATIONS", lines: ["Includes working capital effects.", "Not a reported exploration line item.", "Proxy only."] },
  ],
  "C3 Spend Mix": buildCoreInfo("Stack of overhead, R&D, capex.", "Visualizes allocation priorities.", "Balanced mix should align with company stage.", "Administrative spend crowding out core progress spend.", "Uses available fields only."),
  "C4 Overhead Ratio": buildCoreInfo("Overhead relative to total operating outflow proxy.", "Measures efficiency of corporate shell.", "Lower ratio generally indicates better discipline.", "Rising ratio despite financing pressure.", "Requires overhead plus OCF/opex proxy."),
  "C5 VCE Proxy": buildCoreInfo("Value creation efficiency proxy from FCF and spend.", "High-level discipline signal in pre-revenue phase.", "Less negative values imply improving efficiency.", "Efficiency worsening over several periods.", "Proxy only; shown when component data exists."),
  "C6 VCE vs Overhead": buildCoreInfo("VCE proxy compared with overhead.", "Checks if overhead is justified by efficiency trend.", "Divergence (worse VCE + higher overhead) is negative.", "Persistent negative divergence.", "Derived series, missing if inputs missing."),
  "D1 Net Cash / Net Debt": buildCoreInfo("Net cash stock measure = cash minus total debt, shown as period bars in statement currency millions.", "Tracks balance-sheet resilience and whether the company is in net cash or net debt territory.", "Bars above zero indicate net cash; below zero indicate net debt. Tooltip includes net cash, cash, and total debt (all in millions).", "Sustained moves deeper below zero can signal rising refinancing risk.", "Uses balance.cashAndCashEquivalents and balance.totalDebt on statement dates."),
  "D2 Debt Maturity Mix": buildCoreInfo("Stacked short-term and long-term debt bars by period, shown in statement currency millions.", "Separates near-term maturities from longer-dated debt to assess refinancing pressure.", "Total stack height is total debt; a larger short-term share indicates tighter near-term obligations.", "Rising short-term component without liquidity improvement increases rollover risk.", "Uses balance.shortTermDebt and balance.longTermDebt."),
  "D3 Cash vs Short-Term Obligations": buildCoreInfo("Cash and current liabilities plotted together by period in statement currency millions.", "Conservative liquidity check for near-term obligations coverage.", "In this chart, short-term obligations means total current liabilities (not only short-term debt). Cash below current liabilities can indicate near-term stress.", "A widening liabilities-over-cash gap raises financing pressure risk.", "Uses balance.cashAndCashEquivalents and balance.totalCurrentLiabilities."),
  "D4 Current Ratio": buildCoreInfo("Current assets divided by current liabilities (x multiple).", "Standard short-term solvency indicator.", "Values below 1 can imply tighter liquidity coverage. Very high spikes can occur when current liabilities are unusually small.", "Do not over-interpret temporary spikes without checking balance-sheet composition.", "Uses balance.totalCurrentAssets and balance.totalCurrentLiabilities."),
  "D5 Financing Inflows": buildCoreInfo("Cash proceeds from equity issuance per period, shown as bars in statement currency millions.", "Highlights survival funding events and dependence on external equity markets.", "Larger positive bars indicate larger issuance cash inflows in that period.", "Frequent large inflows without runway improvement can signal structural dependence.", "Uses cashflow.commonStockIssued as the inflow proxy."),
  "D6 Financing Frequency": buildCoreInfo("Trailing 8-period financing frequency rate (0–1) from equity-inflow observations.", "Summarizes how often the company relies on equity issuance over recent periods.", "Higher values mean more frequent periods with positive financing inflow.", "Persistently high frequency alongside weak burn trends can indicate fragile self-funding capacity.", "Derived from cashflow.commonStockIssued > 0 within a trailing window."),
  "E1 Burn Acceleration (Δ vs prior period)": buildCoreInfo("Change in burn magnitude versus the prior period, shown as bars in statement currency millions.", "Provides an early signal of whether operating burn is worsening or improving period-to-period.", "Positive values mean burn worsened; negative values mean burn improved.", "Can be noisy from working-capital timing effects in operating cash flow.", "Derived from cashflow.operatingCashFlow as Δ|OCF| between consecutive periods."),
  "E2 Runway Risk Bands": buildCoreInfo("Estimated runway months with 12m and 6m risk reference lines.", "Shows approximate survival time at the current burn pace.", "Runway = cash divided by approximate monthly burn derived from the corrected burn proxy and inferred period length (3m quarterly, 12m annual).", "Runway is approximate and can move sharply from working-capital timing and one-off cash movements.", "Derived from balance.cashAndCashEquivalents plus the A3 burn proxy series; values are clamped visually for readability while tooltip keeps actual when higher."),
  "E3 Dilution vs Runway": buildCoreInfo("Dilution rate (%) and runway months shown together with dual axes.", "Highlights whether shareholder dilution is buying meaningful survival time.", "Higher dilution with low runway indicates stress; improving runway with moderating dilution is healthier.", "Single-point jumps can come from sparse share updates; focus on trend direction.", "Uses share-count dilution percent and derived runway months."),
  "E4 Governance Leak Index": buildCoreInfo("Heuristic index combining dilution and SBC intensity components.", "Flags potential owner-value leakage through equity issuance and compensation.", "Higher readings indicate larger cumulative leakage pressure.", "Use as directional signal, not an accounting metric.", "Derived from dilution percent and SBC-intensity percent on aligned periods (scaled to index)."),
  "E5 Survival Score": buildCoreInfo("Heuristic 0–10 survival score with explainable components.", "Provides a compact risk gauge driven mainly by runway and penalized by dilution/leak/worsening burn signals.", "Tooltip shows runway score and penalties so score moves are explainable period-to-period.", "Not valuation and not a point forecast; use only as a directional monitoring aid.", "Requires aligned runway and dilution inputs; returns null when insufficient data."),
};


function withUnitMetadata(
  sections: MetricInfoSection[] | undefined,
  unitLabel: string,
  source: CurrencySource,
  mixedCurrencyNote?: string,
) {
  if (!sections) return sections;
  const dataLine = `Unit: ${unitLabel}`;
  const sourceLine = `Currency source: ${source}`;
  const mixedLine = mixedCurrencyNote ? `Note: ${mixedCurrencyNote}` : null;
  const nextSections = [...sections];
  const idx = nextSections.findIndex((section) => section.heading.toUpperCase() === "DATA AVAILABILITY");
  if (idx >= 0) {
    const lines = [...nextSections[idx].lines, dataLine, sourceLine, ...(mixedLine ? [mixedLine] : [])];
    nextSections[idx] = { ...nextSections[idx], lines: Array.from(new Set(lines)) };
  } else {
    nextSections.push({ heading: "DATA AVAILABILITY", lines: [dataLine, sourceLine, ...(mixedLine ? [mixedLine] : [])] });
  }
  return nextSections;
}

const PRICE_SERIES_COLORS = {
  close: "#0b0b0b",
  sma200: "#3a3a3a",
  sma50: "#3e5f8a",
  sma20: "#4b7f5a",
};

function parseFiscalYearEndMonth(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 2) {
    return null;
  }
  const month = Number(digits.slice(0, 2));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return month;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function pickFirstFiniteCandidate(
  candidates: Array<{ path: string; value: unknown }>,
): { path: string; value: number } | null {
  for (const candidate of candidates) {
    const parsed = toFiniteNumber(candidate.value);
    if (parsed !== null) {
      return { path: candidate.path, value: parsed };
    }
  }
  return null;
}

function lastFinitePositiveFromSeries(series: unknown): number | null {
  if (!Array.isArray(series)) return null;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

function formatPriceValue(value: number | null) {
  if (value === null) {
    return "—";
  }
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCapValue(value: number | null) {
  if (value === null) {
    return "—";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 0, useGrouping: true });
}

function formatSharesValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parseChartDate(rawDate: unknown): Date | null {
  if (rawDate instanceof Date) {
    return Number.isNaN(rawDate.getTime()) ? null : rawDate;
  }
  if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
    const fromNumber = new Date(rawDate);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof rawDate === "string") {
    const trimmed = rawDate.trim();
    if (!trimmed) return null;
    const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (isoDateMatch) {
      const year = Number(isoDateMatch[1]);
      const month = Number(isoDateMatch[2]);
      const day = Number(isoDateMatch[3]);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(utcDate.getTime()) ? null : utcDate;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeDateSeries(data: (string | number | Date | null)[][] | null) {
  if (!data || data.length === 0) {
    return data;
  }
  const [headers, ...rows] = data;
  const normalizedRows = rows
    .map((row) => {
      const [rawDate, ...rest] = row;
      const parsedDate = parseChartDate(rawDate);
      if (!parsedDate) {
        return null;
      }
      const normalizedValues = rest.map((value) => {
        if (value === null) return null;
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      });
      if (normalizedValues.length > 0 && normalizedValues.every((value) => value === null)) {
        return null;
      }
      return [parsedDate, ...normalizedValues] as (string | number | Date | null)[];
    })
    .filter((row): row is (string | number | Date | null)[] => row !== null)
    .sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime());

  if (normalizedRows.length === 0) {
    return null;
  }

  return [headers, ...normalizedRows];
}

function summarizeChartSeries(data: (string | number | Date | null)[][] | null) {
  if (!data || data.length < 2) {
    return {
      rows: 0,
      firstPoint: null,
      lastPoint: null,
      validNumericCount: 0,
      invalidValueCount: 0,
      yColumnCount: 0,
      hasConsistentRowLengths: true,
    };
  }
  const [, ...rows] = data;
  const yColumnCount = Math.max(0, (data[0]?.length ?? 0) - 1);
  const firstPoint = rows[0] ?? null;
  const lastPoint = rows[rows.length - 1] ?? null;
  let validNumericCount = 0;
  let invalidValueCount = 0;
  const hasConsistentRowLengths = rows.every((row) => row.length === yColumnCount + 1);

  rows.forEach((row) => {
    row.slice(1).forEach((value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        validNumericCount += 1;
        return;
      }
      if (value === null) {
        return;
      }
      invalidValueCount += 1;
    });
  });

  return {
    rows: rows.length,
    firstPoint,
    lastPoint,
    validNumericCount,
    invalidValueCount,
    yColumnCount,
    hasConsistentRowLengths,
  };
}

function combinePriceAndVolumeSeries(
  priceSeries: (string | number | Date | null)[][] | null,
  volumeSeries: (string | number | Date | null)[][] | null,
  includeSma20: boolean,
) {
  if (!priceSeries || priceSeries.length < 2) return null;

  const priceRows = priceSeries.slice(1);
  const volumeRows = volumeSeries?.slice(1) ?? [];
  const volumeByTimestamp = new Map<number, number | null>();

  volumeRows.forEach((row) => {
    const date = row[0];
    const volume = row[1];
    if (!(date instanceof Date)) return;
    if (typeof volume === "number" && Number.isFinite(volume)) {
      volumeByTimestamp.set(date.getTime(), volume);
      return;
    }
    volumeByTimestamp.set(date.getTime(), null);
  });

  const headers = includeSma20
    ? ["Date", "Close", "SMA200", "SMA50", "SMA20", "Volume"]
    : ["Date", "Close", "SMA200", "SMA50", "Volume"];

  const rows = priceRows
    .map((row) => {
      const date = row[0];
      if (!(date instanceof Date)) return null;
      const close = typeof row[1] === "number" && Number.isFinite(row[1]) ? row[1] : null;
      const sma200 = typeof row[2] === "number" && Number.isFinite(row[2]) ? row[2] : null;
      const sma50 = typeof row[3] === "number" && Number.isFinite(row[3]) ? row[3] : null;
      const sma20 = typeof row[4] === "number" && Number.isFinite(row[4]) ? row[4] : null;
      const volume = volumeByTimestamp.get(date.getTime()) ?? null;
      const combinedRow = includeSma20
        ? [date, close, sma200, sma50, sma20, volume]
        : [date, close, sma200, sma50, volume];
      return combinedRow as (string | number | Date | null)[];
    })
    .filter((row): row is (string | number | Date | null)[] => row !== null);

  if (rows.length === 0) return null;
  return [headers, ...rows];
}

type ReportedChartContext = {
  resolveUnitMeta: (title: string) => ChartUnitMeta;
  marketCurrency: string;
  statementCurrency: string;
  mixedCurrencyNote?: string;
};

type ReportedChartProps = ComponentProps<typeof ChartCard> & {
  reportedChartContext: ReportedChartContext;
};

function ReportedChart({ reportedChartContext, ...props }: ReportedChartProps) {
  const { resolveUnitMeta, marketCurrency, statementCurrency, mixedCurrencyNote } = reportedChartContext;
  const meta = resolveUnitMeta(props.title);
  const source: CurrencySource = meta.unitLabel.includes("shares") || meta.unitLabel === "%" || meta.unitLabel === "months" || meta.unitLabel === "x" || meta.unitLabel === "index"
    ? "unknown"
    : meta.unitLabel.includes(marketCurrency) && !meta.unitLabel.includes(statementCurrency)
      ? "market"
      : "statements";
  const infoSections = withUnitMetadata(props.infoSections, meta.unitLabel, source, mixedCurrencyNote);
  return (
    <ChartCard
      {...props}
      infoSections={infoSections}
      unitLabel={props.unitLabel ?? meta.unitLabel}
      unitKind={props.unitKind ?? meta.unitKind}
      yAxisTitle={props.yAxisTitle ?? meta.yAxisTitle}
      y2AxisTitle={props.y2AxisTitle ?? meta.y2AxisTitle}
    />
  );
}

type SingleStockDashboardProps = {
  onTickerChange?: (ticker: string) => void;
};

type CompanySectorMappingOption = {
  companyId: string;
  ticker: string;
  companyName: string | null;
  sectorId: string;
  subsectorId: string | null;
  category: string | null;
  specificMappings: string[];
};

export default function SingleStockDashboard({ onTickerChange }: SingleStockDashboardProps = {}) {
  const { ticker, data, loading, error, fetchCompany } = useCompanyData("");
  const [quarterlyData, setQuarterlyData] = useState<CompanyResponse | null>(null);
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [mappedCompanies, setMappedCompanies] = useState<CompanySectorMappingOption[]>([]);
  const [mappedCompaniesError, setMappedCompaniesError] = useState<string | null>(null);
  const [mappedCompaniesDiagnostics, setMappedCompaniesDiagnostics] = useState<{ categoryColumnAvailable: boolean | null; mappedCompaniesCount: number | null }>({ categoryColumnAvailable: null, mappedCompaniesCount: null });
  const [selectedMappedSector, setSelectedMappedSector] = useState("");
  const [selectedMappedSubsector, setSelectedMappedSubsector] = useState("");
  const [selectedSpecificMapping, setSelectedSpecificMapping] = useState("");
  const [selectedMappedCategory, setSelectedMappedCategory] = useState("");
  const [tickersError, setTickersError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [priceData, setPriceData] = useState<{
    long: {
      price: (string | number | Date | null)[][] | null;
      volume: (string | number | Date | null)[][] | null;
    } | null;
    short: {
      price: (string | number | Date | null)[][] | null;
      volume: (string | number | Date | null)[][] | null;
    } | null;
  } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(() => readModeFromUrl());
  const [primaryView, setPrimaryView] = useState<PrimaryView>(() => readPrimaryViewFromUrl());
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const [rrDiscountRateInput, setRrDiscountRateInput] = useState<string>("");

  const [companyProjects, setCompanyProjects] = useState<CompanyProjectSummary[]>([]);
  const [companyProjectsError, setCompanyProjectsError] = useState<string | null>(null);
  const [companyProjectsLoading, setCompanyProjectsLoading] = useState(false);
  const [projectSnapshotLoading, setProjectSnapshotLoading] = useState(false);
  const [projectSnapshotError, setProjectSnapshotError] = useState<string | null>(null);
  const [projectSnapshotWarnings, setProjectSnapshotWarnings] = useState<string[]>([]);
  const [projectSnapshotErrors, setProjectSnapshotErrors] = useState<string[]>([]);
  const [projectSnapshotDiagnosticsMeta, setProjectSnapshotDiagnosticsMeta] = useState<Record<string, unknown> | null>(null);
  const [projectSnapshotData, setProjectSnapshotData] = useState<Record<string, unknown> | null>(null);
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  const [selectedProjectRawJson, setSelectedProjectRawJson] = useState<Record<string, unknown> | null>(null);
  const [stressOptions, setStressOptions] = useState<StressOptions>({});
  const [stressSnapshotLoading, setStressSnapshotLoading] = useState(false);
  const [stressSnapshotError, setStressSnapshotError] = useState<string | null>(null);
  const [stressSnapshotData, setStressSnapshotData] = useState<Record<string, unknown> | null>(null);
  const [stressSnapshotDiagnosticsMeta, setStressSnapshotDiagnosticsMeta] = useState<Record<string, unknown> | null>(null);
  const [stressEdgeCases, setStressEdgeCases] = useState<string[]>([]);
  const [projectEquityPct, setProjectEquityPct] = useState("100");
  const [projectDebtPct, setProjectDebtPct] = useState("0");
  const [projectUseQuarterlyCash, setProjectUseQuarterlyCash] = useState(false);
  const [projectCashUsedPct, setProjectCashUsedPct] = useState(100);
  const [projectExtraSharesInput, setProjectExtraSharesInput] = useState("0");
  const [projectSectionsOpen, setProjectSectionsOpen] = useState(PROJECT_SECTION_DEFAULT_OPEN);
  const [npvTracePersistResult, setNpvTracePersistResult] = useState<{ url: string | null; fileName: string | null; savedAtUtc: string | null; error: string | null }>({ url: null, fileName: null, savedAtUtc: null, error: null });
  const [manualPriceStoreVersion, setManualPriceStoreVersion] = useState(0);
  const [manualPriceModalOpen, setManualPriceModalOpen] = useState(false);
  const [manualPriceModalTarget, setManualPriceModalTarget] = useState<{ metal: string; metalKey: string; unit: string | null; reason: string | null } | null>(null);
  const [manualPriceInput, setManualPriceInput] = useState("");

  const manualMetalPrices = useMemo(() => getManualMetalPriceStore(), [manualPriceStoreVersion]);

  const openManualPriceModal = (target: { metal: string; metalKey: string; unit: string | null; reason: string | null }) => {
    setManualPriceModalTarget(target);
    setManualPriceInput("");
    setManualPriceModalOpen(true);
  };

  const submitManualPrice = async () => {
    if (!manualPriceModalTarget) return;
    const value = Number(manualPriceInput);
    if (!Number.isFinite(value) || value <= 0) return;
    saveManualMetalPrice({
      metalKey: manualPriceModalTarget.metalKey,
      displayName: manualPriceModalTarget.metal,
      unit: manualPriceModalTarget.unit,
      value,
    });
    setManualPriceStoreVersion((prev) => prev + 1);
    setManualPriceModalOpen(false);
    if (selectedProjectId) {
      await runProjectSnapshotForProject(selectedProjectId, selectedProjectName);
    }
  };

  const clampPct = (value: number) => {
    const roundedToStep = Math.round(value / 5) * 5;
    return Math.min(100, Math.max(0, roundedToStep));
  };

  const setProjectEquityDebtFromEquity = (value: number) => {
    const equityPct = clampPct(value);
    const debtPct = 100 - equityPct;
    setProjectEquityPct(String(equityPct));
    setProjectDebtPct(String(debtPct));
  };

  const setProjectEquityDebtFromDebt = (value: number) => {
    const debtPct = clampPct(value);
    const equityPct = 100 - debtPct;
    setProjectDebtPct(String(debtPct));
    setProjectEquityPct(String(equityPct));
  };

  const [riskAdjustedDiscountRatePctInput, setRiskAdjustedDiscountRatePctInput] = useState("10");
  const [corporateSnapshotLoading, setCorporateSnapshotLoading] = useState(false);
  const [corporateSnapshotError, setCorporateSnapshotError] = useState<string | null>(null);
  const [corporateSnapshotData, setCorporateSnapshotData] = useState<Record<string, unknown> | null>(null);
  const [corporateDiagnostics, setCorporateDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [corporateProjectEquityPct, setCorporateProjectEquityPct] = useState<Record<string, number>>({});
  const [corporateUseQuarterlyCash, setCorporateUseQuarterlyCash] = useState(false);
  const [corporateCashUsedPct, setCorporateCashUsedPct] = useState(100);
  const [corporateExtraSharesInput, setCorporateExtraSharesInput] = useState("0");
  const [scenarioMode] = useState<"spot" | "percentile" | "fixed">("spot");
  const [scenarioLookbackYearsInput] = useState("10");
  const [scenarioPercentileInput] = useState("50");
  const [fixedPriceMapJson] = useState("{\n  \"XAU_USD_TOZ\": 2400\n}");
  const [fxSource] = useState<"auto" | "manual">("auto");
  const [manualFxInput] = useState("");
  const debugEnabled = isDebugEnabledInClient();
  const valueIntervalDebugVisible = isDebugEnabledByQueryParam();

  useEffect(() => {
    if (!ticker || !selectedProjectId) return;
    setProjectExtraSharesInput(window.localStorage.getItem(extraSharesStorageKey('project', ticker, selectedProjectId)) ?? '0');
  }, [ticker, selectedProjectId]);

  useEffect(() => {
    if (!ticker) return;
    setCorporateExtraSharesInput(window.localStorage.getItem(extraSharesStorageKey('corporate', ticker)) ?? '0');
  }, [ticker]);

  const updateExtraShares = (scope: 'project' | 'corporate', raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (scope === 'project') {
      setProjectExtraSharesInput(digits);
      if (ticker && selectedProjectId) window.localStorage.setItem(extraSharesStorageKey(scope, ticker, selectedProjectId), digits || '0');
    } else {
      setCorporateExtraSharesInput(digits);
      if (ticker) window.localStorage.setItem(extraSharesStorageKey(scope, ticker), digits || '0');
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadPrice() {
      try {
        setPriceLoading(true);
        setPriceError(null);
        const response = await fetch(`/api/company/price?ticker=${encodeURIComponent(ticker)}`);
        const contentType = response.headers.get("content-type") ?? "";
        const rawPayload = await response.text();
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new Error(
            `Expected JSON from /api/company/price (status=${response.status}, content-type=${contentType || "unknown"}, body=${rawPayload.slice(0, 120)})`
          );
        }
        const payload = rawPayload ? JSON.parse(rawPayload) : {};
        if (!response.ok) {
          const message = String(payload.error ?? "Failed to load price data.");
          const unsupported =
            response.status === 404 || message.toLowerCase().includes("not found");
          throw new Error(unsupported ? "Ticker not supported by data provider." : message);
        }
        if (isMounted) {
          const longPayload = payload.long ?? null;
          const shortPayload = payload.short ?? null;
          setPriceData({
            long: longPayload
              ? {
                price: normalizeDateSeries(longPayload.price),
                volume: normalizeDateSeries(longPayload.volume),
              }
              : null,
            short: shortPayload
              ? {
                price: normalizeDateSeries(shortPayload.price),
                volume: normalizeDateSeries(shortPayload.volume),
              }
              : null,
          });
          if (!longPayload && !shortPayload) {
            setPriceData(null);
          }
        }
      } catch (error) {
        if (isMounted) {
          setPriceData(null);
          setPriceError((error as Error).message);
        }
      } finally {
        if (isMounted) {
          setPriceLoading(false);
        }
      }
    }

    if (ticker) {
      void loadPrice();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);

  useEffect(() => {
    setCorporateProjectEquityPct((prev) => {
      const next: Record<string, number> = {};
      for (const project of companyProjects) {
        next[project.project_id] = prev[project.project_id] ?? 100;
      }
      return next;
    });
  }, [companyProjects]);

  useEffect(() => {
    let isMounted = true;

    async function loadQuarterly() {
      try {
        const response = await fetch(`/api/company?ticker=${encodeURIComponent(ticker)}&period=quarterly`);
        const payload = (await response.json()) as CompanyResponse;
        if (!response.ok || payload.error) {
          if (isMounted) {
            setQuarterlyData(null);
          }
          return;
        }
        if (isMounted) {
          setQuarterlyData(payload);
        }
      } catch {
        if (isMounted) {
          setQuarterlyData(null);
        }
      }
    }

    if (ticker) {
      void loadQuarterly();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);


  useEffect(() => {
    function onScreeningOpen(event: Event) {
      const custom = event as CustomEvent<{ ticker?: string }>;
      const nextTicker = custom.detail?.ticker?.trim().toUpperCase();
      if (!nextTicker) {
        return;
      }
      void fetchCompany(nextTicker);
    }
    window.addEventListener("screening:open-ticker", onScreeningOpen as EventListener);
    return () => {
      window.removeEventListener("screening:open-ticker", onScreeningOpen as EventListener);
    };
  }, [fetchCompany]);

  const loadTickers = async () => {
    try {
      setTickersError(null);
      const list = await fetchUniverseSymbols();
      setAvailableTickers(list);
    } catch (error) {
      setTickersError(normalizeClientErrorMessage((error as Error).message, "Failed to load tickers."));
      console.error("Failed to load tickers", error);
    }
  };

  const loadMappedCompanies = async () => {
    try {
      setMappedCompaniesError(null);
      const response = await fetch(`/api/sector/company-mapping${debugEnabled ? "?debug=1" : ""}`);
      const payload = await response.json();
      if (!response.ok) {
        const fallback = "Failed to load mapped companies.";
        const message = typeof payload?.error === "string"
          ? payload.error
          : (debugEnabled ? payload?.error?.debugMessage : payload?.error?.message);
        throw new Error(message ?? fallback);
      }
      const rows = Array.isArray(payload.mappings) ? payload.mappings : [];
      const normalized = rows
        .map((row: any) => ({
          companyId: String(row.companyId ?? ""),
          ticker: String(row.ticker ?? "").trim().toUpperCase(),
          companyName: typeof row.companyName === "string" && row.companyName.trim() ? row.companyName.trim() : null,
          sectorId: String(row.sectorId ?? "").trim(),
          subsectorId: typeof row.subsectorId === "string" && row.subsectorId.trim() ? row.subsectorId.trim() : null,
          category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : null,
          specificMappings: Array.isArray(row.specificMappings)
            ? row.specificMappings.map((item: unknown) => String(item ?? "").trim().toLowerCase()).filter(Boolean)
            : [],
        }))
        .filter((row: CompanySectorMappingOption) => Boolean(row.companyId && row.ticker && row.sectorId));
      setMappedCompanies(normalized);
      const diagnosticsRaw = payload?.diagnostics;
      setMappedCompaniesDiagnostics({
        categoryColumnAvailable: typeof diagnosticsRaw?.categoryColumnAvailable === "boolean" ? diagnosticsRaw.categoryColumnAvailable : null,
        mappedCompaniesCount: typeof diagnosticsRaw?.mappedCompaniesCount === "number" ? diagnosticsRaw.mappedCompaniesCount : normalized.length,
      });
    } catch (error) {
      setMappedCompanies([]);
      setMappedCompaniesDiagnostics({ categoryColumnAvailable: null, mappedCompaniesCount: null });
      setMappedCompaniesError(normalizeClientErrorMessage((error as Error).message, "Failed to load mapped companies."));
      console.error("Failed to load mapped companies", error);
    }
  };

  useEffect(() => {
    void loadTickers();
    void loadMappedCompanies();
  }, []);



  useEffect(() => {
    setPrimaryView("reported");
  }, [analysisMode]);


  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("mode", analysisMode);
    params.set("view", primaryView);
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [analysisMode, primaryView]);
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const response = await fetch(`/api/company/profile?ticker=${encodeURIComponent(ticker)}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load company profile.");
        }
        if (isMounted) {
          setProfile(payload.profile ?? null);
        }
      } catch {
        if (isMounted) {
          setProfile(null);
        }
      }
    }

    if (ticker) {
      void loadProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);

  const lockedTargetCurrency = useMemo(() => resolveProfileTargetCurrency(profile), [profile]);

  useEffect(() => {
    let isMounted = true;

    async function loadCompanyProjects() {
      setCompanyProjectsLoading(true);
      setCompanyProjectsError(null);
      try {
        const projects = await getCompanyProjectsBySymbol(ticker);
        if (isMounted) {
          setCompanyProjects(projects);
        }
      } catch (error) {
        if (isMounted) {
          setCompanyProjects([]);
          setCompanyProjectsError((error as Error).message);
        }
      } finally {
        if (isMounted) {
          setCompanyProjectsLoading(false);
        }
      }
    }

    if (ticker) {
      void loadCompanyProjects();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);

  const runProjectSnapshotForProject = async (projectId: string, projectName?: string | null) => {
    const discountRatePct = toInputNumber(riskAdjustedDiscountRatePctInput);
    const discountRate = typeof discountRatePct === "number" && Number.isFinite(discountRatePct)
      ? discountRatePct / 100
      : Number.NaN;
    const profileSharesCurrent = resolveCommonSharesCurrent({
      balance: data?.balance as Record<string, Array<number | null>> | undefined,
      income: data?.income as Record<string, Array<number | null>> | undefined,
    });
    const profileSharesOutstanding = typeof profile?.sharesOutstanding === "number" && Number.isFinite(profile.sharesOutstanding) && profile.sharesOutstanding > 0
      ? profile.sharesOutstanding
      : undefined;
    const sharesCurrent = profileSharesCurrent ?? profileSharesOutstanding;
    const profilePriceCurrent = typeof profile?.price === "number" ? profile.price : undefined;
    const marketWarnings: string[] = [];
    const latestQuarterlyCash = [...getFieldSeries(data, "balance", "cashAndCashEquivalents")]
      .reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
    const latestQuarterlyDebt = [...getFieldSeries(data, "balance", "totalDebt")]
      .reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
    const projectFinancingFractions = normalizedFinancingFractions(projectEquityPct, projectDebtPct);
    const marketFromProfile =
      isPositiveFinite(sharesCurrent) && isPositiveFinite(profilePriceCurrent)
        ? {
            shares_current: sharesCurrent,
            price_current_TargetCurrency: profilePriceCurrent,
          }
        : undefined;

    if (!marketFromProfile) {
      if (!isPositiveFinite(sharesCurrent)) {
        marketWarnings.push("market.shares_current missing (resolved from statements/profile.sharesOutstanding); EV/multiples will be null.");
      }
      if (!isPositiveFinite(profilePriceCurrent)) {
        marketWarnings.push("market.price_current_TargetCurrency missing from profile.price; EV/multiples may be null.");
      }
    }

    const scenario: SnapshotRequest["scenario"] = (() => {
      if (scenarioMode === "percentile") {
        return {
          mode: "percentile",
          lookbackYears: Number(scenarioLookbackYearsInput) || 10,
          percentile: Number(scenarioPercentileInput) || 50,
          window: "trailing",
          sampling: "eod_close",
          anchor: "period_end",
        };
      }
      if (scenarioMode === "fixed") {
        const parsedFixed = safeParseJson<Record<string, number>>(fixedPriceMapJson);
        if (!parsedFixed.ok) {
          throw new Error(`Invalid fixed scenario JSON: ${parsedFixed.error}`);
        }
        return { mode: "fixed", fixedPriceByKey: parsedFixed.value };
      }
      return { mode: "spot" };
    })();

    setSelectedProjectId(projectId);
    setSelectedProjectName(projectName ?? null);
    setProjectSelectorOpen(false);
    setProjectSnapshotData(null);
    setSelectedProjectRawJson(null);
    setProjectSnapshotLoading(true);
    setProjectSnapshotError(null);
    setProjectSnapshotWarnings([]);
    setProjectSnapshotErrors([]);
    setProjectSnapshotDiagnosticsMeta(null);
    setStressSnapshotData(null);
    setStressSnapshotDiagnosticsMeta(null);
    setStressSnapshotError(null);
    setStressEdgeCases([]);
    setStressOptions({});

    try {
      const project = await getCompanyProject(ticker, projectId);
      const projectsPayload = [{ projectId: project.project_id, rawJson: project.raw_json }];
      if (projectsPayload.length === 0) {
        setProjectSnapshotData(null);
        setProjectSnapshotError("No project selected.");
        return;
      }

      const request = buildProjectsSnapshotRequest({
        profile,
        discountRate,
        scenario,
        fx: {
          source: lockedTargetCurrency === "USD" ? "manual" : fxSource,
          anchor: "today",
          scenario: { mode: "spot" },
          manual_fx_USD_to_TargetCurrency: lockedTargetCurrency === "USD" ? 1 : toInputNumber(manualFxInput),
        },
        projects: projectsPayload,
        market: marketFromProfile,
        balanceSheet: {
          cash_t0_TargetCurrency: latestQuarterlyCash,
          debt_t0_TargetCurrency: latestQuarterlyDebt,
        },
        financingPlan: {
          use_cash_first: projectUseQuarterlyCash,
          cash_use_percent: projectCashUsedPct / 100,
          equity_fraction: projectFinancingFractions.equity,
          debt_fraction: projectFinancingFractions.debt,
          minimum_cash_reserve_TargetCurrency: 0,
          equity_raise_price_TargetCurrency: profilePriceCurrent,
        },
        manualMetalPrices,
      });

      const result = await postCorporateSnapshot(request, { refresh: lockedTargetCurrency !== "USD" });
      setProjectSnapshotWarnings([...marketWarnings, ...(result.diagnostics?.warnings ?? [])]);
      setProjectSnapshotErrors(result.diagnostics?.errors ?? []);
      setProjectSnapshotDiagnosticsMeta((result.diagnostics?.meta ?? null) as Record<string, unknown> | null);
      if (!result.ok || !result.snapshot) {
        setProjectSnapshotData(null);
        setProjectSnapshotError((result.diagnostics?.errors ?? ["Snapshot request failed."]).join("\n"));
        return;
      }
      setSelectedProjectId(project.project_id);
      setSelectedProjectName(project.project_name ?? null);
      setSelectedProjectRawJson(project.raw_json as Record<string, unknown>);
      setProjectSnapshotData(result.snapshot as unknown as Record<string, unknown>);
    } catch (error) {
      setProjectSnapshotData(null);
      setSelectedProjectRawJson(null);
      setProjectSnapshotDiagnosticsMeta(null);
      setProjectSnapshotError((error as Error).message);
    } finally {
      setProjectSnapshotLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const hasStress = Object.values(stressOptions).some((value) => value === true);
    if (!selectedProjectId || !selectedProjectRawJson || !hasStress) {
      setStressSnapshotData(null);
      setStressSnapshotDiagnosticsMeta(null);
      setStressSnapshotError(null);
      setStressEdgeCases([]);
      setStressSnapshotLoading(false);
      return;
    }

    const run = async () => {
      setStressSnapshotLoading(true);
      setStressSnapshotError(null);
      setStressEdgeCases([]);
      setStressSnapshotDiagnosticsMeta(null);
      try {
        const discountRatePct = toInputNumber(riskAdjustedDiscountRatePctInput);
        const discountRate = typeof discountRatePct === "number" && Number.isFinite(discountRatePct)
          ? discountRatePct / 100
          : Number.NaN;
        const profileSharesCurrent = resolveCommonSharesCurrent({
          balance: data?.balance as Record<string, Array<number | null>> | undefined,
          income: data?.income as Record<string, Array<number | null>> | undefined,
        });
        const profileSharesOutstanding = typeof profile?.sharesOutstanding === "number" && Number.isFinite(profile.sharesOutstanding) && profile.sharesOutstanding > 0
          ? profile.sharesOutstanding
          : undefined;
        const sharesCurrent = profileSharesCurrent ?? profileSharesOutstanding;
        const profilePriceCurrent = typeof profile?.price === "number" ? profile.price : undefined;
        const latestQuarterlyCash = [...getFieldSeries(data, "balance", "cashAndCashEquivalents")]
          .reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
        const latestQuarterlyDebt = [...getFieldSeries(data, "balance", "totalDebt")]
          .reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
        const projectFinancingFractions = normalizedFinancingFractions(projectEquityPct, projectDebtPct);
        const marketFromProfile =
          isPositiveFinite(sharesCurrent) && isPositiveFinite(profilePriceCurrent)
            ? {
                shares_current: sharesCurrent,
                price_current_TargetCurrency: profilePriceCurrent,
              }
            : undefined;
        const request = buildProjectsSnapshotRequest({
          profile,
          discountRate,
          scenario: { mode: "spot" },
          fx: {
            source: lockedTargetCurrency === "USD" ? "manual" : fxSource,
            anchor: "today",
            scenario: { mode: "spot" },
            manual_fx_USD_to_TargetCurrency: lockedTargetCurrency === "USD" ? 1 : toInputNumber(manualFxInput),
          },
          projects: [{ projectId: selectedProjectId, rawJson: selectedProjectRawJson }],
          market: marketFromProfile,
          balanceSheet: { cash_t0_TargetCurrency: latestQuarterlyCash, debt_t0_TargetCurrency: latestQuarterlyDebt },
          financingPlan: {
            use_cash_first: projectUseQuarterlyCash,
            cash_use_percent: projectCashUsedPct / 100,
            equity_fraction: projectFinancingFractions.equity,
            debt_fraction: projectFinancingFractions.debt,
            minimum_cash_reserve_TargetCurrency: 0,
            equity_raise_price_TargetCurrency: profilePriceCurrent,
          },
          manualMetalPrices,
        });
        const result = await postCorporateSnapshot({ ...request, stressOptions }, { refresh: lockedTargetCurrency !== "USD" });
        if (cancelled) return;
        if (!result.ok || !result.snapshot) {
          setStressSnapshotData(null);
          setStressSnapshotDiagnosticsMeta((result.diagnostics?.meta ?? null) as Record<string, unknown> | null);
          setStressSnapshotError((result.diagnostics?.errors ?? ["Stress snapshot request failed."]).join("\n"));
          const edge = (((result.diagnostics?.meta ?? {}) as Record<string, unknown>).stress as { edgeCases?: string[] } | undefined)?.edgeCases;
          setStressEdgeCases(Array.isArray(edge) ? edge : []);
          return;
        }
        setStressSnapshotData(result.snapshot as Record<string, unknown>);
        setStressSnapshotDiagnosticsMeta((result.diagnostics?.meta ?? null) as Record<string, unknown> | null);
        const edge = (((result.diagnostics?.meta ?? {}) as Record<string, unknown>).stress as { edgeCases?: string[] } | undefined)?.edgeCases;
        setStressEdgeCases(Array.isArray(edge) ? edge : []);
      } catch (error) {
        if (cancelled) return;
        setStressSnapshotData(null);
        setStressSnapshotDiagnosticsMeta(null);
        setStressSnapshotError((error as Error).message);
      } finally {
        if (!cancelled) setStressSnapshotLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, selectedProjectRawJson, stressOptions, riskAdjustedDiscountRatePctInput, data?.balance, data?.income, profile, lockedTargetCurrency, fxSource, manualFxInput, manualMetalPrices, projectUseQuarterlyCash, projectCashUsedPct, projectEquityPct, projectDebtPct]);

  const corporateFinancingPlan = useMemo(() => {
    if (companyProjects.length === 0) return undefined;
    const equityValues = companyProjects.map((project) => corporateProjectEquityPct[project.project_id] ?? 100);
    const avgEquityPct = equityValues.reduce((sum, value) => sum + value, 0) / equityValues.length;
    const equityFraction = Math.min(1, Math.max(0, avgEquityPct / 100));
    const financingPlanByProject = Object.fromEntries(
      companyProjects.map((project) => {
        const equityPct = corporateProjectEquityPct[project.project_id] ?? 100;
        const projectEquityFraction = Math.min(1, Math.max(0, equityPct / 100));
        return [project.project_id, {
          equity_fraction: projectEquityFraction,
          debt_fraction: 1 - projectEquityFraction,
        }];
      }),
    );
    return {
      equity_fraction: equityFraction,
      debt_fraction: 1 - equityFraction,
      use_cash_first: corporateUseQuarterlyCash,
      cash_use_percent: corporateCashUsedPct / 100,
      financingPlanByProject,
    };
  }, [companyProjects, corporateProjectEquityPct, corporateUseQuarterlyCash, corporateCashUsedPct]);

  useEffect(() => {
    let isMounted = true;
    async function runCorporateSnapshot() {
      if (primaryView !== "modeled") return;
      if (!ticker || companyProjects.length === 0) {
        setCorporateSnapshotData(null);
        setCorporateDiagnostics(null);
        setCorporateSnapshotError(null);
        return;
      }
      const discountRatePct = toInputNumber(riskAdjustedDiscountRatePctInput);
      const discountRate = typeof discountRatePct === "number" && Number.isFinite(discountRatePct)
        ? discountRatePct / 100
        : 0.1;
      const profileSharesCurrent = resolveCommonSharesCurrent({
        balance: data?.balance as Record<string, Array<number | null>> | undefined,
        income: data?.income as Record<string, Array<number | null>> | undefined,
      });
      const profileSharesOutstanding = typeof profile?.sharesOutstanding === "number" && Number.isFinite(profile.sharesOutstanding) && profile.sharesOutstanding > 0
        ? profile.sharesOutstanding
        : undefined;
      const sharesCurrent = profileSharesCurrent ?? profileSharesOutstanding ?? 1;
      const quarterlyCashSeries = getFieldSeries(data, "balance", "cashAndCashEquivalents");
      const latestQuarterlyCash = [...quarterlyCashSeries].reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
      const latestQuarterlyDebt = [...getFieldSeries(data, "balance", "totalDebt")].reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
      const profilePriceCurrent = typeof profile?.price === "number" && Number.isFinite(profile.price) && profile.price > 0
        ? profile.price
        : 1;

      setCorporateSnapshotLoading(true);
      setCorporateSnapshotError(null);
      try {
        const response = await fetch(withDebugQueryPath("/api/snapshot/corporate", debugEnabled), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            symbol: ticker,
            valuationYear: new Date().getUTCFullYear(),
            targetCurrency: lockedTargetCurrency,
            discountRate,
            market: {
              shares_current: sharesCurrent,
              price_current_TargetCurrency: profilePriceCurrent,
            },
            balanceSheet: { cash_t0_TargetCurrency: latestQuarterlyCash, debt_t0_TargetCurrency: latestQuarterlyDebt },
            financingPlan: corporateFinancingPlan,
            financingPlanByProject: corporateFinancingPlan?.financingPlanByProject,
            scenario: { mode: "spot" },
            fx: { source: "auto", anchor: "today", scenario: { mode: "spot" } },
            manualMetalPrices,
          }),
        });
        const result = await response.json() as {
          ok?: boolean;
          snapshot?: Record<string, unknown>;
          diagnostics?: { errors?: string[] } & Record<string, unknown>;
        };
        if (!isMounted) return;
        setCorporateDiagnostics((result.diagnostics ?? null) as Record<string, unknown> | null);
        if (!result.ok || !result.snapshot) {
          setCorporateSnapshotData(null);
          const diagnosticsErrors = Array.isArray(result.diagnostics?.errors)
            ? result.diagnostics.errors.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
          const errorDetails = diagnosticsErrors.length > 0
            ? `\n${diagnosticsErrors.join("\n")}`
            : "";
          setCorporateSnapshotError(`Snapshot request failed.${errorDetails}`);
          return;
        }
        setCorporateSnapshotData(result.snapshot as unknown as Record<string, unknown>);
      } catch (error) {
        if (!isMounted) return;
        setCorporateSnapshotData(null);
        setCorporateSnapshotError((error as Error).message);
      } finally {
        if (isMounted) {
          setCorporateSnapshotLoading(false);
        }
      }
    }

    void runCorporateSnapshot();
    return () => {
      isMounted = false;
    };
  }, [companyProjects.length, corporateFinancingPlan, data?.balance, data?.income, debugEnabled, lockedTargetCurrency, manualMetalPrices, primaryView, profile?.price, profile?.sharesOutstanding, riskAdjustedDiscountRatePctInput, ticker]);

  const revenueData = buildSeriesData(
    buildSeries(data, [{ label: "Revenue", statement: "income", field: "revenue" }]),
    10,
  );
  const revenueGrowthData = buildSeriesData(buildRevenueGrowthSeries(data), 10);
  const grossProfitRatioData = buildSeriesData(
    buildSeries(data, [{ label: "Gross Profit Ratio", statement: "income", field: "grossProfitRatio" }]),
    10,
  );
  const ebitdaMarginData = buildSeriesData(
    buildSeries(data, [{ label: "EBITDA Margin", statement: "income", field: "ebitdaratio" }]),
    10,
  );
  const netIncomeMarginData = buildSeriesData(
    buildSeries(data, [{ label: "Net Income Margin", statement: "income", field: "netIncomeRatio" }]),
    10,
  );
  const cashFromOperationsData = buildSeriesData(
    buildSeries(data, [{ label: "Operating Cash Flow", statement: "cashflow", field: "operatingCashFlow" }]),
    10,
  );
  const cashFromInvestingData = buildSeriesData(
    buildSeries(data, [{ label: "Cash From Investing", statement: "cashflow", field: "netCashUsedForInvestingActivites" }]),
    10,
  );
  const freeCashFlowData = buildSeriesData(
    buildSeries(data, [{ label: "Free Cash Flow", statement: "cashflow", field: "freeCashFlow" }]),
    10,
  );
  const freeCashFlowPerShareData = buildSeriesData(buildFreeCashFlowPerShareSeries(data), 10);
  const equityData = buildSeriesData(
    buildSeries(data, [{ label: "Total Equity", statement: "balance", field: "totalStockholdersEquity" }]),
    10,
  );
  const roeData = buildSeriesData(buildRoeSeries(data), 10);

  const sydingBaseOptions = {
    colors: ["#0b0b0b"],
    trendlines: {
      0: {
        type: "linear",
        color: "#0b0b0b",
        lineWidth: 1,
        opacity: 0.6,
      },
    },
  };

  const priceChartOptions = {
    backgroundColor: "#e0e9ce",
    colors: [
      PRICE_SERIES_COLORS.close,
      PRICE_SERIES_COLORS.sma200,
      PRICE_SERIES_COLORS.sma50,
      PRICE_SERIES_COLORS.sma20,
    ],
    legend: { position: "bottom" },
    hAxis: {
      format: "yyyy",
      slantedText: true,
      slantedTextAngle: 45,
    },
    series: {
      0: { lineWidth: 2 },
      1: { lineWidth: 1 },
      2: { lineWidth: 1 },
      3: { lineWidth: 1 },
    },
  };

  const combinedLongPriceVolumeData = useMemo(
    () => combinePriceAndVolumeSeries(priceData?.long?.price ?? null, priceData?.long?.volume ?? null, false),
    [priceData?.long?.price, priceData?.long?.volume],
  );
  const combinedShortPriceVolumeData = useMemo(
    () => combinePriceAndVolumeSeries(priceData?.short?.price ?? null, priceData?.short?.volume ?? null, true),
    [priceData?.short?.price, priceData?.short?.volume],
  );

  const longVolumeSummary = useMemo(() => summarizeChartSeries(priceData?.long?.volume ?? null), [priceData?.long?.volume]);
  const shortVolumeSummary = useMemo(() => summarizeChartSeries(priceData?.short?.volume ?? null), [priceData?.short?.volume]);
  const longVolumeData = longVolumeSummary.validNumericCount > 0 ? priceData?.long?.volume ?? null : null;
  const shortVolumeData = shortVolumeSummary.validNumericCount > 0 ? priceData?.short?.volume ?? null : null;

  useEffect(() => {
    if (!debugEnabled) return;
    console.debug("[single-stock-volume-series]", {
      ticker,
      source: "/api/company/price -> payload.long.volume/payload.short.volume",
      long: longVolumeSummary,
      short: shortVolumeSummary,
      merged: {
        longRows: combinedLongPriceVolumeData?.length ?? 0,
        shortRows: combinedShortPriceVolumeData?.length ?? 0,
      },
    });
  }, [combinedLongPriceVolumeData, combinedShortPriceVolumeData, debugEnabled, longVolumeSummary, shortVolumeSummary, ticker]);

  const lineBehindBars = {
    seriesType: "bars",
    series: {
      0: { type: "area", lineWidth: 2, color: "#0b0b0b", areaOpacity: 0.25 },
    },
    colors: ["#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b"],
    isStacked: true,
    vAxis: { format: "short" },
  };


  const fiscalDates = (data?.fiscal_dates?.length ? data.fiscal_dates : (data?.years ?? []).map((year) => `${year}-12-31`))
    .map((fiscalDate) => new Date(`${fiscalDate}T00:00:00Z`));

  const statementShares = (() => {
    const candidates = [
      getFieldSeries(data, "balance", "commonStockSharesOutstanding"),
      getFieldSeries(data, "balance", "sharesOutstanding"),
      getFieldSeries(data, "income", "weightedAverageShsOut"),
    ];
    return candidates.find((candidate) => candidate.some((value) => typeof value === "number")) ?? [];
  })();

  const quarterlySharesPoints = useMemo(() => {
    const quarterlyFiscalDates = (quarterlyData?.fiscal_dates ?? [])
      .map((fiscalDate) => new Date(`${fiscalDate}T00:00:00Z`));
    const quarterlyShareCandidates = [
      getFieldSeries(quarterlyData, "balance", "commonStockSharesOutstanding"),
      getFieldSeries(quarterlyData, "balance", "sharesOutstanding"),
      getFieldSeries(quarterlyData, "income", "weightedAverageShsOut"),
    ];
    const quarterlySharesSeries = quarterlyShareCandidates
      .find((candidate) => candidate.some((value) => typeof value === "number" && Number.isFinite(value))) ?? [];

    return quarterlyFiscalDates
      .map((date, index) => {
        const shares = quarterlySharesSeries[index];
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        if (typeof shares !== "number" || !Number.isFinite(shares) || shares <= 0) return null;
        return { date, shares };
      })
      .filter((point): point is { date: Date; shares: number } => Boolean(point))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [quarterlyData]);

  const cashSeries = getFieldSeries(data, "balance", "cashAndCashEquivalents");
  const operatingCashFlowSeries = getFieldSeries(data, "cashflow", "operatingCashFlow");
  const freeCashFlowSeries = getFieldSeries(data, "cashflow", "freeCashFlow");
  const capexSeries = getFieldSeries(data, "cashflow", "capitalExpenditure");
  const sbcSeries = getFieldSeries(data, "cashflow", "stockBasedCompensation");
  const generalAndAdministrativeSeries = getFieldSeries(data, "income", "generalAndAdministrativeExpenses");
  const commonStockIssuedSeries = getFieldSeries(data, "cashflow", "commonStockIssued");
  const netBorrowingsSeries = getFieldSeries(data, "cashflow", "netBorrowings");
  const hasAnyFiniteNonZero = (series: Array<number | null | undefined>) => series.some((value) => typeof value === "number" && Number.isFinite(value) && value !== 0);
  const gaSeriesRaw = generalAndAdministrativeSeries;
  const sgnaSeriesRaw = getFieldSeries(data, "income", "sellingGeneralAndAdministrativeExpenses");
  const operatingExpensesSeries = getFieldSeries(data, "income", "operatingExpenses");
  const overheadSeriesRaw = hasAnyFiniteNonZero(gaSeriesRaw)
    ? gaSeriesRaw
    : hasAnyFiniteNonZero(sgnaSeriesRaw)
      ? sgnaSeriesRaw
      : operatingExpensesSeries;
  const rdSeries = getFieldSeries(data, "income", "researchAndDevelopmentExpenses");
  const totalDebtSeries = getFieldSeries(data, "balance", "totalDebt");
  const shortTermDebtSeries = getFieldSeries(data, "balance", "shortTermDebt");
  const longTermDebtSeries = getFieldSeries(data, "balance", "longTermDebt");
  const currentLiabilitySeries = getFieldSeries(data, "balance", "totalCurrentLiabilities");
  const financingCashflowSeries = getFieldSeries(data, "cashflow", "netCashUsedProvidedByFinancingActivities");

  const buildDerivedSeries = (
    headers: string[],
    mapper: (index: number) => (number | null)[],
    maxRows = 12,
  ) => buildSeriesData({ headers, rows: fiscalDates.map((date, index) => [date, ...mapper(index)]) }, maxRows);

  const a1StatementCurrencyRaw =
    (data as any)?.financials?.currency
    ?? (data as any)?.reportedCurrency
    ?? (data as any)?.statementCurrency
    ?? profile?.currency
    ?? null;
  const a1StatementCurrency = typeof a1StatementCurrencyRaw === "string" && a1StatementCurrencyRaw.trim()
    ? a1StatementCurrencyRaw.trim().toUpperCase()
    : "USD";

  const cashBalanceBarsData = useMemo(() => {
    const rows = fiscalDates
      .map((date, index) => {
        const cash = cashSeries[index];
        if (typeof cash !== "number") return null;
        const previousCash = index > 0 ? cashSeries[index - 1] : null;
        const cashMM = cash / 1_000_000;
        const deltaMM = typeof previousCash === "number" ? (cash - previousCash) / 1_000_000 : null;
        return {
          date,
          cashMM,
          tooltipDate: date.getUTCFullYear(),
          hasDelta: typeof deltaMM === "number",
          deltaMM,
        };
      })
      .filter((row): row is { date: Date; cashMM: number; tooltipDate: number; hasDelta: boolean; deltaMM: number | null } => Boolean(row));

    if (rows.length === 0) {
      return null;
    }

    const trimmedRows = rows.slice(-15);
    const isQuarterly = (() => {
      const countsByYear = new Map<number, number>();
      trimmedRows.forEach((row) => {
        const year = row.date.getUTCFullYear();
        countsByYear.set(year, (countsByYear.get(year) ?? 0) + 1);
      });
      return Array.from(countsByYear.values()).some((count) => count > 1);
    })();

    return [
      ["Date", "Cash Balance (MM)"],
      ...trimmedRows.map((row) => {
        const quarter = Math.floor(row.date.getUTCMonth() / 3) + 1;
        const dateLabel = isQuarterly ? `${row.tooltipDate} Q${quarter}` : `${row.tooltipDate}`;
        const deltaLabel = row.hasDelta ? `${(row.deltaMM as number) >= 0 ? "+" : ""}${(row.deltaMM as number).toFixed(2)}` : "—";
        const formattedValue = `Date: ${dateLabel}\nCash: ${row.cashMM.toFixed(2)} ${a1StatementCurrency} million\nΔCash: ${deltaLabel} ${a1StatementCurrency} million`;
        return [row.date, { v: row.cashMM, f: formattedValue }];
      }),
    ] as unknown as (string | number | Date | null)[][];
  }, [cashSeries, fiscalDates, a1StatementCurrency]);

  const burnProxyRawSeries = fiscalDates.map((_, index) => {
    const fcf = freeCashFlowSeries[index];
    if (typeof fcf === "number") {
      return Math.max(0, -fcf);
    }
    const ocf = operatingCashFlowSeries[index];
    const capex = capexSeries[index];
    if (typeof ocf === "number" && typeof capex === "number") {
      return Math.max(0, -(ocf - capex));
    }
    if (typeof ocf === "number") {
      return Math.max(0, -ocf);
    }
    return null;
  });

  const safeFiniteOrNull = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);

  const a3BurnVsCapitalAvailableData = useMemo(() => {
    const rows = fiscalDates
      .map((date, index) => {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

        const burnRaw = burnProxyRawSeries[index];
        const burnMM = typeof burnRaw === "number" ? safeFiniteOrNull(burnRaw / 1_000_000) : null;

        const previousCash = index > 0 ? cashSeries[index - 1] : null;
        const startingCashMM = typeof previousCash === "number" ? safeFiniteOrNull(previousCash / 1_000_000) : null;

        const equityRaw = commonStockIssuedSeries[index];
        const debtRaw = netBorrowingsSeries[index];
        const equityMM = typeof equityRaw === "number" ? safeFiniteOrNull(equityRaw / 1_000_000) : null;
        const debtMM = typeof debtRaw === "number" ? safeFiniteOrNull(debtRaw / 1_000_000) : null;
        const financingInflowsMM = safeFiniteOrNull((equityMM ?? 0) + (debtMM ?? 0));
        const availableMM = startingCashMM === null ? null : safeFiniteOrNull(startingCashMM + (financingInflowsMM ?? 0));

        const dateLabel = date.toISOString().slice(0, 10);
        const formatMM = (value: number | null) => value === null ? "—" : `${value.toFixed(2)} ${a1StatementCurrency} million`;
        const burnLabel = formatMM(burnMM);
        const startingCashLabel = formatMM(startingCashMM);
        const financingLabel = formatMM(financingInflowsMM);
        const equityLabel = formatMM(equityMM);
        const debtLabel = formatMM(debtMM);
        const availableLabel = formatMM(availableMM);

        return [
          date,
          burnMM,
          availableMM,
          `Date: ${dateLabel}
Burn Proxy: ${burnLabel}
Starting Cash (t-1): ${startingCashLabel}
Financing Inflows: ${financingLabel} (Equity: ${equityLabel}; Debt: ${debtLabel})
Capital Available: ${availableLabel}`,
        ] as (string | number | Date | null)[];
      })
      .filter((row): row is (string | number | Date | null)[] => row !== null)
      .slice(-10);

    if (rows.length === 0) return null;
    return [["Date", "Burn Proxy", "Capital Available", { role: "tooltip", type: "string" }], ...rows] as (string | number | Date | null)[][];
  }, [a1StatementCurrency, burnProxyRawSeries, cashSeries, commonStockIssuedSeries, fiscalDates, netBorrowingsSeries]);

  const burnRateTtmData = buildDerivedSeries(["Date", "Burn Rate TTM"], (index) => {
    if (index < 3) return [null];
    const window = burnProxyRawSeries.slice(index - 3, index + 1);
    if (window.some((v) => typeof v !== "number")) return [null];
    const total = (window as number[]).reduce((acc, value) => acc + value, 0);
    return [total / 12];
  }, 15);

  const hasQuarterlyPeriods = (() => {
    const countsByYear = new Map<number, number>();
    fiscalDates.forEach((date) => {
      const year = date.getUTCFullYear();
      countsByYear.set(year, (countsByYear.get(year) ?? 0) + 1);
    });
    return Array.from(countsByYear.values()).some((count) => count > 1);
  })();
  const monthsInPeriod = hasQuarterlyPeriods ? 3 : 12;

  const runwayMonthsRawSeries = fiscalDates.map((_, index) => {
    const cash = cashSeries[index];
    const burnPeriod = burnProxyRawSeries[index];
    if (typeof cash !== "number" || typeof burnPeriod !== "number") return null;
    const burnPerMonth = burnPeriod / monthsInPeriod;
    if (!Number.isFinite(burnPerMonth) || burnPerMonth <= 0) return null;
    const runway = cash / burnPerMonth;
    return Number.isFinite(runway) ? runway : null;
  });

  const runwayMonthsData = buildDerivedSeries(["Date", "Runway Months"], (index) => {
    const runway = runwayMonthsRawSeries[index];
    return [typeof runway === "number" ? runway : null];
  }, 15);

  const burnDecompositionMaxRows = hasQuarterlyPeriods ? 40 : 10;
  const burnDecompositionData = buildDerivedSeries(["Date", "Capex (abs)", "SBC (proxy)", "R&D (proxy)", "Other within burn"], (index) => {
    const burnRaw = burnProxyRawSeries[index];
    const burn = typeof burnRaw === "number" ? safeFiniteOrNull(Math.max(0, burnRaw) / 1_000_000) : null;
    if (burn === null) return [null, null, null, null];

    const capexRaw = typeof capexSeries[index] === "number" ? Math.abs(capexSeries[index] as number) / 1_000_000 : 0;
    const sbcRaw = typeof sbcSeries[index] === "number" ? Math.max(0, (sbcSeries[index] as number) / 1_000_000) : 0;
    const rdRaw = typeof rdSeries[index] === "number" ? Math.max(0, (rdSeries[index] as number) / 1_000_000) : 0;

    const capex = Math.min(burn, safeFiniteOrNull(capexRaw) ?? 0);
    const sbc = Math.min(Math.max(0, burn - capex), safeFiniteOrNull(sbcRaw) ?? 0);
    const rd = Math.min(Math.max(0, burn - capex - sbc), safeFiniteOrNull(rdRaw) ?? 0);
    const other = safeFiniteOrNull(Math.max(0, burn - capex - sbc - rd));

    return [capex, sbc, rd, other];
  }, burnDecompositionMaxRows);

  const cashBridgeData = buildDerivedSeries(["Date", "Operating", "Investing", "Financing"], (index) => [
    operatingCashFlowSeries[index] ?? null,
    getFieldSeries(data, "cashflow", "netCashUsedForInvestingActivites")[index] ?? null,
    financingCashflowSeries[index] ?? null,
  ], 15);

  const next12mSurvivalData = buildDerivedSeries(["Date", "Runway Months", "12M Threshold"], (index) => {
    const runway = runwayMonthsRawSeries[index];
    return [typeof runway === "number" ? runway : null, 12];
  }, 15);

  const sharesOutstandingData = buildDerivedSeries(["Date", "Shares Outstanding"], (index) => [statementShares[index] ?? null], 15);
  const dilutionRateRawSeries = fiscalDates.map((_, index) => {
    if (index === 0) return null;
    const current = statementShares[index];
    const previous = statementShares[index - 1];
    if (typeof current !== "number" || typeof previous !== "number" || previous <= 0) return null;
    const dilution = current / previous - 1;
    if (Math.abs(dilution) > 3) return null;
    return dilution * 100;
  });
  const dilutionRateData = buildDerivedSeries(["Date", "Dilution Rate YoY"], (index) => [dilutionRateRawSeries[index]], 15);

  const cashPerShareData = buildDerivedSeries(["Date", "Cash per Share"], (index) => {
    const cash = cashSeries[index];
    const shares = statementShares[index];
    if (typeof cash !== "number" || typeof shares !== "number" || shares === 0) return [null];
    return [cash / shares];
  }, 15);

  const historicalClosePoints = useMemo(() => {
    const source = priceData?.long?.price;
    if (!source || source.length < 2) return [] as { date: Date; close: number }[];
    return source.slice(1)
      .map((row) => {
        const [rawDate, ...rest] = row;
        const date = parseChartDate(rawDate);
        const close = rest.find((value) => typeof value === "number" && Number.isFinite(value));
        if (!date || Number.isNaN(date.getTime()) || typeof close !== "number" || !Number.isFinite(close)) return null;
        return { date, close };
      })
      .filter((point): point is { date: Date; close: number } => Boolean(point))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [priceData]);

  const marketCapVsSharesData = buildDerivedSeries(["Date", "Implied Market Cap"], (index) => {
    const QUARTERLY_SHARES_RECENCY_MS = 18 * 30 * 24 * 60 * 60 * 1000;
    const anchorDate = fiscalDates[index];
    if (!(anchorDate instanceof Date) || Number.isNaN(anchorDate.getTime())) return [null];
    const annualShares = statementShares[index];
    const getSharesForAnchor = () => {
      if (typeof annualShares === "number" && Number.isFinite(annualShares) && annualShares > 0) {
        return annualShares;
      }
      let fallbackQuarterlyPoint: { date: Date; shares: number } | null = null;
      for (const point of quarterlySharesPoints) {
        if (point.date.getTime() <= anchorDate.getTime()) {
          fallbackQuarterlyPoint = point;
        } else {
          break;
        }
      }
      if (!fallbackQuarterlyPoint) return null;
      if (anchorDate.getTime() - fallbackQuarterlyPoint.date.getTime() > QUARTERLY_SHARES_RECENCY_MS) return null;
      return fallbackQuarterlyPoint.shares;
    };
    const shares = getSharesForAnchor();
    if (typeof shares !== "number" || !Number.isFinite(shares) || shares <= 0) return [null];
    let chosen: { date: Date; close: number } | null = null;
    for (const point of historicalClosePoints) {
      if (point.date.getTime() <= anchorDate.getTime()) {
        chosen = point;
      } else {
        break;
      }
    }
    if (!chosen) return [null];
    const impliedMarketCap = chosen.close * shares;
    if (!Number.isFinite(impliedMarketCap)) return [null];
    const marketCapMM = impliedMarketCap / 1_000_000;
    const sharesMM = shares / 1_000_000;
    const tooltip = `Close price: ${chosen.close.toFixed(2)}\nShares: ${shares.toLocaleString("en-US", { maximumFractionDigits: 0 })}\nShares (millions): ${sharesMM.toFixed(2)}\nImplied market cap: ${marketCapMM.toFixed(2)} ${a1StatementCurrency} million`;
    return [{ v: marketCapMM, f: tooltip } as unknown as number];
  }, 15);

  const sbcData = buildDerivedSeries(["Date", "SBC (millions)"], (index) => {
    const sbc = sbcSeries[index];
    if (typeof sbc !== "number" || !Number.isFinite(sbc)) return [null];
    const sbcMM = sbc / 1_000_000;
    if (!Number.isFinite(sbcMM)) return [null];
    return [{ v: sbcMM, f: `SBC: ${sbcMM.toFixed(2)} ${a1StatementCurrency} million` } as unknown as number];
  }, 15);
  const sbcIntensityRawSeries = fiscalDates.map((_, index) => {
    const sbc = sbcSeries[index];
    const burn = burnProxyRawSeries[index];
    if (typeof sbc !== "number" || !Number.isFinite(sbc)) return null;
    if (typeof burn !== "number" || !Number.isFinite(burn) || burn <= 0) return null;
    const ratio = sbc / burn;
    return Number.isFinite(ratio) ? ratio : null;
  });
  const sbcIntensityData = buildDerivedSeries(["Date", "SBC / Burn"], (index) => [sbcIntensityRawSeries[index]], 15);
  const allInDilutionData = buildDerivedSeries(["Date", "Equity financing inflow", "SBC expense"], (index) => {
    const issued = commonStockIssuedSeries[index];
    const sbc = sbcSeries[index];
    const issuedMM = typeof issued === "number" && Number.isFinite(issued) ? issued / 1_000_000 : null;
    const sbcMM = typeof sbc === "number" && Number.isFinite(sbc) ? sbc / 1_000_000 : null;
    return [
      issuedMM === null ? null : ({ v: issuedMM, f: `Equity financing inflow (Common Stock Issued): ${issuedMM.toFixed(2)} ${a1StatementCurrency} million` } as unknown as number),
      sbcMM === null ? null : ({ v: sbcMM, f: `SBC expense (non-cash): ${sbcMM.toFixed(2)} ${a1StatementCurrency} million` } as unknown as number),
    ];
  }, 15);

  const corporateOverheadData = buildDerivedSeries(["Date", "Corporate Overhead"], (index) => {
    const overheadRaw = overheadSeriesRaw[index];
    if (typeof overheadRaw !== "number" || !Number.isFinite(overheadRaw)) return [null];
    return [Math.abs(overheadRaw) / 1_000_000];
  }, 15);
  const explorationProxyData = buildDerivedSeries(["Date", "Exploration Proxy"], (index) => {
    const operatingCashFlow = operatingCashFlowSeries[index];
    if (typeof operatingCashFlow !== "number" || !Number.isFinite(operatingCashFlow)) return [null];

    const burnFromOcf = Math.max(0, -operatingCashFlow);
    if (!Number.isFinite(burnFromOcf) || burnFromOcf === 0) return [0];

    const sbcCash = typeof sbcSeries[index] === "number" && Number.isFinite(sbcSeries[index] as number)
      ? (sbcSeries[index] as number)
      : 0;
    const gaCashProxy = typeof generalAndAdministrativeSeries[index] === "number" && Number.isFinite(generalAndAdministrativeSeries[index] as number)
      ? (generalAndAdministrativeSeries[index] as number)
      : 0;

    const explorationProxyRaw = burnFromOcf - sbcCash - gaCashProxy;
    if (!Number.isFinite(explorationProxyRaw)) return [null];

    const explorationProxy = Math.max(0, explorationProxyRaw);
    return [Number.isFinite(explorationProxy) ? explorationProxy / 1_000_000 : null];
  }, 15);
  const spendMixData = buildDerivedSeries(["Date", "Overhead", "R&D", "Capex (abs)"], (index) => [
    overheadSeriesRaw[index] ?? null,
    rdSeries[index] ?? null,
    typeof capexSeries[index] === "number" ? Math.abs(capexSeries[index] as number) : null,
  ], 15);
  const overheadRatioData = buildDerivedSeries(["Date", "Overhead Ratio"], (index) => {
    const overhead = overheadSeriesRaw[index];
    const fcf = freeCashFlowSeries[index];
    if (typeof overhead !== "number" || typeof fcf !== "number" || fcf === 0) return [null];
    return [(overhead / Math.abs(fcf)) * 100];
  }, 15);
  const vceProxyData = buildDerivedSeries(["Date", "VCE Proxy"], (index) => {
    const fcf = freeCashFlowSeries[index];
    const overhead = overheadSeriesRaw[index];
    if (typeof fcf !== "number" || typeof overhead !== "number" || overhead === 0) return [null];
    return [fcf / Math.abs(overhead)];
  }, 15);
  const vceVsOverheadData = buildDerivedSeries(["Date", "VCE Proxy", "Overhead"], (index) => {
    const vce = vceProxyData?.[index + 1]?.[1] as number | null | undefined;
    return [typeof vce === "number" ? vce : null, overheadSeriesRaw[index] ?? null];
  }, 15);

  const netCashDebtData = buildDerivedSeries(["Date", "Net Cash / Net Debt"], (index) => {
    const cash = cashSeries[index];
    const debt = totalDebtSeries[index];
    if (typeof cash !== "number" || typeof debt !== "number") return [null];
    const netCashMM = (cash - debt) / 1_000_000;
    const cashMM = cash / 1_000_000;
    const debtMM = debt / 1_000_000;
    const tooltip = `Net cash: ${netCashMM.toFixed(2)} ${a1StatementCurrency} million\nCash: ${cashMM.toFixed(2)} ${a1StatementCurrency} million\nTotal debt: ${debtMM.toFixed(2)} ${a1StatementCurrency} million`;
    return [{ v: netCashMM, f: tooltip } as unknown as number];
  }, 15);
  const debtMaturityMixData = buildDerivedSeries(["Date", "Short-Term Debt", "Long-Term Debt"], (index) => {
    const shortTerm = shortTermDebtSeries[index];
    const longTerm = longTermDebtSeries[index];
    const shortMM = typeof shortTerm === "number" ? shortTerm / 1_000_000 : null;
    const longMM = typeof longTerm === "number" ? longTerm / 1_000_000 : null;
    if (shortMM === null && longMM === null) return [null, null];
    const totalMM = (shortMM ?? 0) + (longMM ?? 0);
    return [
      shortMM === null ? null : ({ v: shortMM, f: `ST debt: ${shortMM.toFixed(2)} ${a1StatementCurrency} million\nLT debt: ${(longMM ?? 0).toFixed(2)} ${a1StatementCurrency} million\nTotal: ${totalMM.toFixed(2)} ${a1StatementCurrency} million` } as unknown as number),
      longMM === null ? null : ({ v: longMM, f: `ST debt: ${(shortMM ?? 0).toFixed(2)} ${a1StatementCurrency} million\nLT debt: ${longMM.toFixed(2)} ${a1StatementCurrency} million\nTotal: ${totalMM.toFixed(2)} ${a1StatementCurrency} million` } as unknown as number),
    ];
  }, 15);
  const cashVsObligationsData = buildDerivedSeries(["Date", "Cash", "Current Liabilities"], (index) => {
    const cash = cashSeries[index];
    const liabilities = currentLiabilitySeries[index];
    const cashMM = typeof cash === "number" ? cash / 1_000_000 : null;
    const liabilitiesMM = typeof liabilities === "number" ? liabilities / 1_000_000 : null;
    return [
      cashMM === null ? null : ({ v: cashMM, f: `Cash: ${cashMM.toFixed(2)} ${a1StatementCurrency} million\nCurrent liabilities: ${(liabilitiesMM ?? 0).toFixed(2)} ${a1StatementCurrency} million` } as unknown as number),
      liabilitiesMM === null ? null : ({ v: liabilitiesMM, f: `Cash: ${(cashMM ?? 0).toFixed(2)} ${a1StatementCurrency} million\nCurrent liabilities: ${liabilitiesMM.toFixed(2)} ${a1StatementCurrency} million` } as unknown as number),
    ];
  }, 15);
  const financingInflowsData = buildDerivedSeries(["Date", "Financing Inflows"], (index) => {
    const inflow = commonStockIssuedSeries[index];
    if (typeof inflow !== "number") return [null];
    const inflowMM = inflow / 1_000_000;
    return [{ v: inflowMM, f: `${inflowMM.toFixed(2)} ${a1StatementCurrency} million` } as unknown as number];
  }, 15);
  const financingFrequencyData = buildDerivedSeries(["Date", "Financing Frequency (8p)"], (index) => {
    if (index < 2) return [null];
    const windowStart = Math.max(0, index - 7);
    const windowValues = commonStockIssuedSeries.slice(windowStart, index + 1).filter((value): value is number => typeof value === "number");
    if (windowValues.length < 3) return [null];
    const positives = windowValues.filter((value) => value > 0).length;
    const freq = positives / windowValues.length;
    const tooltip = `${freq.toFixed(2)} index\n${positives}/${windowValues.length} periods with inflow > 0`;
    return [{ v: freq, f: tooltip } as unknown as number];
  }, 15);

  const burnAccelerationRawSeries = fiscalDates.map((_, index) => {
    if (index === 0) return null;
    const current = burnProxyRawSeries[index];
    const previous = burnProxyRawSeries[index - 1];
    if (typeof current !== "number" || typeof previous !== "number") return null;
    return (current - previous) / 1_000_000;
  });

  const runwayRiskBandsData = buildDerivedSeries(["Date", "Runway", "12M", "6M"], (index) => {
    const runway = runwayMonthsRawSeries[index];
    if (typeof runway !== "number") return [null, 12, 6];
    const capped = Math.min(runway, 36);
    const tooltip = runway > 36 ? `>36 months (actual: ${runway.toFixed(1)})` : `${runway.toFixed(1)} months`;
    return [{ v: capped, f: tooltip } as unknown as number, 12, 6];
  }, 15);
  const burnAccelerationData = buildDerivedSeries(["Date", "Burn Acceleration"], (index) => [burnAccelerationRawSeries[index]], 15);
  const dilutionVsRunwayData = buildDerivedSeries(["Date", "Dilution Rate", "Runway Months"], (index) => [
    dilutionRateRawSeries[index],
    runwayMonthsRawSeries[index],
  ], 15);
  const governanceLeakRawSeries = fiscalDates.map((_, index) => {
    const dilution = dilutionRateRawSeries[index];
    const sbcIntensity = sbcIntensityRawSeries[index];
    if (typeof dilution !== "number" && typeof sbcIntensity !== "number") return null;
    return ((dilution ?? 0) + (sbcIntensity ?? 0)) / 100;
  });
  const governanceLeakIndexData = buildDerivedSeries(["Date", "Governance Leak Index"], (index) => [governanceLeakRawSeries[index]], 15);
  const survivalScoreData = buildDerivedSeries(["Date", "Survival Score"], (index) => {
    const runway = runwayMonthsRawSeries[index];
    const dilutionPercent = dilutionRateRawSeries[index];
    const burnAccel = burnAccelerationRawSeries[index];
    const governanceLeak = governanceLeakRawSeries[index];
    if (typeof runway !== "number" || typeof dilutionPercent !== "number") return [null];
    const runwayScore = Math.max(0, Math.min(10, runway / 2));
    const dilutionPenalty = Math.max(0, Math.min(10, dilutionPercent * 0.5));
    const leakPenalty = typeof governanceLeak === "number" ? Math.max(0, Math.min(3, governanceLeak * 1.5)) : 0;
    const burnPenalty = typeof burnAccel === "number" && burnAccel > 0 ? Math.min(2, burnAccel / 50) : 0;
    const score = Math.max(0, Math.min(10, runwayScore - dilutionPenalty - leakPenalty - burnPenalty));
    const tooltip = `Score: ${score.toFixed(2)}\nRunway score: ${runwayScore.toFixed(2)}\nDilution penalty: -${dilutionPenalty.toFixed(2)}\nLeak penalty: -${leakPenalty.toFixed(2)}\nBurn penalty: -${burnPenalty.toFixed(2)}`;
    return [{ v: score, f: tooltip } as unknown as number];
  }, 15);

  const revenueVsCostData = buildSeriesData(
    buildSeries(data, [
      { label: "Revenue", statement: "income", field: "revenue" },
      { label: "Cost of Revenue", statement: "income", field: "costOfRevenue" },
    ]),
    15,
  );
  const grossProfitVsExpensesData = buildSeriesData(
    buildSeries(data, [
      { label: "Gross Profit", statement: "income", field: "grossProfit" },
      { label: "Selling & Marketing", statement: "income", field: "sellingAndMarketingExpenses" },
      { label: "G&A", statement: "income", field: "generalAndAdministrativeExpenses" },
      { label: "R&D", statement: "income", field: "researchAndDevelopmentExpenses" },
      { label: "Other Expenses", statement: "income", field: "otherExpenses" },
    ]),
    15,
  );
  const operatingProfitVsDepData = buildSeriesData(buildOperatingProfitVsDepSeries(data), 15);
  const ebitVsInterestData = buildSeriesData(buildOperatingIncomeVsInterestSeries(data), 15);
  const netEarningsData = buildSeriesData(computeNetEarningsSeries(data), 15);
  const netEarningsPerShareData = buildSeriesData(buildNetEarningsPerShareSeries(data), 15);

  const cashVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "cashAndShortTermInvestments"),
    15,
  );
  const cashVsShortTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "Short Term Debt", statement: "balance", field: "shortTermDebt" },
      { label: "Cash & Short Term Investments", statement: "balance", field: "cashAndShortTermInvestments" },
    ]),
    15,
  );
  const inventoryVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "inventory"),
    15,
  );
  const ppeVsDepData = buildSeriesData(
    buildSeries(data, [
      { label: "Property Plant Equipment", statement: "balance", field: "propertyPlantEquipmentNet" },
      { label: "Depreciation", statement: "income", field: "depreciationAndAmortization" },
    ]),
    15,
  );
  const goodwillData = buildSeriesData(
    buildSeries(data, [{ label: "Goodwill", statement: "balance", field: "goodwill" }]),
    15,
  );
  const debtMixData = buildSeriesData(
    buildSeries(data, [
      { label: "Short Term Debt", statement: "balance", field: "shortTermDebt" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
    15,
  );
  const ebitdaVsLongTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "EBITDA", statement: "income", field: "ebitda" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
    15,
  );
  const currentRatioData = buildSeriesData(buildCurrentRatioSeries(data), 15);
  const longTermDebtToNetEarningsData = buildSeriesData(buildLongTermDebtToNetEarningsSeries(data), 15);
  const debtToEquityData = buildSeriesData(buildDebtToEquitySeries(data), 15);
  const adjustedDebtToEquityData = buildSeriesData(buildAdjustedDebtToEquitySeries(data), 15);
  const retainedEarningsData = buildSeriesData(
    buildSeries(data, [
      { label: "Net Income", statement: "income", field: "netIncome" },
      { label: "Retained Earnings", statement: "balance", field: "retainedEarnings" },
    ]),
    15,
  );

  const capexVsNetEarningsData = buildSeriesData(
    buildCapitalExpenditureVsNetEarningsSeries(data),
    15,
  );
  const buybacksDividendsData = buildSeriesData(
    buildBuybacksDividendsSeries(data),
    15,
  );


  const producerCore = useMemo(() => (data?.producer_core as ProducerCorePanel | undefined) ?? null, [data]);
  const rrOverlay = useMemo(() => (data?.rr_overlay as RrOverlayPanel | undefined) ?? null, [data]);
  const producerCoreMissing = !producerCore || !producerCore.efficiency;
  const rrOverlayMissing = !rrOverlay || Object.keys(rrOverlay).length === 0;
  const rrDiscountRatePct = rrDiscountRateInput.trim() ? Number(rrDiscountRateInput) : null;
  const rrDiscountRate = rrDiscountRatePct !== null && Number.isFinite(rrDiscountRatePct) && rrDiscountRatePct > 0 && rrDiscountRatePct <= 25
    ? rrDiscountRatePct / 100
    : null;
  const rrNetDebt = typeof (rrOverlay as any)?.rr_net_debt === "number"
    ? Number((rrOverlay as any).rr_net_debt)
    : typeof (producerCore as any)?.efficiency?.balance_sheet?.net_debt === "number"
      ? Number((producerCore as any).efficiency.balance_sheet.net_debt)
      : null;
  const medianFcf5Y = typeof (producerCore as any)?.value?.medians_5Y?.median_fcf === "number"
    ? Number((producerCore as any).value.medians_5Y.median_fcf)
    : null;
  const statementDerivedSharesOutstanding = (() => {
    const candidates = [
      (data?.balance as any)?.sharesOutstanding,
      (data?.balance as any)?.commonStockSharesOutstanding,
      (data?.income as any)?.weightedAverageShsOut,
      (data?.income as any)?.weightedAverageShsOutDil,
    ];
    for (const series of candidates) {
      if (!Array.isArray(series)) continue;
      for (let i = series.length - 1; i >= 0; i -= 1) {
        const v = series[i];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          return v;
        }
      }
    }
    return null;
  })();
  const sharesOutstanding =
    toFiniteNumber((profile as any)?.sharesOutstanding) ??
    toFiniteNumber((data as any)?.quote?.sharesOutstanding) ??
    statementDerivedSharesOutstanding;

  const totalDebt = (() => {
    const series = (data?.balance as any)?.totalDebt;
    if (!Array.isArray(series)) return null;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const value = toFiniteNumber(series[i]);
      if (value !== null) return value;
    }
    return null;
  })();
  const cashAndShortTermInvestments = (() => {
    const series = (data?.balance as any)?.cashAndShortTermInvestments;
    if (!Array.isArray(series)) return null;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const value = toFiniteNumber(series[i]);
      if (value !== null) return value;
    }
    return null;
  })();
  const marketCapForEv =
    toFiniteNumber((profile as any)?.mktCap) ??
    toFiniteNumber((profile as any)?.marketCap) ??
    toFiniteNumber((data as any)?.quote?.marketCap);
  const currentEnterpriseValue = marketCapForEv !== null && totalDebt !== null && cashAndShortTermInvestments !== null
    ? marketCapForEv + totalDebt - cashAndShortTermInvestments
    : null;

  const fv2Ev = rrDiscountRate !== null && medianFcf5Y !== null && medianFcf5Y > 0
    ? medianFcf5Y / rrDiscountRate
    : null;
  const fv2Equity = fv2Ev !== null && rrNetDebt !== null ? fv2Ev - rrNetDebt : null;
  const fv2PerShare = fv2Equity !== null && sharesOutstanding !== null && sharesOutstanding > 0
    ? fv2Equity / sharesOutstanding
    : null;
  const fv2EvSignal = fv2Ev !== null && fv2Ev > 0 && currentEnterpriseValue !== null && currentEnterpriseValue > 0
    ? currentEnterpriseValue / fv2Ev
    : null;
  const fv2Flags = {
    missing_median_fcf: medianFcf5Y === null || medianFcf5Y <= 0,
    missing_net_debt: rrNetDebt === null,
    missing_shares: sharesOutstanding === null || sharesOutstanding <= 0,
    invalid_discount_rate: rrDiscountRate === null || rrDiscountRate <= 0,
  };
  const missingEvForFv2 = currentEnterpriseValue === null || currentEnterpriseValue <= 0;
  const rrInputsReady = rrDiscountRate !== null && rrDiscountRate > 0;

  const fiscalYearEndMonth =
    parseFiscalYearEndMonth(data?.fiscal_year_end_month) ??
    parseFiscalYearEndMonth(data?.fiscal_year_end) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEndMonth) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEnd);

  const exchangeDisplay = [
    profile?.exchangeShortName,
    profile?.exchange,
    profile?.exchangeSymbol,
    profile?.symbolExchange,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  const priceResolved = pickFirstFiniteCandidate([
    { path: "profile.price", value: profile?.price },
    { path: "data.quote.price", value: (data as any)?.quote?.price },
  ]);
  const priceValue = priceResolved?.value ?? null;

  const sharesResolved = pickFirstFiniteCandidate([
    { path: "profile.sharesOutstanding", value: (profile as any)?.sharesOutstanding },
    { path: "data.quote.sharesOutstanding", value: (data as any)?.quote?.sharesOutstanding },
    { path: "data.balance.sharesOutstanding[last finite]", value: lastFinitePositiveFromSeries((data as any)?.balance?.sharesOutstanding) },
    { path: "data.balance.commonStockSharesOutstanding[last finite]", value: lastFinitePositiveFromSeries((data as any)?.balance?.commonStockSharesOutstanding) },
    { path: "data.income.weightedAverageShsOut[last finite]", value: lastFinitePositiveFromSeries((data as any)?.income?.weightedAverageShsOut) },
    { path: "data.income.weightedAverageShsOutDil[last finite]", value: lastFinitePositiveFromSeries((data as any)?.income?.weightedAverageShsOutDil) },
  ]);
  const sharesValue = sharesResolved?.value ?? null;

  const marketCapDirectResolved = pickFirstFiniteCandidate([
    { path: "profile.mktCap", value: (profile as any)?.mktCap },
    { path: "profile.marketCap", value: (profile as any)?.marketCap },
    { path: "data.quote.marketCap", value: (data as any)?.quote?.marketCap },
  ]);
  const computedMarketCapValue =
    priceValue !== null && sharesValue !== null && sharesValue > 0
      ? priceValue * sharesValue
      : null;
  const marketCapDirectValue = marketCapDirectResolved?.value ?? null;
  const marketCapDisagreementPct =
    marketCapDirectValue !== null && computedMarketCapValue !== null && marketCapDirectValue > 0
      ? Math.abs(computedMarketCapValue - marketCapDirectValue) / marketCapDirectValue
      : null;
  const marketCapUseComputed =
    marketCapDirectValue === null
    || (marketCapDisagreementPct !== null && marketCapDisagreementPct > 0.2);
  const marketCapValue = marketCapUseComputed ? computedMarketCapValue : marketCapDirectValue;
  const marketCapSourceMode: "profile_direct" | "computed_price_times_shares" | "other" =
    marketCapUseComputed
      ? "computed_price_times_shares"
      : marketCapDirectResolved?.path?.startsWith("profile.")
        ? "profile_direct"
        : "other";
  const marketCapSourcePath = marketCapUseComputed
    ? (priceResolved && sharesResolved ? `${priceResolved.path} * ${sharesResolved.path}` : null)
    : (marketCapDirectResolved?.path ?? null);

  const statementCurrencyRaw =
    (data as any)?.financials?.currency
    ?? (data as any)?.reportedCurrency
    ?? (data as any)?.statementCurrency
    ?? profile?.currency
    ?? null;
  const statementCurrency = typeof statementCurrencyRaw === "string" && statementCurrencyRaw.trim()
    ? statementCurrencyRaw.trim().toUpperCase()
    : "USD";
  const marketCurrencyRaw = profile?.currency ?? statementCurrency;
  const marketCurrency = typeof marketCurrencyRaw === "string" && marketCurrencyRaw.trim()
    ? marketCurrencyRaw.trim().toUpperCase()
    : statementCurrency;
  const mixedCurrency = statementCurrency !== marketCurrency;
  const mixedCurrencyNote = mixedCurrency
    ? `Market data uses ${marketCurrency} while statements use ${statementCurrency}.`
    : undefined;
  const companyProfileMarketCapDebug = {
    ticker: ticker || null,
    price_displayed: priceValue,
    price_source_path: priceResolved?.path ?? null,
    price_raw_value: priceResolved ? (priceResolved.path === "profile.price" ? profile?.price : (data as any)?.quote?.price) : null,
    market_cap_displayed: marketCapValue,
    market_cap_source_mode: marketCapSourceMode,
    market_cap_source_path: marketCapSourcePath,
    market_cap_raw_value: marketCapUseComputed ? computedMarketCapValue : marketCapDirectValue,
    shares_displayed: sharesValue,
    shares_source_path: sharesResolved?.path ?? null,
    shares_raw_value: sharesResolved ? (() => {
      if (sharesResolved.path === "profile.sharesOutstanding") return (profile as any)?.sharesOutstanding;
      if (sharesResolved.path === "data.quote.sharesOutstanding") return (data as any)?.quote?.sharesOutstanding;
      if (sharesResolved.path.startsWith("data.balance.sharesOutstanding")) return lastFinitePositiveFromSeries((data as any)?.balance?.sharesOutstanding);
      if (sharesResolved.path.startsWith("data.balance.commonStockSharesOutstanding")) return lastFinitePositiveFromSeries((data as any)?.balance?.commonStockSharesOutstanding);
      if (sharesResolved.path.startsWith("data.income.weightedAverageShsOutDil")) return lastFinitePositiveFromSeries((data as any)?.income?.weightedAverageShsOutDil);
      if (sharesResolved.path.startsWith("data.income.weightedAverageShsOut")) return lastFinitePositiveFromSeries((data as any)?.income?.weightedAverageShsOut);
      return null;
    })() : null,
    market_cap_currency: marketCurrency,
    price_currency: marketCurrency,
    shares_unit_basis: "common shares",
    computed_market_cap_from_displayed_price_and_shares: computedMarketCapValue,
    difference_vs_displayed_market_cap:
      marketCapValue !== null && computedMarketCapValue !== null
        ? computedMarketCapValue - marketCapValue
        : null,
    percentage_difference:
      marketCapValue !== null && computedMarketCapValue !== null && marketCapValue !== 0
        ? ((computedMarketCapValue - marketCapValue) / marketCapValue) * 100
        : null,
    direct_profile_market_cap_value: marketCapDirectValue,
    direct_profile_market_cap_path: marketCapDirectResolved?.path ?? null,
    direct_vs_computed_difference:
      marketCapDirectValue !== null && computedMarketCapValue !== null
        ? computedMarketCapValue - marketCapDirectValue
        : null,
    direct_vs_computed_pct:
      marketCapDisagreementPct !== null
        ? marketCapDisagreementPct * 100
        : null,
    fx_conversion_used: false,
    stale_last_updated: {
      profile_last_update: (profile as any)?.lastUpdate ?? null,
      profile_timestamp: (profile as any)?.timestamp ?? null,
      quote_timestamp: (data as any)?.quote?.timestamp ?? null,
      data_fetched_at: (data as any)?.fetchedAt ?? null,
      corporate_snapshot_generated_at: (corporateDiagnostics as any)?.generated_at ?? null,
    },
    profile_field_candidates: [
      { path: "profile.mktCap", value: (profile as any)?.mktCap },
      { path: "profile.marketCap", value: (profile as any)?.marketCap },
      { path: "profile.sharesOutstanding", value: (profile as any)?.sharesOutstanding },
      { path: "profile.companySharesOutstanding", value: (profile as any)?.companySharesOutstanding },
      { path: "profile.weightedAverageShsOut", value: (profile as any)?.weightedAverageShsOut },
      { path: "profile.weightedAverageShsOutDil", value: (profile as any)?.weightedAverageShsOutDil },
    ],
    quote_field_candidates: [
      { path: "data.quote.marketCap", value: (data as any)?.quote?.marketCap },
      { path: "data.quote.sharesOutstanding", value: (data as any)?.quote?.sharesOutstanding },
      { path: "data.quote.price", value: (data as any)?.quote?.price },
    ],
    statement_field_candidates: [
      { path: "data.balance.sharesOutstanding[last finite]", value: lastFinitePositiveFromSeries((data as any)?.balance?.sharesOutstanding) },
      { path: "data.balance.commonStockSharesOutstanding[last finite]", value: lastFinitePositiveFromSeries((data as any)?.balance?.commonStockSharesOutstanding) },
      { path: "data.income.weightedAverageShsOut[last finite]", value: lastFinitePositiveFromSeries((data as any)?.income?.weightedAverageShsOut) },
      { path: "data.income.weightedAverageShsOutDil[last finite]", value: lastFinitePositiveFromSeries((data as any)?.income?.weightedAverageShsOutDil) },
    ],
    corporate_snapshot_field_candidates: corporateSnapshotData && typeof corporateSnapshotData === "object"
      ? Object.entries(corporateSnapshotData)
        .filter(([key]) => /mktcap|marketcap|shares|outstanding/i.test(key))
        .map(([key, value]) => ({ path: `corporateSnapshot.${key}`, value }))
      : [],
  };

  const unitMetaByTitle: Record<string, ChartUnitMeta> = {
    "Aktieprishistoria": { unitLabel: marketCurrency, unitKind: "money", yAxisTitle: marketCurrency },
    "Aktieprishistoria (kort)": { unitLabel: marketCurrency, unitKind: "money", yAxisTitle: marketCurrency },
    "Volume": { unitLabel: "shares", unitKind: "shares", yAxisTitle: "shares" },
    "Volume (kort)": { unitLabel: "shares", unitKind: "shares", yAxisTitle: "shares" },
    "Revenue": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: statementCurrency },
    "Revenue Growth": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "Gross Profit Ratio": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "EBITDA Margin": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "Net Income Margin": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "Operating Cash Flow": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: statementCurrency },
    "Cash From Investing": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: statementCurrency },
    "Free Cash Flow": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: statementCurrency },
    "Free Cash Flow/Share": { unitLabel: `${statementCurrency}/share`, unitKind: "money", yAxisTitle: `${statementCurrency}/share` },
    "Total Equity": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: statementCurrency },
    "ROE": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "A1 Cash Balance": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "A2 Operating Cash Flow": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: statementCurrency },
    "A3 Burn vs Capital Available": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "A4 Burn Rate TTM": { unitLabel: `${statementCurrency}/month`, unitKind: "money", yAxisTitle: `${statementCurrency}/month` },
    "A5 Runway Months": { unitLabel: "months", unitKind: "months", yAxisTitle: "months" },
    "A8 Next-12M Survival Gauge": { unitLabel: "months", unitKind: "months", yAxisTitle: "months" },
    "B1 Shares Outstanding": { unitLabel: "shares", unitKind: "shares", yAxisTitle: "shares" },
    "B2 Dilution Rate YoY": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "B3 Cash per Share": { unitLabel: `${statementCurrency}/share`, unitKind: "money", yAxisTitle: `${statementCurrency}/share` },
    "B4 Market Cap vs Shares": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "B5 SBC": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "B6 SBC Intensity": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "B7 All-in Dilution": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "C1 Corporate Overhead": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "C2 Exploration / Evaluation Cash Proxy (OCF Adjusted)": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: statementCurrency },
    "C4 Overhead Ratio": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%" },
    "C5 VCE Proxy": { unitLabel: "x", unitKind: "ratio", yAxisTitle: "x" },
    "D1 Net Cash / Net Debt": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "D2 Debt Maturity Mix": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "D3 Cash vs Short-Term Obligations": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "D4 Current Ratio": { unitLabel: "x", unitKind: "ratio", yAxisTitle: "x" },
    "D5 Financing Inflows": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "D6 Financing Frequency": { unitLabel: "index", unitKind: "index", yAxisTitle: "index" },
    "E1 Burn Acceleration (Δ vs prior period)": { unitLabel: statementCurrency, unitKind: "money", yAxisTitle: `${statementCurrency} (millions)` },
    "E2 Runway Risk Bands": { unitLabel: "months", unitKind: "months", yAxisTitle: "months" },
    "E3 Dilution vs Runway": { unitLabel: "%", unitKind: "percent", yAxisTitle: "%", y2AxisTitle: "months" },
    "E4 Governance Leak Index": { unitLabel: "index", unitKind: "index", yAxisTitle: "index" },
    "E5 Survival Score (0–10 composite)": { unitLabel: "index", unitKind: "index", yAxisTitle: "index" },
  };

  const resolveUnitMeta = (title: string): ChartUnitMeta => unitMetaByTitle[title] ?? {
    unitLabel: statementCurrency,
    unitKind: "money",
    yAxisTitle: statementCurrency,
  };

  const parsedSelectedProject = useMemo(() => {
    if (!selectedProjectRawJson) return null;
    try {
      return parseProjectJsonV1WithContext(selectedProjectRawJson);
    } catch {
      return null;
    }
  }, [selectedProjectRawJson]);

  const lastNpvTraceFingerprintRef = useRef<string | null>(null);

  const projectCalendarResolution = useMemo(() => {
    if (!projectSnapshotData || !parsedSelectedProject || !selectedProjectRawJson) return null;
    const inputs = getProjectInputs({
      snapshot: projectSnapshotData,
      parsedProject: parsedSelectedProject,
      discountRateInput: riskAdjustedDiscountRatePctInput,
      targetCurrency: lockedTargetCurrency,
    });
    const rawTime = (selectedProjectRawJson.time ?? null) as { productionStartYear?: unknown; periodEndDatesUtc?: unknown } | null;
    return verifyProjectCalendarAxis({
      version: selectedProjectRawJson.version === 'project_json_v1' ? 'project_json_v1' : 'project_json_v2',
      masterN: Number(inputs.masterN),
      fcffLength: Array.isArray(inputs.series.fcfUSD) ? inputs.series.fcfUSD.length : 0,
      productionStartPeriod: Number(inputs.tp),
      productionStartYear: typeof rawTime?.productionStartYear === 'number' ? rawTime.productionStartYear : null,
      periodEndDatesUtc: rawTime?.periodEndDatesUtc,
      parsedCanonicalYears: parsedSelectedProject.engineInputWithoutPrices.yearsByPeriod,
    });
  }, [lockedTargetCurrency, parsedSelectedProject, projectSnapshotData, riskAdjustedDiscountRatePctInput, selectedProjectRawJson]);

  const projectViewMetrics = useMemo(() => {
    if (!projectSnapshotData || !projectCalendarResolution?.ok) return null;
    const asSeries = (raw: Array<number> | null | undefined): Array<number | null> => (Array.isArray(raw)
      ? raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
      : []);
    const inputs = getProjectInputs({
      snapshot: projectSnapshotData,
      parsedProject: parsedSelectedProject,
      discountRateInput: riskAdjustedDiscountRatePctInput,
      targetCurrency: lockedTargetCurrency,
    });
    const marketValue = (projectSnapshotData.marketValue ?? {}) as Record<string, unknown>;
    const asNum = (raw: unknown): number | null => (typeof raw === "number" && Number.isFinite(raw) ? raw : null);
    const snapshotYears = ((projectSnapshotData.series ?? {}) as { yearsByPeriod?: unknown }).yearsByPeriod;
    const valuationYears = ((projectSnapshotData.project ?? {}) as { chartFlows?: { yearsByPeriod?: unknown } }).chartFlows?.yearsByPeriod;
    const internalStartYear = Array.isArray(snapshotYears) && typeof snapshotYears[0] === 'number' ? snapshotYears[0] : null;
    const valuationStartYear = Array.isArray(valuationYears) && typeof valuationYears[0] === 'number' ? valuationYears[0] : null;
    // This remains a discount-distance input only. Presentation years come solely
    // from the verified project period dates below.
    const discountPeriodOffset = internalStartYear !== null && valuationStartYear !== null ? internalStartYear - valuationStartYear : 0;
    const latestQuarterlyCash = [...getFieldSeries(data, "balance", "cashAndCashEquivalents")]
      .reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
    const latestQuarterlyDebt = [...getFieldSeries(data, "balance", "totalDebt")]
      .reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;

    return computeProjectViewMetrics({
      meta: { projectId: selectedProjectId },
      targetCurrency: String(projectSnapshotData.targetCurrency ?? lockedTargetCurrency),
      fxUSDToTarget: inputs.fx,
      discountRate: inputs.r,
      masterN: inputs.masterN,
      sharesCurrent: inputs.sharesCurrent,
      sharesPostFinancingInput: inputs.sharesPostFinancing,
      extraShares: parseExtraShares(projectExtraSharesInput),
      priceCurrentTarget: inputs.price,
      cashCurrentTarget: latestQuarterlyCash,
      debtCurrentTarget: latestQuarterlyDebt,
      enterpriseAdjustmentsTarget: asNum(marketValue.EnterpriseAdjustments_TargetCurrency),
      fcfUSD: asSeries(inputs.series.fcfUSD),
      capexUSD: asSeries(inputs.series.capexUSD),
      grossRevenueUSD: asSeries(inputs.series.grossRevenueUSD),
      ebitUSD: asSeries(inputs.series.ebitUSD),
      nopatUSD: asSeries(inputs.series.nopatUSD),
      effectiveTaxRate: asSeries(inputs.series.effectiveTaxRate),
      taxUSD: asSeries(inputs.series.taxUSD),
      federalIncomeTaxUSD: asSeries(inputs.series.federalIncomeTaxUSD),
      df_now: asSeries(inputs.series.df_now),
      economicsTaxRate: inputs.economicsTaxRate,
      payableAuEqOz: asSeries(inputs.series.payableAuEqOz),
      sustainingCostUSD: asSeries(inputs.series.sustainingCostUSD),
      productionStartPeriod: inputs.tp,
      calendarYears: projectCalendarResolution.value.yearsByPeriod,
      valuationYear: new Date().getUTCFullYear(),
      periodEndDates: projectCalendarResolution.value.periodEndDatesUtc ?? undefined,
      calendarYearPolicy: 'verified',
      valuationPeriodOffset: discountPeriodOffset,
      financing: {
        equityPct: toInputNumber(projectEquityPct) ?? 100,
        debtPct: toInputNumber(projectDebtPct) ?? 0,
        latestQuarterlyCashTarget: latestQuarterlyCash,
        useCashFirst: projectUseQuarterlyCash,
        cashUsePercent: projectCashUsedPct / 100,
      },
    });
  }, [data, projectUseQuarterlyCash, projectCashUsedPct, projectDebtPct, projectEquityPct, projectExtraSharesInput, projectSnapshotData, parsedSelectedProject, selectedProjectId, lockedTargetCurrency, riskAdjustedDiscountRatePctInput, projectCalendarResolution]);

  const corporateViewMetrics = useMemo(() => {
    if (!corporateSnapshotData) return null;
    const asSeries = (raw: Array<number> | null | undefined): Array<number | null> => (Array.isArray(raw)
      ? raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
      : []);
    const inputs = getProjectInputs({
      snapshot: corporateSnapshotData,
      parsedProject: null,
      discountRateInput: riskAdjustedDiscountRatePctInput,
      targetCurrency: lockedTargetCurrency,
    });
    const marketValue = (corporateSnapshotData.marketValue ?? {}) as Record<string, unknown>;
    const corporateFinancing = (corporateSnapshotData.financing ?? {}) as Record<string, unknown>;
    const asNum = (raw: unknown): number | null => (typeof raw === "number" && Number.isFinite(raw) ? raw : null);
    const computed = computeProjectViewMetrics({
      meta: { projectId: "corporate" },
      targetCurrency: String(corporateSnapshotData.targetCurrency ?? lockedTargetCurrency),
      fxUSDToTarget: inputs.fx,
      discountRate: inputs.r,
      masterN: inputs.masterN,
      sharesCurrent: inputs.sharesCurrent,
      sharesPostFinancingInput: inputs.sharesPostFinancing,
      extraShares: parseExtraShares(corporateExtraSharesInput),
      priceCurrentTarget: inputs.price,
      cashCurrentTarget: asNum(corporateFinancing.cash_for_nav_TargetCurrency) ?? inputs.cash0,
      debtCurrentTarget: inputs.debt0,
      enterpriseAdjustmentsTarget: asNum(marketValue.EnterpriseAdjustments_TargetCurrency),
      fcfUSD: asSeries(inputs.series.fcfUSD),
      capexUSD: asSeries(inputs.series.capexUSD),
      grossRevenueUSD: asSeries(inputs.series.grossRevenueUSD),
      ebitUSD: asSeries(inputs.series.ebitUSD),
      nopatUSD: asSeries(inputs.series.nopatUSD),
      effectiveTaxRate: asSeries(inputs.series.effectiveTaxRate),
      taxUSD: asSeries(inputs.series.taxUSD),
      federalIncomeTaxUSD: asSeries(inputs.series.federalIncomeTaxUSD),
      df_now: asSeries(inputs.series.df_now),
      economicsTaxRate: inputs.economicsTaxRate,
      payableAuEqOz: asSeries(inputs.series.payableAuEqOz),
      sustainingCostUSD: asSeries(inputs.series.sustainingCostUSD),
      productionStartPeriod: inputs.tp,
      calendarYears: Array.isArray((corporateSnapshotData.corporateValuationTimeSeries as { rows?: Array<{ year: number }> } | undefined)?.rows)
        ? (corporateSnapshotData.corporateValuationTimeSeries as { rows: Array<{ year: number }> }).rows.map((row) => row.year)
        : undefined,
      valuationPeriodOffset: 0,
      financing: {
        equityPct: 100,
        debtPct: 0,
        usePrecomputedFinancing: true,
      },
    });
    // The snapshot's canonical timeline is already rebased to valuationYear and
    // calendar-aligned. Recomputing it from the internal series can have a different
    // length when projects begin before/after today and would fall back to offsets.
    const canonicalTimeline = (corporateSnapshotData as unknown as { canonicalValuationTimeline?: typeof computed.valuationTimeline }).canonicalValuationTimeline;
    const computedWithCanonical = canonicalTimeline ? { ...computed, valuationTimeline: canonicalTimeline } : computed;
    const corporateLista3 = ((corporateSnapshotData.corporate ?? {}) as { lista3Metrics?: {
      AISC_LOM?: number | null;
      BreakEven_AuEq?: number | null;
      CAPEX_per_Annual_AuEq?: number | null;
      Payback_approx_years?: number | null;
      Payback_real_years?: number | null;
      ROI_10Y_pct?: number | null;
      IRR?: number | null;
      LOM_avg_EBIT_ROCE?: number | null;
      LOM_discounted_EBIT_ROCE?: number | null;
      Corporate_ROIC?: number | null;
      LOM_avg_NOPAT_ROIC?: number | null;
      Kapitalavkastning_LOM?: number | null;
      Kapitalavkastning_per_Year?: number | null;
    } }).lista3Metrics;
    if (!corporateLista3) {
      return computedWithCanonical;
    }

    const toMetricValue = (value: number | null | undefined, reason: string): MetricValue => ({
      value: isFiniteNumber(value) ? value : null,
      reason: isFiniteNumber(value) ? null : reason,
    });

    return {
      ...computedWithCanonical,
      list3: {
        ...computed.list3,
        AISC_LOM: toMetricValue(corporateLista3.AISC_LOM, "Missing corporate.lista3Metrics.AISC_LOM"),
        BreakEven_AuEq: toMetricValue(corporateLista3.BreakEven_AuEq, "Missing corporate.lista3Metrics.BreakEven_AuEq"),
        CAPEX_per_Annual_AuEq: toMetricValue(corporateLista3.CAPEX_per_Annual_AuEq, "Missing corporate.lista3Metrics.CAPEX_per_Annual_AuEq"),
        Payback_approx: toMetricValue(corporateLista3.Payback_approx_years, "Missing corporate.lista3Metrics.Payback_approx_years"),
        Payback_real: toMetricValue(corporateLista3.Payback_real_years, "Missing corporate.lista3Metrics.Payback_real_years"),
        ROI_10Y: toMetricValue(
          isFiniteNumber(corporateLista3.ROI_10Y_pct)
            ? corporateLista3.ROI_10Y_pct
            : null,
          "Missing corporate.lista3Metrics.ROI_10Y_pct",
        ),
        IRR: toMetricValue(corporateLista3.IRR, "Missing corporate.lista3Metrics.IRR"),
        LOM_avg_EBIT_ROCE: toMetricValue(corporateLista3.LOM_avg_EBIT_ROCE, "Missing corporate.lista3Metrics.LOM_avg_EBIT_ROCE"),
        LOM_discounted_EBIT_ROCE: toMetricValue(corporateLista3.LOM_discounted_EBIT_ROCE, "Missing corporate.lista3Metrics.LOM_discounted_EBIT_ROCE"),
        Corporate_ROIC: toMetricValue(corporateLista3.Corporate_ROIC, "Missing corporate.lista3Metrics.Corporate_ROIC"),
        LOM_avg_NOPAT_ROIC: toMetricValue(corporateLista3.LOM_avg_NOPAT_ROIC, "Missing corporate.lista3Metrics.LOM_avg_NOPAT_ROIC"),
        Kapitalavkastning_LOM: toMetricValue(corporateLista3.Kapitalavkastning_LOM, "Missing corporate.lista3Metrics.Kapitalavkastning_LOM"),
        Kapitalavkastning_per_Year: toMetricValue(corporateLista3.Kapitalavkastning_per_Year, "Missing corporate.lista3Metrics.Kapitalavkastning_per_Year"),
      },
    };
  }, [corporateExtraSharesInput, corporateSnapshotData, lockedTargetCurrency, riskAdjustedDiscountRatePctInput]);

  useEffect(() => {
    if (!debugEnabled) return;
    if (projectViewMetrics) console.table(projectViewMetrics.diagnostics.valuation_metric_audit.map((row) => ({ scope: "project", ...row })));
    if (corporateViewMetrics) console.table(corporateViewMetrics.diagnostics.valuation_metric_audit.map((row) => ({ scope: "corporate", ...row })));
  }, [debugEnabled, projectViewMetrics, corporateViewMetrics]);

  const corporateLista3Debug = useMemo(() => {
    const corporateSection = ((corporateSnapshotData?.corporate ?? null) as {
      lista3Debug?: {
        scope?: string | null;
        sourcePath?: string | null;
        tp_main: number | null;
        initialCapexUSD_main: number | null;
        shares_post_financing: number | null;
        series?: {
          fcfUSD_total?: Array<number | null>;
          capexUSD_total?: Array<number | null>;
          nopatUSD_total?: Array<number | null>;
        };
        corporateNopatInputs?: {
          requiredInputs?: string[];
          projectInputs?: Array<{
            projectId?: string;
            taxRate?: number | null;
            taxRateByPeriod?: Array<number | null> | null;
            sampleEbitUSD?: Array<number | null>;
          }>;
          perPeriod?: Array<{
            t?: number;
            contributions?: Array<{
              projectId?: string;
              ebitUSD?: number | null;
              taxRate?: number | null;
              nopatContributionUSD?: number | null;
            }>;
            nopatUSD_total?: number | null;
          }>;
          missingInputs?: Array<{
            projectId?: string;
            t?: number;
            missing?: string[];
          }>;
        };
        perMetric?: Record<string, {
          formula?: string;
          inputs?: Record<string, unknown>;
          intermediates?: Record<string, unknown>;
          requiredInputs?: string[];
          missingInputs?: string[];
          output?: { value?: number | null };
        }>;
      };
    } | null);
    return corporateSection?.lista3Debug ?? null;
  }, [corporateSnapshotData]);

  const corporateLista3DebugDisplayOrder = [
    "AISC_LOM",
    "BreakEven_AuEq",
    "CAPEX_per_Annual_AuEq",
    "Payback_approx",
    "Payback_real",
    "IRR",
    "ROI_10Y",
    "LOM_avg_EBIT_ROCE",
    "LOM_discounted_EBIT_ROCE",
    "Corporate_ROIC",
    "LOM_avg_NOPAT_ROIC",
    "Kapitalavkastning_LOM",
    "Kapitalavkastning_per_Year",
  ] as const;

  const corporateLista3DebugFormulaByMetric: Record<string, string> = {
    AISC_LOM: "Σ sustainingCostUSD where payableAuEqOz>0 / Σ payableAuEqOz where >0",
    BreakEven_AuEq: "(Σ CAPEX + Σ sustainingCostUSD where payableAuEqOz>0) / Σ payableAuEqOz where >0",
    CAPEX_per_Annual_AuEq: "|Initial_CAPEX_USD| / (AuEq_LOM / LOM)",
    Payback_approx: "|Initial_CAPEX_USD| / AnnualAvg_FCFF_USD",
    Payback_real: "cumulative FCFF from tp until payback; linear interpolation",
    IRR: "IRR(fcfUSD_total[0..masterN])",
    ROI_10Y: "Σ FCFF(t=tp..tp+9) / |Initial_CAPEX_USD|",
    LOM_avg_EBIT_ROCE: "Average EBIT(tp..masterN) / |Initial_CAPEX_USD|",
    LOM_discounted_EBIT_ROCE: "Σ EBIT(t)*df_now(t) / |Initial_CAPEX_USD|",
    Corporate_ROIC: "Corporate scope input (not provided in current dataset)",
    LOM_avg_NOPAT_ROIC: "Average NOPAT(tp..masterN) / |Initial_CAPEX_USD|",
    Kapitalavkastning_LOM: "Σ FCFF(tp..masterN) / |Initial_CAPEX_USD|",
    Kapitalavkastning_per_Year: "(Σ FCFF(tp..masterN) / |Initial_CAPEX_USD|) / LOM",
  };

  const corporateProdStartMarkerValuesByKey = useMemo(() => {
    const result: Partial<Record<"NPV_prodStart" | "NPV_prodStart_perShare" | "NAV_prodStart" | "NAV_prodStart_perShare" | "DCF_Target" | "DCF_perShare", YearlyMetricValue[]>> = {};
    if (!corporateViewMetrics || !corporateSnapshotData) return result;
    const markerPeriods = ((corporateSnapshotData as unknown as { projectStartMilestones?: Array<{ corporatePeriodIndex: number }> }).projectStartMilestones ?? [])
      .map((milestone) => milestone.corporatePeriodIndex)
      .filter((period): period is number => Number.isInteger(period));
    const fields = {
      NPV_prodStart: 'npvAtPeriodTarget', NPV_prodStart_perShare: 'npvPerShareTarget',
      NAV_prodStart: 'navAtPeriodTarget', NAV_prodStart_perShare: 'navPerShareTarget',
      DCF_Target: 'dcfAtPeriodTarget', DCF_perShare: 'dcfPerShareTarget',
    } as const;
    for (const [metric, field] of Object.entries(fields) as Array<[keyof typeof fields, typeof fields[keyof typeof fields]]>) {
      const rows = markerPeriods.flatMap((period) => {
        const state = corporateViewMetrics.valuationTimeline.periods[period];
        const value = state?.[field];
        return state && typeof value === 'number' ? [{ year: String(state.calendarYear), value }] : [];
      });
      if (rows.length) result[metric] = rows;
    }
    return result;
  }, [corporateSnapshotData, corporateViewMetrics]);

  const corporateProdStartMarkerTextByKey = useMemo(() => {
    return Object.fromEntries(
      Object.entries(corporateProdStartMarkerValuesByKey).map(([metricKey, rows]) => [
        metricKey,
        (rows ?? []).map((row) => `${row.year}: ${formatMetricValue({ value: row.value, reason: null }, "money", lockedTargetCurrency)}`).join(", "),
      ]),
    ) as Record<string, string>;
  }, [corporateProdStartMarkerValuesByKey, lockedTargetCurrency]);

  const corporateCanonicalStartPeriods = useMemo(() =>
    ((corporateSnapshotData as unknown as { projectStartMilestones?: Array<{ corporatePeriodIndex: number }> } | null)?.projectStartMilestones ?? [])
      .map((milestone) => milestone.corporatePeriodIndex),
  [corporateSnapshotData]);

  const corporateList2ScalarTextByKey = useMemo(() => {
    const selection = corporateViewMetrics ? selectValuationChart(corporateViewMetrics.valuationTimeline, corporateCanonicalStartPeriods) : null;
    const discountedPerShareValue = selection?.today.high ?? null;
    const adjustedShares = selection?.today.high !== null ? corporateViewMetrics?.marketBox.sharesPf.value ?? null : null;
    const discountedValue = discountedPerShareValue !== null && adjustedShares !== null
      ? discountedPerShareValue * adjustedShares
      : null;
    const discounted = discountedValue !== null
      ? formatMetricValue({ value: discountedValue, reason: null }, "money", lockedTargetCurrency)
      : null;
    const discountedPerShare = typeof discountedPerShareValue === "number"
      && Number.isFinite(discountedPerShareValue)
      ? formatMetricValue({ value: discountedPerShareValue, reason: null }, "money", lockedTargetCurrency)
      : null;

    return {
      DCF_Target_discounted: discounted,
      DCF_Target_discounted_perShare: discountedPerShare,
    } as const;
  }, [corporateCanonicalStartPeriods, corporateViewMetrics, lockedTargetCurrency]);

  const corporateAlwaysMarkerMetricKeys = useMemo(
    () => new Set<string>(["DCF_Target", "DCF_perShare"]),
    [],
  );

  const corporateChartTimeSeries = useMemo(() => {
    const source = corporateSnapshotData?.corporateValuationTimeSeries as {
      valuationYear?: number;
      rows?: Array<{ period: number; year: number; npvPerShare: number | null; dcfPerShare: number | null; dcfExCapexPerShare?: number | null; navPerShare: number | null; sharesPf: number | null }>;
      projectMarkers?: Array<{ projectId: string; projectName: string; productionStartYear: number | null }>;
    } | null | undefined;
    if (!source?.rows || !source.projectMarkers) return null;
    const navByYear = new Map((corporateProdStartMarkerValuesByKey.NAV_prodStart_perShare ?? []).map((row) => [Number(row.year), row.value]));
    const dcfByYear = new Map((corporateProdStartMarkerValuesByKey.DCF_perShare ?? []).map((row) => [Number(row.year), row.value]));
    const calculatedShares = source.rows.find((row) => typeof row.sharesPf === 'number' && row.sharesPf > 0)?.sharesPf ?? null;
    const adjustedShares = calculatedShares === null ? null : calculatedShares + parseExtraShares(corporateExtraSharesInput);
    const scale = calculatedShares !== null && adjustedShares !== null && adjustedShares > 0 ? calculatedShares / adjustedShares : 1;
    return {
      valuationYear: source.valuationYear,
      rows: source.rows.map((row) => ({
        ...row,
        sharesPf: adjustedShares ?? row.sharesPf,
        npvPerShare: row.npvPerShare === null ? null : row.npvPerShare * scale,
        navPerShare: row.navPerShare === null ? null : row.navPerShare * scale,
        dcfPerShare: row.dcfPerShare === null ? null : row.dcfPerShare * scale,
        dcfExCapexPerShare: row.dcfExCapexPerShare == null ? null : row.dcfExCapexPerShare * scale,
      })),
      projectMarkers: source.projectMarkers.map((marker) => ({
        ...marker,
        navPerShare: marker.productionStartYear === null ? null : navByYear.get(marker.productionStartYear) ?? null,
        dcfPerShare: marker.productionStartYear === null ? null : dcfByYear.get(marker.productionStartYear) ?? null,
      })),
    };
  }, [corporateExtraSharesInput, corporateProdStartMarkerValuesByKey, corporateSnapshotData]);

  const projectInputDebug = useMemo(() => {
    if (!projectSnapshotData) return null;
    const inputs = getProjectInputs({ snapshot: projectSnapshotData, parsedProject: parsedSelectedProject, discountRateInput: riskAdjustedDiscountRatePctInput, targetCurrency: lockedTargetCurrency });
    const rows = [
      ["price_current_TargetCurrency", inputs.price],
      ["shares_current", inputs.sharesCurrent],
      ["cash_TargetCurrency", inputs.cash0],
      ["debt_TargetCurrency", inputs.debt0],
      ["fx_USD_to_TargetCurrency", inputs.fx],
      ["discountRate (r)", inputs.r],
      ["masterN", inputs.masterN],
      ["tp", inputs.tp],
      ["shares_post_financing (computed default)", inputs.sharesPostFinancing ?? inputs.sharesCurrent],
    ];
    const seriesRows: Array<[string, number[] | null | undefined]> = [
      ["fcfUSD", inputs.series.fcfUSD],
      ["capexUSD", inputs.series.capexUSD],
      ["grossRevenue_USD", inputs.series.grossRevenueUSD],
      ["AuPrice_USD_per_Oz", inputs.series.auPriceUSD],
      ["operatingCostsUSD", inputs.series.operatingCostsUSD],
      ["sustainingCapexUSD", inputs.series.sustainingCapexUSD],
      ["siteGandA_USD", inputs.series.siteGandAUSD],
      ["royaltiesUSD", inputs.series.royaltiesUSD],
      ["reclamationAccrualUSD", inputs.series.reclamationAccrualUSD],
    ];
    return {
      rows,
      seriesRows,
      missing: validateProjectInputs(inputs),
    };
  }, [projectSnapshotData, parsedSelectedProject, riskAdjustedDiscountRatePctInput, lockedTargetCurrency]);




  const financingConsistencyDebug = useMemo(() => {
    if (!projectViewMetrics || !projectSnapshotData) return null;
    const inputs = getProjectInputs({ snapshot: projectSnapshotData as Record<string, unknown>, parsedProject: parsedSelectedProject, discountRateInput: riskAdjustedDiscountRatePctInput, targetCurrency: lockedTargetCurrency });
    const sharesUsed = (typeof inputs.sharesPostFinancing === "number" && Number.isFinite(inputs.sharesPostFinancing) && inputs.sharesPostFinancing > 0)
      ? inputs.sharesPostFinancing
      : ((typeof inputs.sharesCurrent === "number" && Number.isFinite(inputs.sharesCurrent) && inputs.sharesCurrent > 0) ? inputs.sharesCurrent : null);
    const graphHighPerShare = projectViewMetrics.list2.DCF_perShare?.value ?? null;
    const graphLowPerShare = projectViewMetrics.list2.NAV_prodStart_perShare?.value ?? null;
    const graphHighEquity = (typeof graphHighPerShare === "number" && sharesUsed !== null) ? graphHighPerShare * sharesUsed : null;
    const graphLowEquity = (typeof graphLowPerShare === "number" && sharesUsed !== null) ? graphLowPerShare * sharesUsed : null;

    const rows = [
      { metric: "NPV", enterprise_value: projectViewMetrics.list2.NPV_Target?.value ?? null, equity_value: projectViewMetrics.list2.NPV_Target?.value ?? null, shares_used: null, source_layer: "1. central project valuation engine" },
      { metric: "NAV", enterprise_value: null, equity_value: projectViewMetrics.list2.NAV_Target?.value ?? null, shares_used: null, source_layer: "1. central project valuation engine + financing" },
      { metric: "CF_LOM", enterprise_value: projectViewMetrics.list2.CF_LOM_Target?.value ?? null, equity_value: null, shares_used: null, source_layer: "1. central project valuation engine" },
      { metric: "DCF_prodstart", enterprise_value: projectViewMetrics.list2.DCF_Target?.value ?? null, equity_value: projectViewMetrics.list2.NPV_prodStart?.value ?? null, shares_used: null, source_layer: "1. central project valuation engine" },
      { metric: "graph_high", enterprise_value: null, equity_value: graphHighEquity, shares_used: sharesUsed, source_layer: "3. graph rendering layer" },
      { metric: "graph_low", enterprise_value: null, equity_value: graphLowEquity, shares_used: sharesUsed, source_layer: "3. graph rendering layer" },
    ];

    const marketCap = projectViewMetrics.marketBox.marketCapCurrent?.value ?? null;
    const ev = projectViewMetrics.marketBox.evCurrent?.value ?? null;
    const debt = inputs.debt0;
    const cash = inputs.cash0;
    const evFormula = (typeof marketCap === "number" && typeof debt === "number" && typeof cash === "number") ? (marketCap + debt - cash) : null;

    return {
      financing_mix: { equity_fraction: projectEquityPct ?? null, debt_fraction: projectDebtPct ?? null },
      shares_current: inputs.sharesCurrent,
      shares_post_financing: inputs.sharesPostFinancing,
      debt: debt,
      cash: cash,
      market_box: {
        marketCap,
        ev,
        ev_formula_marketCap_plus_debt_minus_cash: evFormula,
        ev_formula_diff: (typeof ev === "number" && typeof evFormula === "number") ? ev - evFormula : null,
      },
      rows,
    };
  }, [projectViewMetrics, projectSnapshotData, parsedSelectedProject, riskAdjustedDiscountRatePctInput, lockedTargetCurrency, projectEquityPct, projectDebtPct]);

  const projectTimelineDebug = useMemo(() => {
    if (!projectSnapshotData || !projectViewMetrics) return null;
    const inputs = getProjectInputs({ snapshot: projectSnapshotData, parsedProject: parsedSelectedProject, discountRateInput: riskAdjustedDiscountRatePctInput, targetCurrency: lockedTargetCurrency });
    const yearsByPeriod = requireYearsByPeriod((projectSnapshotData.series ?? null) as { yearsByPeriod?: number[] } | null);
    const sharesCurrent = typeof inputs.sharesCurrent === "number" && Number.isFinite(inputs.sharesCurrent) ? inputs.sharesCurrent : null;
    const sharesPostFinancing = typeof inputs.sharesPostFinancing === "number" && Number.isFinite(inputs.sharesPostFinancing) ? inputs.sharesPostFinancing : sharesCurrent;
    const sharedPerShareBasis = {
      usesShares: (sharesPostFinancing !== null ? "shares_post_financing" : "shares_current") as "shares_post_financing" | "shares_current",
      sharesValue: sharesPostFinancing ?? sharesCurrent ?? 0,
    };
    const tp = Number.isInteger(inputs.tp) ? inputs.tp as number : null;
    const resolveLabel = (idx: number | null): { label: string | null; source: string; reason?: string } => {
      if (idx === null) return { label: null, source: "yearsByPeriod[null]", reason: "Missing t index." };
      const raw = yearsByPeriod[idx];
      if (Number.isFinite(raw)) return { label: String(raw), source: `yearsByPeriod[${idx}]` };
      return { label: null, source: `yearsByPeriod[${idx}]`, reason: "Missing yearsByPeriod value at index." };
    };
    const todayLabel = resolveLabel(0);
    const prodLabel = resolveLabel(tp);
    const points = [
      {
        pointType: "today" as const,
        tp: null,
        tIndexUsed: 0,
        yearLabelUsed: todayLabel.label,
        yearLabelSource: todayLabel.source,
        lowValueUsed: projectViewMetrics.valuationTimeline.periods[projectViewMetrics.valuationTimeline.todayPeriod]?.navPerShareTarget ?? null,
        highValueUsed: projectViewMetrics.list2.DCF_Target_discounted_perShare?.value ?? null,
        lowSource: { metricKey: "valuationTimeline.today.navPerShareTarget", description: "canonical chart selector" },
        highSource: { metricKey: "DCF_Target_discounted_perShare", description: "ValueRangeSnapshotCard npvHigh" },
        perShareBasis: sharedPerShareBasis,
        nullReasons: {
          ...(projectViewMetrics.list2.NAV_perShare?.value === null ? { low: projectViewMetrics.list2.NAV_perShare?.reason ?? "Metric is null." } : {}),
          ...(projectViewMetrics.list2.DCF_Target_discounted_perShare?.value === null ? { high: projectViewMetrics.list2.DCF_Target_discounted_perShare?.reason ?? "Metric is null." } : {}),
          ...(todayLabel.reason ? { yearLabel: todayLabel.reason } : {}),
        },
        sanity: {
          lowLEHigh: (typeof projectViewMetrics.list2.NAV_perShare?.value === "number" && typeof projectViewMetrics.list2.DCF_Target_discounted_perShare?.value === "number")
            ? projectViewMetrics.list2.NAV_perShare.value <= projectViewMetrics.list2.DCF_Target_discounted_perShare.value
            : null,
          notes: "If false, low/high may be swapped in source metrics for today point.",
        },
      },
      {
        pointType: "prodStart" as const,
        tp,
        tIndexUsed: tp,
        yearLabelUsed: prodLabel.label,
        yearLabelSource: prodLabel.source,
        lowValueUsed: projectViewMetrics.list2.NAV_prodStart_perShare?.value ?? null,
        highValueUsed: projectViewMetrics.list2.DCF_perShare?.value ?? null,
        lowSource: { metricKey: "NAV_prodStart_perShare", description: "ValueRangeSnapshotCard tpLow" },
        highSource: { metricKey: "DCF_perShare", description: "ValueRangeSnapshotCard tpHigh" },
        perShareBasis: sharedPerShareBasis,
        nullReasons: {
          ...(projectViewMetrics.list2.NAV_prodStart_perShare?.value === null ? { low: projectViewMetrics.list2.NAV_prodStart_perShare?.reason ?? "Metric is null." } : {}),
          ...(projectViewMetrics.list2.DCF_perShare?.value === null ? { high: projectViewMetrics.list2.DCF_perShare?.reason ?? "Metric is null." } : {}),
          ...(prodLabel.reason ? { yearLabel: prodLabel.reason } : {}),
        },
        sanity: {
          lowLEHigh: (typeof projectViewMetrics.list2.NAV_prodStart_perShare?.value === "number" && typeof projectViewMetrics.list2.DCF_perShare?.value === "number")
            ? projectViewMetrics.list2.NAV_prodStart_perShare.value <= projectViewMetrics.list2.DCF_perShare.value
            : null,
          notes: "If false, low/high may be swapped in source metrics for prodStart point.",
        },
      },
    ];
    return {
      chart: "project.modeled.valuationTimeline",
      points,
    };
  }, [projectSnapshotData, parsedSelectedProject, projectViewMetrics, riskAdjustedDiscountRatePctInput, lockedTargetCurrency]);

  const projectValueIntervalDebug = useMemo(() => {
    if (!debugEnabled || !projectSnapshotData) return null;
    const diagnosticsMeta = (projectSnapshotDiagnosticsMeta ?? {}) as Record<string, unknown>;
    const projectModeled = ((projectSnapshotData.project ?? {}) as { modeled?: { npvSpotRange?: unknown } }).modeled ?? {};
    const npvSpotRange = (projectModeled as { npvSpotRange?: Record<string, unknown> | null }).npvSpotRange ?? null;
    const rawProject = selectedProjectRawJson ?? {};
    const rawTime = (rawProject.time ?? {}) as Record<string, unknown>;
    const rawEconomics = (rawProject.economics ?? {}) as Record<string, unknown>;
    const inputSeries = ((projectSnapshotData.series ?? {}) as Record<string, unknown>);
    const metalPriceDiagnostics = (diagnosticsMeta.metalPriceDiagnostics ?? {}) as Record<string, Record<string, unknown>>;
    const materialMetals = Object.entries(metalPriceDiagnostics)
      .map(([metal, info]) => ({
        metal,
        symbol: info.liveSymbol ?? null,
        material: true,
        manualPrice: info.manualFallbackValue ?? null,
        fmpPrice: info.livePriceValue ?? null,
        jsonStudyPrice: null,
        winningSource: info.priceSourceUsed ?? null,
        timestampUtc: info.manualEnteredAtUtc ?? null,
        currency: 'USD',
        finalSpotPrice: info.normalizedOutputValue ?? null,
      }));

    const scenarioNode = (key: 'low' | 'base' | 'high') => npvSpotRange && typeof npvSpotRange === 'object'
      ? (npvSpotRange as Record<string, unknown>)[key] as Record<string, unknown> | null
      : null;
    const mapStatus = (key: 'LOW' | 'SPOT' | 'HIGH', node: Record<string, unknown> | null) => {
      if (!node) return `${key}: failed (scenario node missing)`;
      return `${key}: ok`;
    };

    return {
      context: {
        scope: 'project',
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        projectId: selectedProjectId ?? null,
        projectName: selectedProjectName ?? null,
        component: 'NpvSpotRangeComparisonCard',
        selector: 'project.modeled.npvSpotRange',
        snapshotVersion: projectSnapshotData.snapshotVersion ?? null,
        dataOrigin: diagnosticsMeta.refresh === true ? 'live calculated snapshot' : 'cached/inline snapshot',
      },
      requiredInputs: {
        time: {
          masterN: rawTime.masterN ?? null,
          productionStartPeriod: rawTime.productionStartPeriod ?? null,
          productionStartYear: rawTime.productionStartYear ?? null,
          periodLength: Number.isInteger(rawTime.masterN) ? Number(rawTime.masterN) + 1 : null,
          bounds: {
            tp_gte_0: Number.isInteger(rawTime.productionStartPeriod) ? Number(rawTime.productionStartPeriod) >= 0 : null,
            tp_lte_masterN: Number.isInteger(rawTime.productionStartPeriod) && Number.isInteger(rawTime.masterN)
              ? Number(rawTime.productionStartPeriod) <= Number(rawTime.masterN)
              : null,
          },
        },
        prices: {
          metals: materialMetals,
          missingMaterialPrice: Boolean((diagnosticsMeta.metalsWithPriceFailure as unknown[] | undefined)?.length),
          scenarioBlocked: !npvSpotRange,
          priorityRule: 'manual price → FMP price → JSON study price',
        },
        economy: {
          discountRate: projectSnapshotData.discountRate ?? null,
          taxRate: rawEconomics.taxRate ?? null,
          fx_USD_to_TargetCurrency: projectSnapshotData.fx_USD_to_TargetCurrency ?? null,
          targetCurrency: projectSnapshotData.targetCurrency ?? null,
          shares_current: (projectSnapshotData.market as Record<string, unknown> | undefined)?.shares_current ?? null,
          shares_post_financing: (projectSnapshotData.financing as Record<string, unknown> | undefined)?.shares_post_financing ?? null,
          cash_TargetCurrency: (projectSnapshotData.financing as Record<string, unknown> | undefined)?.cash_t0_post_TargetCurrency ?? null,
          debt_TargetCurrency: (projectSnapshotData.financing as Record<string, unknown> | undefined)?.debt_t0_post_TargetCurrency ?? null,
        },
        series: {
          fcfUSD_len: Array.isArray(inputSeries.fcffUSD) ? inputSeries.fcffUSD.length : null,
          capexUSD_len: Array.isArray(inputSeries.capexUSD) ? inputSeries.capexUSD.length : null,
          revenue_len: Array.isArray(inputSeries.totalRevenue_USD) ? inputSeries.totalRevenue_USD.length : null,
          cost_len: Array.isArray(inputSeries.operatingCostsUSD) ? inputSeries.operatingCostsUSD.length : null,
        },
      },
      scenarioDefinitions: {
        LOW: 'spot deck with low override from scenario engine (typically -25% for priced material metals)',
        SPOT: 'spot deck unadjusted',
        HIGH: 'spot deck with high override from scenario engine (typically +25% for priced material metals)',
      },
      scenarioStatusText: [
        mapStatus('LOW', scenarioNode('low')),
        mapStatus('SPOT', scenarioNode('base')),
        mapStatus('HIGH', scenarioNode('high')),
      ],
      metricDependencies: {
        NPV: 'discountRate + fcf series',
        IRR: 'cash flow series with sign change',
        Payback: 'cumulative FCF repays initial capex',
        LOM_avg_EBIT_ROCE: 'EBIT series + initial CAPEX',
        Kapitalavkastning_LOM: 'CF_LOM / Initial_CAPEX',
        InSitu_10Y_USD: 'first 10 years of revenue series',
      },
      sourcePaths: {
        calculator: 'src/lib/snapshot/runCorporateSnapshot.ts (project.modeled.npvSpotRange build + applyScenarioMetrics)',
        selector: 'projectSnapshotData.project.modeled.npvSpotRange',
        uiGuard: 'src/components/project/NpvSpotRangeComparisonCard.tsx formatMetricValueByLabel',
      },
    };
  }, [debugEnabled, projectSnapshotData, projectSnapshotDiagnosticsMeta, selectedProjectId, selectedProjectName, selectedProjectRawJson]);

  useEffect(() => {
    if (debugEnabled && projectTimelineDebug) {
      console.debug("[project-modeled-valuation-timeline-debug]", projectTimelineDebug);
    }
  }, [debugEnabled, projectTimelineDebug]);

  useEffect(() => {
    if (!debugEnabled || !projectViewMetrics || !projectSnapshotData || !selectedProjectRawJson) return;

    const trace = projectViewMetrics.diagnostics?.npv10_trace;
    if (!trace) return;

    const fingerprint = JSON.stringify({
      projectId: selectedProjectId,
      npvTarget: projectViewMetrics.list2.NPV_Target?.value ?? null,
      npvProdStart: projectViewMetrics.list2.NPV_prodStart?.value ?? null,
      navProdStart: projectViewMetrics.list2.NAV_prodStart?.value ?? null,
      dcfTarget: projectViewMetrics.list2.DCF_Target?.value ?? null,
      dcfDiscounted: projectViewMetrics.list2.DCF_Target_discounted?.value ?? null,
      trace,
    });

    if (lastNpvTraceFingerprintRef.current === fingerprint) return;
    lastNpvTraceFingerprintRef.current = fingerprint;

    void fetch("/api/debug/npv-trace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: `ui-npv10-${selectedProjectId ?? "project"}` ,
        source: "single-stock-dashboard",
        section: "FINANSIELLA NYCKELTAL OCH VÄRDERING / Debug: NPV/NAV/DCF vid produktionsstart",
        projectId: selectedProjectId ?? null,
        projectName: typeof selectedProjectRawJson.meta === "object" && selectedProjectRawJson.meta !== null
          ? ((selectedProjectRawJson.meta as Record<string, unknown>).projectName ?? null)
          : null,
        uiInputs: {
          time: selectedProjectRawJson.time ?? null,
          economics: selectedProjectRawJson.economics ?? null,
        },
        uiMetrics: projectViewMetrics.list2,
        uiDiagnostics: projectViewMetrics.diagnostics,
        engineDiagnostics: (projectSnapshotDiagnosticsMeta ?? null),
        projectSnapshotKeys: Object.keys(projectSnapshotData ?? {}),
      }),
    })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          const errorMessage = typeof json?.error === "string" ? json.error : "Unknown error while persisting NPV trace.";
          setNpvTracePersistResult((prev) => ({ ...prev, error: errorMessage }));
          console.warn("[npv-trace] failed to persist trace", json);
          return;
        }
        setNpvTracePersistResult({
          url: typeof json?.url === "string" ? json.url : null,
          fileName: typeof json?.fileName === "string" ? json.fileName : null,
          savedAtUtc: new Date().toISOString(),
          error: null,
        });
        console.debug("[npv-trace] persisted", json);
      })
      .catch((error) => {
        setNpvTracePersistResult((prev) => ({ ...prev, error: (error as Error).message || "Request failed" }));
        console.warn("[npv-trace] request failed", error);
      });
  }, [debugEnabled, projectSnapshotData, projectSnapshotDiagnosticsMeta, projectViewMetrics, selectedProjectId, selectedProjectRawJson]);

  const corporateTimelineDebug = useMemo(() => {
    if (!corporateSnapshotData || !corporateViewMetrics) return null;
    let yearsByPeriod: number[];
    try {
      yearsByPeriod = requireYearsByPeriod(corporateSnapshotData.series);
    } catch {
      return null;
    }
    const timeline = (corporateSnapshotData.modeledValuationTimeline ?? null) as {
      tps?: number[];
      lastTp?: number | null;
      rangeEndTp?: number | null;
      markers?: Array<{ tp: number; corporateTpIndexUsed?: number | null; value_high: number | null; value_low: number | null }>;
    } | null;
    const markers = Array.isArray(timeline?.markers) ? timeline.markers : [];
    const financing = (corporateSnapshotData.financing ?? null) as Record<string, unknown> | null;
    const sharesPf = typeof financing?.shares_post_financing === "number"
      ? (financing.shares_post_financing as number)
      : null;
    const sharesCurrent = corporateViewMetrics.marketBox.sharesCurrent.value;
    const shareBasis = {
      usesShares: (sharesPf !== null ? "shares_post_financing" : "shares_current") as "shares_post_financing" | "shares_current",
      sharesValue: sharesPf ?? sharesCurrent ?? 0,
    };
    const todayLow = corporateViewMetrics.valuationTimeline.periods[corporateViewMetrics.valuationTimeline.todayPeriod]?.navPerShareTarget ?? null;
    const todayHigh = (typeof corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency === "number" && Number.isFinite(corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency)
      ? corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency
      : null);
    const points = [
      {
        pointType: "today" as const,
        tp: null,
        tIndexUsed: 0,
        yearLabelUsed: yearLabel(yearsByPeriod, 0),
        yearLabelSource: "series.yearsByPeriod[0]",
        lowValueUsed: todayLow,
        highValueUsed: todayHigh,
        lowSource: { metricKey: "valuationTimeline.today.navPerShareTarget", description: "canonical chart selector" },
        highSource: { metricKey: "DCF_prodStart_present_perShare_TargetCurrency", description: "ValueRangeSnapshotCard npvHigh" },
        perShareBasis: shareBasis,
        nullReasons: {
          ...(todayLow === null ? { low: corporateViewMetrics.list2.NAV_perShare?.reason ?? "Metric is null." } : {}),
          ...(todayHigh === null ? { high: "Both corporate snapshot and list2 discounted DCF per share are null." } : {}),
        },
        sanity: {
          lowLEHigh: (typeof todayLow === "number" && typeof todayHigh === "number") ? todayLow <= todayHigh : null,
          notes: "todayLow should map to NPV_today_perShare and todayHigh to DCF_prodStart_present_perShare.",
        },
        mappingUsed: { todayLow: "NPV_today_perShare", todayHigh: "DCF_prodStart_present_perShare" },
        expectedMappingPreview: {
          low: todayLow,
          high: typeof corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency === "number" ? corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency : null,
          yearLabel: yearLabel(yearsByPeriod, 0),
        },
      },
      ...markers.map((marker) => {
        const tIndex = typeof marker.corporateTpIndexUsed === "number" ? marker.corporateTpIndexUsed : marker.tp;
        return {
          pointType: "prodStart" as const,
          tp: marker.tp,
          tIndexUsed: tIndex,
          yearLabelUsed: yearLabel(yearsByPeriod, tIndex),
          yearLabelSource: `series.yearsByPeriod[${tIndex}]`,
          lowValueUsed: marker.value_low,
          highValueUsed: marker.value_high,
          lowSource: { metricKey: "modeledValuationTimeline.markers.value_low", description: "Current chart mapping uses marker.value_low" },
          highSource: { metricKey: "modeledValuationTimeline.markers.value_high", description: "Current chart mapping uses marker.value_high" },
          perShareBasis: shareBasis,
          nullReasons: {
            ...(marker.value_low === null ? { low: "Marker low is null." } : {}),
            ...(marker.value_high === null ? { high: "Marker high is null." } : {}),
          },
          sanity: {
            lowLEHigh: (typeof marker.value_low === "number" && typeof marker.value_high === "number") ? marker.value_low <= marker.value_high : null,
            notes: "If false, low/high are swapped versus chart intent.",
          },
          mappingUsed: {
            todayLow: "NPV_today_perShare",
            todayHigh: "DCF_prodStart_present_perShare",
            prodStartLow: "NPV_prodStart_perShare@tp (currently NOT used in chart)",
            prodStartHigh: "DCF_prodStart_perShare@tp",
          },
          expectedMappingPreview: {
            low: null,
            high: marker.value_high,
            yearLabel: yearLabel(yearsByPeriod, tIndex),
            notes: "NPV_prodStart_perShare@tp is not available in current marker payload; preview low stays null until exposed from backend.",
          },
        };
      }),
    ];
    return {
      chart: "corporate.modeled.valuationTimeline",
      corporateTpsList: Array.isArray(timeline?.tps) ? timeline?.tps : markers.map((m) => m.tp),
      lastTp: timeline?.lastTp ?? null,
      rangeEndTpUsed: timeline?.rangeEndTp ?? null,
      mappingUsed: {
        todayLow: "NPV_today_perShare",
        todayHigh: "DCF_prodStart_present_perShare",
        prodStartLow: "NPV_prodStart_perShare@tp",
        prodStartHigh: "DCF_prodStart_perShare@tp",
      },
      points,
    };
  }, [corporateSnapshotData, corporateViewMetrics]);

  useEffect(() => {
    if (debugEnabled && corporateTimelineDebug) {
      console.debug("[corporate-modeled-valuation-timeline-debug]", corporateTimelineDebug);
    }
  }, [corporateTimelineDebug, debugEnabled]);

  const dashboardTasks = useMemo(() => {
    const corporateByMetal = ((corporateDiagnostics?.meta as Record<string, unknown> | undefined)?.metalPriceDiagnostics ?? {}) as Record<string, Record<string, unknown>>;
    const projectByMetal = ((projectSnapshotDiagnosticsMeta ?? {}) as Record<string, unknown>).metalPriceDiagnostics as Record<string, Record<string, unknown>> | undefined;
    const needsByKey = new Map<string, {
      projectId: string;
      metal: string;
      metalKey: string;
      fmpSpotValue: number | null;
      unit: string | null;
    }>();

    const pushDiagnostics = (items: Record<string, Record<string, unknown>>, sourceProjectId: string) => {
      for (const [metal, item] of Object.entries(items)) {
        const metalKey = typeof item.priceKeyRequested === "string" ? item.priceKeyRequested : metal;
        const next = {
          projectId: sourceProjectId,
          metal,
          metalKey,
          fmpSpotValue: typeof item.livePriceValue === "number" && Number.isFinite(item.livePriceValue) ? item.livePriceValue : null,
          unit: typeof item.interpretedUnit === "string" ? item.interpretedUnit : null,
        };
        const prev = needsByKey.get(metalKey);
        if (!prev || (prev.fmpSpotValue === null && next.fmpSpotValue !== null)) {
          needsByKey.set(metalKey, next);
        }
      }
    };

    pushDiagnostics(corporateByMetal, "corporate");
    if (projectByMetal) {
      pushDiagnostics(projectByMetal, selectedProjectId ?? "project");
    }

    return collectDashboardTasks({ projectPriceNeeds: [...needsByKey.values()], manualByMetalKey: manualMetalPrices });
  }, [corporateDiagnostics, manualMetalPrices, projectSnapshotDiagnosticsMeta, selectedProjectId, ticker, primaryView, analysisMode]);

  const projectSeries = (projectSnapshotData?.series ?? null) as Record<string, unknown> | null;

  const projectMetalRevenueFailures = useMemo(() => {
    return extractFailingMetals(projectSnapshotDiagnosticsMeta?.metalRevenueDiagnostics ?? null);
  }, [projectSnapshotDiagnosticsMeta]);

  const projectMetalPriceFallbackOrFailureMetals = useMemo(() => {
    return extractFallbackOrFailingPriceMetals(projectSnapshotDiagnosticsMeta?.metalPriceDiagnostics ?? null);
  }, [projectSnapshotDiagnosticsMeta]);

  const projectMetalPriceDiagnostics = (projectSnapshotDiagnosticsMeta?.metalPriceDiagnostics ?? null) as Record<string, Record<string, unknown>> | null;
  const projectMissingPriceActions = useMemo(() => {
    const out: Array<{ metal: string; metalKey: string; unit: string | null; reason: string | null }> = [];
    if (!projectMetalPriceDiagnostics) return out;
    for (const [metal, item] of Object.entries(projectMetalPriceDiagnostics)) {
      const source = typeof item.priceSourceUsed === "string" ? item.priceSourceUsed : "";
      if (source !== "missing" && source !== "expired") continue;
      const metalKey = typeof item.priceKeyRequested === "string" ? item.priceKeyRequested : metal;
      const unit = typeof item.interpretedUnit === "string" ? item.interpretedUnit : null;
      const reason = typeof item.reason === "string" ? item.reason : null;
      out.push({ metal, metalKey, unit, reason });
    }
    return out;
  }, [projectMetalPriceDiagnostics]);


  const projectOperationsGridInput = useMemo((): OperationsGridInput | null => {
    if (!parsedSelectedProject) return null;
    const projectSeriesRecord = (projectSeries ?? {}) as Record<string, unknown>;
    const getSeries = (raw: unknown): Array<number | null> | null => (Array.isArray(raw) ? raw as Array<number | null> : null);
    const payableUnits = parsedSelectedProject.engineInputWithoutPrices.payableQtyUnitByMetal ?? {};
    const payableSeriesByMetal = parsedSelectedProject.engineInputWithoutPrices.payableQtyByMetal ?? {};
    const gradeByMetal = parsedSelectedProject.context.operations?.gradeByMetal ?? {};
    const gradeUnitByMetal = parsedSelectedProject.context.operations?.gradeUnitByMetal ?? {};
    const recoveryPctByMetal = parsedSelectedProject.context.operations?.recoveryPctByMetal ?? {};

    return {
      masterN: parsedSelectedProject.engineInputWithoutPrices.masterN,
      productionStartPeriod: parsedSelectedProject.engineInputWithoutPrices.productionStartPeriod,
      yearsByPeriod: parsedSelectedProject.engineInputWithoutPrices.yearsByPeriod,
      operations: {
        oreMilledTonnes: parsedSelectedProject.context.operations?.oreMilledTonnes,
        oreMinedTonnes: parsedSelectedProject.context.operations?.oreMinedTonnes,
        oreTonnageUnit: parsedSelectedProject.context.operations?.oreTonnageUnit,
        gradeByMetal,
        gradeUnitByMetal,
        recoveryPctByMetal,
        capacity: {
          throughputUnit: parsedSelectedProject.context.operations?.capacity?.throughputUnit,
          nameplateThroughput: parsedSelectedProject.context.operations?.capacity?.nameplateThroughput,
          utilizationPct: parsedSelectedProject.context.operations?.capacity?.utilizationPct,
        },
      },
      metals: {
        payableQtyByMetal: payableSeriesByMetal,
        payableQtyUnitByMetal: payableUnits,
      },
      economics: {
        priceUSDByMetal: (projectSeriesRecord.priceUsedByMetal_USD as Record<string, Array<number | null>> | undefined) ?? {},
        operatingCostsUSD: getSeries(projectSeriesRecord.operatingCostsUSD) ?? undefined,
        royaltiesUSD: getSeries(projectSeriesRecord.royaltiesUSD) ?? undefined,
        ebitdaUSD: getSeries(projectSeriesRecord.ebitdaUSD) ?? undefined,
        ebitUSD: getSeries(projectSeriesRecord.ebitUSD) ?? undefined,
        depreciationUSD: getSeries(projectSeriesRecord.depreciationUSD) ?? getSeries((parsedSelectedProject.context.series ?? {}).depreciationUSD) ?? undefined,
        taxableIncomeUSD: getSeries(projectSeriesRecord.taxableIncomeUSD) ?? undefined,
        taxUSD: getSeries(projectSeriesRecord.taxUSD) ?? undefined,
        effectiveTaxRate: getSeries(projectSeriesRecord.effectiveTaxRate) ?? undefined,
      },
    };
  }, [parsedSelectedProject, projectSeries]);

  const projectExcelGrid = useMemo(() => {
    if (!parsedSelectedProject || !projectOperationsGridInput) return null;

    const projectSeriesRecord = (projectSeries ?? {}) as Record<string, unknown>;
    const getSeries = (raw: unknown): Array<number | null> | null => (Array.isArray(raw) ? raw as Array<number | null> : null);
    const payableUnits = parsedSelectedProject.engineInputWithoutPrices.payableQtyUnitByMetal ?? {};
    const payableSeriesByMetal = parsedSelectedProject.engineInputWithoutPrices.payableQtyByMetal ?? {};
    const gradeByMetal = parsedSelectedProject.context.operations?.gradeByMetal ?? {};
    const gradeUnitByMetal = parsedSelectedProject.context.operations?.gradeUnitByMetal ?? {};
    const recoveryPctByMetal = parsedSelectedProject.context.operations?.recoveryPctByMetal ?? {};

    const priorityMetals = ['Au', 'Ag', 'Cu', 'Zn', 'Pb', 'Ni', 'Co', 'Pt', 'Pd'];
    const presentMetals = Array.from(new Set([
      ...Object.keys(payableSeriesByMetal),
      ...Object.keys(gradeByMetal),
      ...Object.keys(recoveryPctByMetal),
    ]));
    const orderedMetals = [
      ...priorityMetals.filter((metal) => presentMetals.includes(metal)),
      ...presentMetals.filter((metal) => !priorityMetals.includes(metal)).sort((a, b) => a.localeCompare(b)),
    ];
    const orderedPayableMetals = orderedMetals.filter((metal) => Object.prototype.hasOwnProperty.call(payableSeriesByMetal, metal));

    const base = buildOperationsGridModel(projectOperationsGridInput);

    const seriesByLabel = new Map(base.rows.map((row) => [row.label, row.values]));
    const oreUnit = parsedSelectedProject.context.operations?.oreTonnageUnit ?? 'tonne';

    const productionRows = [
      { label: `Ore mined (${oreUnit})`, values: seriesByLabel.get(`Ore mined (${oreUnit})`) ?? null },
      { label: `Ore milled (${oreUnit})`, values: seriesByLabel.get(`Ore milled (${oreUnit})`) ?? null },
      ...orderedPayableMetals.map((metal) => {
        const unit = gradeUnitByMetal[metal] ?? '—';
        const label = `Grade ${metal} (${unit})`;
        const values = seriesByLabel.get(label) ?? null;
        if (!rowHasDisplayValue(values)) return null;
        return { label, values };
      }),
      ...orderedPayableMetals.map((metal) => {
        const label = `Recovery ${metal} (%)`;
        const values = seriesByLabel.get(label) ?? null;
        if (!rowHasDisplayValue(values)) return null;
        return { label, values };
      }),
      ...orderedMetals.map((metal) => {
        const values = getSeries(payableSeriesByMetal[metal]);
        const unit = payableUnits[metal];
        const include = rowHasDisplayValue(values);
        return {
          label: `Payable ${metal} (${unit ?? '—'})`,
          values: include ? values : null,
        };
      }),
    ].filter((row) => row && row.values !== null) as Array<{ label: string; values: Array<number | null> }>;

    const revenueRows = orderedMetals
      .map((metal) => ({ label: `Revenue ${metal} (USD)`, values: seriesByLabel.get(`Revenue ${metal} (USD)`) ?? null }))
      .filter((row) => rowHasDisplayValue(row.values)) as Array<{ label: string; values: Array<number | null> }>;

    const royaltiesFromDetail = (() => {
      const detail = projectSeriesRecord.royaltiesDetail as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(detail) || detail.length === 0) return null;
      const first = detail[0]?.royaltyUSD;
      if (!Array.isArray(first)) return null;
      return Array.from({ length: first.length }, (_, t) => {
        let sum = 0;
        let hasFinite = false;
        for (const item of detail) {
          const series = item.royaltyUSD as Array<number | null> | undefined;
          const value = series?.[t];
          if (typeof value === 'number' && Number.isFinite(value)) {
            sum += value;
            hasFinite = true;
          }
        }
        return hasFinite ? sum : null;
      });
    })();
    const grossRevenueSeries = seriesByLabel.get('Gross revenue (USD)') ?? getSeries(projectSeriesRecord.totalRevenue_USD);
    const resolvedRoyaltiesUSD = royaltiesFromDetail ?? getSeries(projectSeriesRecord.royaltiesUSD);
    const royaltyRatePct = Array.from({ length: base.tMinusTp.length }, (_, t) => {
      if (!royaltiesFromDetail) return null;
      const grossRevenue = grossRevenueSeries?.[t] ?? null;
      const royalties = resolvedRoyaltiesUSD?.[t] ?? null;
      if (typeof grossRevenue !== 'number' || !Number.isFinite(grossRevenue)) return null;
      if (typeof royalties !== 'number' || !Number.isFinite(royalties)) return null;
      if (grossRevenue === 0) return royalties === 0 ? 0 : null;
      return (royalties / grossRevenue) * 100;
    });

    const pAndLCoreRows = [
      ...revenueRows,
      { label: 'Gross revenue (USD)', values: grossRevenueSeries ?? null },
      { label: 'Royalty rate (%)', values: royaltyRatePct },
      { label: 'Royalties (USD)', values: resolvedRoyaltiesUSD },
      { label: 'Gross profit (USD)', values: seriesByLabel.get('Gross profit (USD)') ?? null },
      { label: 'EBITDA (USD, includes royalties)', values: seriesByLabel.get('EBITDA (USD, includes royalties)') ?? null },
      { label: 'EBIT (USD)', values: getSeries(projectSeriesRecord.ebitUSD) },
      { label: 'Operating costs (USD)', values: getSeries(projectSeriesRecord.operatingCostsUSD) },
    ]
      .filter((row) => {
        if (row.label === 'Royalty rate (%)' || row.label === 'Royalties (USD)') return Array.isArray(row.values);
        return rowHasDisplayValue(row.values);
      }) as Array<{ label: string; values: Array<number | null> }>;

    const taxRows = [
      ['Taxable income (USD)', projectSeriesRecord.taxableIncomeUSD],
      ['Tax (USD)', projectSeriesRecord.taxUSD],
      ['Effective tax rate', projectSeriesRecord.effectiveTaxRate],
    ]
      .map(([label, values]) => ({ label, values: getSeries(values) }))
      .filter((row) => rowHasDisplayValue(row.values)) as Array<{ label: string; values: Array<number | null> }>;

    const capitalRows = [
      ['Sustaining capex (USD)', projectSeriesRecord.sustainingCapexUSD],
      ['Reclamation (USD)', projectSeriesRecord.reclamationUSD],
      ['Working capital delta (USD)', projectSeriesRecord.workingCapitalDeltaUSD],
      ['Byproduct credits (USD)', projectSeriesRecord.byproductCreditsUSD],
    ]
      .map(([label, values]) => ({ label, values: getSeries(values) }))
      .filter((row) => rowHasDisplayValue(row.values)) as Array<{ label: string; values: Array<number | null> }>;

    const investmentRows = [
      ['Capex (USD)', projectSeriesRecord.capexUSD],
      ['FCFF (USD)', projectSeriesRecord.fcffUSD],
    ]
      .map(([label, values]) => ({ label, values: getSeries(values) }))
      .filter((row) => rowHasDisplayValue(row.values)) as Array<{ label: string; values: Array<number | null> }>;

    const failedMetals = new Set([...Object.keys(projectMetalRevenueFailures), ...projectMetalPriceFallbackOrFailureMetals]);
    const groupedRows: Array<{ type: 'divider'; label: string } | { type: 'data'; label: string; values: Array<number | null>; hasMetalRevenueFailure?: boolean }> = [];
    const addSection = (label: string, rows: Array<{ label: string; values: Array<number | null> }>) => {
      if (rows.length === 0) return;
      groupedRows.push({ type: 'divider', label });
      rows.forEach((row) => {
        const hasMetalRevenueFailure = rowHasMetalRevenueFailure(row.label, Array.from(failedMetals));
        groupedRows.push({ type: 'data', ...row, hasMetalRevenueFailure });
      });
    };

    addSection('PRODUCTION', productionRows);
    addSection('P&L CORE', pAndLCoreRows);
    addSection('TAX', taxRows);
    addSection('CAPITAL', capitalRows);
    addSection('INVESTMENT & CASH FLOW', investmentRows);

    const depreciationSeries = getSeries((parsedSelectedProject.context.series ?? {}).depreciationUSD);
    const hasDepreciationSeries = Array.isArray(depreciationSeries);

    return {
      ...base,
      tMinusTp: base.tMinusTp.map((value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return value;
        return num < 0 ? '' : value;
      }),
      notes: hasDepreciationSeries ? base.notes : [...base.notes, 'EBITDA requires D&A series; missing => null'],
      rows: groupedRows,
    };
  }, [parsedSelectedProject, projectSeries, projectOperationsGridInput, projectMetalRevenueFailures, projectMetalPriceFallbackOrFailureMetals]);


  const projectPnlTraceDebugger = useMemo(() => {
    if (!projectSeries) return null;
    const record = projectSeries as Record<string, unknown>;
    const seriesOrNull = (value: unknown): Array<number | null> | null => (Array.isArray(value) ? value as Array<number | null> : null);
    const revenueByMetal = (record.revenueByMetal_USD ?? {}) as Record<string, Array<number | null>>;
    const orderedRevenueMetals = Object.keys(revenueByMetal).sort((a, b) => a.localeCompare(b));
    const grossRevenueFromPhase1 = seriesOrNull(record.grossRevenueUSD);
    const grossRevenueFromRevenueTable = seriesOrNull(record.totalRevenue_USD);
    const grossRevenue = grossRevenueFromPhase1 ?? grossRevenueFromRevenueTable;
    const grossRevenueSource = grossRevenueFromPhase1
      ? 'series.grossRevenueUSD'
      : 'series.totalRevenue_USD';
    const operatingCosts = seriesOrNull(record.operatingCostsUSD);
    const royalties = (() => {
      const detail = Array.isArray(record.royaltiesDetail) ? record.royaltiesDetail as Array<Record<string, unknown>> : [];
      if (detail.length > 0 && Array.isArray(detail[0]?.royaltyUSD)) {
        const n = (detail[0].royaltyUSD as Array<unknown>).length;
        return Array.from({ length: n }, (_, t) => {
          let sum = 0;
          let hasFinite = false;
          for (const item of detail) {
            const value = Array.isArray(item.royaltyUSD) ? item.royaltyUSD[t] : null;
            if (typeof value === "number" && Number.isFinite(value)) {
              sum += value;
              hasFinite = true;
            }
          }
          return hasFinite ? sum : null;
        });
      }
      return seriesOrNull(record.royaltiesUSD);
    })();
    const grossProfit = seriesOrNull(record.grossProfitUSD);
    const ebitda = seriesOrNull(record.ebitdaUSD);
    const ebit = seriesOrNull(record.ebitUSD);
    const siteGandA = seriesOrNull(record.siteGandA_USD);
    const byproductCredits = seriesOrNull(record.byproductCreditsUSD);
    const tax = seriesOrNull(record.taxUSD);
    const sustainingCapex = seriesOrNull(record.sustainingCapexUSD);
    const reclamation = seriesOrNull(record.reclamationUSD);
    const workingCapitalDelta = seriesOrNull(record.workingCapitalDeltaUSD);
    const capex = seriesOrNull(record.capexUSD);
    const fcff = seriesOrNull(record.fcffUSD);

    const firstNegativeEbitPeriod = Array.isArray(ebit)
      ? ebit.findIndex((value) => typeof value === "number" && value < 0)
      : -1;
    const firstRevenuePeriod = Array.isArray(grossRevenue)
      ? grossRevenue.findIndex((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
      : -1;
    const fallbackPeriod = Array.isArray(grossRevenue) && grossRevenue.length > 0
      ? Math.min(6, grossRevenue.length - 1)
      : -1;
    const spotlightPeriod = firstRevenuePeriod >= 0
      ? firstRevenuePeriod
      : fallbackPeriod;

    const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
    const asNumberOrNull = (value: unknown): number | null => (isFiniteNumber(value) ? value : null);
    const seriesValue = (series: Array<number | null> | null, t: number): number | null => {
      if (!Array.isArray(series) || t < 0) return null;
      return asNumberOrNull(series[t]);
    };

    const royaltiesDiagnosticsByProject = (projectSnapshotDiagnosticsMeta?.royaltiesDiagnostics ?? null) as Record<string, Record<string, unknown>> | null;
    const projectRoyaltyDiagnostics = selectedProjectId && royaltiesDiagnosticsByProject
      ? (royaltiesDiagnosticsByProject[selectedProjectId] ?? null)
      : null;
    const royaltiesDetailFromSnapshot = Array.isArray(record.royaltiesDetail) ? record.royaltiesDetail as Array<Record<string, unknown>> : [];
    const royaltiesDetailFromJson = (() => {
      const rawEco = (selectedProjectRawJson?.economicsBreakdown ?? null) as Record<string, unknown> | null;
      const rawDetail = rawEco?.royaltiesDetail;
      return Array.isArray(rawDetail) ? rawDetail as Array<Record<string, unknown>> : [];
    })();
    const royaltiesRulesSource = royaltiesDetailFromJson.length > 0
      ? royaltiesDetailFromJson
      : royaltiesDetailFromSnapshot;
    const royaltiesSnapshotById = new Map(
      royaltiesDetailFromSnapshot.map((detail) => [String(detail.id ?? ''), detail]),
    );

    const royaltiesRulesDebug = royaltiesRulesSource.map((detail, idx) => {
      const base = String(detail.base ?? '').trim().toLowerCase();
      const rateType = String(detail.rateType ?? '').trim().toLowerCase();
      const rate = asNumberOrNull(detail.rate);
      const ruleId = String(detail.id ?? `rule-${idx}`);
      const snapshotMatch = royaltiesSnapshotById.get(ruleId);
      const royaltySeries = Array.isArray(snapshotMatch?.royaltyUSD)
        ? snapshotMatch.royaltyUSD as Array<number | null>
        : (Array.isArray(detail.royaltyUSD) ? detail.royaltyUSD as Array<number | null> : null);
      const grossAtSpotlight = seriesValue(grossRevenue, spotlightPeriod);
      const royaltyAtSpotlight = seriesValue(royaltySeries, spotlightPeriod);
      const requirements = [
        {
          label: 'base måste vara "revenue"',
          passed: base === 'revenue',
          actual: base || '(tomt)',
        },
        {
          label: 'rateType måste vara "nsr_pct" eller "ad_valorem_pct"',
          passed: rateType === 'nsr_pct' || rateType === 'ad_valorem_pct',
          actual: rateType || '(tomt)',
        },
        {
          label: 'rate måste vara ett ändligt tal',
          passed: rate !== null,
          actual: detail.rate ?? null,
        },
        {
          label: `gross revenue måste vara numerisk i spotlight t=${spotlightPeriod}`,
          passed: grossAtSpotlight !== null,
          actual: grossAtSpotlight,
        },
      ];
      return {
        id: ruleId,
        label: String(detail.label ?? detail.name ?? `Rule ${idx + 1}`),
        hasTechnicalFields: typeof detail.base !== 'undefined' || typeof detail.rateType !== 'undefined' || typeof detail.rate !== 'undefined',
        royaltySeriesSource: Array.isArray(snapshotMatch?.royaltyUSD) ? 'series.royaltiesDetail' : 'json.royaltiesDetail',
        rate,
        rateType,
        base,
        royaltyAtSpotlight,
        grossRevenueAtSpotlight: grossAtSpotlight,
        requirements,
      };
    });

    const ebitWalkthrough = (() => {
      if (spotlightPeriod < 0) return null;
      const inputRows = [
        { key: 'Gross revenue', rawValue: seriesValue(grossRevenue, spotlightPeriod), sign: '+' },
        { key: 'Operating costs', rawValue: seriesValue(operatingCosts, spotlightPeriod), sign: '-' },
        { key: 'Sustaining capex', rawValue: seriesValue(sustainingCapex, spotlightPeriod), sign: '-' },
        { key: 'Site G&A', rawValue: seriesValue(siteGandA, spotlightPeriod), sign: '-' },
        { key: 'Royalties', rawValue: seriesValue(royalties, spotlightPeriod), sign: '-' },
        { key: 'Reclamation', rawValue: seriesValue(reclamation, spotlightPeriod), sign: '-' },
        { key: 'Byproduct credits', rawValue: seriesValue(byproductCredits, spotlightPeriod), sign: '+' },
      ] as const;
      const inputRowsWithEngineValue = inputRows.map((row) => ({
        ...row,
        usedByEngine: row.rawValue ?? 0,
      }));
      const coercedToZero = inputRowsWithEngineValue
        .filter((row) => row.rawValue === null)
        .map((row) => row.key);
      const ebitdaComputed = inputRowsWithEngineValue[0].usedByEngine
        - inputRowsWithEngineValue[1].usedByEngine
        - inputRowsWithEngineValue[2].usedByEngine
        - inputRowsWithEngineValue[3].usedByEngine
        - inputRowsWithEngineValue[4].usedByEngine
        - inputRowsWithEngineValue[5].usedByEngine
        + inputRowsWithEngineValue[6].usedByEngine;
      const depreciationAtSpotlight = seriesValue((seriesOrNull((parsedSelectedProject?.context?.series ?? {}).depreciationUSD) ?? null), spotlightPeriod)
        ?? seriesValue((seriesOrNull(record.depreciationUSD) ?? null), spotlightPeriod);
      const depreciationUsedByEngine = depreciationAtSpotlight ?? 0;
      const ebitComputed = ebitdaComputed - depreciationUsedByEngine;
      const ebitReported = seriesValue(ebit, spotlightPeriod);
      const taxAtSpotlight = seriesValue(tax, spotlightPeriod);
      const capexAtSpotlight = seriesValue(capex, spotlightPeriod);
      const sustainingCapexAtSpotlight = seriesValue(sustainingCapex, spotlightPeriod);
      const workingCapitalDeltaAtSpotlight = seriesValue(workingCapitalDelta, spotlightPeriod);
      const reclamationAtSpotlight = seriesValue(reclamation, spotlightPeriod);
      const fcffRecomputedFromEbit = ebitReported === null
        ? null
        : ebitReported
          - (taxAtSpotlight ?? 0)
          + (depreciationAtSpotlight ?? 0)
          - (sustainingCapexAtSpotlight ?? 0)
          - (capexAtSpotlight ?? 0)
          - (workingCapitalDeltaAtSpotlight ?? 0)
          - (reclamationAtSpotlight ?? 0);
      const fcffReported = seriesValue(fcff, spotlightPeriod);
      const fcffDiff = fcffRecomputedFromEbit !== null && fcffReported !== null
        ? fcffReported - fcffRecomputedFromEbit
        : null;
      return {
        t: spotlightPeriod,
        ebitReported,
        ebitComputed,
        ebitdaComputed,
        depreciationAtSpotlight,
        depreciationUsedByEngine,
        taxAtSpotlight,
        capexAtSpotlight,
        sustainingCapexAtSpotlight,
        workingCapitalDeltaAtSpotlight,
        reclamationAtSpotlight,
        fcffRecomputedFromEbit,
        fcffReported,
        fcffDiff,
        inputRows: inputRowsWithEngineValue,
        coercedToZero,
        grossRevenueSource,
      };
    })();

    return {
      singleSourceOfTruth: "Instrumentbräda-tabellen läser värden från projectSnapshotData.series (samma källa för raderna i Production → P&L → FCFF).",
      note: "Inga dolda avdrag i UI: negativa EBIT/FCFF kommer från explicita seriekomponenter (costs, royalties, G&A, tax, capex, etc.).",
      ebitSpotlight: firstNegativeEbitPeriod >= 0
        ? {
          t: firstNegativeEbitPeriod,
          ebit: ebit?.[firstNegativeEbitPeriod] ?? null,
          grossRevenue: grossRevenue?.[firstNegativeEbitPeriod] ?? null,
          operatingCosts: operatingCosts?.[firstNegativeEbitPeriod] ?? null,
          siteGandA: siteGandA?.[firstNegativeEbitPeriod] ?? null,
          royalties: royalties?.[firstNegativeEbitPeriod] ?? null,
          byproductCredits: byproductCredits?.[firstNegativeEbitPeriod] ?? null,
        }
        : null,
      ebitWalkthrough,
      royaltiesRuleChecks: royaltiesRulesDebug,
      royaltiesPipelineDiagnostics: projectRoyaltyDiagnostics,
      grossRevenueSource,
      grossRevenueCrossCheck: (() => {
        if (!grossRevenueFromPhase1 || !grossRevenueFromRevenueTable || spotlightPeriod < 0) return null;
        const phase1Value = seriesValue(grossRevenueFromPhase1, spotlightPeriod);
        const revenueTableValue = seriesValue(grossRevenueFromRevenueTable, spotlightPeriod);
        if (phase1Value === null || revenueTableValue === null) return null;
        return {
          t: spotlightPeriod,
          phase1GrossRevenue: phase1Value,
          revenueTableGrossRevenue: revenueTableValue,
          diff: revenueTableValue - phase1Value,
        };
      })(),
      blocks: [
        {
          label: "Gross revenue",
          formula: "Σ Revenue metal (USD)",
          calculatedIn: "snapshot series pipeline (rendered as totalRevenue_USD)",
          sourceOfTruth: grossRevenueSource,
          inputs: orderedRevenueMetals.map((metal) => ({
            label: `Revenue ${metal}`,
            source: `series.revenueByMetal_USD.${metal}`,
            values: revenueByMetal[metal],
          })),
          output: grossRevenue,
        },
        {
          label: "Gross profit",
          formula: "grossRevenue - operatingCosts",
          calculatedIn: "snapshot series pipeline (rendered as grossProfitUSD)",
          sourceOfTruth: "series.grossProfitUSD",
          inputs: [
            { label: "Gross revenue", source: grossRevenueSource, values: grossRevenue },
            { label: "Operating costs", source: "series.operatingCostsUSD", values: operatingCosts },
            { label: "Royalties", source: "series.royaltiesDetail/series.royaltiesUSD", values: royalties },
            { label: "Byproduct credits", source: "series.byproductCreditsUSD", values: byproductCredits },
          ],
          output: grossProfit,
        },
        {
          label: "EBITDA",
          formula: "grossRevenue - operatingCosts - sustainingCapex - siteG&A - royalties - reclamation + byproductCredits",
          calculatedIn: "snapshot series pipeline",
          sourceOfTruth: "series.ebitdaUSD",
          inputs: [
            { label: "Gross revenue", source: grossRevenueSource, values: grossRevenue },
            { label: "Operating costs", source: "series.operatingCostsUSD", values: operatingCosts },
            { label: "Sustaining capex", source: "series.sustainingCapexUSD", values: sustainingCapex },
            { label: "Site G&A", source: "series.siteGandA_USD", values: siteGandA },
            { label: "Royalties", source: "series.royaltiesDetail/series.royaltiesUSD", values: royalties },
            { label: "Reclamation", source: "series.reclamationUSD", values: reclamation },
            { label: "Byproduct credits", source: "series.byproductCreditsUSD", values: byproductCredits },
          ],
          output: ebitda,
        },
        {
          label: "EBIT",
          formula: "EBITDA - depreciation",
          calculatedIn: "snapshot series pipeline",
          sourceOfTruth: "series.ebitUSD",
          inputs: [
            { label: "EBITDA", source: "series.ebitdaUSD", values: ebitda },
            { label: "Depreciation", source: "series.depreciationUSD", values: seriesOrNull(record.depreciationUSD) },
          ],
          output: ebit,
        },
        {
          label: "Operating costs",
          formula: "direkt serie (ingen extra härledning i UI)",
          calculatedIn: "snapshot series pipeline",
          sourceOfTruth: "series.operatingCostsUSD",
          inputs: [{ label: "Operating costs", source: "series.operatingCostsUSD", values: operatingCosts }],
          output: operatingCosts,
        },
        {
          label: "FCFF",
          formula: "grossRevenue - operatingCosts - siteG&A - royalties - tax - sustainingCapex - reclamation - workingCapitalDelta - capex + byproductCredits",
          calculatedIn: "snapshot series pipeline",
          sourceOfTruth: "series.fcffUSD",
          inputs: [
            { label: "Gross revenue", source: grossRevenueSource, values: grossRevenue },
            { label: "Operating costs", source: "series.operatingCostsUSD", values: operatingCosts },
            { label: "Site G&A", source: "series.siteGandA_USD", values: siteGandA },
            { label: "Royalties", source: "series.royaltiesDetail/series.royaltiesUSD", values: royalties },
            { label: "Tax", source: "series.taxUSD", values: tax },
            { label: "Sustaining capex", source: "series.sustainingCapexUSD", values: sustainingCapex },
            { label: "Reclamation", source: "series.reclamationUSD", values: reclamation },
            { label: "Working capital delta", source: "series.workingCapitalDeltaUSD", values: workingCapitalDelta },
            { label: "Capex", source: "series.capexUSD", values: capex },
            { label: "Byproduct credits", source: "series.byproductCreditsUSD", values: byproductCredits },
          ],
          output: fcff,
        },
      ],
    };
  }, [parsedSelectedProject, projectSeries, projectSnapshotDiagnosticsMeta, selectedProjectId, selectedProjectRawJson]);

  const projectMountDebug = useMemo(() => {
    const rawJson = selectedProjectRawJson;
    const rawTime = rawJson && typeof rawJson.time === "object" && rawJson.time !== null && !Array.isArray(rawJson.time)
      ? rawJson.time as Record<string, unknown>
      : null;
    const tp = Number.isInteger(projectOperationsGridInput?.productionStartPeriod)
      ? projectOperationsGridInput?.productionStartPeriod as number
      : null;
    const yearsByPeriod = Array.isArray(projectOperationsGridInput?.yearsByPeriod)
      ? projectOperationsGridInput.yearsByPeriod
      : [];

    const alignmentSources: Record<string, Array<number | null> | undefined> = {
      'operations.oreMinedTonnes': projectOperationsGridInput?.operations?.oreMinedTonnes,
      'operations.oreMilledTonnes': projectOperationsGridInput?.operations?.oreMilledTonnes,
      'series.capexUSD': parsedSelectedProject?.engineInputWithoutPrices.phase1.capexUSD,
      'metals.payableQtyByMetal.Au': projectOperationsGridInput?.metals?.payableQtyByMetal?.Au,
      'metals.payableQtyByMetal.Ag': projectOperationsGridInput?.metals?.payableQtyByMetal?.Ag,
      'metals.payableQtyByMetal.Cu': projectOperationsGridInput?.metals?.payableQtyByMetal?.Cu,
    };

    const productionDriverFirstNonZeroIndex = buildProductionDriverFirstNonZeroMap({
      oreMinedTonnes: projectOperationsGridInput?.operations?.oreMinedTonnes,
      oreMilledTonnes: projectOperationsGridInput?.operations?.oreMilledTonnes,
      payableQtyByMetal: projectOperationsGridInput?.metals?.payableQtyByMetal,
    });
    const productionStartIndexCandidateValue = productionStartIndexCandidate(productionDriverFirstNonZeroIndex);

    const alignmentCheck = Object.fromEntries(Object.entries(alignmentSources).map(([key, values]) => {
      const nonZero = firstNonZeroIndex(values);
      const valueAtTp = tp === null ? null : (values?.[tp] ?? null);
      const valueAtTpPlus1 = tp === null ? null : (values?.[tp + 1] ?? null);
      return [key, {
        valueAtTp,
        valueAtTpPlus1,
        firstNonZeroIndex: nonZero,
        doesFirstNonZeroEqualTp: tp === null || nonZero === null ? null : nonZero === tp,
      }];
    }));

    const yearAtT0 = Number.isInteger(yearsByPeriod[0]) ? yearsByPeriod[0] : null;
    const yearAtTp = tp === null ? null : (Number.isInteger(yearsByPeriod[tp]) ? yearsByPeriod[tp] : null);
    const expectedYearAtTp = rawTime && Number.isInteger(rawTime.productionStartYear)
      ? rawTime.productionStartYear
      : null;
    const yearAtCand = productionStartIndexCandidateValue === null ? null : (Number.isInteger(yearsByPeriod[productionStartIndexCandidateValue]) ? yearsByPeriod[productionStartIndexCandidateValue] : null);

    const parseError = (() => {
      if (!rawJson) return "No selected project raw JSON.";
      if (!parsedSelectedProject) return "Project JSON parse failed for strict project_json_v2 validation. Check tp/year and production-driver alignment.";
      return null;
    })();

    return {
      parseError,
      raw: {
        version: rawJson?.version ?? null,
        time: {
          masterN: rawTime?.masterN ?? null,
          productionStartPeriod: rawTime?.productionStartPeriod ?? null,
          productionStartYear: rawTime?.productionStartYear ?? null,
          yearsByPeriod_first8: yearsByPeriod.slice(0, 8),
        },
      },
      engine: {
        masterN: projectOperationsGridInput?.masterN ?? null,
        productionStartPeriod: projectOperationsGridInput?.productionStartPeriod ?? null,
        productionStartYear: expectedYearAtTp,
        yearsByPeriod_first8: yearsByPeriod.slice(0, 8),
      },
      alignmentCheck,
      productionStartIndexCandidate: productionStartIndexCandidateValue,
      driverFirstNonZeroIndex: productionDriverFirstNonZeroIndex,
      yearCheck: {
        yearAtT0,
        yearAtTp,
        yearAtCand,
        expectedYearAtTp,
        doesYearMatchTp: yearAtTp === null || expectedYearAtTp === null ? null : yearAtTp === expectedYearAtTp,
      },
    };
  }, [projectOperationsGridInput, parsedSelectedProject, selectedProjectRawJson]);


  const strictTpAlignmentError = useMemo(() => {
    const message = typeof projectMountDebug === "object" && projectMountDebug !== null && typeof (projectMountDebug as Record<string, unknown>).parseError === "string"
      ? (projectMountDebug as Record<string, unknown>).parseError as string
      : null;
    if (message) {
      return {
        message,
        driverFirstNonZeroIndex: (projectMountDebug as Record<string, unknown>).driverFirstNonZeroIndex ?? null,
      };
    }
    const debug = projectMountDebug as Record<string, unknown>;
    const tpRaw = debug?.engine && typeof debug.engine === "object" ? (debug.engine as Record<string, unknown>).productionStartPeriod : null;
    const candidateRaw = debug?.productionStartIndexCandidate;
    const yearCheck = (debug?.yearCheck && typeof debug.yearCheck === "object") ? debug.yearCheck as Record<string, unknown> : null;
    const tp = Number.isInteger(tpRaw) ? tpRaw as number : null;
    const candidate = Number.isInteger(candidateRaw) ? candidateRaw as number : null;
    const yearAtTp = Number.isInteger(yearCheck?.yearAtTp) ? yearCheck?.yearAtTp as number : null;
    const expectedYearAtTp = Number.isInteger(yearCheck?.expectedYearAtTp) ? yearCheck?.expectedYearAtTp as number : null;
    const yearAtCand = Number.isInteger(yearCheck?.yearAtCand) ? yearCheck?.yearAtCand as number : null;
    if (tp !== null && candidate !== null && candidate !== tp) {
      return {
        message: `tp mismatch: tp=${tp} (year ${yearAtTp ?? "n/a"}) but first production driver is at index ${candidate} (year ${yearAtCand ?? "n/a"}). Fix by either changing tp or shifting your production-driver series so first non-zero equals tp.`,
        driverFirstNonZeroIndex: debug.driverFirstNonZeroIndex ?? null,
      };
    }
    if (tp !== null && tp > 0 && candidate === null) {
      return {
        message: "No production series has non-zero values, cannot validate tp.",
        driverFirstNonZeroIndex: debug.driverFirstNonZeroIndex ?? null,
      };
    }
    if (yearAtTp !== null && expectedYearAtTp !== null && yearAtTp !== expectedYearAtTp) {
      return {
        message: `time.productionStartYear mismatch: productionStartYear=${expectedYearAtTp} but yearAtTp=${yearAtTp}.`,
        driverFirstNonZeroIndex: debug.driverFirstNonZeroIndex ?? null,
      };
    }
    return null;
  }, [projectMountDebug]);
  const reportedChartContext: ReportedChartContext = {
    resolveUnitMeta,
    marketCurrency,
    statementCurrency,
    mixedCurrencyNote,
  };
  const mappedSectorOptions = useMemo(() => {
    return Array.from(new Set(mappedCompanies.map((item) => item.sectorId).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [mappedCompanies]);
  const mappedSubsectorOptions = useMemo(() => {
    if (!selectedMappedSector) return [];
    return Array.from(
      new Set(
        mappedCompanies
          .filter((item) => item.sectorId === selectedMappedSector)
          .map((item) => item.subsectorId)
          .filter((item): item is string => Boolean(item))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [mappedCompanies, selectedMappedSector]);
  const mappedRowsForSpecificOptions = useMemo(() => {
    return mappedCompanies.filter((item) =>
      (!selectedMappedSector || item.sectorId === selectedMappedSector)
      && (!selectedMappedSubsector || item.subsectorId === selectedMappedSubsector)
    );
  }, [mappedCompanies, selectedMappedSector, selectedMappedSubsector]);
  const specificMappingOptions = useMemo(() => {
    const options = new Set<string>();
    for (const row of mappedRowsForSpecificOptions) {
      for (const mapping of row.specificMappings) {
        options.add(mapping);
      }
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [mappedRowsForSpecificOptions]);
  const mappedCategoryOptions = useMemo(() => {
    const candidates = mappedRowsForSpecificOptions.filter((item) =>
      !selectedSpecificMapping || item.specificMappings.includes(selectedSpecificMapping)
    );
    return Array.from(new Set(candidates.map((item) => item.category).filter((item): item is string => Boolean(item)))).sort((a, b) => a.localeCompare(b));
  }, [mappedRowsForSpecificOptions, selectedSpecificMapping]);
  const filteredMappedRows = useMemo(() => {
    return mappedCompanies.filter((item) =>
      (!selectedMappedSector || item.sectorId === selectedMappedSector)
      && (!selectedMappedSubsector || item.subsectorId === selectedMappedSubsector)
      && (!selectedSpecificMapping || item.specificMappings.includes(selectedSpecificMapping))
      && (!selectedMappedCategory || item.category === selectedMappedCategory)
    );
  }, [mappedCompanies, selectedMappedCategory, selectedMappedSector, selectedMappedSubsector, selectedSpecificMapping]);
  const filteredMappedTickers = useMemo(() => {
    return Array.from(new Set(filteredMappedRows.map((item) => item.ticker))).sort((a, b) => a.localeCompare(b));
  }, [filteredMappedRows]);
  const anyMappingFilterActive = Boolean(selectedMappedSector || selectedMappedSubsector || selectedSpecificMapping || selectedMappedCategory);
  const tickerOptions = anyMappingFilterActive ? filteredMappedTickers : availableTickers;
  const mappedTickerSetForPicker = anyMappingFilterActive ? filteredMappedTickers : [];

  useEffect(() => {
    if (!selectedMappedSubsector) return;
    if (!mappedSubsectorOptions.includes(selectedMappedSubsector)) {
      setSelectedMappedSubsector("");
    }
  }, [mappedSubsectorOptions, selectedMappedSubsector]);

  useEffect(() => {
    if (!selectedSpecificMapping) return;
    if (!specificMappingOptions.includes(selectedSpecificMapping)) {
      setSelectedSpecificMapping("");
    }
  }, [selectedSpecificMapping, specificMappingOptions]);

  useEffect(() => {
    if (!selectedMappedCategory) return;
    if (!mappedCategoryOptions.includes(selectedMappedCategory)) {
      setSelectedMappedCategory("");
    }
  }, [mappedCategoryOptions, selectedMappedCategory]);

  const selectedTickerLabel = data?.ticker ?? ticker;
  const companyHeaderTitle = profile?.companyName
    ? `${profile.companyName}${selectedTickerLabel ? ` (${selectedTickerLabel})` : ""}`
    : selectedTickerLabel;
  const hasSelectedCompany = Boolean(data?.ticker && !error);

  return (
    <div className="single-stock-dashboard">
      <div className="breadcontainersinglecolumn">
        <div className="producer-core-compact-card single-stock-search-card">
          <h2 className="subrub small">Single Stock</h2>
          <div className="stock-selector">
            <div className="stock-selector-row">
              <CompanyPicker
                label="Sök bolagsnamn"
                placeholder="T.ex. Apple"
                allowedSymbols={mappedTickerSetForPicker}
                onSelect={(company) => {
                  onTickerChange?.(company.symbol);
                  void fetchCompany(company.symbol);
                }}
              />
              <select
                defaultValue="Välj En Aktie"
                onChange={(event) => {
                  const value = event.target.value;
                  if (value !== "Välj En Aktie") {
                    onTickerChange?.(value);
                    void fetchCompany(value);
                  }
                }}
              >
                <option value="Välj En Aktie">Välj En Aktie</option>
                {tickerOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-toggle"
                onClick={() => setShowAdmin((prev) => !prev)}
              >
                {showAdmin ? "Dölj admin" : "Visa admin"}
              </button>
            </div>
            <div className="single-stock-filter-row">
              <label htmlFor="single-stock-filter-sector">Sector</label>
              <select
                id="single-stock-filter-sector"
                value={selectedMappedSector}
                onChange={(event) => {
                  setSelectedMappedSector(event.target.value);
                  setSelectedMappedSubsector("");
                  setSelectedSpecificMapping("");
                  setSelectedMappedCategory("");
                }}
              >
                <option value="">All</option>
                {mappedSectorOptions.map((option) => (
                  <option key={`single-stock-sector-${option}`} value={option}>{option}</option>
                ))}
              </select>
              <label htmlFor="single-stock-filter-subsector">Undersektor</label>
              <select
                id="single-stock-filter-subsector"
                value={selectedMappedSubsector}
                onChange={(event) => {
                  setSelectedMappedSubsector(event.target.value);
                  setSelectedSpecificMapping("");
                  setSelectedMappedCategory("");
                }}
                disabled={!selectedMappedSector}
              >
                <option value="">All</option>
                {mappedSubsectorOptions.map((option) => (
                  <option key={`single-stock-subsector-${option}`} value={option}>{option}</option>
                ))}
              </select>
              {specificMappingOptions.length > 0 && (
                <>
                  <label htmlFor="single-stock-filter-specific">Specific mapping</label>
                  <select
                    id="single-stock-filter-specific"
                    value={selectedSpecificMapping}
                    onChange={(event) => setSelectedSpecificMapping(event.target.value)}
                  >
                    <option value="">All</option>
                    {specificMappingOptions.map((option) => (
                      <option key={`single-stock-specific-${option}`} value={option}>{option}</option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor="single-stock-filter-category">Major/Junior list</label>
              <select
                id="single-stock-filter-category"
                value={selectedMappedCategory}
                onChange={(event) => setSelectedMappedCategory(event.target.value)}
              >
                <option value="">All</option>
                {mappedCategoryOptions.map((option) => (
                  <option key={`single-stock-category-${option}`} value={option}>{option}</option>
                ))}
              </select>
            </div>
            {anyMappingFilterActive && filteredMappedTickers.length === 0 && (
              <p className="status empty">No mapped companies matched this filter combination.</p>
            )}
            {tickersError && <p className="status error">{tickersError}</p>}
            {mappedCompaniesError && <p className="status error">{mappedCompaniesError}</p>}
            {debugEnabled && (
              <div className="single-stock-filter-debug">
                <div><strong>filters:</strong> sector={selectedMappedSector || "all"}, undersektor={selectedMappedSubsector || "all"}, specific={selectedSpecificMapping || "all"}, majorJunior={selectedMappedCategory || "all"}</div>
                <div><strong>matching companies:</strong> {filteredMappedTickers.length}</div>
                <div><strong>source:</strong> mapped company list (company_sector_map + commodity overrides + category metadata)</div>
                <div><strong>mapped rows fetched:</strong> {mappedCompaniesDiagnostics.mappedCompaniesCount ?? "n/a"}</div>
                <div><strong>category column:</strong> {mappedCompaniesDiagnostics.categoryColumnAvailable === null ? "unknown" : (mappedCompaniesDiagnostics.categoryColumnAvailable ? "available" : "missing (fallback: null category)")}</div>
                <div><strong>specific mapping filter:</strong> {specificMappingOptions.length > 0 ? "active/available" : "unavailable in current context"}</div>
              </div>
            )}
            {loading && <p className="status">Fetching company…</p>}
            {error && <p className="status error">{error}</p>}
          </div>
        </div>
      </div>

      {hasSelectedCompany && (
        <>
          {showAdmin && <Admin onTickersUpserted={loadTickers} />}

          <div className="breadcontainersinglecolumn">
            <div className="producer-core-compact-card single-stock-header-card">
              {companyHeaderTitle ? <h1 id="SingleStock_Stock_Name" className="subrub">{companyHeaderTitle}</h1> : null}
              <section className="producer-core-section single-stock-profile-body">
                <div className="producer-core-title-row">
                  <h2 className="subrub small" style={{ margin: 0 }}>Company Profile</h2>
                </div>
                <div className="compact-metrics-grid company-profile-grid">
                  <div className="compact-metric-row">
                    <span className="compact-metric-label">Sektor</span>
                    <span className="compact-metric-value">{String(profile?.sector ?? "—")}</span>
                  </div>
                  <div className="compact-metric-row">
                    <span className="compact-metric-label">Industri</span>
                    <span className="compact-metric-value">{String(profile?.industry ?? "—")}</span>
                  </div>
                  <div className="compact-metric-row">
                    <span className="compact-metric-label">Valuta</span>
                    <span className="compact-metric-value">{String(profile?.currency ?? "—")}</span>
                  </div>
                  <div className="compact-metric-row">
                    <span className="compact-metric-label">Börs</span>
                    <span className="compact-metric-value">{exchangeDisplay ? String(exchangeDisplay) : "—"}</span>
                  </div>
                  <div className="compact-metric-row">
                    <span className="compact-metric-label">Aktiepris</span>
                    <span className="compact-metric-value">{formatPriceValue(priceValue)}</span>
                  </div>
                  <div className="compact-metric-row">
                    <span className="compact-metric-label">Börsvärde</span>
                    <span className="compact-metric-value">{formatMarketCapValue(marketCapValue)}</span>
                  </div>
                  <div className="compact-metric-row">
                    <span className="compact-metric-label">Antal aktier</span>
                    <span className="compact-metric-value">{formatSharesValue(sharesValue)}</span>
                  </div>
                </div>
                {debugEnabled && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>Company Profile Market Cap Debug</summary>
                    <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 12 }}>
                      {Object.entries(companyProfileMarketCapDebug).map(([key, value]) => (
                        <div key={`company-profile-market-cap-debug-${key}`}><strong>{key}:</strong> {formatDebugNumericValue(value)}</div>
                      ))}
                    </div>
                  </details>
                )}
              </section>
              <section className="producer-core-section single-stock-header-body">
                <p className="bread">
                  {profile?.description
                    ? String(profile.description)
                    : "—"}
                </p>
              </section>
              <section className="producer-core-section single-stock-price-body">
                <div className="producer-core-title-row">
                  <h2 className="subrub small" style={{ margin: 0 }}>Price History</h2>
                </div>
                {priceLoading && <p className="status">Fetching data…</p>}
                {!priceLoading && priceError && <p className="status error">{priceError}</p>}
                {!priceLoading && !priceError && !priceData && (
                  <p className="status empty">No historical data available.</p>
                )}
                {!priceLoading && !priceError && priceData && !longVolumeData && !shortVolumeData && (
                  <p className="status empty">Volume data saknas för vald period.</p>
                )}
                <div className="chartcontainerdoublecolumn single-stock-price-charts">
                  <ReportedChart reportedChartContext={reportedChartContext}
                    fiscalYearEndMonth={fiscalYearEndMonth}
                    chartType="ComboChart"
                    title="Aktieprishistoria"
                    data={combinedLongPriceVolumeData}
                    height={260}
                    options={{
                      ...priceChartOptions,
                      colors: [
                        PRICE_SERIES_COLORS.close,
                        PRICE_SERIES_COLORS.sma200,
                        PRICE_SERIES_COLORS.sma50,
                        "#7a7a7a",
                      ],
                      seriesType: "line",
                      series: {
                        0: { type: "line", lineWidth: 2, targetAxisIndex: 0 },
                        1: { type: "line", lineWidth: 1.5, targetAxisIndex: 0 },
                        2: { type: "line", lineWidth: 1.5, targetAxisIndex: 0 },
                        3: { type: "bars", targetAxisIndex: 1 },
                      },
                      vAxes: {
                        0: { title: marketCurrency },
                        1: { title: "shares", format: "short" },
                      },
                      bar: { groupWidth: "45%" },
                    }}
                    y2AxisTitle="shares"
                  />
                  <ReportedChart reportedChartContext={reportedChartContext}
                    fiscalYearEndMonth={fiscalYearEndMonth}
                    chartType="ComboChart"
                    title="Aktieprishistoria (kort)"
                    data={combinedShortPriceVolumeData}
                    height={260}
                    options={{
                      ...priceChartOptions,
                      colors: [
                        PRICE_SERIES_COLORS.close,
                        PRICE_SERIES_COLORS.sma200,
                        PRICE_SERIES_COLORS.sma50,
                        PRICE_SERIES_COLORS.sma20,
                        "#7a7a7a",
                      ],
                      seriesType: "line",
                      series: {
                        0: { type: "line", lineWidth: 2, targetAxisIndex: 0 },
                        1: { type: "line", lineWidth: 1.5, targetAxisIndex: 0 },
                        2: { type: "line", lineWidth: 1.5, targetAxisIndex: 0 },
                        3: { type: "line", lineWidth: 1.5, targetAxisIndex: 0 },
                        4: { type: "bars", targetAxisIndex: 1 },
                      },
                      vAxes: {
                        0: { title: marketCurrency },
                        1: { title: "shares", format: "short" },
                      },
                      bar: { groupWidth: "45%" },
                    }}
                    y2AxisTitle="shares"
                  />
                </div>
              </section>
            </div>
          </div>

          <div className="breadcontainersinglecolumn">
            <div className="producer-core-compact-card single-stock-tasks-card">
              <h2 className="subrub small">Göromål</h2>
              {dashboardTasks.length === 0 ? (
                <p className="bread">Inga göromål just nu.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {dashboardTasks.map((task) => (
                    <li key={task.id}>
                      {task.category}: {task.title}.
                      <button
                        type="button"
                        className="button-link"
                        style={{ marginLeft: 6 }}
                        onClick={() => openManualPriceModal({ metal: task.metal, metalKey: task.metalKey, unit: task.unit, reason: task.resolution.reason })}
                      >
                        {task.actionLabel}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="breadcontainersinglecolumn">
            <div className="producer-core-compact-card single-stock-nav-card">
              <div className="single-stock-tabs single-stock-tabs-primary" role="tablist" aria-label="Company perspective">
                <button
                  type="button"
                  className={`single-stock-tab ${analysisMode === "revenue" ? "is-active" : ""}`}
                  onClick={() => setAnalysisMode("revenue")}
                  aria-selected={analysisMode === "revenue"}
                >
                  Revenue
                </button>
                <button
                  type="button"
                  className={`single-stock-tab ${analysisMode === "prerevenue" ? "is-active" : ""}`}
                  onClick={() => setAnalysisMode("prerevenue")}
                  aria-selected={analysisMode === "prerevenue"}
                >
                  Pre-Revenue
                </button>
              </div>
              <div className="single-stock-subtabs-wrap">
                <div className="single-stock-subtabs-label">Corporate views</div>
                <div className="single-stock-tabs single-stock-tabs-secondary" role="tablist" aria-label="Company data views">
                  <button
                    type="button"
                    className={`single-stock-tab single-stock-subtab ${primaryView === "reported" ? "is-active" : ""}`}
                    onClick={() => setPrimaryView("reported")}
                    aria-selected={primaryView === "reported"}
                  >
                    Reported
                  </button>
                  <button
                    type="button"
                    className={`single-stock-tab single-stock-subtab ${primaryView === "modeled" ? "is-active" : ""}`}
                    onClick={() => setPrimaryView("modeled")}
                    aria-selected={primaryView === "modeled"}
                  >
                    Modeled
                  </button>
                  {analysisMode === "prerevenue" && (
                    <button
                      type="button"
                      className={`single-stock-tab single-stock-subtab ${primaryView === "projects" ? "is-active" : ""}`}
                      onClick={() => setPrimaryView("projects")}
                      aria-selected={primaryView === "projects"}
                    >
                      Project
                    </button>
                  )}
                  {analysisMode === "prerevenue" ? (
                    <a href={`/company/${encodeURIComponent(ticker)}/projects`} className="single-stock-tab single-stock-tab-action">
                      Edit Project
                    </a>
                  ) : (
                    <span className="single-stock-tab single-stock-tab-action is-disabled" aria-disabled="true">Edit Project</span>
                  )}
                </div>
              </div>
            </div>
          </div>

      {primaryView === "reported" && mixedCurrency && (
        <div className="breadcontainersinglecolumn">
          <p className="status" style={{ color: "#7a4f01" }}>⚠ Mixed currencies: Statements in {statementCurrency}, Market data in {marketCurrency}. No FX normalization applied yet.</p>
        </div>
      )}

      {analysisMode === "revenue" && primaryView === "reported" && (
        <>
          <div className="breadcontainersinglecolumn">
            <h1 className="subrub">Producer Core (PVE v2)</h1>
          </div>
          {producerCoreMissing ? (
            <div className="breadcontainersinglecolumn">
              <p className="status empty">Data missing for Producer Core panel.</p>
            </div>
          ) : (
            <div className="producer-core-compact-card">
              <div className="producer-core-compact-grid">
                <section className="producer-core-section efficiency">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Efficiency</h2>
                    <InfoPopover
                      id="efficiency"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Efficiency"
                      sections={metricInfoMap.Efficiency.sections}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("efficiency", [
                      { label: "Gross margin", value: (producerCore as any)?.efficiency?.margin_structure?.gross_margin, infoKey: "gross_margin" },
                      { label: "Operating margin", value: (producerCore as any)?.efficiency?.margin_structure?.operating_margin, infoKey: "operating_margin" },
                      { label: "Net margin", value: (producerCore as any)?.efficiency?.margin_structure?.net_margin, infoKey: "net_margin" },
                      { label: "Margin trend", value: (producerCore as any)?.efficiency?.margin_structure?.margin_trend_label, infoKey: "margin_trend_label" },
                      { label: "OCF / NI", value: (producerCore as any)?.efficiency?.cash_quality?.ocf_to_ni, infoKey: "ocf_to_ni" },
                      { label: "FCF / NI", value: (producerCore as any)?.efficiency?.cash_quality?.fcf_to_ni, infoKey: "fcf_to_ni" },
                      { label: "Accrual", value: (producerCore as any)?.efficiency?.cash_quality?.accrual_flag, infoKey: "accrual_flag" },
                      { label: "Capex / Revenue", value: (producerCore as any)?.efficiency?.capital_intensity?.capex_to_revenue, infoKey: "capex_to_revenue" },
                      { label: "Capex / OCF", value: (producerCore as any)?.efficiency?.capital_intensity?.capex_to_ocf, infoKey: "capex_to_ocf" },
                      { label: "PPE vs Revenue", value: (producerCore as any)?.efficiency?.capital_intensity?.ppe_vs_revenue_signal, infoKey: "ppe_vs_revenue_signal" },
                      { label: "Net debt", value: (producerCore as any)?.efficiency?.balance_sheet?.net_debt, infoKey: "net_debt" },
                      { label: "Net debt / EBITDA", value: (producerCore as any)?.efficiency?.balance_sheet?.net_debt_to_ebitda, infoKey: "net_debt_to_ebitda" },
                      { label: "Interest coverage", value: (producerCore as any)?.efficiency?.balance_sheet?.interest_coverage, infoKey: "interest_coverage" },
                      { label: "Debt trend", value: (producerCore as any)?.efficiency?.balance_sheet?.debt_trend_label, infoKey: "debt_trend_label" },
                      { label: "ROE", value: (producerCore as any)?.efficiency?.returns?.roe, infoKey: "roe" },
                      { label: "ROIC pre-tax", value: (producerCore as any)?.efficiency?.returns?.roic_pre_tax, infoKey: "roic_pre_tax" },
                      { label: "ROE trend 5Y", value: (producerCore as any)?.efficiency?.returns?.roe_trend_5Y, infoKey: "roe_trend_5Y" },
                      { label: "Shares trend 5Y", value: (producerCore as any)?.efficiency?.allocation?.shares_trend_5Y, infoKey: "shares_trend_5Y" },
                      { label: "Retained vs NI", value: (producerCore as any)?.efficiency?.allocation?.retained_vs_ni_signal, infoKey: "retained_vs_ni_signal" },
                      {
                        label: "Quality flags",
                        infoKey: "quality_flags",
                        value: Array.isArray((producerCore as any)?.efficiency?.quality_flags) && (producerCore as any).efficiency.quality_flags.length
                          ? (producerCore as any).efficiency.quality_flags.join(", ")
                          : "—",
                      },
                      {
                        label: "Risk flags",
                        infoKey: "risk_flags",
                        value: Array.isArray((producerCore as any)?.efficiency?.risk_flags) && (producerCore as any).efficiency.risk_flags.length
                          ? (producerCore as any).efficiency.risk_flags.join(", ")
                          : "—",
                      },
                      { label: "Invalid capital employed", value: (producerCore as any)?.efficiency?.diagnostics?.invalid_capital_employed, infoKey: "invalid_capital_employed" },
                      { label: "EV formula check", value: (producerCore as any)?.efficiency?.diagnostics?.ev_formula_check, infoKey: "ev_formula_check" },
                      { label: "Accounting anomaly", value: (producerCore as any)?.efficiency?.diagnostics?.accounting_anomaly, infoKey: "accounting_anomaly" },
                    ], openInfoId, setOpenInfoId)}
                  </div>
                </section>

                <section className="producer-core-section resilience">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Resilience</h2>
                    <InfoPopover
                      id="resilience"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Resilience"
                      sections={metricInfoMap.Resilience.sections}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("resilience", [
                      { label: "Net debt", value: (producerCore as any)?.resilience?.leverage?.net_debt, infoKey: "net_debt" },
                      { label: "Net debt / EBITDA", value: (producerCore as any)?.resilience?.leverage?.net_debt_to_ebitda, infoKey: "net_debt_to_ebitda" },
                      { label: "Interest coverage", value: (producerCore as any)?.resilience?.leverage?.interest_coverage, infoKey: "interest_coverage" },
                      { label: "Current ratio", value: (producerCore as any)?.resilience?.liquidity?.current_ratio, infoKey: "current_ratio" },
                      { label: "Cash vs short debt", value: (producerCore as any)?.resilience?.liquidity?.cash_vs_short_term_debt, infoKey: "cash_vs_short_term_debt" },
                      { label: "FCF volatility 5Y", value: (producerCore as any)?.resilience?.stability?.fcf_volatility_5Y, infoKey: "fcf_volatility_5Y" },
                    ], openInfoId, setOpenInfoId)}                  </div>
                </section>

                <section className="producer-core-section value">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Value</h2>
                    <InfoPopover
                      id="value"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Value"
                      sections={metricInfoMap.Value.sections}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("value", [
                      { label: "P/E", value: (producerCore as any)?.value?.multiples?.pe, infoKey: "pe" },
                      { label: "Earnings yield", value: (producerCore as any)?.value?.multiples?.earnings_yield, infoKey: "earnings_yield" },
                      { label: "P/FCF", value: (producerCore as any)?.value?.multiples?.p_fcf, infoKey: "p_fcf" },
                      { label: "FCF yield", value: (producerCore as any)?.value?.multiples?.fcf_yield, infoKey: "fcf_yield" },
                      { label: "EV/EBITDA", value: (producerCore as any)?.value?.multiples?.ev_ebitda, infoKey: "ev_ebitda" },
                      { label: "EV/EBIT", value: (producerCore as any)?.value?.multiples?.ev_ebit, infoKey: "ev_ebit" },
                      { label: "EV/FCF", value: (producerCore as any)?.value?.multiples?.ev_fcf, infoKey: "ev_fcf" },
                      { label: "Net debt / EV", value: (producerCore as any)?.value?.multiples?.net_debt_over_ev, infoKey: "net_debt_over_ev" },
                      { label: "Median NI (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_ni, infoKey: "median_ni_5y" },
                      { label: "Median EBIT margin (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_ebit_margin, infoKey: "median_ebit_margin_5y" },
                      { label: "Median FCF (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_fcf, infoKey: "median_fcf_5y" },
                      { label: "Implied return", value: (producerCore as any)?.value?.implied_return, infoKey: "implied_return" },
                      { label: "Value band", value: (producerCore as any)?.value?.value_band, infoKey: "value_band" },
                    ], openInfoId, setOpenInfoId)}                  </div>
                </section>
              </div>

              <div className="producer-core-divider" />

              <section className="producer-core-section rr-snapshot">
                <div className="producer-core-title-row">
                  <h2 className="subrub small">RR Snapshot (Commodity Strength — MVP)</h2>
                  <InfoPopover
                    id="rr"
                    openId={openInfoId}
                    onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                    onClose={() => setOpenInfoId(null)}
                    title="RR Snapshot"
                    sections={metricInfoMap["RR Snapshot"].sections}
                  />
                </div>
                <p className="bread">MVP proxies. Missing benchmark/reserve inputs visas som null + flags.</p>
                <div className="rr-input-row">
                  <label>Diskonteringsränta r (%)
                    <input value={rrDiscountRateInput} onChange={(e) => setRrDiscountRateInput(e.target.value)} placeholder="t.ex. 10" />
                  </label>
                </div>
                {!rrInputsReady && <p className="status empty">Ange giltig diskonteringsränta (0–25%) för att aktivera FV2.</p>}
                {rrOverlayMissing ? (
                  <p className="status empty">Data missing for RR Snapshot panel.</p>
                ) : (
                  <div className="rr-grid">
                    <div className="rr-group">
                      <h4>Scale</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-scale", [
                          { label: "10Y recoverable value", infoKey: "rr_scale_10y_recoverable_value_usd", value: (rrOverlay as any)?.rr_scale_10y_recoverable_value_usd },
                          { label: "Scale flag", infoKey: "scale_flag", value: rrOverlay?.rr_scale_flag ?? "Unknown" },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Capital</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-capital", [
                          { label: "ROCE", infoKey: "rr_roce", value: (rrOverlay as any)?.rr_roce },
                          { label: "ROCE flag", infoKey: "rr_roce_flag", value: rrOverlay?.rr_roce_flag ?? "Unknown" },
                          { label: "Margin buffer", infoKey: "margin_buffer", value: (rrOverlay as any)?.rr_margin_buffer_pct },
                          { label: "Cost quartile", infoKey: "cost_quartile", value: (rrOverlay as any)?.rr_cost_quartile },
                          { label: "Reserve life", infoKey: "reserve_life", value: (rrOverlay as any)?.rr_reserve_life_years },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Balance sheet</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-balance", [
                          { label: "Net debt / FCF", infoKey: "rr_net_debt_fcf", value: (rrOverlay as any)?.rr_net_debt_fcf },
                          { label: "Interest coverage", infoKey: "rr_interest_coverage", value: rrOverlay?.rr_interest_coverage },
                          { label: "Missing benchmark", infoKey: "missing_benchmark", value: rrOverlay?.rr_cost_quartile_flags?.missing_benchmark ?? false },
                          { label: "Missing reserves", infoKey: "missing_reserves", value: rrOverlay?.rr_reserve_life_flags?.missing_reserves ?? false },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Fair value</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-fv", [
                          { label: "FV2 (Enterprise, USD)", value: fv2Ev, infoKey: "fv2_enterprise" },
                          { label: "FV2 (Equity, USD)", value: fv2Equity, infoKey: "fv2_equity" },
                          { label: "FV2 (Per share, USD)", value: fv2PerShare, infoKey: "fv2_per_share" },
                          { label: "EV / FV2_EV", value: fv2EvSignal, infoKey: "ev_over_fv2" },
                          { label: "missing_median_fcf", value: fv2Flags.missing_median_fcf, infoKey: "missing_median_fcf" },
                          { label: "missing_net_debt", value: fv2Flags.missing_net_debt, infoKey: "missing_net_debt" },
                          { label: "missing_shares", value: fv2Flags.missing_shares, infoKey: "missing_shares" },
                          { label: "invalid_discount_rate", value: fv2Flags.invalid_discount_rate, infoKey: "invalid_discount_rate" },
                          { label: "Fair value 3", infoKey: "fv3_disabled", value: "Ej aktiv i revenue mode" },
                        ], openInfoId, setOpenInfoId)}
                        {missingEvForFv2 && <p className="status empty">missing EV (market cap + debt - cash)</p>}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Sydings Analytik</h1>
        <p className="bread">
          Sydings Analytik visar marginaler och kassaflöden över tid för att bedöma varaktig
          lönsamhet. Data hämtas via backendens materialiserade årsdata efter “Refresh Ticker”.
        </p>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Revenue"
          data={revenueData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Revenue Growth"
          data={revenueGrowthData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Gross Profit Ratio"
          id="Gross Profit Ratio"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Gross Profit Ratio"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={grossProfitRatioData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="EBITDA Margin"
          id="EBITDA Margin"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["EBITDA Margin"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={ebitdaMarginData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Net Income Margin"
          id="Net Income Margin"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Net Income Margin"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={netIncomeMarginData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Operating Cash Flow"
          data={cashFromOperationsData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Cash From Investing"
          data={cashFromInvestingData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Free Cash Flow"
          id="Free Cash Flow"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Free Cash Flow"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={freeCashFlowData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Free Cash Flow/Share"
          data={freeCashFlowPerShareData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Total Equity"
          id="Total Equity"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Total Equity"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={equityData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="ROE"
          id="ROE"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["ROE"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={roeData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
      </div>

      </>
      )}

      {analysisMode === "prerevenue" && primaryView === "reported" && (
        <>
          <div className="breadcontainersinglecolumn">
            <h1 className="subrub">Corporate Pre-Revenue Core Engine</h1>
            <p className="bread">Graph-first corporate survival, dilution and discipline dashboard. Buffet charts are intentionally hidden for Pre-Revenue.</p>
            <p className="bread">Need to update project JSON? <a href={`/company/${encodeURIComponent(ticker)}/projects`} className="button-link">Open Project Editor</a></p>
          </div>

          <div className="breadcontainersinglecolumn"><h2 className="subrub small">A) Survival Engine</h2></div>
          <div className="chartcontainerdoublecolumn">
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="A1 Cash Balance" id="A1 Cash Balance" infoSections={PRE_REVENUE_CORE_INFO["A1 Cash Balance"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={cashBalanceBarsData} options={{ bar: { groupWidth: "65%" } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="A2 Operating Cash Flow" id="A2 Operating Cash Flow" infoSections={PRE_REVENUE_CORE_INFO["A2 Operating Cash Flow"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={cashFromOperationsData} options={{ vAxis: { baseline: 0 } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ComboChart" title="A3 Burn vs Capital Available" id="A3 Burn vs Capital Available" infoSections={PRE_REVENUE_CORE_INFO["A3 Burn vs Capital Available"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={a3BurnVsCapitalAvailableData} options={{ seriesType: "bars", series: { 0: { type: "bars", targetAxisIndex: 0, color: "#0b0b0b" }, 1: { type: "area", targetAxisIndex: 0, areaOpacity: 0.15, lineWidth: 1, color: "#7a7a7a" } }, colors: ["#0b0b0b", "#7a7a7a"], vAxis: { baseline: 0, title: `${statementCurrency} (millions)` }, tooltip: { isHtml: false } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="A4 Burn Rate TTM" id="A4 Burn Rate TTM" infoSections={PRE_REVENUE_CORE_INFO["A4 Burn Rate TTM"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={burnRateTtmData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="A5 Runway Months" id="A5 Runway Months" infoSections={PRE_REVENUE_CORE_INFO["A5 Runway Months"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={runwayMonthsData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="A6 Burn Decomposition" id="A6 Burn Decomposition" infoSections={PRE_REVENUE_CORE_INFO["A6 Burn Decomposition"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={burnDecompositionData} options={{ isStacked: true, bar: { groupWidth: "65%" }, vAxis: { baseline: 0 } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ComboChart" title="A7 Cash Bridge / Waterfall" id="A7 Cash Bridge / Waterfall" infoSections={PRE_REVENUE_CORE_INFO["A7 Cash Bridge / Waterfall"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={cashBridgeData} options={lineBehindBars} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="A8 Next-12M Survival Gauge" id="A8 Next-12M Survival Gauge" infoSections={PRE_REVENUE_CORE_INFO["A8 Next-12M Survival Gauge"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={next12mSurvivalData} />
          </div>

          <div className="breadcontainersinglecolumn"><h2 className="subrub small">B) Dilution & Shareholder Cost</h2></div>
          <div className="chartcontainerdoublecolumn">
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="B1 Shares Outstanding" id="B1 Shares Outstanding" infoSections={PRE_REVENUE_CORE_INFO["B1 Shares Outstanding"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={sharesOutstandingData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="B2 Dilution Rate YoY" id="B2 Dilution Rate YoY" infoSections={PRE_REVENUE_CORE_INFO["B2 Dilution Rate YoY"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={dilutionRateData} options={{ vAxis: { format: "#,##0.##'%'" } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="B3 Cash per Share" id="B3 Cash per Share" infoSections={PRE_REVENUE_CORE_INFO["B3 Cash per Share"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={cashPerShareData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="B4 Market Cap vs Shares" id="B4 Market Cap vs Shares" infoSections={PRE_REVENUE_CORE_INFO["B4 Market Cap vs Shares"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={marketCapVsSharesData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="B5 SBC" id="B5 SBC" infoSections={PRE_REVENUE_CORE_INFO["B5 SBC"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={sbcData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="B6 SBC Intensity" id="B6 SBC Intensity" infoSections={PRE_REVENUE_CORE_INFO["B6 SBC Intensity"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={sbcIntensityData} options={{ vAxis: { format: "percent" } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="B7 All-in Dilution" id="B7 All-in Dilution" infoSections={PRE_REVENUE_CORE_INFO["B7 All-in Dilution"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={allInDilutionData} options={{ bar: { groupWidth: "65%" } }} />
          </div>

          <div className="breadcontainersinglecolumn"><h2 className="subrub small">C) Corporate Discipline</h2></div>
          <div className="chartcontainerdoublecolumn">
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="C1 Corporate Overhead" id="C1 Corporate Overhead" infoSections={PRE_REVENUE_CORE_INFO["C1 Corporate Overhead"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={corporateOverheadData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="C2 Exploration / Evaluation Cash Proxy (OCF Adjusted)" id="C2 Exploration / Evaluation Cash Proxy (OCF Adjusted)" infoSections={PRE_REVENUE_CORE_INFO["C2 Exploration / Evaluation Cash Proxy (OCF Adjusted)"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={explorationProxyData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ComboChart" title="C3 Spend Mix" id="C3 Spend Mix" infoSections={PRE_REVENUE_CORE_INFO["C3 Spend Mix"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={spendMixData} options={lineBehindBars} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="C4 Overhead Ratio" id="C4 Overhead Ratio" infoSections={PRE_REVENUE_CORE_INFO["C4 Overhead Ratio"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={overheadRatioData} options={{ vAxis: { format: "#,##0.##'%'" } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="C5 VCE Proxy" id="C5 VCE Proxy" infoSections={PRE_REVENUE_CORE_INFO["C5 VCE Proxy"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={vceProxyData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ComboChart" title="C6 VCE vs Overhead" id="C6 VCE vs Overhead" infoSections={PRE_REVENUE_CORE_INFO["C6 VCE vs Overhead"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={vceVsOverheadData} options={lineBehindBars} />
          </div>

          <div className="breadcontainersinglecolumn"><h2 className="subrub small">D) Financing Structure & Stress</h2></div>
          <div className="chartcontainerdoublecolumn">
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="D1 Net Cash / Net Debt" id="D1 Net Cash / Net Debt" infoSections={PRE_REVENUE_CORE_INFO["D1 Net Cash / Net Debt"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={netCashDebtData} options={{ vAxis: { baseline: 0 } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="D2 Debt Maturity Mix" id="D2 Debt Maturity Mix" infoSections={PRE_REVENUE_CORE_INFO["D2 Debt Maturity Mix"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={debtMaturityMixData} options={{ isStacked: true, bar: { groupWidth: "65%" } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ComboChart" title="D3 Cash vs Short-Term Obligations" id="D3 Cash vs Short-Term Obligations" infoSections={PRE_REVENUE_CORE_INFO["D3 Cash vs Short-Term Obligations"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={cashVsObligationsData} options={{ seriesType: "line", series: { 0: { type: "area", areaOpacity: 0.2, lineWidth: 2 }, 1: { type: "line", lineWidth: 2 } } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="D4 Current Ratio" id="D4 Current Ratio" infoSections={PRE_REVENUE_CORE_INFO["D4 Current Ratio"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={currentRatioData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="D5 Financing Inflows" id="D5 Financing Inflows" infoSections={PRE_REVENUE_CORE_INFO["D5 Financing Inflows"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={financingInflowsData} options={{ vAxis: { baseline: 0 } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="D6 Financing Frequency" id="D6 Financing Frequency" infoSections={PRE_REVENUE_CORE_INFO["D6 Financing Frequency"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={financingFrequencyData} options={{ vAxis: { viewWindow: { min: 0, max: 1 } } }} />
          </div>

          <div className="breadcontainersinglecolumn"><h2 className="subrub small">E) Risk Signals & Scoreboard</h2></div>
          <div className="chartcontainerdoublecolumn">
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ColumnChart" title="E1 Burn Acceleration (Δ vs prior period)" id="E1 Burn Acceleration (Δ vs prior period)" infoSections={PRE_REVENUE_CORE_INFO["E1 Burn Acceleration (Δ vs prior period)"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={burnAccelerationData} options={{ vAxis: { baseline: 0 } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="E2 Runway Risk Bands" id="E2 Runway Risk Bands" infoSections={PRE_REVENUE_CORE_INFO["E2 Runway Risk Bands"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={runwayRiskBandsData} options={{ vAxis: { viewWindow: { min: 0, max: 36 } } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="ComboChart" title="E3 Dilution vs Runway" id="E3 Dilution vs Runway" infoSections={PRE_REVENUE_CORE_INFO["E3 Dilution vs Runway"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={dilutionVsRunwayData} options={{ seriesType: "bars", series: { 0: { type: "bars", targetAxisIndex: 0 }, 1: { type: "line", targetAxisIndex: 1, lineWidth: 2 } }, vAxes: { 0: { title: "%" }, 1: { title: "months" } } }} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="E4 Governance Leak Index" id="E4 Governance Leak Index" infoSections={PRE_REVENUE_CORE_INFO["E4 Governance Leak Index"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={governanceLeakIndexData} />
            <ReportedChart reportedChartContext={reportedChartContext} fiscalYearEndMonth={fiscalYearEndMonth} chartType="LineChart" title="E5 Survival Score (0–10 composite)" id="E5 Survival Score" infoSections={PRE_REVENUE_CORE_INFO["E5 Survival Score"]} openInfoId={openInfoId} onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))} onCloseInfo={() => setOpenInfoId(null)} data={survivalScoreData} options={{ vAxis: { viewWindow: { min: 0, max: 10 } } }} />
          </div>
        </>
      )}

{analysisMode === "revenue" && primaryView === "reported" && (
      <>
      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Buffetologisk Analytik</h1>
        <p className="bread">
          Buffetologi jämför intäkter, kostnader och kapitalstruktur för att förstå bolagets
          uthållighet. Graferna speglar samma legacy‑modell, men drivs nu av backendens
          årsvisa datapunkter.
        </p>
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Income Statement</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Revenue vs Cost of Revenue"
          data={revenueVsCostData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Gross Profit vs Expenses"
          data={grossProfitVsExpensesData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Operating Profit vs Depreciation"
          data={operatingProfitVsDepData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="EBIT vs Interest"
          id="EBIT vs Interest"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["EBIT vs Interest"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={ebitVsInterestData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Net Earnings"
          data={netEarningsData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Revenue vs Net Earnings per Share"
          data={netEarningsPerShareData}
          options={lineBehindBars}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Balance Sheet</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Cash vs Net Earnings"
          id="Cash vs Net Earnings"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Cash vs Net Earnings"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={cashVsNetEarningsData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Cash vs Short Term Debt"
          data={cashVsShortTermDebtData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Net Earnings vs Inventory"
          data={inventoryVsNetEarningsData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="PPE vs Depreciation"
          data={ppeVsDepData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Goodwill"
          data={goodwillData}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Short Term vs Long Term Debt"
          data={debtMixData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="EBITDA vs Long Term Debt"
          data={ebitdaVsLongTermDebtData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Current Ratio"
          data={currentRatioData}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Long Term Debt to Net Earnings"
          data={longTermDebtToNetEarningsData}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Debt to Equity"
          id="Debt to Equity"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Debt to Equity"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={debtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Adjusted Debt to Equity"
          data={adjustedDebtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Retained Earnings vs Net Income"
          id="Retained Earnings vs Net Income"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Retained Earnings vs Net Income"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={retainedEarningsData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="ROE"
          data={roeData}
          options={{ vAxis: { format: "percent" } }}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Cashflow Statement</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Capital Expenditure vs Net Earnings"
          id="Capital Expenditure vs Net Earnings"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Capital Expenditure vs Net Earnings"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={capexVsNetEarningsData}
          options={lineBehindBars}
        />
        <ReportedChart reportedChartContext={reportedChartContext}
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Buybacks + Dividends vs Net Earnings"
          id="Buybacks + Dividends vs Net Earnings"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Buybacks + Dividends vs Net Earnings"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={buybacksDividendsData}
          options={lineBehindBars}
        />
      </div>
      </>
      )}

      {primaryView === "modeled" && (
        <div className="breadcontainersinglecolumn">
          <h1 className="subrub">Corporate (modeled)</h1>
          {companyProjectsLoading && <p className="bread">Loading stored projects…</p>}
          {companyProjectsError && <p className="status error">{companyProjectsError}</p>}
          {!companyProjectsLoading && companyProjects.length === 0 && (
            <>
              <p className="status empty">No stored projects for this symbol.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={`/company/${encodeURIComponent(ticker)}/projects`} className="button-link">Open projects</a>
                <a href={`/company/${encodeURIComponent(ticker)}/projects?action=new`} className="button-link">Add project</a>
              </div>
            </>
          )}

          {companyProjects.length > 0 && (
            <section className="project-producer-layout" style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {corporateSnapshotLoading && <p className="bread">Running corporate snapshot…</p>}
              {corporateSnapshotError && <p className="status error">{corporateSnapshotError}</p>}

              {debugEnabled && corporateSnapshotData && (
                <details className="producer-core-section" open>
                  <summary><h2 className="subrub small">Corporate debug</h2></summary>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
{JSON.stringify((() => {
  const diagnosticsMeta = (corporateDiagnostics?.meta ?? {}) as Record<string, unknown>;
  const corporateTotalsDebug = diagnosticsMeta.corporateTotalsDebug ?? null;
  const corporateFinancingDebug = diagnosticsMeta.corporateFinancingDebug ?? null;
  const corporateModeledValuationTimeline = diagnosticsMeta.corporateModeledValuationTimeline ?? (corporateSnapshotData.modeledValuationTimeline ?? null);
  const aggregation = (corporateSnapshotData.aggregation ?? {}) as Record<string, unknown>;
  const masterN = typeof aggregation.corporateMasterN === "number" ? aggregation.corporateMasterN : null;
  const fcf = Array.isArray(aggregation.fcffUSD_total) ? aggregation.fcffUSD_total : [];
  const capex = Array.isArray(aggregation.capexUSD_total) ? aggregation.capexUSD_total : [];
  const nullCount = (arr: unknown[]) => arr.filter((value) => value === null).length;
  const list2Debug = {
    DCF_prodStart_present_TargetCurrency: typeof corporateSnapshotData.DCF_prodStart_present_TargetCurrency === "number" ? corporateSnapshotData.DCF_prodStart_present_TargetCurrency : null,
    DCF_prodStart_present_perShare_TargetCurrency: typeof corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency === "number" ? corporateSnapshotData?.DCF_prodStart_present_perShare_TargetCurrency : null,
    DCF_prodStart_exCapex_TargetCurrency: typeof corporateSnapshotData.DCF_prodStart_exCapex_TargetCurrency === "number" ? corporateSnapshotData.DCF_prodStart_exCapex_TargetCurrency : null,
    DCF_prodStart_exCapex_perShare_TargetCurrency: typeof corporateSnapshotData.DCF_prodStart_exCapex_perShare_TargetCurrency === "number" ? corporateSnapshotData.DCF_prodStart_exCapex_perShare_TargetCurrency : null,
  };
  return {
    projectCount: diagnosticsMeta.projectCount ?? null,
    masterN,
    corporateTotalsDebug,
    corporateFinancingDebug,
    corporateModeledValuationTimeline,
    list2Debug,
    lengthChecks: {
      fcfUSD_total: { len: fcf.length, expected: masterN === null ? null : masterN + 1 },
      capexUSD_total: { len: capex.length, expected: masterN === null ? null : masterN + 1 },
    },
    nullCount: {
      fcfUSD_total: nullCount(fcf),
      capexUSD_total: nullCount(capex),
    },
    fcfUSD_total_preview: {
      first5: fcf.slice(0, 5),
      last5: fcf.slice(Math.max(0, fcf.length - 5)),
    },
  };
})(), null, 2)}
                  </pre>
                </details>
              )}

              {corporateViewMetrics && (() => {
                try {
                  requireYearsByPeriod(corporateSnapshotData?.series);
                  return (
                <>
                  <div className="producer-core-compact-card">
                    <section className="producer-core-section">
                      <div className="producer-core-title-row">
                        <h2 className="subrub small">Market Box</h2>
                      </div>
                      <div className="compact-metrics-grid">
                        {[
                          { label: "MarketCap (current)", value: corporateViewMetrics.marketBox.marketCapCurrent, kind: "money" as const },
                          { label: "EV (current)", value: corporateViewMetrics.marketBox.evCurrent, kind: "money" as const },
                          { label: "Shares Current", value: corporateViewMetrics.marketBox.sharesCurrent, kind: "integer" as const },
                          { label: "Shares PF", value: corporateViewMetrics.marketBox.sharesPf, kind: "integer" as const },
                        ].map((metric) => (
                          <div key={`corporate-market-${metric.label}`} className="compact-metric-row">
                            <span className="compact-metric-label">{metric.label}</span>
                            <span className="compact-metric-dots" />
                            <span className="compact-metric-value">
                              {metric.kind === "integer"
                                ? formatSharesValue(metric.value.value)
                                : formatMetricValue(metric.value, metric.kind, metric.kind === "money" ? lockedTargetCurrency : undefined)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <label className="rr-input-row" style={{ marginTop: 10, display: "grid", gap: 4 }}>
                        <span className="compact-metric-label-wrap"><span>Extra aktier</span><InfoPopover id="corporate-extra-shares" openId={openInfoId} onToggle={(id) => setOpenInfoId((prev) => prev === id ? null : id)} onClose={() => setOpenInfoId(null)} title="Extra aktier" sections={[{ heading: "Info", lines: [EXTRA_SHARES_HELP] }]} /></span>
                        <input aria-label="Extra aktier" inputMode="numeric" pattern="[0-9 ]*" value={formatExtraSharesInput(corporateExtraSharesInput)} onChange={(event) => updateExtraShares('corporate', event.target.value)} onBlur={() => { if (!corporateExtraSharesInput) updateExtraShares('corporate', '0'); }} />
                      </label>
                    </section>
                  </div>

                  {debugEnabled && (() => {
                    const diagnosticsMeta = (corporateDiagnostics?.meta ?? {}) as Record<string, unknown>;
                    const financingDebug = (diagnosticsMeta.corporateFinancingDebug ?? null) as Record<string, unknown> | null;
                    const perProject = Array.isArray(financingDebug?.perProjectNewShares) ? financingDebug?.perProjectNewShares as Array<Record<string, unknown>> : [];
                    if (!financingDebug) return null;
                    return (
                      <section className="producer-core-section" style={{ marginTop: 8 }}>
                        <h3 className="subrub small">Market Box debug</h3>
                        <div className="compact-metrics-grid">
                          {["shares_current", "shares_post_financing", "totalNewShares", "totalDebt_USD", "totalDebt_TargetCurrency"].map((key) => (
                            <div key={`corp-debug-${key}`} className="compact-metric-row">
                              <span className="compact-metric-label">{key}</span>
                              <span className="compact-metric-dots" />
                              <span className="compact-metric-value">{formatMetricValue({ value: typeof financingDebug[key] === "number" ? financingDebug[key] as number : null, reason: null }, "integer")}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12 }}>
                          {perProject.map((item) => (
                            <div key={`corp-debug-project-${String(item.projectId ?? "unknown")}`}>
                              <strong>{String(item.projectName ?? item.projectId ?? "unknown")}</strong>: newShares {typeof item.newShares === "number" ? item.newShares.toFixed(2) : "n/a"}
                              {typeof item.debtAmount_USD === "number" ? `, debtUSD=${item.debtAmount_USD.toFixed(2)}` : ""}
                              {typeof item.equityFraction === "number" ? `, equity=${(item.equityFraction * 100).toFixed(0)}%` : ""}
                              {typeof item.debtFraction === "number" ? `, debt=${(item.debtFraction * 100).toFixed(0)}%` : ""}
                              {typeof item.reasonIfUnavailable === "string" && item.reasonIfUnavailable ? `, ${item.reasonIfUnavailable}` : ""}
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })()}

                  <details className="producer-core-section project-collapsible-card" open>
                    <summary><h2 className="subrub small">C CORPORATE FINANCING</h2></summary>
                    <div className="rr-input-row" style={{ marginTop: 8 }}>
                      <label>
                        <input type="checkbox" checked={corporateUseQuarterlyCash} onChange={(event) => setCorporateUseQuarterlyCash(event.target.checked)} />
                        Använd senaste kvartalets Cash &amp; Cash Equivalents som finansiering
                      </label>
                      <label>Cash Used {corporateCashUsedPct}%<input type="range" min="0" max="100" value={corporateCashUsedPct} onChange={(event) => setCorporateCashUsedPct(Number(event.target.value))} /></label>
                      {companyProjects.map((project) => {
                        const hasFinancing = !!((corporateSnapshotData?.financing ?? null) as Record<string, unknown> | null);
                        const currentEquity = corporateProjectEquityPct[project.project_id] ?? 100;
                        return (
                          <label key={`corp-fin-${project.project_id}`} htmlFor={`corp-equity-${project.project_id}`} style={{ opacity: hasFinancing ? 1 : 0.6 }}>
                            {project.project_name ?? project.project_id} — Equity {currentEquity}%
                            <input
                              id={`corp-equity-${project.project_id}`}
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              disabled={!hasFinancing}
                              value={currentEquity}
                              onChange={(event) => {
                                const equityPct = clampPct(Number(event.target.value));
                                setCorporateProjectEquityPct((prev) => ({ ...prev, [project.project_id]: equityPct }));
                              }}
                              style={{ width: "100%" }}
                            />
                            {!hasFinancing && <span style={{ display: "block", fontSize: 11 }}>Financing not configured</span>}
                          </label>
                        );
                      })}
                    </div>
                    {(() => {
                      const financing = (corporateSnapshotData?.financing ?? {}) as Record<string, unknown>;
                      const manualExtraShares = parseExtraShares(corporateExtraSharesInput);
                      const sharesPf = typeof financing.shares_post_financing === "number"
                        ? financing.shares_post_financing + manualExtraShares
                        : null;
                      const fields = [
                        ["Latest Quarterly Cash", financing.latest_quarterly_cash_TargetCurrency], ["Cash Used %", typeof financing.cash_used_percent === "number" ? financing.cash_used_percent * 100 : null], ["Initial Cash Used", financing.cash_used_for_build_TargetCurrency], ["Internally Generated Cash Used", financing.internally_generated_cash_used_TargetCurrency], ["Total Internal Cash Used", financing.total_internal_cash_used_TargetCurrency], ["Remaining Funding Need", financing.remaining_funding_need_TargetCurrency], ["Debt Added", financing.new_debt_TargetCurrency], ["Equity Raise", financing.equity_raised_TargetCurrency], ["New Shares", financing.new_shares], ["Shares PF", sharesPf], ["Closing Corporate Cash", financing.closing_corporate_cash_TargetCurrency],
                      ];
                      return <div className="compact-metrics-grid">{fields.map(([label, raw]) => <div className="compact-metric-row" key={String(label)}><span className="compact-metric-label">{String(label)}</span><span className="compact-metric-dots"/><span className="compact-metric-value">{typeof raw === "number" ? raw.toLocaleString() : "n/a"}</span></div>)}</div>;
                    })()}
                    {(() => {
                      const waterfall = ((corporateSnapshotData?.financing as Record<string, unknown> | undefined)?.corporate_cash_waterfall ?? null) as { rows?: Array<Record<string, unknown>> } | null;
                      if (!waterfall?.rows?.length) return null;
                      return <details style={{ marginTop: 10 }}><summary>Corporate cash waterfall per period</summary><div style={{ overflowX: "auto" }}><table className="compact-debug-table"><thead><tr>{["Period","Year","Opening Cash","Operating Cash Generated","Construction CAPEX","Internal Cash Used","Debt Added","Equity Raised","Closing Cash"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{waterfall.rows.map((row,index)=><tr key={index}>{[row.period,row.year,row.openingCash,row.operatingCashGenerated,row.projectCapexNeed,row.internalCashUsed,row.debtAdded,row.equityRaised,row.closingCash].map((v,i)=><td key={i}>{typeof v === "number" ? v.toLocaleString() : "n/a"}</td>)}</tr>)}</tbody></table></div></details>;
                    })()}
                    <p className="bread" style={{ marginTop: 8 }}>
                      {(() => {
                        const diagnosticsMeta = (corporateDiagnostics?.meta ?? {}) as Record<string, unknown>;
                        const financingDebug = (diagnosticsMeta.corporateFinancingDebug ?? null) as Record<string, unknown> | null;
                        const totalDebtTarget = typeof financingDebug?.totalDebt_TargetCurrency === "number"
                          ? financingDebug.totalDebt_TargetCurrency
                          : null;
                        return `TotalDebt (aggregated): ${totalDebtTarget === null ? "n/a" : formatMetricValue({ value: totalDebtTarget, reason: null }, "money", lockedTargetCurrency)}`;
                      })()}
                    </p>
                  </details>

                  {([
                    ["list2", "FINANSIELLA NYCKELTAL OCH VÄRDERING", corporateViewMetrics.list2],
                    ["list3", "EFFEKTIVITET OCH LÖNSAMHET", corporateViewMetrics.list3],
                    ["list4", "TILLGÅNGSVÄRDE OCH JÄMFÖRELSE", corporateViewMetrics.list4],
                    ["list6", "M&A VALUATION", corporateViewMetrics.list6],
                  ] as Array<["list2" | "list3" | "list4" | "list6", string, Record<string, MetricValue>]>).map(([sectionKey, title, metrics]) => (
                    <details key={`corporate-${sectionKey}`} className="producer-core-section project-collapsible-card" open>
                      <summary><h2 className="subrub small">{title}</h2></summary>
                      {sectionKey === "list2" && (
                        <>
                        <ValueRangeSnapshotCard
                          priceToday={
                            corporateViewMetrics.marketBox.marketCapCurrent.value !== null && corporateViewMetrics.marketBox.sharesCurrent.value !== null && corporateViewMetrics.marketBox.sharesCurrent.value > 0
                              ? corporateViewMetrics.marketBox.marketCapCurrent.value / corporateViewMetrics.marketBox.sharesCurrent.value
                              : null
                          }
                          npvLow={corporateViewMetrics.list2.NAV_perShare?.value ?? null}
                          npvHigh={corporateViewMetrics.list2.DCF_Target_discounted_perShare?.value ?? null}
                          tpLow={corporateViewMetrics.list2.NAV_prodStart_perShare?.value ?? null}
                          tpHigh={corporateViewMetrics.list2.DCF_perShare?.value ?? null}
                          canonicalTimeline={corporateViewMetrics.valuationTimeline}
                          canonicalStartPeriods={corporateCanonicalStartPeriods}
                          corporateTimeSeries={corporateChartTimeSeries}
                          discountRate={typeof corporateSnapshotData?.discountRate === "number" ? corporateSnapshotData.discountRate : null}
                          currencyCode={lockedTargetCurrency}
                        />
                        {debugEnabled && corporateTimelineDebug && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>Valuation timeline debug</summary>
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 8 }}>{JSON.stringify(corporateTimelineDebug, null, 2)}</pre>
                          </details>
                        )}
                        </>
                      )}
                      <div className="compact-metrics-grid">
                        {Object.entries(metrics).map(([key, value]) => (
                          <div key={`corporate-${sectionKey}-${key}`} className="compact-metric-row">
                            <span className="compact-metric-label">{resolveCorporateMetricLabel(key, formatDiscountRateTag(riskAdjustedDiscountRatePctInput))}</span>
                            <span className="compact-metric-dots" />
                            <span className="compact-metric-value">{
                              (() => {
                                if (sectionKey === "list2" && (key === "DCF_Target_discounted" || key === "DCF_Target_discounted_perShare")) {
                                  const scalarText = corporateList2ScalarTextByKey[key];
                                  if (import.meta.env.DEV) {
                                    const debugPanelValue = key === "DCF_Target_discounted"
                                      ? (typeof corporateSnapshotData?.DCF_prodStart_present_TargetCurrency === "number" && Number.isFinite(corporateSnapshotData.DCF_prodStart_present_TargetCurrency)
                                        ? corporateSnapshotData.DCF_prodStart_present_TargetCurrency
                                        : null)
                                      : (typeof corporateSnapshotData?.DCF_prodStart_present_perShare_TargetCurrency === "number" && Number.isFinite(corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency)
                                        ? corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency
                                        : null);
                                    if (debugPanelValue !== null && scalarText === null) {
                                      console.assert(false, "[corporate-list2-scalar-missing] discounted DCF available in debug panel but missing in list render", {
                                        missingKey: key,
                                        availableMetricKeys: Object.keys(metrics),
                                        snapshotKeys: Object.keys((corporateSnapshotData ?? {}) as Record<string, unknown>),
                                      });
                                    }
                                  }
                                  if (scalarText !== null) {
                                    return scalarText;
                                  }
                                }

                                if (
                                  sectionKey === "list2"
                                  && corporateProdStartMarkerTextByKey[key]
                                  && (value.value === null || corporateAlwaysMarkerMetricKeys.has(key))
                                ) {
                                  return corporateProdStartMarkerTextByKey[key];
                                }
                                if (sectionKey === "list3") {
                                  if (key === "ROI_10Y") return formatMetricValue(value, "multiple", lockedTargetCurrency);
                                  if (key === "IRR") return formatIrrMetricValue(value);
                                  if (key.includes("Payback")) return formatMetricValue(value, "decimal", lockedTargetCurrency);
                                  if (key === "AISC_LOM" || key === "BreakEven_AuEq" || key === "CAPEX_per_Annual_AuEq") return formatMetricValue(value, "decimal", lockedTargetCurrency);
                                  if (key === "LOM_avg_EBIT_ROCE" || key === "LOM_discounted_EBIT_ROCE") {
                                    return value.value === null ? "n/a" : value.value.toFixed(2);
                                  }
                                }
                                return formatMetricValue(value, key.includes("over") || key.includes("Mult") ? "multiple" : key === "LOM" ? "integer" : key.includes("Payback") ? "decimal" : "money", lockedTargetCurrency);
                              })()
                            }</span>
                          </div>
                        ))}
                      </div>
                      {sectionKey === "list3" && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>Debug (Lista 3 — Corporate)</summary>
                          <div style={{ marginTop: 8, fontSize: 12, display: "grid", gap: 8 }}>
                            <div><strong>scope:</strong> {formatDebugNumericValue(corporateLista3Debug?.scope ?? null)}</div>
                            <div><strong>sourcePath:</strong> {formatDebugNumericValue(corporateLista3Debug?.sourcePath ?? null)}</div>
                            <div><strong>tp_main:</strong> {formatDebugNumericValue(corporateLista3Debug?.tp_main ?? null)}</div>
                            <div><strong>initialCapexUSD_main:</strong> {formatDebugNumericValue(corporateLista3Debug?.initialCapexUSD_main ?? null)}</div>
                            <div><strong>shares_post_financing:</strong> {formatDebugNumericValue(corporateLista3Debug?.shares_post_financing ?? null)}</div>
                            <div><strong>series.fcfUSD_total:</strong> {formatDebugNumericValue(corporateLista3Debug?.series?.fcfUSD_total ?? null)}</div>
                            <div><strong>series.capexUSD_total:</strong> {formatDebugNumericValue(corporateLista3Debug?.series?.capexUSD_total ?? null)}</div>
                            <div><strong>series.nopatUSD_total:</strong> {formatDebugNumericValue(corporateLista3Debug?.series?.nopatUSD_total ?? null)}</div>
                            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
                              <div><strong>Corporate NOPAT strict aggregation</strong></div>
                              <div>requiredInputs: {Array.isArray(corporateLista3Debug?.corporateNopatInputs?.requiredInputs) ? `[${corporateLista3Debug?.corporateNopatInputs?.requiredInputs.join(', ')}]` : 'none'}</div>
                              <div>Project inputs:</div>
                              <div style={{ paddingLeft: 12 }}>
                                {Array.isArray(corporateLista3Debug?.corporateNopatInputs?.projectInputs) && corporateLista3Debug.corporateNopatInputs.projectInputs.length > 0
                                  ? corporateLista3Debug.corporateNopatInputs.projectInputs.map((projectInput: { projectId?: string; taxRate?: number | null; taxRateByPeriod?: Array<number | null> | null; sampleEbitUSD?: Array<number | null> }) => (
                                    <div key={`corp-list3-nopat-input-${String(projectInput?.projectId ?? 'unknown')}`}>
                                      {String(projectInput?.projectId ?? 'unknown')}: taxRate={formatDebugNumericValue(projectInput?.taxRate ?? null)}, taxRateByPeriod={formatDebugNumericValue(projectInput?.taxRateByPeriod ?? null)}, sampleEbitUSD[0..6]={formatDebugNumericValue(projectInput?.sampleEbitUSD ?? null)}
                                    </div>
                                  ))
                                  : <div>none</div>}
                              </div>
                              <div>Per-period contributions:</div>
                              <div style={{ paddingLeft: 12 }}>
                                {Array.isArray(corporateLista3Debug?.corporateNopatInputs?.perPeriod) && corporateLista3Debug.corporateNopatInputs.perPeriod.length > 0
                                  ? corporateLista3Debug.corporateNopatInputs.perPeriod.map((period: { t?: number; contributions?: Array<{ projectId?: string; ebitUSD?: number | null; taxRate?: number | null; nopatContributionUSD?: number | null }>; nopatUSD_total?: number | null }) => (
                                    <div key={`corp-list3-nopat-period-${String(period?.t ?? 'na')}`} style={{ marginBottom: 4 }}>
                                      <div>t={formatDebugNumericValue(period?.t ?? null)} summed_nopatUSD_total={formatDebugNumericValue(period?.nopatUSD_total ?? null)}</div>
                                      <div style={{ paddingLeft: 12 }}>
                                        {Array.isArray(period?.contributions) && period.contributions.length > 0
                                          ? period.contributions.map((contribution: { projectId?: string; ebitUSD?: number | null; taxRate?: number | null; nopatContributionUSD?: number | null }) => (
                                            <div key={`corp-list3-nopat-period-${String(period?.t ?? 'na')}-project-${String(contribution?.projectId ?? 'unknown')}`}>
                                              {String(contribution?.projectId ?? 'unknown')}: ebitUSD={formatDebugNumericValue(contribution?.ebitUSD ?? null)}, taxRate={formatDebugNumericValue(contribution?.taxRate ?? null)}, nopatContributionUSD={formatDebugNumericValue(contribution?.nopatContributionUSD ?? null)}
                                            </div>
                                          ))
                                          : <div>none</div>}
                                      </div>
                                    </div>
                                  ))
                                  : <div>none</div>}
                              </div>
                              <div>Missing inputs (strict):</div>
                              <div style={{ paddingLeft: 12 }}>
                                {Array.isArray(corporateLista3Debug?.corporateNopatInputs?.missingInputs) && corporateLista3Debug.corporateNopatInputs.missingInputs.length > 0
                                  ? corporateLista3Debug.corporateNopatInputs.missingInputs.map((missing: { projectId?: string; t?: number; missing?: string[] }, idx: number) => (
                                    <div key={`corp-list3-nopat-missing-${idx}`}>
                                      projectId={String(missing?.projectId ?? 'unknown')}, t={formatDebugNumericValue(missing?.t ?? null)}, missing={Array.isArray(missing?.missing) ? `[${missing.missing.join(', ')}]` : '[]'}
                                    </div>
                                  ))
                                  : <div>none</div>}
                              </div>
                            </div>
                            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
                              <div><strong>CAPEX sanity block</strong></div>
                              {(() => {
                                const tpMain = corporateLista3Debug?.tp_main;
                                const capexSeries = Array.isArray(corporateLista3Debug?.series?.capexUSD_total)
                                  ? corporateLista3Debug.series.capexUSD_total
                                  : [];
                                const preTpCapex = typeof tpMain === "number" && Number.isInteger(tpMain) && tpMain >= 0
                                  ? capexSeries.slice(0, tpMain)
                                  : [];
                                const preTpCapexSum = preTpCapex.length > 0 && preTpCapex.every((value) => typeof value === "number" && Number.isFinite(value))
                                  ? preTpCapex.reduce<number>((sum, value) => {
                                    const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
                                    return sum + numericValue;
                                  }, 0)
                                  : null;
                                const initialCapexMain = typeof corporateLista3Debug?.initialCapexUSD_main === "number" && Number.isFinite(corporateLista3Debug.initialCapexUSD_main)
                                  ? corporateLista3Debug.initialCapexUSD_main
                                  : null;
                                const delta = initialCapexMain !== null && preTpCapexSum !== null
                                  ? initialCapexMain - preTpCapexSum
                                  : null;
                                return (
                                  <>
                                    <div>capexUSD_total[0..tp_main-1]: {formatDebugNumericValue(preTpCapex)}</div>
                                    <div>sum(capexUSD_total[0..tp_main-1]): {formatDebugNumericValue(preTpCapexSum)}</div>
                                    <div>initialCapexUSD_main: {formatDebugNumericValue(initialCapexMain)}</div>
                                    <div>delta = initialCapexUSD_main - sum(pre-tp capex): {formatDebugNumericValue(delta)}</div>
                                  </>
                                );
                              })()}
                            </div>
                            {corporateLista3DebugDisplayOrder.map((metricKey) => {
                              const payload = corporateLista3Debug?.perMetric?.[metricKey];
                              const inputs = payload?.inputs ?? {};
                              const intermediates = payload?.intermediates ?? {};
                              const requiredInputs = Array.isArray(payload?.requiredInputs) ? payload.requiredInputs : [];
                              const missingInputs = Array.isArray(payload?.missingInputs) ? payload?.missingInputs : [];
                              return (
                                <div key={`corp-list3-debug-${metricKey}`} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6 }}>
                                  <div><strong>{resolveProjectMetricLabel(metricKey, formatDiscountRateTag(riskAdjustedDiscountRatePctInput))}</strong></div>
                                  <div>Output value: {formatDebugNumericValue(payload?.output?.value ?? null)}</div>
                                  <div>Formula: {payload?.formula ?? corporateLista3DebugFormulaByMetric[metricKey] ?? "n/a"}</div>
                                  <div>Required inputs: {requiredInputs.length > 0 ? `[${requiredInputs.join(', ')}]` : 'none'}</div>
                                  <div>Inputs:</div>
                                  <div style={{ paddingLeft: 12 }}>
                                    {Object.keys(inputs).length > 0
                                      ? Object.entries(inputs).map(([inputKey, inputValue]) => (
                                        <div key={`corp-list3-debug-${metricKey}-input-${inputKey}`}>{inputKey}: {formatDebugNumericValue(inputValue)}</div>
                                      ))
                                      : <div>none</div>}
                                  </div>
                                  <div>Intermediates:</div>
                                  <div style={{ paddingLeft: 12 }}>
                                    {Object.keys(intermediates).length > 0
                                      ? Object.entries(intermediates).map(([intermediateKey, intermediateValue]) => (
                                        <div key={`corp-list3-debug-${metricKey}-intermediate-${intermediateKey}`}>{intermediateKey}: {formatDebugNumericValue(intermediateValue)}</div>
                                      ))
                                      : <div>none</div>}
                                  </div>
                                  <div>Missing inputs: {missingInputs.length > 0 ? missingInputs.join(", ") : "none"}</div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                      {sectionKey === "list2" && renderProdStartDebugWindow({
                        capexWindows: (() => {
                          const diagnosticsMeta = (corporateDiagnostics?.meta ?? null) as {
                            corporateTotalsDebug?: {
                              corporateProdStartCapexWindowDebug?: Array<{
                                milestoneYear: number;
                                tp_prev: number;
                                tp_k: number;
                                windowYears: number[];
                                windowCapexUSD: Array<number | null>;
                                windowCapexUSD_sum_strict: number | null;
                                fx_USD_to_TargetCurrency: number | null;
                                windowCapexTarget_sum_strict: number | null;
                              }>;
                            };
                          } | null;
                          const windows = diagnosticsMeta?.corporateTotalsDebug?.corporateProdStartCapexWindowDebug;
                          return Array.isArray(windows) ? windows : undefined;
                        })(),
                        data: {
                          npvToday: metrics.NPV_Target?.value ?? null,
                          npvTodayPerShare: metrics.NPV_perShare?.value ?? null,
                          navToday: metrics.NAV_Target?.value ?? null,
                          navTodayPerShare: metrics.NAV_perShare?.value ?? null,
                          dcfProdStartDiscounted:
                            typeof corporateSnapshotData?.DCF_prodStart_present_TargetCurrency === "number"
                              && Number.isFinite(corporateSnapshotData.DCF_prodStart_present_TargetCurrency)
                              ? corporateSnapshotData.DCF_prodStart_present_TargetCurrency
                              : null,
                          dcfProdStartDiscountedPerShare:
                            typeof corporateSnapshotData?.DCF_prodStart_present_perShare_TargetCurrency === "number"
                              && Number.isFinite(corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency)
                              ? corporateSnapshotData.DCF_prodStart_present_perShare_TargetCurrency
                              : null,
                          npvProdStart: metrics.NPV_prodStart?.value ?? null,
                          npvProdStartPerShare: metrics.NPV_prodStart_perShare?.value ?? null,
                          navProdStart: metrics.NAV_prodStart?.value ?? null,
                          navProdStartPerShare: metrics.NAV_prodStart_perShare?.value ?? null,
                          dcfProdStart: metrics.DCF_Target?.value ?? null,
                          dcfProdStartPerShare: metrics.DCF_perShare?.value ?? null,
                        },
                        targetCurrency: lockedTargetCurrency,
                        yearlyValuesByKey: corporateProdStartMarkerValuesByKey,
                      })}
                    </details>
                  ))}
                </>
                  );
                } catch {
                  return <p className="status error">Missing yearsByPeriod in corporate snapshot. See diagnostics.</p>;
                }
              })()}
            </section>
          )}
        </div>
      )}

      {primaryView === "projects" && (
        <div className="breadcontainersinglecolumn">
          {!selectedProjectId && (
            <>
              <h1 className="subrub">Project</h1>
              <p className="bread">Choose a project to view its metrics, operations, and economics.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button type="button" onClick={() => setProjectSelectorOpen((prev) => !prev)}>
                  Select project
                </button>
                <a href={`/company/${encodeURIComponent(ticker)}/projects?action=new`} className="button-link" style={{ alignSelf: "center" }}>
                  Add project
                </a>
              </div>
              <p className="bread">To add a new project, use “New from template” in the editor.</p>

              {companyProjectsLoading && <p className="bread">Loading stored projects…</p>}
              {companyProjectsError && <p className="status error">{companyProjectsError}</p>}

              {projectSelectorOpen && (
                <div style={{ display: "grid", gap: 8 }}>
                  {companyProjects.length === 0 && <p className="status empty">No stored projects for this symbol.</p>}
                  {companyProjects.map((project) => (
                    <button key={project.project_id} type="button" onClick={() => void runProjectSnapshotForProject(project.project_id, project.project_name)} disabled={projectSnapshotLoading}>
                      {project.project_id} — {project.project_name ?? "Unnamed project"}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {selectedProjectId && (
            <>
              <h1 className="subrub">{selectedProjectName?.trim() || selectedProjectId}</h1>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button type="button" onClick={() => { setSelectedProjectId(null); setSelectedProjectName(null); setSelectedProjectRawJson(null); setProjectSnapshotData(null); setProjectSnapshotError(null); setProjectSnapshotWarnings([]); setProjectSnapshotErrors([]); setProjectSnapshotDiagnosticsMeta(null); setStressSnapshotData(null); setStressSnapshotDiagnosticsMeta(null); setStressSnapshotError(null); setStressEdgeCases([]); setStressOptions({}); }}>
                  Back to projects
                </button>
                <a href={`/company/${encodeURIComponent(ticker)}/projects?projectId=${encodeURIComponent(selectedProjectId)}`} className="button-link" style={{ alignSelf: "center" }}>
                  Edit project
                </a>
              </div>

              {projectSnapshotLoading && <p className="bread">Running snapshot…</p>}
              {projectSnapshotError && <p className="status error">{projectSnapshotError}</p>}
              {projectCalendarResolution && !projectCalendarResolution.ok && (
                <p className="status error">{projectCalendarResolution.error}</p>
              )}

              {projectViewMetrics && (
                <section className="project-producer-layout" style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {(import.meta.env.DEV || debugEnabled) && projectInputDebug && (
                    <details className="producer-core-section" open>
                      <summary><h2 className="subrub small">Project input diagnostics (dev)</h2></summary>
                      <div style={{ fontSize: 12, paddingTop: 8 }}>
                        {projectInputDebug.rows.map(([label, value]) => (
                          <div key={label}><strong>{label}:</strong> {typeof value === "number" && Number.isFinite(value) ? String(value) : "missing"}</div>
                        ))}
                        <div style={{ marginTop: 8 }}><strong>Series presence</strong></div>
                        {projectInputDebug.seriesRows.map(([label, values]) => (
                          <div key={label}>
                            <strong>{label}:</strong> {Array.isArray(values) ? `present (length=${values.length})` : "missing"}
                          </div>
                        ))}
                        <div style={{ marginTop: 8 }}><strong>Missing/invalid:</strong> {projectInputDebug.missing.length ? projectInputDebug.missing.join(", ") : "none"}</div>
                        <div><strong>capex_sign_convention:</strong> {projectViewMetrics.diagnostics.capexSignConvention}</div>
                      </div>
                    </details>
                  )}
                  <div className="producer-core-compact-card">
                    <section className="producer-core-section">
                      <div className="producer-core-title-row">
                        <h2 className="subrub small">Market Box</h2>
                      </div>
                      <div className="compact-metrics-grid">
                        {[
                          { label: "MarketCap (current)", value: projectViewMetrics.marketBox.marketCapCurrent, kind: "money" as const },
                          { label: "EV (current)", value: projectViewMetrics.marketBox.evCurrent, kind: "money" as const },
                          { label: "Shares Current", value: projectViewMetrics.marketBox.sharesCurrent, kind: "integer" as const },
                          { label: "Shares PF", value: projectViewMetrics.marketBox.sharesPf, kind: "integer" as const },
                        ].map((metric) => (
                          <div key={metric.label} className="compact-metric-row">
                            <span className="compact-metric-label-wrap">
                              <span className="compact-metric-label">{metric.label}</span>
                              <InfoPopover
                                id={`project-market-${metric.label}`}
                                openId={openInfoId}
                                onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                                onClose={() => setOpenInfoId(null)}
                                title={metric.label}
                                sections={[
                                  { heading: "Definition", lines: ["Project view market metric."] },
                                  { heading: "Formula", lines: [metric.label.includes("MarketCap") ? "MarketCap_current = price_current × shares_current" : metric.label.includes("EV") ? "EV = MarketCap_current + debt_t0 - cash_t0 + EnterpriseAdjustments" : "Per financing equations in List 5."] },
                                  { heading: "Basis / Unit / Null", lines: ["Basis: equity for MarketCap, enterprise for EV.", `Unit: ${metric.kind === "money" ? lockedTargetCurrency : "shares"}.`, metric.value.reason ?? "Null: n/a only when required inputs are missing."] },
                                  { heading: "Interpretation", lines: ["Use current MarketCap and financing-adjusted PF shares for dilution context."] },
                                ]}
                              />
                            </span>
                            <span className="compact-metric-dots" />
                            <span className="compact-metric-value">
                              {metric.kind === "integer"
                                ? formatSharesValue(metric.value.value)
                                : formatMetricValue(metric.value, metric.kind, metric.kind === "money" ? lockedTargetCurrency : undefined)}
                              {metric.value.value === null && <span style={{ display: "block", fontSize: 11, color: "#6b7280", marginTop: 2 }}>{formatMetricNullReason(metric.value)}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                      <label className="rr-input-row" style={{ marginTop: 10, display: "grid", gap: 4 }}>
                        <span className="compact-metric-label-wrap"><span>Extra aktier</span><InfoPopover id="project-extra-shares" openId={openInfoId} onToggle={(id) => setOpenInfoId((prev) => prev === id ? null : id)} onClose={() => setOpenInfoId(null)} title="Extra aktier" sections={[{ heading: "Info", lines: [EXTRA_SHARES_HELP] }]} /></span>
                        <input aria-label="Extra aktier" inputMode="numeric" pattern="[0-9 ]*" value={formatExtraSharesInput(projectExtraSharesInput)} onChange={(event) => updateExtraShares('project', event.target.value)} onBlur={() => { if (!projectExtraSharesInput) updateExtraShares('project', '0'); }} />
                      </label>
                    </section>
                  </div>

                  <div className="project-list2-pager" aria-label="Project modeled valuation pages">
                    <div className="project-list2-page">
                      <details className="producer-core-section project-collapsible-card" open={projectSectionsOpen.list2} onToggle={(event) => { const open = (event.currentTarget as HTMLDetailsElement | null)?.open ?? false; setProjectSectionsOpen((prev) => ({ ...prev, list2: open })); }}>
                        <summary><h2 className="subrub small">FINANSIELLA NYCKELTAL OCH VÄRDERING</h2></summary>
                        <ValueRangeSnapshotCard
                          mode="project"
                          priceToday={typeof profile?.price === "number" && Number.isFinite(profile.price) ? profile.price : null}
                          npvLow={projectViewMetrics.list2.NAV_perShare?.value ?? null}
                          npvHigh={projectViewMetrics.list2.DCF_Target_discounted_perShare?.value ?? null}
                          tpLow={projectViewMetrics.list2.NAV_prodStart_perShare?.value ?? null}
                          tpHigh={projectViewMetrics.list2.DCF_perShare?.value ?? null}
                          canonicalTimeline={projectViewMetrics.valuationTimeline}
                          canonicalSharesPostFinancing={projectViewMetrics.marketBox.sharesPf.value}
                          chartFlows={(() => {
                            const projectPayload = (projectSnapshotData?.project ?? null) as { chartFlows?: { dcfProdstartPresentPerShareSeries?: Array<number | null>; navProdstartPerShareSeries?: Array<number | null>; dcfProdstartExCapexPerShareSeries?: Array<number | null>; navByPeriodPerShareSeries?: Array<number | null>; yearsByPeriod?: Array<number | null>; productionStartPeriod?: number | null; discountRate?: number | null } | null } | null;
                            return projectPayload?.chartFlows ?? null;
                          })()}
                          projectDebug={(() => {
                            const snapshotSeries = (projectSnapshotData?.series ?? null) as { fcffUSD?: Array<number | null>; yearsByPeriod?: Array<number | null> } | null;
                            const inputs = getProjectInputs({ snapshot: (projectSnapshotData ?? null) as Record<string, unknown> | null, parsedProject: parsedSelectedProject, discountRateInput: riskAdjustedDiscountRatePctInput, targetCurrency: lockedTargetCurrency });
                            return {
                              yearsByPeriod: Array.isArray(snapshotSeries?.yearsByPeriod) ? snapshotSeries?.yearsByPeriod : null,
                              fcffProductionTableSeries: Array.isArray(snapshotSeries?.fcffUSD) ? snapshotSeries.fcffUSD : null,
                              fcffNpvSeries: Array.isArray(inputs.series.fcfUSD) ? inputs.series.fcfUSD : null,
                              discountRate: inputs.r,
                              tpPeriod: inputs.tp,
                              debugEnabled,
                              fxUsdToTarget: inputs.fx,
                              sharesPostFinancing: inputs.sharesPostFinancing,
                              netCashTarget: (inputs.cash0 !== null && inputs.debt0 !== null) ? (inputs.cash0 - inputs.debt0) : null,
                              capexSeries: Array.isArray(inputs.series.capexUSD) ? inputs.series.capexUSD : null,
                            };
                          })()}
                          currentYear={(() => {
                            const series = (projectSnapshotData?.series ?? null) as { yearsByPeriod?: number[] } | null;
                            const firstYear = Array.isArray(series?.yearsByPeriod) ? series?.yearsByPeriod[0] : null;
                            return typeof firstYear === "number" && Number.isFinite(firstYear) ? firstYear : null;
                          })()}
                          tpYear={(() => {
                            const time = selectedProjectRawJson && typeof selectedProjectRawJson.time === "object" && selectedProjectRawJson.time !== null
                              ? selectedProjectRawJson.time as Record<string, unknown>
                              : null;
                            const value = time?.productionStartYear;
                            return typeof value === "number" && Number.isFinite(value) ? value : null;
                          })()}
                          currencyCode={lockedTargetCurrency}
                        />
                        <div className="compact-metrics-grid">
                          {(projectSectionMetricOrder.list2
                            .filter((key) => Object.prototype.hasOwnProperty.call(projectViewMetrics.list2, key))
                            .map((key) => [key, projectViewMetrics.list2[key]] as const))
                          .map(([key, value]) => (
                            <div key={key} className="compact-metric-row">
                              <span className="compact-metric-label-wrap">
                                <span className="compact-metric-label">{resolveProjectMetricLabel(key, formatDiscountRateTag(riskAdjustedDiscountRatePctInput))}</span>
                                <InfoPopover
                                  id={`project-list2-${key}`}
                                  openId={openInfoId}
                                  onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                                  onClose={() => setOpenInfoId(null)}
                                  title={resolveProjectMetricLabel(key, formatDiscountRateTag(riskAdjustedDiscountRatePctInput))}
                                  sections={[
                                    { heading: "Definition", lines: ["Project KPI in pre-revenue strict mode."] },
                                    { heading: "Formula", lines: ["Exact formula implemented in computeProjectViewMetrics helper."] },
                                    { heading: "Basis / Unit / Null", lines: ["Basis: enterprise/equity per metric family.", "Unit auto-formatted.", value.reason ?? "Null rule: returns n/a when input requirements fail."] },
                                    { heading: "Interpretation", lines: ["Higher/lower significance depends on metric type and project stage."] },
                                  ]}
                                />
                              </span>
                              <span className="compact-metric-dots" />
                              <span className="compact-metric-value">
                                {key === "IRR"
                                  ? formatIrrMetricValue(value)
                                  : key === "AuEq_10Y_perShare"
                                    ? formatAuEq10YPerShareValue(value)
                                    : (() => {
                                    const meta = projectMetricUnitMeta[key];
                                    if (meta?.unitType === "percent" || meta?.unitType === "multiple" || meta?.unitType === "multiple_per_year") {
                                      return formatMetricValue(value, meta.unitType);
                                    }
                                    return formatMetricValue(value, key.includes("over") || key.includes("Mult") ? "multiple" : key === "LOM" ? "integer" : key.includes("Payback") ? "decimal" : "money", key.includes("InSitu") ? "USD" : undefined);
                                  })()}
                                {value.value === null && <span style={{ display: "block", fontSize: 11, color: "#6b7280", marginTop: 2 }}>{formatMetricNullReason(value)}</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                        {renderProdStartDebugWindow({
                          data: {
                            npvToday: projectViewMetrics.list2.NPV_Target?.value ?? null,
                            npvTodayPerShare: projectViewMetrics.list2.NPV_perShare?.value ?? null,
                            navToday: projectViewMetrics.list2.NAV_Target?.value ?? null,
                            navTodayPerShare: projectViewMetrics.list2.NAV_perShare?.value ?? null,
                            dcfProdStartDiscounted: projectViewMetrics.list2.DCF_Target_discounted?.value ?? null,
                            dcfProdStartDiscountedPerShare: projectViewMetrics.list2.DCF_Target_discounted_perShare?.value ?? null,
                            npvProdStart: projectViewMetrics.list2.NPV_prodStart?.value ?? null,
                            npvProdStartPerShare: projectViewMetrics.list2.NPV_prodStart_perShare?.value ?? null,
                            navProdStart: projectViewMetrics.list2.NAV_prodStart?.value ?? null,
                            navProdStartPerShare: projectViewMetrics.list2.NAV_prodStart_perShare?.value ?? null,
                            dcfProdStart: projectViewMetrics.list2.DCF_Target?.value ?? null,
                            dcfProdStartPerShare: projectViewMetrics.list2.DCF_perShare?.value ?? null,
                          },
                          targetCurrency: lockedTargetCurrency,
                        })}
                        {debugEnabled && (() => {
                          const npv10Trace = projectViewMetrics.diagnostics?.npv10_trace ?? null;
                          return (
                            <details style={{ marginTop: 8 }}>
                              <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>Djupdebugg NPV10 (UI → motor, alla steg)</summary>
                              <div style={{ marginTop: 8, fontSize: 11, color: "#0f172a" }}>
                                <div><strong>Persisted tracefil:</strong> {npvTracePersistResult.url ? <a href={npvTracePersistResult.url} target="_blank" rel="noreferrer">{npvTracePersistResult.fileName ?? npvTracePersistResult.url}</a> : "inte sparad ännu"}</div>
                                {npvTracePersistResult.savedAtUtc && <div><strong>Senast sparad (UTC):</strong> {npvTracePersistResult.savedAtUtc}</div>}
                                {npvTracePersistResult.error && <div style={{ color: "#b91c1c" }}><strong>Persist-fel:</strong> {npvTracePersistResult.error}</div>}
                                <div style={{ marginTop: 8 }}><strong>Steglogg NPV10 (inkl. IF/guards):</strong></div>
                                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 6 }}>{JSON.stringify(npv10Trace, null, 2)}</pre>
                                <div style={{ marginTop: 8 }}><strong>UI indata / val:</strong></div>
                                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 6 }}>{JSON.stringify({
                                  projectId: selectedProjectId,
                                  projectName: selectedProjectName,
                                  time: selectedProjectRawJson?.time ?? null,
                                  economics: selectedProjectRawJson?.economics ?? null,
                                  financeInputs: {
                                    projectEquityPct,
                                    projectDebtPct,
                                    projectUseQuarterlyCash,
                                    projectCashUsedPct,
                                    riskAdjustedDiscountRatePctInput,
                                  },
                                  list2Metrics: projectViewMetrics.list2,
                                }, null, 2)}</pre>
                                <div style={{ marginTop: 8 }}><strong>Motor-diagnostik (snapshot):</strong></div>
                                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 6 }}>{JSON.stringify(projectSnapshotDiagnosticsMeta ?? null, null, 2)}</pre>
                              </div>
                            </details>
                          );
                        })()}
                        {debugEnabled && financingConsistencyDebug && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>financing_consistency_debug</summary>
                            <div style={{ marginTop: 8, fontSize: 11, color: "#0f172a", display: "grid", gap: 8 }}>
                              <div><strong>financing_mix:</strong> equity={financingConsistencyDebug.financing_mix.equity_fraction ?? "null"}, debt={financingConsistencyDebug.financing_mix.debt_fraction ?? "null"}</div>
                              <div><strong>shares_current:</strong> {financingConsistencyDebug.shares_current ?? "null"} | <strong>shares_post_financing:</strong> {financingConsistencyDebug.shares_post_financing ?? "null"}</div>
                              <div><strong>debt:</strong> {financingConsistencyDebug.debt ?? "null"} | <strong>cash:</strong> {financingConsistencyDebug.cash ?? "null"}</div>
                              <div><strong>MarketBox EV check:</strong> EV={financingConsistencyDebug.market_box.ev ?? "null"}, MarketCap+Debt-Cash={financingConsistencyDebug.market_box.ev_formula_marketCap_plus_debt_minus_cash ?? "null"}, diff={financingConsistencyDebug.market_box.ev_formula_diff ?? "null"}</div>
                              <div style={{ overflowX: "auto" }}>
                                <table>
                                  <thead><tr><th>metric</th><th>enterprise_value</th><th>equity_value</th><th>shares_used</th><th>source_layer</th></tr></thead>
                                  <tbody>
                                    {financingConsistencyDebug.rows.map((row) => (
                                      <tr key={`fin-${row.metric}`}>
                                        <td>{row.metric}</td>
                                        <td>{row.enterprise_value ?? "null"}</td>
                                        <td>{row.equity_value ?? "null"}</td>
                                        <td>{row.shares_used ?? "null"}</td>
                                        <td>{row.source_layer}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </details>
                        )}
                        {debugEnabled && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>debugg fallande graf</summary>
                            <div style={{ marginTop: 8, fontSize: 11, color: "#0f172a" }}>
                              Den fulla tabell-debuggen för fallande kurva ligger i grafkortet (ValueRangeSnapshotCard) direkt ovanför listan med nyckeltal i samma sektion.
                              <div style={{ marginTop: 6 }}><strong>Plats:</strong> FINANSIELLA NYCKELTAL OCH VÄRDERING → under själva grafen.</div>
                            </div>
                          </details>
                        )}
                        {debugEnabled && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>debugg fallande graf 2</summary>
                            <div style={{ marginTop: 8, fontSize: 11, color: "#0f172a" }}>
                              Den fulla sektionen med post-TP exponentverifiering, central-vs-graf-jämförelse och differenstabeller ligger i grafkortet (ValueRangeSnapshotCard) direkt ovanför nyckeltalen.
                              <div style={{ marginTop: 6 }}><strong>Tips:</strong> scrolla upp i samma kort till grafen och öppna detaljerna där.</div>
                            </div>
                          </details>
                        )}
                        {debugEnabled && projectTimelineDebug && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>Valuation timeline debug</summary>
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 8 }}>{JSON.stringify(projectTimelineDebug, null, 2)}</pre>
                          </details>
                        )}
                      </details>
                    </div>
                    <div className="project-list2-page">
                      <details className="producer-core-section project-collapsible-card" open={projectSectionsOpen.list2Interval} onToggle={(event) => { const open = (event.currentTarget as HTMLDetailsElement | null)?.open ?? false; setProjectSectionsOpen((prev) => ({ ...prev, list2Interval: open })); }}>
                        <summary><h2 className="subrub small">FINANSIELLA NYCKELTAL · VÄRDEINTERVALL</h2></summary>
                        <NpvSpotRangeComparisonCard
                          range={(() => {
                            const npvRange = (projectSnapshotData?.project as { modeled?: { npvSpotRange?: { low: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null }; base: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null }; high: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null } } | null } } | undefined)?.modeled?.npvSpotRange ?? null;
                            if (!npvRange) return null;
                            return {
                              low: npvRange.low,
                              spot: npvRange.base,
                              high: npvRange.high,
                            };
                          })()}
                          yearsByPeriod={Array.isArray(((projectSnapshotData?.project as { chartFlows?: { yearsByPeriod?: number[] } } | undefined)?.chartFlows?.yearsByPeriod)) ? ((projectSnapshotData?.project as { chartFlows?: { yearsByPeriod?: number[] } }).chartFlows?.yearsByPeriod as number[]) : []}
                          productionStartYear={(() => {
                            const time = selectedProjectRawJson && typeof selectedProjectRawJson.time === "object" && selectedProjectRawJson.time !== null
                              ? selectedProjectRawJson.time as Record<string, unknown>
                              : null;
                            const value = time?.productionStartYear;
                            return typeof value === "number" && Number.isFinite(value) ? value : null;
                          })()}
                          productionStartPeriod={(() => {
                            const time = selectedProjectRawJson && typeof selectedProjectRawJson.time === "object" && selectedProjectRawJson.time !== null
                              ? selectedProjectRawJson.time as Record<string, unknown>
                              : null;
                            const value = time?.productionStartPeriod;
                            return typeof value === "number" && Number.isFinite(value) ? value : null;
                          })()}
                          masterN={(() => {
                            const time = selectedProjectRawJson && typeof selectedProjectRawJson.time === "object" && selectedProjectRawJson.time !== null
                              ? selectedProjectRawJson.time as Record<string, unknown>
                              : null;
                            const value = time?.masterN;
                            return typeof value === "number" && Number.isFinite(value) ? value : null;
                          })()}
                          marketCapToday={projectViewMetrics.marketBox.marketCapCurrent.value}
                          currencyCode={lockedTargetCurrency}
                          formatMoney={(value) => formatMetricValue({ value, reason: null }, "money", lockedTargetCurrency)}
                          debugEnabled={valueIntervalDebugVisible}
                          debugPayload={projectValueIntervalDebug}
                        />
                      </details>
                    </div>
                    <div className="project-list2-page">
                      <details className="producer-core-section project-collapsible-card" open={projectSectionsOpen.list2}>
                        <summary><h2 className="subrub small">ALLT GICK FEL</h2></summary>
                        <AlltGickFelCard
                          range={(() => {
                            const hasActiveStressOptions = Object.values(stressOptions).some((value) => value === true);
                            const sourceSnapshot = hasActiveStressOptions
                              ? stressSnapshotData
                              : projectSnapshotData;
                            const npvRange = (sourceSnapshot?.project as { modeled?: { npvSpotRange?: { low: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null }; base: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null }; high: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null } } | null } } | undefined)?.modeled?.npvSpotRange ?? null;
                            if (!npvRange) return null;
                            return {
                              low: npvRange.low,
                              spot: npvRange.base,
                              high: npvRange.high,
                            };
                          })()}
                          yearsByPeriod={Array.isArray(((projectSnapshotData?.project as { chartFlows?: { yearsByPeriod?: number[] } } | undefined)?.chartFlows?.yearsByPeriod)) ? ((projectSnapshotData?.project as { chartFlows?: { yearsByPeriod?: number[] } }).chartFlows?.yearsByPeriod as number[]) : []}
                          marketCapToday={projectViewMetrics.marketBox.marketCapCurrent.value}
                          currencyCode={lockedTargetCurrency}
                          formatMoney={(value) => formatMetricValue({ value, reason: null }, "money", lockedTargetCurrency)}
                          stressOptions={stressOptions}
                          onToggle={(key) => setStressOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
                          loading={stressSnapshotLoading}
                          error={stressSnapshotError}
                          edgeCases={stressEdgeCases}
                          debugPayload={valueIntervalDebugVisible
                            ? (() => {
                                const hasActiveStressOptions = Object.values(stressOptions).some((value) => value === true);
                                const stressPipelineInvoked = stressSnapshotLoading || stressSnapshotData !== null || stressSnapshotError !== null || stressEdgeCases.length > 0 || stressSnapshotDiagnosticsMeta !== null;
                                const baseSnapshotExists = projectSnapshotData !== null;
                                const stressedSnapshotExists = stressSnapshotData !== null;
                                const snapshotToRender = hasActiveStressOptions
                                  ? (stressedSnapshotExists ? "stressedSnapshot" : "none")
                                  : (baseSnapshotExists ? "baseSnapshot" : "none");
                                const sourceSnapshot = snapshotToRender === "stressedSnapshot"
                                  ? stressSnapshotData
                                  : snapshotToRender === "baseSnapshot"
                                    ? projectSnapshotData
                                    : null;
                                const extractRange = (snapshot: Record<string, unknown> | null) => {
                                  const npvRange = (snapshot?.project as { modeled?: { npvSpotRange?: { low: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null }; base: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null }; high: { npvToday: number | null; npvSeries: Array<number | null>; irr: number | null; payback: number | null; lomAvgEbitRoce: number | null; kapitalavkastningLom: number | null; inSitu10YUsd: number | null } } | null } } | undefined)?.modeled?.npvSpotRange ?? null;
                                  return npvRange
                                    ? { low: npvRange.low, spot: npvRange.base, high: npvRange.high }
                                    : null;
                                };
                                const baseRange = extractRange(projectSnapshotData);
                                const stressedRange = extractRange(stressSnapshotData);
                                const renderRange = extractRange(sourceSnapshot);

                                const requiredInputPresence = (() => {
                                  const time = selectedProjectRawJson && typeof selectedProjectRawJson.time === "object" && selectedProjectRawJson.time !== null
                                    ? selectedProjectRawJson.time as Record<string, unknown>
                                    : null;
                                  const econ = selectedProjectRawJson && typeof selectedProjectRawJson.economics === "object" && selectedProjectRawJson.economics !== null
                                    ? selectedProjectRawJson.economics as Record<string, unknown>
                                    : null;
                                  const series = selectedProjectRawJson && typeof selectedProjectRawJson.series === "object" && selectedProjectRawJson.series !== null
                                    ? selectedProjectRawJson.series as Record<string, unknown>
                                    : null;
                                  const ops = selectedProjectRawJson && typeof selectedProjectRawJson.operations === "object" && selectedProjectRawJson.operations !== null
                                    ? selectedProjectRawJson.operations as Record<string, unknown>
                                    : null;
                                  return {
                                    'time.masterN': typeof time?.masterN === 'number',
                                    'time.productionStartPeriod': typeof time?.productionStartPeriod === 'number',
                                    'economics.taxRate': typeof econ?.taxRate === 'number',
                                    'series.capexUSD': Array.isArray(series?.capexUSD),
                                    'series.operatingCostsUSD': Array.isArray(series?.operatingCostsUSD),
                                    'series.sustainingCapexUSD': Array.isArray(series?.sustainingCapexUSD),
                                    'series.reclamationUSD': Array.isArray(series?.reclamationUSD),
                                    'series.royaltiesUSD': Array.isArray(series?.royaltiesUSD),
                                    'operations.recoveryPctByMetal': typeof ops?.recoveryPctByMetal === 'object' && ops?.recoveryPctByMetal !== null,
                                    'fx.manual_fx_USD_to_TargetCurrency': typeof toInputNumber(manualFxInput) === 'number',
                                  };
                                })();

                                const guard = (name: string, passed: boolean, message: string, path: string, blocking = false) => ({ name, status: passed ? 'PASS' : 'FAIL', severity: passed ? 'info' : (blocking ? 'error' : 'warning'), message, path, blocking });
                                const guards = [
                                  guard('noStressUsesBaseSnapshot', !hasActiveStressOptions ? snapshotToRender === 'baseSnapshot' : true, hasActiveStressOptions ? 'stress active' : 'no stress should resolve base snapshot', 'snapshot selection', !hasActiveStressOptions),
                                  guard('stressPipelineInvokedWhenActive', hasActiveStressOptions ? stressPipelineInvoked : true, hasActiveStressOptions ? 'active stress should invoke pipeline' : 'not applicable', 'stress pipeline', hasActiveStressOptions),
                                  guard('snapshotToRenderResolved', snapshotToRender !== 'none', `snapshotToRender=${snapshotToRender}`, 'snapshotToRender', true),
                                  guard('baseSnapshotExists', baseSnapshotExists, 'base snapshot loaded', 'projectSnapshotData', false),
                                  guard('stressedSnapshotExistsWhenActive', hasActiveStressOptions ? stressedSnapshotExists : true, hasActiveStressOptions ? 'stressed snapshot required when stress active' : 'not applicable', 'stressSnapshotData', hasActiveStressOptions),
                                  guard('uiMetricPathsPresent', renderRange !== null, 'project.modeled.npvSpotRange.{low|base|high}', 'snapshot.project.modeled.npvSpotRange', true),
                                  guard('edgeCasesEmpty', stressEdgeCases.length === 0, stressEdgeCases.length === 0 ? 'no stress edge case blockers' : stressEdgeCases.join(' | '), 'diagnostics.meta.stress.edgeCases', true),
                                ];

                                const uiRows = [
                                  { row: 'NPV', key: 'npvToday' as const },
                                  { row: 'IRR', key: 'irr' as const },
                                  { row: 'Payback', key: 'payback' as const },
                                  { row: 'LOM_avg_EBIT_ROCE', key: 'lomAvgEbitRoce' as const },
                                  { row: 'Kapitalavkastning_LOM', key: 'kapitalavkastningLom' as const },
                                  { row: 'InSitu_10Y_USD', key: 'inSitu10YUsd' as const },
                                ].map((item) => {
                                  const low = renderRange ? renderRange.low[item.key] : null;
                                  const spot = renderRange ? renderRange.spot[item.key] : null;
                                  const high = renderRange ? renderRange.high[item.key] : null;
                                  const reason = snapshotToRender === 'none'
                                    ? 'missing snapshot'
                                    : renderRange === null
                                      ? 'missing metric key path'
                                      : (low === null && spot === null && high === null)
                                        ? 'null numeric values'
                                        : 'value present';
                                  return {
                                    row: item.row,
                                    low: { path: `project.modeled.npvSpotRange.low.${item.key}`, value: low },
                                    spot: { path: `project.modeled.npvSpotRange.base.${item.key}`, value: spot },
                                    high: { path: `project.modeled.npvSpotRange.high.${item.key}`, value: high },
                                    reasonForNA: reason,
                                  };
                                });

                                const diagnosis = (() => {
                                  if (!hasActiveStressOptions && stressPipelineInvoked) return 'No active stress options but stress pipeline appears to have run.';
                                  if (hasActiveStressOptions && stressSnapshotError) return `Stress pipeline failed: ${stressSnapshotError.split('\n')[0]}`;
                                  if (stressEdgeCases.length > 0) return `Stress pipeline aborted by edge-case guard: ${stressEdgeCases[0]}`;
                                  if (hasActiveStressOptions && !stressedSnapshotExists) return 'Stress pipeline ran but stressed snapshot is null.';
                                  if (snapshotToRender !== 'none' && renderRange === null) return 'Snapshot exists but UI binding path project.modeled.npvSpotRange is missing.';
                                  if (uiRows.every((row) => row.reasonForNA !== 'value present')) return 'Snapshot/path exists but all metric values are null or rejected, resulting in n/a.';
                                  return 'No blocking issue detected in trace.';
                                })();

                                return {
                                  context: {
                                    route: typeof window !== 'undefined' ? window.location.pathname : null,
                                    query: typeof window !== 'undefined' ? Object.fromEntries(new URLSearchParams(window.location.search).entries()) : {},
                                    projectId: selectedProjectId,
                                    projectName: selectedProjectName,
                                    debugModeByQueryParam: valueIntervalDebugVisible,
                                    scope: 'project',
                                    renderMode: hasActiveStressOptions ? 'stress-mode' : 'baseline-mode',
                                  },
                                  stressOptions: {
                                    raw: stressOptions,
                                    activeKeys: Object.entries(stressOptions).filter(([, value]) => value === true).map(([key]) => key),
                                    hasActiveStressOptions,
                                  },
                                  snapshotSelection: {
                                    baseSnapshotExists,
                                    stressedSnapshotExists,
                                    stressPipelineInvoked,
                                    noStressModeIncorrectlyInvokedPipeline: !hasActiveStressOptions && stressPipelineInvoked,
                                    sourcePathUsedByCard: 'snapshot.project.modeled.npvSpotRange',
                                    snapshotToRender,
                                  },
                                  baseSnapshotSummary: {
                                    hasModeledData: ((projectSnapshotData?.project as { modeled?: unknown } | undefined)?.modeled ?? null) !== null,
                                    hasNpvSpotRange: baseRange !== null,
                                    sample: baseRange
                                      ? {
                                          npv: { low: baseRange.low.npvToday, spot: baseRange.spot.npvToday, high: baseRange.high.npvToday },
                                          irrSpot: baseRange.spot.irr,
                                          paybackSpot: baseRange.spot.payback,
                                        }
                                      : null,
                                  },
                                  stressTrace: {
                                    invoked: stressPipelineInvoked,
                                    reasonInvoked: hasActiveStressOptions ? 'active stress options' : 'no active stress options',
                                    status: {
                                      loading: stressSnapshotLoading,
                                      error: stressSnapshotError,
                                    },
                                    stepA_inputAcquisition: {
                                      baseInputsFound: selectedProjectRawJson !== null,
                                      inputSourcePath: 'selectedProjectRawJson + buildProjectsSnapshotRequest',
                                      requiredInputPresence,
                                    },
                                    stepB_applyStressModifiers: {
                                      success: stressEdgeCases.length === 0,
                                      edgeCases: stressEdgeCases,
                                      details: (stressSnapshotDiagnosticsMeta?.stress ?? null),
                                    },
                                    stepC_validation: {
                                      pass: stressSnapshotError === null || !stressSnapshotError.toLowerCase().includes('must'),
                                      message: stressSnapshotError,
                                    },
                                    stepD_engineExecution: {
                                      attempted: stressPipelineInvoked,
                                      completed: stressPipelineInvoked && !stressSnapshotLoading,
                                      skippedReason: !hasActiveStressOptions ? 'no active stress options' : null,
                                      failedReason: stressSnapshotError,
                                    },
                                    stepE_output: {
                                      snapshotExists: stressedSnapshotExists,
                                      modeledExists: ((stressSnapshotData?.project as { modeled?: unknown } | undefined)?.modeled ?? null) !== null,
                                      npvSpotRangeExists: stressedRange !== null,
                                      metricsSourceExists: stressedRange !== null,
                                    },
                                  },
                                  guards,
                                  modifierSpecific: {
                                    initialCapex2x: stressOptions.initialCapex2x ? { attempted: true, tp: (selectedProjectRawJson?.time as Record<string, unknown> | undefined)?.productionStartPeriod ?? null, capexSeriesLength: Array.isArray((selectedProjectRawJson?.series as Record<string, unknown> | undefined)?.capexUSD) ? (((selectedProjectRawJson?.series as Record<string, unknown>).capexUSD as unknown[])?.length ?? null) : null, edgeCases: stressEdgeCases.filter((line) => line.toLowerCase().includes('capex')) } : { attempted: false },
                                    spotHalf: stressOptions.spotHalf ? { attempted: true, detail: 'Applied in engine after winning price-source resolution (manual -> FMP -> JSON study).' } : { attempted: false },
                                    tpPlus2: stressOptions.tpPlus2 ? { attempted: true, originalTp: (selectedProjectRawJson?.time as Record<string, unknown> | undefined)?.productionStartPeriod ?? null, stressedTp: typeof (selectedProjectRawJson?.time as Record<string, unknown> | undefined)?.productionStartPeriod === 'number' ? (((selectedProjectRawJson?.time as Record<string, unknown>).productionStartPeriod as number) + 2) : null, masterN: (selectedProjectRawJson?.time as Record<string, unknown> | undefined)?.masterN ?? null, edgeCases: stressEdgeCases.filter((line) => line.toLowerCase().includes('tp')) } : { attempted: false },
                                    taxPlus5pp: stressOptions.taxPlus5pp ? { attempted: true, originalTaxRate: (selectedProjectRawJson?.economics as Record<string, unknown> | undefined)?.taxRate ?? null, stressTaxExpected: typeof (selectedProjectRawJson?.economics as Record<string, unknown> | undefined)?.taxRate === 'number' ? Math.max(0, Math.min(1, ((selectedProjectRawJson?.economics as Record<string, unknown>).taxRate as number) + 0.05)) : null, recomputeViaEngine: true } : { attempted: false },
                                    fxMinus10: stressOptions.fxMinus10 ? { attempted: true, manualFxInput: toInputNumber(manualFxInput), direction: 'fx_USD_to_TargetCurrency * 0.9' } : { attempted: false },
                                  },
                                  uiBindings: {
                                    cardMetricSourcePath: 'project.modeled.npvSpotRange',
                                    pathExistsOnSnapshotToRender: renderRange !== null,
                                    rows: uiRows,
                                  },
                                  diagnosis,
                                };
                              })()
                            : null}
                        />
                      </details>
                    </div>
                  </div>

                  {([
                    ["list3", "EFFEKTIVITET OCH LÖNSAMHET", projectViewMetrics.list3],
                    ["list4", "TILLGÅNGSVÄRDE OCH JÄMFÖRELSE", projectViewMetrics.list4],
                    ["list6", "M&A VALUATION", projectViewMetrics.list6],
                  ] as Array<["list3" | "list4" | "list6", string, Record<string, MetricValue>]>).map(([sectionKey, title, metrics]) => (
                    <details key={sectionKey} className="producer-core-section project-collapsible-card" open={projectSectionsOpen[sectionKey]} onToggle={(event) => { const open = (event.currentTarget as HTMLDetailsElement | null)?.open ?? false; setProjectSectionsOpen((prev) => ({ ...prev, [sectionKey]: open })); }}>
                      <summary><h2 className="subrub small">{title}</h2></summary>
                      <div className="compact-metrics-grid">
                        {Object.entries(metrics).map(([key, value]) => (
                          <div key={key} className="compact-metric-row">
                            <span className="compact-metric-label-wrap">
                              <span className="compact-metric-label">{resolveProjectMetricLabel(key, formatDiscountRateTag(riskAdjustedDiscountRatePctInput))}</span>
                              <InfoPopover
                                id={`project-${sectionKey}-${key}`}
                                openId={openInfoId}
                                onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                                onClose={() => setOpenInfoId(null)}
                                title={resolveProjectMetricLabel(key, formatDiscountRateTag(riskAdjustedDiscountRatePctInput))}
                                sections={[
                                  { heading: "Definition", lines: ["Project KPI in pre-revenue strict mode."] },
                                  { heading: "Formula", lines: ["Exact formula implemented in computeProjectViewMetrics helper."] },
                                  { heading: "Basis / Unit / Null", lines: ["Basis: enterprise/equity per metric family.", "Unit auto-formatted.", value.reason ?? "Null rule: returns n/a when input requirements fail."] },
                                  { heading: "Interpretation", lines: ["Higher/lower significance depends on metric type and project stage."] },
                                ]}
                              />
                            </span>
                            <span className="compact-metric-dots" />
                            <span className="compact-metric-value">
                              {key === "IRR"
                                ? formatIrrMetricValue(value)
                                : key === "AuEq_10Y_perShare"
                                  ? formatAuEq10YPerShareValue(value)
                                  : (() => {
                                  const meta = projectMetricUnitMeta[key];
                                  if (meta?.unitType === "percent" || meta?.unitType === "multiple" || meta?.unitType === "multiple_per_year") {
                                    return formatMetricValue(value, meta.unitType);
                                  }
                                  return formatMetricValue(value, key.includes("over") || key.includes("Mult") ? "multiple" : key === "LOM" ? "integer" : key.includes("Payback") ? "decimal" : "money", key.includes("InSitu") ? "USD" : undefined);
                                })()}
                              {value.value === null && <span style={{ display: "block", fontSize: 11, color: "#6b7280", marginTop: 2 }}>{formatMetricNullReason(value)}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}

                  <details className="producer-core-section project-collapsible-card" open={projectSectionsOpen.list5} onToggle={(event) => { const open = (event.currentTarget as HTMLDetailsElement | null)?.open ?? false; setProjectSectionsOpen((prev) => ({ ...prev, list5: open })); }}>
                    <summary><h2 className="subrub small">FINANSIERING OCH SKULDSÄTTNING</h2></summary>
                    <div className="rr-input-row" style={{ marginTop: 8 }}>
                      <label htmlFor="project-equity-pct-slider">
                        Equity {projectEquityPct}%
                        <input
                          id="project-equity-pct-slider"
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={projectEquityPct}
                          onChange={(event) => setProjectEquityDebtFromEquity(Number(event.target.value))}
                          style={{ width: "100%" }}
                        />
                      </label>
                      <label htmlFor="project-debt-pct-slider">
                        Debt {projectDebtPct}%
                        <input
                          id="project-debt-pct-slider"
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={projectDebtPct}
                          onChange={(event) => setProjectEquityDebtFromDebt(Number(event.target.value))}
                          style={{ width: "100%" }}
                        />
                      </label>
                      <label>
                        <input type="checkbox" checked={projectUseQuarterlyCash} onChange={(event) => setProjectUseQuarterlyCash(event.target.checked)} />
                        Använd senaste kvartalets Cash &amp; Cash Equivalents
                      </label>
                      <label>Cash Used {projectCashUsedPct}%<input type="range" min="0" max="100" value={projectCashUsedPct} onChange={(event) => setProjectCashUsedPct(Number(event.target.value))} /></label>
                    </div>
                    <div className="compact-metrics-grid">
                      <div className="compact-metric-row"><span className="compact-metric-label">Latest Quarterly Cash</span><span className="compact-metric-dots"/><span className="compact-metric-value">{([...getFieldSeries(data, "balance", "cashAndCashEquivalents")].reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0).toLocaleString()}</span></div>
                      <div className="compact-metric-row"><span className="compact-metric-label">Shares PF</span><span className="compact-metric-dots"/><span className="compact-metric-value">{projectViewMetrics.marketBox.sharesPf.value?.toLocaleString() ?? "n/a"}</span></div>
                      {Object.entries(projectViewMetrics.list5).map(([key, value]) => (
                        <div key={key} className="compact-metric-row">
                          <span className="compact-metric-label-wrap">
                            <span className="compact-metric-label">{key}</span>
                            <InfoPopover
                              id={`project-list5-${key}`}
                              openId={openInfoId}
                              onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                              onClose={() => setOpenInfoId(null)}
                              title={key}
                              sections={[
                                { heading: "Definition", lines: ["Financing block metric (does not alter operations series)."] },
                                { heading: "Formula", lines: ["Computed from Initial CAPEX, cash-first usage, and debt/equity split."] },
                                { heading: "Basis / Unit / Null", lines: ["Basis: financing and capital structure.", `Unit: ${lockedTargetCurrency} / shares.`, value.reason ?? "Null: n/a if required source is missing."] },
                                { heading: "Interpretation", lines: ["Shows dilution and balance-sheet impact of funding plan."] },
                              ]}
                            />
                          </span>
                          <span className="compact-metric-dots" />
                          <span className="compact-metric-value">
                            {formatMetricValue(value, key.includes("Shares") ? "integer" : "money", key.includes("Shares") ? undefined : lockedTargetCurrency)}
                            {value.value === null && <span style={{ display: "block", fontSize: 11, color: "#6b7280", marginTop: 2 }}>{formatMetricNullReason(value)}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>

                  <div className="producer-core-compact-card">
                    <section className="producer-core-section">
                      <div className="producer-core-title-row">
                        <h2 className="subrub small">Riskjusterad diskontering</h2>
                      </div>
                      <div className="rr-input-row" style={{ marginTop: 8 }}>
                        <label>
                          Diskonteringsränta (%)
                          <input type="text" value={riskAdjustedDiscountRatePctInput} onChange={(event) => setRiskAdjustedDiscountRatePctInput(event.target.value)} />
                        </label>
                      </div>
                    </section>
                  </div>
                </section>
              )}

              {projectExcelGrid && (
                <section style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <h2 className="subrub small" style={{ margin: 0 }}>Operations & series</h2>
                  {projectExcelGrid.notes.map((note) => <p key={note} className="bread" style={{ margin: 0 }}>{note}</p>)}
                  {projectExcelGrid.warnings.map((warning) => <p key={warning} className="bread" style={{ margin: 0 }}>{warning}</p>)}
                  <div style={{ display: "grid", gap: 2, fontSize: 12, border: "1px solid #d8e0d2", borderRadius: 6, padding: "6px 8px", background: "#fff" }}>
                    <div><strong>Nameplate throughput:</strong> {formatPanelValue(projectExcelGrid.capacity.nameplateThroughput)} {projectExcelGrid.capacity.throughputUnit ?? ""}</div>
                    <div><strong>Utilization:</strong> {projectExcelGrid.capacity.utilizationPct === null ? "—" : `${formatPanelValue(projectExcelGrid.capacity.utilizationPct * 100)}%`}</div>
                    <div><strong>Effective throughput:</strong> {formatPanelValue(projectExcelGrid.capacity.effectiveThroughput)} {projectExcelGrid.capacity.throughputUnit ?? ""}</div>
                  </div>
                  <div className="project-excel-grid-wrap">
                    <table className="project-excel-grid">
                      <thead>
                        <tr>
                          <th className="first-col">Year</th>
                          {projectExcelGrid.years.map((value, idx) => <th key={`year-${idx}`}>{value}</th>)}
                        </tr>
                        <tr>
                          <th className="first-col">t</th>
                          {projectExcelGrid.tIndex.map((value, idx) => <th key={`t-${idx}`}>{value}</th>)}
                        </tr>
                        <tr>
                          <th className="first-col">t - tp</th>
                          {projectExcelGrid.tMinusTp.map((value, idx) => <th key={`tp-${idx}`}>{value}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {projectExcelGrid.rows.map((row) => (
                          row.type === 'divider'
                            ? (
                              <tr key={`divider-${row.label}`} className="section-row">
                                <th className="first-col section-first-col">{row.label}</th>
                                {Array.from({ length: projectExcelGrid.columnCount }, (_, t) => <td key={`divider-${row.label}-${t}`} className="section-fill" />)}
                              </tr>
                            )
                            : (
                              <tr key={row.label} className={row.hasMetalRevenueFailure ? "project-row-failure" : undefined}>
                                <th className="first-col">{row.label}{row.hasMetalRevenueFailure ? " ⚠" : ""}{row.hasMetalRevenueFailure && (() => { const target = projectMissingPriceActions.find((item) => row.label.includes(` ${item.metal} `) || row.label.includes(` ${item.metal}(`)); return target ? (<button type="button" className="button-link" style={{ marginLeft: 6 }} onClick={() => openManualPriceModal(target)}>Klicka här</button>) : null; })()}</th>
                                {Array.from({ length: projectExcelGrid.columnCount }, (_, t) => <td key={`${row.label}-${t}`}>{formatPanelValue(row.values[t] ?? null)}</td>)}
                              </tr>
                            )
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <details style={{ marginTop: 8, border: "1px solid #d8e0d2", borderRadius: 8, background: "#fff", padding: "8px 10px" }}>
                    <summary><strong>P&L Debugger (varför EBIT blir negativ)</strong></summary>
                    {!projectPnlTraceDebugger ? (
                      <p className="bread" style={{ marginTop: 8 }}>Ingen debugdata ännu.</p>
                    ) : (
                      <div style={{ display: "grid", gap: 8, marginTop: 8, fontSize: 13 }}>
                        <p style={{ margin: 0 }}><strong>Single source of truth:</strong> {projectPnlTraceDebugger.singleSourceOfTruth}</p>
                        <p style={{ margin: 0 }}><strong>Not:</strong> {projectPnlTraceDebugger.note}</p>

                        {projectPnlTraceDebugger.ebitSpotlight && (
                          <div style={{ border: "1px solid #d8e0d2", borderRadius: 6, background: "#f7fbf2", padding: "8px" }}>
                            <strong>Första negativa EBIT-period:</strong>
                            <div>
                              t={projectPnlTraceDebugger.ebitSpotlight.t}: EBIT {formatPanelValue(projectPnlTraceDebugger.ebitSpotlight.ebit)}
                              {' '}= Revenue {formatPanelValue(projectPnlTraceDebugger.ebitSpotlight.grossRevenue)}
                              {' '}− Op.cost {formatPanelValue(projectPnlTraceDebugger.ebitSpotlight.operatingCosts)}
                              {' '}− Site G&amp;A {formatPanelValue(projectPnlTraceDebugger.ebitSpotlight.siteGandA)}
                              {' '}− Royalties {formatPanelValue(projectPnlTraceDebugger.ebitSpotlight.royalties)}
                              {' '}+ Byproduct credits {formatPanelValue(projectPnlTraceDebugger.ebitSpotlight.byproductCredits)}
                            </div>
                          </div>
                        )}

                        {projectPnlTraceDebugger.ebitWalkthrough && (
                          <div style={{ border: "1px solid #d8e0d2", borderRadius: 6, background: "#fff", padding: "8px" }}>
                            <strong>Noggrann steg-för-steg: Gross revenue → EBITDA → EBIT → FCFF (spotlight)</strong>
                            <div style={{ marginTop: 4, color: "#374151" }}>Spotlight väljs som första t med revenue &gt; 0, annars fallback t=6.</div>
                            <div style={{ marginTop: 4 }}>t={projectPnlTraceDebugger.ebitWalkthrough.t}</div>
                            <div style={{ marginTop: 4 }}>Gross revenue-källa i walkthrough: <code>{projectPnlTraceDebugger.ebitWalkthrough.grossRevenueSource}</code></div>
                            <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                              {projectPnlTraceDebugger.ebitWalkthrough.inputRows.map((row) => (
                                <li key={`walk-${row.key}`}>
                                  {row.sign} {row.key}: {formatPanelValue(row.rawValue)}
                                  {row.rawValue === null && <span> (engine använder 0)</span>}
                                </li>
                              ))}
                            </ul>
                            <div>EBITDA (computed): {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.ebitdaComputed)}</div>
                            <div>Depreciation: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.depreciationAtSpotlight)}</div>
                            {projectPnlTraceDebugger.ebitWalkthrough.depreciationAtSpotlight === null && (
                              <div>Depreciation saknas i raden; engine använder 0 i beräkningen.</div>
                            )}
                            <div>EBIT (computed): {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.ebitComputed)}</div>
                            <div>EBIT (series.ebitUSD): {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.ebitReported)}</div>
                            <div style={{ marginTop: 6 }}><strong>FCFF-led (från EBIT):</strong></div>
                            <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                              <li>- Tax: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.taxAtSpotlight)}</li>
                              <li>+ Depreciation: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.depreciationAtSpotlight)}</li>
                              <li>- Sustaining capex: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.sustainingCapexAtSpotlight)}</li>
                              <li>- Capex: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.capexAtSpotlight)}</li>
                              <li>- Working capital delta: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.workingCapitalDeltaAtSpotlight)}</li>
                              <li>- Reclamation: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.reclamationAtSpotlight)}</li>
                            </ul>
                            <div>fcffRecomputedFromEbit: {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.fcffRecomputedFromEbit)}</div>
                            <div>FCFF (series.fcffUSD): {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.fcffReported)}</div>
                            <div>FCFF diff (series - recomputed): {formatPanelValue(projectPnlTraceDebugger.ebitWalkthrough.fcffDiff)}</div>
                            {projectPnlTraceDebugger.ebitWalkthrough.fcffRecomputedFromEbit === null && (
                              <div style={{ color: "#7f1d1d" }}>
                                fcffRecomputedFromEbit är null eftersom EBIT saknas i perioden.
                              </div>
                            )}
                            {projectPnlTraceDebugger.ebitWalkthrough.coercedToZero.length > 0 && (
                              <div style={{ color: "#1f2937", marginTop: 6 }}>
                                Inputs som var null men behandlades som 0 av engine: {projectPnlTraceDebugger.ebitWalkthrough.coercedToZero.join(', ')}.
                              </div>
                            )}
                            {projectPnlTraceDebugger.grossRevenueCrossCheck && (
                              <div style={{ marginTop: 6, color: "#7f1d1d" }}>
                                Kontroll t={projectPnlTraceDebugger.grossRevenueCrossCheck.t}: phase1 gross revenue ({formatPanelValue(projectPnlTraceDebugger.grossRevenueCrossCheck.phase1GrossRevenue)}) vs revenue-tabell ({formatPanelValue(projectPnlTraceDebugger.grossRevenueCrossCheck.revenueTableGrossRevenue)}), diff={formatPanelValue(projectPnlTraceDebugger.grossRevenueCrossCheck.diff)}.
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ border: "1px solid #d8e0d2", borderRadius: 6, background: "#fff", padding: "8px" }}>
                          <strong>Royalties-regler (%): kravkontroll</strong>
                          {projectPnlTraceDebugger.royaltiesRuleChecks.length === 0 ? (
                            <div style={{ marginTop: 6 }}>Inga royaltiesDetail-regler hittades. Då används fallback: <code>series.royaltiesUSD</code> om den finns, annars null-serie.</div>
                          ) : (
                            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                              {projectPnlTraceDebugger.royaltiesRuleChecks.map((rule) => (
                                <div key={`rule-${rule.id}`} style={{ borderTop: "1px solid #e5ebdf", paddingTop: 6 }}>
                                  <div><strong>{rule.label}</strong> ({rule.id})</div>
                                  <div>base={rule.base || '—'}, rateType={rule.rateType || '—'}, rate={formatPanelValue(rule.rate)}</div>
                                  <div>grossRevenue i spotlight (från {projectPnlTraceDebugger.grossRevenueSource}): {formatPanelValue(rule.grossRevenueAtSpotlight)}</div>
                                  <div>royalty-serie källa: <code>{rule.royaltySeriesSource}</code></div>
                                  <div>royaltyUSD i spotlight: {formatPanelValue(rule.royaltyAtSpotlight)}</div>
                                  {!rule.hasTechnicalFields && (
                                    <div style={{ color: "#7f1d1d" }}>
                                      Snapshot-serien innehåller bara id/label/royaltyUSD. base/rateType/rate läses därför från JSON-indata när den finns.
                                    </div>
                                  )}
                                  <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                                    {rule.requirements.map((req) => (
                                      <li key={`${rule.id}-${req.label}`}>
                                        {req.passed ? '✅' : '❌'} {req.label}; aktuellt värde: {String(req.actual)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                          {projectPnlTraceDebugger.royaltiesPipelineDiagnostics && (
                            <div style={{ marginTop: 8 }}>
                              <strong>Pipeline-diagnostik (körning):</strong>
                              <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0 0" }}>{JSON.stringify(projectPnlTraceDebugger.royaltiesPipelineDiagnostics, null, 2)}</pre>
                            </div>
                          )}
                        </div>

                        {projectPnlTraceDebugger.blocks.map((block) => (
                          <div key={block.label} style={{ borderTop: "1px solid #e5ebdf", paddingTop: 8 }}>
                            <div><strong>{block.label}</strong></div>
                            <div>Formula: <code>{block.formula}</code></div>
                            <div>Beräknas i: <code>{block.calculatedIn}</code></div>
                            <div>Källa: {block.sourceOfTruth}</div>
                            <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                              {block.inputs.map((input) => (
                                <li key={`${block.label}-${input.label}`}>
                                  <strong>{input.label}</strong> → {input.source}; summa: {formatPanelValue(sumFiniteSeries(input.values))}
                                </li>
                              ))}
                            </ul>
                            <div><strong>Outputsumma:</strong> {formatPanelValue(sumFiniteSeries(block.output))}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                </section>
              )}

              <details style={{ marginTop: 12 }}>
                <summary>Diagnostics</summary>
                {strictTpAlignmentError && (
                  <div style={{ border: "1px solid #dc2626", background: "#fee2e2", color: "#7f1d1d", padding: "10px", borderRadius: 6, marginTop: 10 }}>
                    <strong>Project validation error:</strong> {strictTpAlignmentError.message}
                    {strictTpAlignmentError.driverFirstNonZeroIndex && (
                      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(strictTpAlignmentError.driverFirstNonZeroIndex, null, 2)}</pre>
                    )}
                  </div>
                )}
                {projectSnapshotErrors.length === 0 && projectSnapshotWarnings.length === 0 && !projectViewMetrics && Object.keys(projectMetalRevenueFailures).length === 0 && projectMetalPriceFallbackOrFailureMetals.length === 0 && <p>No diagnostics.</p>}
                {projectSnapshotErrors.length > 0 && <ul>{projectSnapshotErrors.map((item) => <li key={`e-${item}`}>{item}</li>)}</ul>}
                {projectSnapshotWarnings.length > 0 && <ul>{projectSnapshotWarnings.map((item) => <li key={`w-${item}`}>{item}</li>)}</ul>}
                {projectMetalPriceDiagnostics && (
                  <>
                    <h4>Metal price source diagnostics</h4>
                    <ul>
                      {Object.entries(projectMetalPriceDiagnostics).map(([metal, item]) => (
                        <li key={`metal-price-${metal}`}>
                          price source metal={metal} {'->'} {String(item.priceSourceUsed ?? 'unknown')} ({String(item.reason ?? 'n/a')})
                        </li>
                      ))}
                    </ul>
                    <p>
                      metalsUsingLivePrices: {JSON.stringify(projectSnapshotDiagnosticsMeta?.metalsUsingLivePrices ?? [])}{' | '}
                      metalsUsingManualFallback: {JSON.stringify(projectSnapshotDiagnosticsMeta?.metalsUsingManualFallback ?? [])}{' | '}
                      metalsWithPriceFailure: {JSON.stringify(projectSnapshotDiagnosticsMeta?.metalsWithPriceFailure ?? [])}
                    </p>
                  </>
                )}
                {Object.keys(projectMetalRevenueFailures).length > 0 && (
                  <>
                    <h4>Metal revenue failures</h4>
                    <ul>
                      {Object.entries(projectMetalRevenueFailures).map(([metal, failures]) => {
                        const first = failures[0] ?? {};
                        const t = typeof first.t === 'number' ? first.t : null;
                        const year = typeof first.year === 'number' ? first.year : null;
                        const reason = typeof first.failureReason === 'string' ? first.failureReason : 'Unknown';
                        return (
                          <li key={`metal-failure-${metal}`}>
                            {metal}: {failures.length} failing periods{t !== null ? `, first at t=${t}` : ''}{year !== null ? ` / year ${year}` : ''}. Reason: {reason}
                          </li>
                        );
                      })}
                    </ul>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({ metalRevenueDiagnostics: projectMetalRevenueFailures }, null, 2)}</pre>
                  </>
                )}
                {projectViewMetrics && (
                  <>
                    <h4>Payback real debug</h4>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(projectViewMetrics.diagnostics.payback_real_debug, null, 2)}</pre>
                    <h4>IRR debug</h4>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(projectViewMetrics.diagnostics.irr_debug, null, 2)}</pre>
                  </>
                )}
                <h4>---- PROJECT MOUNT DEBUG ----</h4>
                <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(projectMountDebug, null, 2)}</pre>
              </details>

              <details style={{ marginTop: 12 }}>
                <summary>Snapshot JSON</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>{projectSnapshotData ? JSON.stringify(projectSnapshotData, null, 2) : "No snapshot loaded."}</pre>
              </details>
            </>
          )}
        </div>
      )}
        </>
      )}
      {manualPriceModalOpen && manualPriceModalTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 2000 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: 16, width: "min(92vw, 520px)", display: "grid", gap: 8 }}>
            <h3 style={{ margin: 0 }}>Ange råvarupris</h3>
            <p style={{ margin: 0 }}><strong>Råvara:</strong> {manualPriceModalTarget.metal} ({manualPriceModalTarget.metalKey})</p>
            <p style={{ margin: 0 }}><strong>Enhet:</strong> {manualPriceModalTarget.unit ?? "—"}</p>
            <p style={{ margin: 0, fontSize: 13 }}>FMP saknar aktuellt spotpris för denna råvara. Ange ett manuellt pris. Priset gäller i 1 månad.</p>
            {manualPriceModalTarget.reason && <p style={{ margin: 0, fontSize: 12, color: "#7f1d1d" }}>{manualPriceModalTarget.reason}</p>}
            <input type="number" step="any" value={manualPriceInput} onChange={(event) => setManualPriceInput(event.target.value)} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setManualPriceModalOpen(false)}>Avbryt</button>
              <button type="button" onClick={() => void submitManualPrice()}>OK</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
