export type FredSeriesConfig = {
  fredSeriesId: string;
  seriesKey: string;
  fallbackFredSeriesIds?: string[];
  latestLookbackMonths?: number;
  backfillLookbackYears?: number;
};

export const US_FRED_SERIES: FredSeriesConfig[] = [
  { fredSeriesId: "DGS10", seriesKey: "nominal_yield_10y_us" },
  { fredSeriesId: "SP500", seriesKey: "SP500", latestLookbackMonths: 360, backfillLookbackYears: 20 },
  { fredSeriesId: "DGS2", seriesKey: "nominal_yield_2y_us" },
  { fredSeriesId: "DFII10", seriesKey: "real_yield_10y_us" },
  { fredSeriesId: "CPILFESL", seriesKey: "core_cpi_us" },
  { fredSeriesId: "T10YIE", seriesKey: "breakeven_10y_us" },
  { fredSeriesId: "BAMLC0A0CM", seriesKey: "ig_spread_us" },
  { fredSeriesId: "BAMLH0A0HYM2", seriesKey: "hy_spread_us" },
  { fredSeriesId: "VIXCLS", seriesKey: "vix_index" },
  { fredSeriesId: "NFCI", seriesKey: "financial_conditions_index" },
  { fredSeriesId: "DTWEXBGS", seriesKey: "usd_broad_index" },
  { fredSeriesId: "DCOILBRENTEU", seriesKey: "oil_brent_usd" },
  { fredSeriesId: "DHHNGSP", seriesKey: "natgas_usd" },
  { fredSeriesId: "PCOPPUSDM", seriesKey: "copper_usd" },
  { fredSeriesId: "PMETAUSDM", seriesKey: "industrial_metals_index", fallbackFredSeriesIds: ["PINDUUSDM", "PINDUINDEXM"] },
  { fredSeriesId: "PALLFNFUSDM", seriesKey: "commodity_index", fallbackFredSeriesIds: ["PALLFNFNFUSDM", "PALLFNFINDEXM"] },
  { fredSeriesId: "WALCL", seriesKey: "fed_balance_sheet_total" },
  { fredSeriesId: "WALCL", seriesKey: "WALCL", latestLookbackMonths: 360, backfillLookbackYears: 80 },
  { fredSeriesId: "WDTGAL", seriesKey: "WDTGAL", latestLookbackMonths: 360, backfillLookbackYears: 80 },
  { fredSeriesId: "RRPONTSYD", seriesKey: "RRPONTSYD", latestLookbackMonths: 360, backfillLookbackYears: 80 },
  { fredSeriesId: "TOTBKCR", seriesKey: "TOTBKCR" },
  { fredSeriesId: "GDP", seriesKey: "GDP", latestLookbackMonths: 360, backfillLookbackYears: 80 },
  { fredSeriesId: "DRTSCILM", seriesKey: "DRTSCILM", latestLookbackMonths: 180, backfillLookbackYears: 20 },
  { fredSeriesId: "TEDRATE", seriesKey: "TEDRATE", latestLookbackMonths: 240, backfillLookbackYears: 30 },
  { fredSeriesId: "EURUSD3MD156NWSG", seriesKey: "EURUSD3MD156NWSG", latestLookbackMonths: 360, backfillLookbackYears: 40 },
  { fredSeriesId: "M2SL", seriesKey: "m2sl" },
  { fredSeriesId: "M2SL", seriesKey: "M2SL" },
  { fredSeriesId: "DFII5", seriesKey: "real_yield_5y" },
  { fredSeriesId: "DGS3MO", seriesKey: "nominal_yield_3mo_us" },
  // backlog/unavailable: supply_chain_pressure removed from active US ingest until a verified FRED series is available.
  { fredSeriesId: "GFDEGDQ188S", seriesKey: "debt_to_gdp_us", latestLookbackMonths: 180, backfillLookbackYears: 25 },
  { fredSeriesId: "FYFSGDA188S", seriesKey: "deficit_to_gdp_us", latestLookbackMonths: 240, backfillLookbackYears: 25 },
  { fredSeriesId: "INDPRO", seriesKey: "pmi_us", latestLookbackMonths: 180, backfillLookbackYears: 20 },
  { fredSeriesId: "THREEFYTP10", seriesKey: "acmtp10_us", latestLookbackMonths: 180, backfillLookbackYears: 20 },
  { fredSeriesId: "DGORDER", seriesKey: "new_orders_us", latestLookbackMonths: 180, backfillLookbackYears: 20 },
  { fredSeriesId: "ISRATIO", seriesKey: "isratio_us", latestLookbackMonths: 180, backfillLookbackYears: 20 },
  { fredSeriesId: "PPIACO", seriesKey: "ppiaco_us", latestLookbackMonths: 180, backfillLookbackYears: 20 },
  { fredSeriesId: "USEPUINDXM", seriesKey: "policy_uncertainty_us", latestLookbackMonths: 180, backfillLookbackYears: 20 },
];

