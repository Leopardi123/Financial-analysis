import { fetchStableJson } from "../../../api/_fmp.js";
import { buildDerivedSeries, fetchFredSeries, US_FRED_SERIES } from "./fred.ts";
import { fetchEcbSeries } from "./adapters/ecbAdapter.ts";
import { fetchEurostatSeries } from "./adapters/eurostatAdapter.ts";
import {
  fetchRiksbankSeriesVerified,
  verifyRiksbankSeriesExists,
} from "./adapters/riksbankAdapter.ts";
import {
  discoverScbTablePath,
  fetchScbPxTableSeries,
  fetchScbTableMetadata,
} from "./adapters/scbAdapter.ts";

export type CanonicalSeriesMap = Record<string, Array<{ date: string; value: number | null }>>;

type TimeSeriesPoint = { date: string; value: number | null };

const EUROSTAT_EA_DATASETS = {
  hicpBase: {
    dataset: "prc_hicp_manr",
    filters: { geo: "EA20", coicop: "CP00", unit: "RCH_A_AVG", freq: "M" },
  },
  debtToGdp: {
    dataset: "gov_10dd_edpt1",
    filters: { geo: "EA20", sector: "S13", unit: "PC_GDP", na_item: "GD", freq: "A" },
  },
  deficitToGdp: {
    dataset: "gov_10dd_edpt1",
    filters: { geo: "EA20", sector: "S13", unit: "PC_GDP", na_item: "B9", freq: "A" },
  },
} as const;

async function fetchEurostatFirstAvailable(candidates: Array<{ dataset: string; filters: Record<string, string> }>) {
  for (const candidate of candidates) {
    try {
      const rows = await fetchEurostatSeries(candidate);
      if (rows.length > 0) return rows;
    } catch {
      // try next candidate
    }
  }
  return [] as Array<{ date: string; value: number | null }>;
}

function computeMomentum(points: Array<{ date: string; value: number | null }>, months = 3) {
  if (points.length <= months) return [];
  return points
    .map((p, i) => {
      const prev = i >= months ? points[i - months] : null;
      if (!prev || p.value === null || prev.value === null) return { date: p.date, value: null };
      return { date: p.date, value: p.value - prev.value };
    })
    .filter((x) => x.value !== null);
}

function hasMinimumNumericPoints(points: Array<{ date: string; value: number | null }>, minimum = 4): boolean {
  return points.filter((p) => typeof p.value === "number" && Number.isFinite(p.value)).length >= minimum;
}

function alignSpread(
  left: Array<{ date: string; value: number | null }>,
  right: Array<{ date: string; value: number | null }>,
): Array<{ date: string; value: number | null }> {
  const rightByMonth = new Map(right.map((p) => [p.date.slice(0, 7), p.value]));
  return left
    .map((l) => {
      const rv = rightByMonth.get(l.date.slice(0, 7));
      if (l.value === null || rv === null || rv === undefined) return { date: l.date, value: null };
      return { date: l.date, value: l.value - rv };
    })
    .filter((x) => x.value !== null);
}


function alignRatio(
  left: Array<{ date: string; value: number | null }>,
  right: Array<{ date: string; value: number | null }>,
): Array<{ date: string; value: number | null }> {
  const rightByMonth = new Map(right.map((p) => [p.date.slice(0, 7), p.value]));
  return left
    .map((l) => {
      const rv = rightByMonth.get(l.date.slice(0, 7));
      if (l.value === null || rv === null || rv === undefined || rv === 0) return { date: l.date, value: null };
      return { date: l.date, value: l.value / rv };
    })
    .filter((x) => x.value !== null);
}
function alignSubtract(
  left: TimeSeriesPoint[],
  right: TimeSeriesPoint[],
): TimeSeriesPoint[] {
  const rightByMonth = new Map(right.map((point) => [point.date.slice(0, 7), point.value]));
  const output: TimeSeriesPoint[] = [];
  for (const point of left) {
    const rightValue = rightByMonth.get(point.date.slice(0, 7));
    if (point.value === null || rightValue === null || rightValue === undefined) continue;
    output.push({ date: point.date, value: point.value - rightValue });
  }
  return output;
}

