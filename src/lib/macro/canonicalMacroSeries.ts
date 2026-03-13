import { fetchStableJson } from "../../../api/_fmp.js";
import { buildDerivedSeries, fetchFredSeries, US_FRED_SERIES } from "./fred.ts";
import { fetchEcbSeries } from "./adapters/ecbAdapter.ts";
import { fetchEurostatSeries } from "./adapters/eurostatAdapter.ts";
import { fetchRiksbankSeries } from "./adapters/riksbankAdapter.ts";
import { fetchScbSeries } from "./adapters/scbAdapter.ts";

export type CanonicalSeriesMap = Record<string, Array<{ date: string; value: number | null }>>;

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

export async function loadCanonicalMacroSeries(region: "US" | "EA" | "SE", mode: "backfill" | "latest"): Promise<{ sourceSeries: CanonicalSeriesMap; derivedSeries: CanonicalSeriesMap; }> {
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
    return { sourceSeries, derivedSeries: buildDerivedSeries(sourceSeries) };
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
    return { sourceSeries, derivedSeries };
  }

  const sourceSeries: CanonicalSeriesMap = {};
  const tasks: Array<Promise<void>> = [
    fetchScbSeries({ path: "ssd/PR/PR0101/PR0101A/KPIArM", query: { query: [], response: { format: "json" } } }).then((x) => { sourceSeries.cpi_se = x; }),
    fetchRiksbankSeries("SE.REPO.RATE").then((x) => { sourceSeries.repo_rate_se = x; }),
    fetchRiksbankSeries("SE.GOVBOND.10Y").then((x) => { sourceSeries.gov_bond_yield_10y_se = x; }),
    fetchScbSeries({ path: "ssd/NR/NR0109/NR0109A/Offentligfinanser", query: { query: [], response: { format: "json" } } }).then((x) => { sourceSeries.debt_gdp_se = x; }),
    fetchScbSeries({ path: "ssd/NR/NR0109/NR0109A/Offentligfinanser", query: { query: [], response: { format: "json" } } }).then((x) => { sourceSeries.deficit_gdp_se = x; }),
    fetchRiksbankSeries("SE.INFL_EXP.2Y").then((x) => { sourceSeries.infl_exp_se = x; }),
    fetchRiksbankSeries("SE.CREDIT.SPREAD").then((x) => { sourceSeries.credit_spreads_se = x; }),
  ];
  await Promise.allSettled(tasks);

  const derivedSeries: CanonicalSeriesMap = {
    cpi_momentum_se: computeMomentum(sourceSeries.cpi_se ?? [], 3),
  };
  return { sourceSeries, derivedSeries };
}
