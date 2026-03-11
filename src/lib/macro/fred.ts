export type FredSeriesConfig = {
  fredSeriesId: string;
  seriesKey: string;
  latestLookbackMonths?: number;
  backfillLookbackYears?: number;
};

export const US_FRED_SERIES: FredSeriesConfig[] = [
  { fredSeriesId: "DGS10", seriesKey: "nominal_yield_10y_us" },
  { fredSeriesId: "DGS2", seriesKey: "nominal_yield_2y_us" },
  { fredSeriesId: "DFII10", seriesKey: "real_yield_10y_us" },
  { fredSeriesId: "CPILFESL", seriesKey: "core_cpi_us" },
  { fredSeriesId: "T10YIE", seriesKey: "breakeven_10y_us" },
  { fredSeriesId: "BAMLH0A0HYM2", seriesKey: "hy_spread_us" },
  { fredSeriesId: "GFDEGDQ188S", seriesKey: "debt_to_gdp_us", latestLookbackMonths: 180, backfillLookbackYears: 25 },
  { fredSeriesId: "FYFSGDA188S", seriesKey: "deficit_to_gdp_us", latestLookbackMonths: 240, backfillLookbackYears: 25 },
  { fredSeriesId: "INDPRO", seriesKey: "pmi_us", latestLookbackMonths: 180, backfillLookbackYears: 20 },
];

type FredObservation = {
  date: string;
  value: string;
};

type FredObservationsResponse = {
  observations?: FredObservation[];
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

export async function fetchFredSeries(params: {
  fredSeriesId: string;
  mode: "backfill" | "latest";
  latestLookbackMonths?: number;
  backfillLookbackYears?: number;
}): Promise<Array<{ date: string; value: number | null }>> {
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

  return observations
    .map((obs) => {
      const raw = String(obs.value ?? "").trim();
      const numeric = raw === "." ? null : Number(raw);
      return {
        date: String(obs.date),
        value: Number.isFinite(numeric) ? numeric : null,
      };
    })
    .filter((obs) => /^\d{4}-\d{2}-\d{2}$/.test(obs.date));
}

function mean(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0) / Math.max(1, values.length);
}

function stdDev(values: number[], avg: number): number {
  const variance = values.reduce((acc, value) => acc + ((value - avg) ** 2), 0) / Math.max(1, values.length);
  return Math.sqrt(variance);
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

  const y10 = inputs.nominal_yield_10y_us ?? [];
  const y2 = inputs.nominal_yield_2y_us ?? [];
  if (y10.length > 0 && y2.length > 0) {
    const byDate2 = new Map(y2.map((row) => [row.date, row.value]));
    output.yield_curve_10y_minus_2y_us = y10
      .map((row) => ({
        date: row.date,
        value: row.value !== null && byDate2.get(row.date) !== null && byDate2.get(row.date) !== undefined
          ? row.value - (byDate2.get(row.date) as number)
          : null,
      }))
      .filter((row) => row.value !== null);
  }

  const gold = inputs.gold_usd ?? [];
  const real10y = inputs.real_yield_10y_us ?? [];
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

  const coreCpi = inputs.core_cpi_us ?? [];
  if (coreCpi.length > 12) {
    output.core_cpi_yoy_us = coreCpi
      .map((row, index) => {
        const prev = index >= 12 ? coreCpi[index - 12] : null;
        return {
          date: row.date,
          value: prev && prev.value !== null && row.value !== null && prev.value !== 0
            ? ((row.value / prev.value) - 1) * 100
            : null,
        };
      })
      .filter((row) => row.value !== null);
  }

  const pmi = inputs.pmi_us ?? [];
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

  return output;
}