function normalizeFmpEodRows(payload: unknown): Array<{ date: string; value: number | null }> {
  const candidates = Array.isArray(payload) ? payload : [];
  return candidates
    .map((row) => {
      if (typeof row !== "object" || row === null) return null;
      const dateRaw = (row as { date?: unknown }).date;
      const closeRaw = (row as { close?: unknown }).close;
      const date = typeof dateRaw === "string" ? dateRaw.slice(0, 10) : null;
      const close = typeof closeRaw === "number" && Number.isFinite(closeRaw) ? closeRaw : null;
      if (!date) return null;
      return { date, value: close };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchGoldSeries() {
  const payload = await fetchStableJson<unknown>("historical-price-eod/full", {
    symbol: "GCUSD",
    from: "2000-01-01",
    to: new Date().toISOString().slice(0, 10),
  });
  return normalizeFmpEodRows(payload);
}

export async function loadCanonicalMacroSeries(
  region: "US" | "EA" | "SE",
  mode: "backfill" | "latest",
): Promise<{ sourceSeries: CanonicalSeriesMap; derivedSeries: CanonicalSeriesMap; partialSeries: string[] }> {
  if (region === "US") {
    const sourceSeries: CanonicalSeriesMap = {};
    for (const entry of US_FRED_SERIES) {
      try {
        sourceSeries[entry.seriesKey] = await fetchFredSeries({
          fredSeriesId: entry.fredSeriesId,
          mode,
          latestLookbackMonths: entry.latestLookbackMonths,
          backfillLookbackYears: entry.backfillLookbackYears,
        });
      } catch {
        sourceSeries[entry.seriesKey] = [];
      }
    }
    try {
      sourceSeries.gold_usd = await fetchGoldSeries();
    } catch {
      sourceSeries.gold_usd = [];
    }
    return { sourceSeries, derivedSeries: buildDerivedSeries(sourceSeries), partialSeries: [] };
  }

  if (region === "EA") {
    const sourceSeries: CanonicalSeriesMap = {
      hicp_ea: [],
      hicp_yoy_ea: [],
      real_yield_10y_ea: [],
      m3_ea: [],
      ecb_balance_sheet_ea: [],
      debt_gdp_ea: [],
      deficit_gdp_ea: [],
      credit_spreads_ea: [],
      gold_usd: [],
    };

    const tasks: Array<Promise<void>> = [
      fetchEurostatFirstAvailable([
        EUROSTAT_EA_DATASETS.hicpBase,
        { dataset: "prc_hicp_midx", filters: { geo: "EA20", coicop: "CP00", unit: "I15", freq: "M" } },
      ]).then((x) => { sourceSeries.hicp_ea = x; }),
      fetchEcbSeries({ flowRef: "ICP", key: "M.U2.N.000000.4.ANR" }).then((x) => { sourceSeries.hicp_yoy_ea = x; }),
      fetchEcbSeries({ flowRef: "FM", key: "M.U2.EUR.4F.BB.U2_10Y.YLD" }).then((x) => { sourceSeries.real_yield_10y_ea = x; }),
      fetchEcbSeries({ flowRef: "BSI", key: "M.U2.Y.V.M30.X.1.U2.2300.Z01.E" }).then((x) => { sourceSeries.m3_ea = x; }),
      fetchEcbSeries({ flowRef: "BSI", key: "M.U2.N.A.A20.A.1.U2.2240.Z01.E" }).then((x) => { sourceSeries.ecb_balance_sheet_ea = x; }),
      fetchEurostatFirstAvailable([
        EUROSTAT_EA_DATASETS.debtToGdp,
        { dataset: "gov_10dd_edpt1", filters: { geo: "EA20", unit: "PC_GDP", na_item: "GD" } },
      ]).then((x) => { sourceSeries.debt_gdp_ea = x; }),
      fetchEurostatFirstAvailable([
        EUROSTAT_EA_DATASETS.deficitToGdp,
        { dataset: "gov_10dd_edpt1", filters: { geo: "EA20", unit: "PC_GDP", na_item: "B9" } },
      ]).then((x) => { sourceSeries.deficit_gdp_ea = x; }),
      fetchEcbSeries({ flowRef: "FM", key: "M.U2.EUR.4F.BB.U2_10Y.YLD" }).then((x) => { sourceSeries.credit_spreads_ea = x; }),
      fetchGoldSeries().then((x) => { sourceSeries.gold_usd = x; }),
    ];
    await Promise.allSettled(tasks);

    const derivedSeries: CanonicalSeriesMap = {
      hicp_momentum_ea: computeMomentum(
        hasMinimumNumericPoints(sourceSeries.hicp_ea ?? []) ? (sourceSeries.hicp_ea ?? []) : (sourceSeries.hicp_yoy_ea ?? []),
        3,
      ),
      m3_growth_ea: computeMomentum(sourceSeries.m3_ea ?? [], 12),
      gold_vs_real_yield_ea: alignSpread(sourceSeries.gold_usd ?? [], sourceSeries.real_yield_10y_ea ?? []),
    };
    return { sourceSeries, derivedSeries, partialSeries: [] };
  }

  const partialSeries = new Set<string>();
  const sourceSeries: CanonicalSeriesMap = {
    kpif_yoy_se: [],
    inflation_momentum_se: [],
    policy_rate_se: [],
    government_bond_yield_10y_se: [],
    public_debt_nominal_se: [],
    net_lending_borrowing_se: [],
    gdp_nominal_se: [],
    gold_usd: [],
  };

  let kpifTablePath = "START/PR/PR0101/PR0101A/KPIFMAnad";
  try {
    const discoveredPath = await discoverScbTablePath({
      directoryPath: "START/PR/PR0101",
      mustIncludeKeywords: ["kpif"],
    });
    if (discoveredPath) kpifTablePath = discoveredPath;
  } catch {
    partialSeries.add("kpif_yoy_se");
    partialSeries.add("inflation_momentum_se");
  }

  const riksbankRepoExists = await verifyRiksbankSeriesExists("SECBREPOEFF").catch(() => false);
  const riksbank10YExists = await verifyRiksbankSeriesExists("SEGVB10YC").catch(() => false);
  if (!riksbankRepoExists) partialSeries.add("policy_rate_se");
  if (!riksbank10YExists) partialSeries.add("government_bond_yield_10y_se");

  const tasks: Array<Promise<void>> = [
    fetchScbPxTableSeries({
      path: kpifTablePath,
      selectors: [
        {
          codeHint: "ContentsCode",
          valueKeywordGroups: [["kpif", "12", "month"], ["12", "month", "change"], ["year", "change"]],
        },
      ],
    }).then((x) => { sourceSeries.kpif_yoy_se = x; }),
    fetchScbPxTableSeries({
      path: kpifTablePath,
      selectors: [
        {
          codeHint: "ContentsCode",
          valueKeywordGroups: [["kpif", "month", "change"], ["monthly", "change"]],
        },
      ],
    }).then((x) => { sourceSeries.inflation_momentum_se = x; }),
    fetchRiksbankSeriesVerified("SECBREPOEFF").then((x) => { sourceSeries.policy_rate_se = x; }),
    fetchRiksbankSeriesVerified("SEGVB10YC").then((x) => { sourceSeries.government_bond_yield_10y_se = x; }),
    fetchScbPxTableSeries({
      path: "START/NR/NR0109/NR0109A/Offentligfinanser",
      selectors: [
        { codeHint: "ContentsCode", valueKeywordGroups: [["debt", "gdp"]] },
      ],
    }).then((x) => { sourceSeries.public_debt_nominal_se = x; }),
    fetchScbPxTableSeries({
      path: "START/NR/NR0109/NR0109A/Offentligfinanser",
      selectors: [
        { codeHint: "ContentsCode", valueKeywordGroups: [["net", "lending", "gdp"]] },
      ],
    }).then((x) => { sourceSeries.net_lending_borrowing_se = x; }),
    fetchGoldSeries().then((x) => { sourceSeries.gold_usd = x; }),
  ];
  await Promise.allSettled(tasks);

  if ((sourceSeries.kpif_yoy_se ?? []).length === 0 || (sourceSeries.inflation_momentum_se ?? []).length === 0) {
    try {
      const metadata = await fetchScbTableMetadata(kpifTablePath);
      const contents = (metadata.variables ?? []).find((v) => String(v.code ?? "").toLowerCase() === "contentscode");
      if (contents) {
        const kpifIndex = await fetchScbPxTableSeries({
          path: kpifTablePath,
          selectors: [{ codeHint: "ContentsCode", valueKeywordGroups: [["kpif", "index"], ["index"]] }],
        });
        if ((sourceSeries.kpif_yoy_se ?? []).length === 0) {
          sourceSeries.kpif_yoy_se = kpifIndex
            .map((p, i) => {
              const prev = i >= 12 ? kpifIndex[i - 12] : null;
              if (!prev || p.value === null || prev.value === null || prev.value === 0) return null;
              return { date: p.date, value: p.value / prev.value - 1 };
            })
            .filter((p): p is { date: string; value: number } => p !== null);
        }
        if ((sourceSeries.inflation_momentum_se ?? []).length === 0) {
          sourceSeries.inflation_momentum_se = kpifIndex
            .map((p, i) => {
              const prev = i >= 1 ? kpifIndex[i - 1] : null;
              if (!prev || p.value === null || prev.value === null || prev.value === 0) return null;
              return { date: p.date, value: p.value / prev.value - 1 };
            })
            .filter((p): p is { date: string; value: number } => p !== null);
        }
      }
    } catch {
      partialSeries.add("kpif_yoy_se");
      partialSeries.add("inflation_momentum_se");
    }
  }

  if ((sourceSeries.public_debt_nominal_se ?? []).length === 0) partialSeries.add("debt_gdp_se");
  if ((sourceSeries.net_lending_borrowing_se ?? []).length === 0) partialSeries.add("deficit_gdp_se");
  if ((sourceSeries.gdp_nominal_se ?? []).length === 0) partialSeries.add("debt_gdp_se");
  if ((sourceSeries.gdp_nominal_se ?? []).length === 0) partialSeries.add("deficit_gdp_se");

  const debtGdp = alignRatio(sourceSeries.public_debt_nominal_se ?? [], sourceSeries.gdp_nominal_se ?? []).map((p) => ({ ...p, value: p.value === null ? null : p.value * 100 }));
  const deficitGdp = alignRatio(sourceSeries.net_lending_borrowing_se ?? [], sourceSeries.gdp_nominal_se ?? []).map((p) => ({ ...p, value: p.value === null ? null : p.value * 100 }));
  const realYield = alignSubtract(sourceSeries.government_bond_yield_10y_se ?? [], sourceSeries.kpif_yoy_se ?? []);

  if (realYield.length === 0) partialSeries.add("real_yield_10y_se");

  const derivedSeries: CanonicalSeriesMap = {
    inflation_momentum_se:
      (sourceSeries.inflation_momentum_se ?? []).length > 0
        ? (sourceSeries.inflation_momentum_se ?? [])
        : computeMomentum(sourceSeries.kpif_yoy_se ?? [], 1),
    real_yield_10y_se: realYield,
    debt_gdp_se: debtGdp,
    deficit_gdp_se: deficitGdp,
    gold_vs_real_yield_se: alignRatio(sourceSeries.gold_usd ?? [], realYield),
  };
  if ((derivedSeries.gold_vs_real_yield_se ?? []).length === 0) partialSeries.add("gold_vs_real_yield_se");
  return { sourceSeries, derivedSeries, partialSeries: Array.from(partialSeries).sort() };
}