type FredObservation = {
  date: string;
  value: string;
};

type FredObservationsResponse = {
  observations?: FredObservation[];
};

export type FredFetchDebug = {
  requestedProviderSeriesId: string;
  requestTarget: string;
  httpStatus: number | null;
  providerResponseShapeSummary: string;
  observationsBeforeFiltering: number;
  observationsAfterFiltering: number;
  first3RawObservations: FredObservation[];
  last3RawObservations: FredObservation[];
  zeroRowsReason: string | null;
  skippedByDateParsing: number;
  skippedByNumericParsing: number;
  skippedByDuplicateLogic: number;
};

function validateFredApiKey(): string {
  const key = String(process.env.FRED_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("FRED_API_KEY is not set");
  }
  return key;
}

function buildFredUrl(params: Record<string, string>): string {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function fetchFredSeriesWithDebug(params: {
  fredSeriesId: string;
  mode: "backfill" | "latest";
  latestLookbackMonths?: number;
  backfillLookbackYears?: number;
}): Promise<{ rows: Array<{ date: string; value: number | null }>; debug: FredFetchDebug }> {
  const apiKey = validateFredApiKey();
  const end = new Date();
  const start = new Date(end);
  if (params.mode === "backfill") {
    start.setFullYear(end.getFullYear() - (params.backfillLookbackYears ?? 12));
  } else {
    start.setMonth(end.getMonth() - (params.latestLookbackMonths ?? 2));
  }

  const url = buildFredUrl({
    api_key: apiKey,
    file_type: "json",
    series_id: params.fredSeriesId,
    observation_start: start.toISOString().slice(0, 10),
    observation_end: end.toISOString().slice(0, 10),
    sort_order: "asc",
  });

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FRED request failed (${params.fredSeriesId}): ${response.status} ${body.slice(0, 400)}`);
  }

  const payload = (await response.json()) as FredObservationsResponse;
  const observations = Array.isArray(payload.observations) ? payload.observations : [];

  const normalized = observations.map((obs) => {
    const raw = String(obs.value ?? "").trim();
    const numeric = raw === "." ? null : Number(raw);
    return {
      date: String(obs.date),
      value: Number.isFinite(numeric) ? numeric : null,
      dateOk: /^\d{4}-\d{2}-\d{2}$/.test(String(obs.date)),
      numericOk: raw === "." || Number.isFinite(numeric),
    };
  });

  const dateFiltered = normalized.filter((obs) => obs.dateOk);
  const skippedByDateParsing = normalized.length - dateFiltered.length;
  const skippedByNumericParsing = dateFiltered.filter((obs) => !obs.numericOk).length;
  const rows = dateFiltered.map((obs) => ({ date: obs.date, value: obs.value }));
  const monthlyRows = toCanonicalMonthly(rows);
  const skippedByDuplicateLogic = Math.max(0, rows.length - monthlyRows.length);

  const debug: FredFetchDebug = {
    requestedProviderSeriesId: params.fredSeriesId,
    requestTarget: url,
    httpStatus: response.status,
    providerResponseShapeSummary: Array.isArray((payload as any).observations) ? "observations[]" : typeof payload,
    observationsBeforeFiltering: observations.length,
    observationsAfterFiltering: rows.length,
    first3RawObservations: observations.slice(0, 3),
    last3RawObservations: observations.slice(-3),
    zeroRowsReason: rows.length > 0 ? null : (observations.length === 0 ? "No observations from provider" : (skippedByDateParsing === observations.length ? "All rows failed date parsing" : "No usable observations after filtering")),
    skippedByDateParsing,
    skippedByNumericParsing,
    skippedByDuplicateLogic,
  };

  return { rows, debug };
}

export async function fetchFredSeries(params: {
  fredSeriesId: string;
  mode: "backfill" | "latest";
  latestLookbackMonths?: number;
  backfillLookbackYears?: number;
}): Promise<Array<{ date: string; value: number | null }>> {
  const { rows } = await fetchFredSeriesWithDebug(params);
  return rows;
}


function toCanonicalMonthly(points: Array<{ date: string; value: number | null }>) {
  const map = new Map<string, { date: string; value: number | null }>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    const prev = map.get(month);
    if (!prev || point.date > prev.date) map.set(month, point);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mean(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0) / Math.max(1, values.length);
}

function stdDev(values: number[], avg: number): number {
  const variance = values.reduce((acc, value) => acc + ((value - avg) ** 2), 0) / Math.max(1, values.length);
  return Math.sqrt(variance);
}


function alignBinaryOperation(
  left: Array<{ date: string; value: number | null }>,
  right: Array<{ date: string; value: number | null }>,
  op: (leftValue: number, rightValue: number) => number | null,
): Array<{ date: string; value: number | null }> {
  const rightByMonth = new Map(right.map((row) => [row.date.slice(0, 7), row.value]));
  return left
    .map((row) => {
      const rv = rightByMonth.get(row.date.slice(0, 7));
      if (row.value === null || rv === null || rv === undefined) return { date: row.date, value: null };
      return { date: row.date, value: op(row.value, rv) };
    })
    .filter((row) => row.value !== null);
}



function alignTernaryOperation(
  first: Array<{ date: string; value: number | null }>,
  second: Array<{ date: string; value: number | null }>,
  third: Array<{ date: string; value: number | null }>,
  op: (a: number, b: number, c: number) => number | null,
): Array<{ date: string; value: number | null }> {
  const secondByMonth = new Map(second.map((row) => [row.date.slice(0, 7), row.value]));
  const thirdByMonth = new Map(third.map((row) => [row.date.slice(0, 7), row.value]));
  return first
    .map((row) => {
      const b = secondByMonth.get(row.date.slice(0, 7));
      const c = thirdByMonth.get(row.date.slice(0, 7));
      if (row.value === null || b === null || b === undefined || c === null || c === undefined) return { date: row.date, value: null };
      return { date: row.date, value: op(row.value, b, c) };
    })
    .filter((row) => row.value !== null);
}

function expandMonthlyByCarryForward(
  points: Array<{ date: string; value: number | null }>,
  startMonth: string,
  endMonth: string,
): Array<{ date: string; value: number | null }> {
  const byMonth = new Map(points.map((point) => [point.date.slice(0, 7), point.value]));
  const out: Array<{ date: string; value: number | null }> = [];
  let cursor = new Date(`${startMonth}-01T00:00:00Z`);
  const end = new Date(`${endMonth}-01T00:00:00Z`);
  let latest: number | null = null;
  while (cursor <= end) {
    const month = cursor.toISOString().slice(0, 7);
    if (byMonth.has(month)) latest = byMonth.get(month) ?? latest;
    out.push({ date: `${month}-01`, value: latest });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function alignBinaryOperationWithCarryForwardRight(
  left: Array<{ date: string; value: number | null }>,
  right: Array<{ date: string; value: number | null }>,
  op: (leftValue: number, rightValue: number) => number | null,
): Array<{ date: string; value: number | null }> {
  if (left.length === 0 || right.length === 0) return [];
  const leftMonths = left.map((row) => row.date.slice(0, 7)).sort((a, b) => a.localeCompare(b));
  const startMonth = leftMonths[0];
  const endMonth = leftMonths[leftMonths.length - 1];
  const rightExpanded = expandMonthlyByCarryForward(right, startMonth, endMonth);
  return alignBinaryOperation(left, rightExpanded, op);
}
function computeYoY(points: Array<{ date: string; value: number | null }>): Array<{ date: string; value: number | null }> {
  if (points.length <= 12) return [];
  return points
    .map((row, index) => {
      const prev = index >= 12 ? points[index - 12] : null;
      if (!prev || row.value === null || prev.value === null || prev.value === 0) return { date: row.date, value: null };
      return { date: row.date, value: ((row.value / prev.value) - 1) * 100 };
    })
    .filter((row) => row.value !== null);
}

function computeYoYChange(points: Array<{ date: string; value: number | null }>): Array<{ date: string; value: number | null }> {
  const yoy = computeYoY(points);
  if (yoy.length < 2) return [];
  return yoy
    .map((row, index) => {
      const prev = index > 0 ? yoy[index - 1] : null;
      if (!prev || row.value === null || prev.value === null) return { date: row.date, value: null };
      return { date: row.date, value: row.value - prev.value };
    })
    .filter((row) => row.value !== null);
}

function toZScoreByDate(points: Array<{ date: string; value: number | null }>): Map<string, number> {
  const valid = points.filter((item): item is { date: string; value: number } => typeof item.value === "number");
  if (valid.length < 2) return new Map();
  const values = valid.map((item) => item.value);
  const avg = mean(values);
  const sd = stdDev(values, avg);
  if (!Number.isFinite(sd) || sd === 0) return new Map();
  return new Map(valid.map((item) => [item.date, (item.value - avg) / sd]));
}

export function buildDerivedSeries(inputs: Record<string, Array<{ date: string; value: number | null }>>) {
  const output: Record<string, Array<{ date: string; value: number | null }>> = {};
  const monthlyInputs = Object.fromEntries(Object.entries(inputs).map(([key, points]) => [key, toCanonicalMonthly(points)]));

  const y10 = monthlyInputs.nominal_yield_10y_us ?? [];
  const y2 = monthlyInputs.nominal_yield_2y_us ?? [];
  if (y10.length > 0 && y2.length > 0) {
    output.yield_curve_10y_minus_2y_us = alignBinaryOperation(y10, y2, (a, b) => a - b);
  }

  const y3m = monthlyInputs.nominal_yield_3mo_us ?? [];
  if (y10.length > 0 && y3m.length > 0) {
    output.term_premium_proxy = alignBinaryOperation(y10, y3m, (a, b) => a - b);
  }

  const gold = monthlyInputs.gold_usd ?? [];
  const real10y = monthlyInputs.real_yield_10y_us ?? [];
  if (gold.length > 0 && real10y.length > 0) {
    const goldZ = toZScoreByDate(gold);
    const realZ = toZScoreByDate(real10y);
    output.gold_minus_real_yield_spread = gold
      .map((row) => {
        const goldNorm = goldZ.get(row.date);
        const realNorm = realZ.get(row.date);
        return {
          date: row.date,
          value: goldNorm !== undefined && realNorm !== undefined ? goldNorm - realNorm : null,
        };
      })
      .filter((row) => row.value !== null);
  }

  const coreCpi = monthlyInputs.core_cpi_us ?? [];
  if (coreCpi.length > 12) {
    output.core_cpi_yoy_us = computeYoY(coreCpi);
  }

  const debtToGdp = monthlyInputs.debt_to_gdp_us ?? [];
  if (debtToGdp.length > 0 && y10.length > 0) {
    output.interest_cost_proxy_us = alignBinaryOperation(debtToGdp, y10, (debt, nominal) => (debt * nominal) / 100);
  }

  const pmi = monthlyInputs.pmi_us ?? [];
  if (pmi.length >= 6) {
    output.pmi_momentum_us = pmi
      .map((row, index) => {
        const prev = index >= 3 ? pmi[index - 3] : null;
        return {
          date: row.date,
          value: row.value !== null && prev?.value !== null && prev?.value !== undefined
            ? row.value - prev.value
            : null,
        };
      })
      .filter((row) => row.value !== null);
  }


  const oil = monthlyInputs.oil_brent_usd ?? [];
  if (oil.length > 12) {
    output.oil_yoy = computeYoY(oil);
  }
  if (oil.length > 0 && real10y.length > 0) {
    output.oil_vs_real_yield = alignBinaryOperation(oil, real10y, (a, b) => a - b);
  }

  const natgas = monthlyInputs.natgas_usd ?? [];
  if (natgas.length > 12) output.natgas_yoy = computeYoY(natgas);

  const copper = monthlyInputs.copper_usd ?? [];
  if (copper.length > 12) output.copper_yoy = computeYoY(copper);

  const industrialMetals = monthlyInputs.industrial_metals_index ?? [];
  if (industrialMetals.length > 12) output.industrial_metals_yoy = computeYoY(industrialMetals);

  const commodityIndex = monthlyInputs.commodity_index ?? [];
  if (commodityIndex.length > 12) output.commodity_index_yoy = computeYoY(commodityIndex);

  const fedBalanceSheet = monthlyInputs.fed_balance_sheet_total ?? [];
  if (fedBalanceSheet.length > 12) output.fed_balance_sheet_yoy = computeYoY(fedBalanceSheet);

  const walcl = monthlyInputs.WALCL ?? [];
  const wdtgal = monthlyInputs.WDTGAL ?? [];
  const rrpontsyd = monthlyInputs.RRPONTSYD ?? [];
  const gdp = monthlyInputs.GDP ?? [];
  if (walcl.length > 0 && wdtgal.length > 0 && rrpontsyd.length > 0) {
    output.effective_fed_liquidity = alignTernaryOperation(walcl, wdtgal, rrpontsyd, (a, b, c) => a - b - c);
  }
  const effectiveFedLiquidity = output.effective_fed_liquidity ?? [];
  if (effectiveFedLiquidity.length > 0 && gdp.length > 0) {
    output.effective_fed_liquidity_ratio = alignBinaryOperationWithCarryForwardRight(effectiveFedLiquidity, gdp, (liq, gdpValue) => (gdpValue === 0 ? null : liq / gdpValue));
  }

  const m2 = monthlyInputs.m2sl ?? [];
  if (m2.length > 12) {
    output.m2_yoy = computeYoY(m2);
    output.m2_momentum = computeYoYChange(m2);
  }

  const usd = monthlyInputs.usd_broad_index ?? [];
  if (usd.length > 12) output.usd_yoy = computeYoY(usd);

  const silver = monthlyInputs.silver_usd ?? [];
  if (gold.length > 0 && silver.length > 0) {
    output.gold_silver_ratio = alignBinaryOperation(gold, silver, (a, b) => (b === 0 ? null : a / b));
  }
  if (industrialMetals.length > 0 && gold.length > 0) {
    output.industrial_metals_vs_gold = alignBinaryOperation(industrialMetals, gold, (a, b) => (b === 0 ? null : a / b));
  }


  return output;
}
