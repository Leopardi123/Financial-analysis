export type FredSeriesConfig = {
  fredSeriesId: string;
  seriesKey: string;
};

export const US_FRED_SERIES: FredSeriesConfig[] = [
  { fredSeriesId: "DGS10", seriesKey: "nominal_yield_10y_us" },
  { fredSeriesId: "DGS2", seriesKey: "nominal_yield_2y_us" },
  { fredSeriesId: "DFII10", seriesKey: "real_yield_10y_us" },
  { fredSeriesId: "CPILFESL", seriesKey: "core_cpi_us" },
  { fredSeriesId: "T10YIE", seriesKey: "breakeven_10y_us" },
  { fredSeriesId: "BAMLH0A0HYM2", seriesKey: "hy_spread_us" },
  { fredSeriesId: "GOLDPMGBD228NLBM", seriesKey: "gold_usd" },
  { fredSeriesId: "GFDEGDQ188S", seriesKey: "debt_to_gdp_us" },
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
}): Promise<Array<{ date: string; value: number | null }>> {
  const apiKey = validateFredApiKey();
  const end = new Date();
  const start = new Date(end);
  if (params.mode === "backfill") {
    start.setFullYear(end.getFullYear() - 12);
  } else {
    start.setMonth(end.getMonth() - 2);
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
    const realByDate = new Map(real10y.map((row) => [row.date, row.value]));
    output.gold_minus_real_yield_spread = gold
      .map((row) => {
        const real = realByDate.get(row.date);
        return {
          date: row.date,
          value: row.value !== null && real !== null && real !== undefined ? row.value - real : null,
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

  return output;
}
