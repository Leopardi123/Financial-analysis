import { fetchApiV3Json, requireFmpApiKey } from "../../../../api/_fmp.js";

type PricePoint = {
  date: string;
  close: number;
  volume: number | null;
};
type NumericPoint = {
  date: string;
  value: number;
};

const SMA_WINDOWS = [20, 50, 200];
const LONG_YEARS = 15;
const SHORT_POINTS = 260;

function toDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampToRecentYears(points: PricePoint[], years: number) {
  if (points.length === 0) {
    return points;
  }
  const lastPoint = points[points.length - 1];
  const lastDate = toDate(lastPoint.date);
  if (!lastDate) {
    return points;
  }
  const cutoff = new Date(lastDate.getFullYear() - (years - 1), 0, 1);
  return points.filter((point) => {
    const pointDate = toDate(point.date);
    return pointDate ? pointDate >= cutoff : false;
  });
}

function calculateSma(values: number[], window: number) {
  const result: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < window) {
      result.push(null);
      continue;
    }
    const slice = values.slice(i + 1 - window, i + 1);
    const sum = slice.reduce((acc, value) => acc + value, 0);
    result.push(sum / window);
  }
  return result;
}

function normalizeCurrency(raw: string | null | undefined) {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;
  return normalized;
}

function toDateMs(value: string) {
  const parsed = toDate(value);
  return parsed ? parsed.getTime() : null;
}

function forwardLookupByDate(points: NumericPoint[]) {
  const sorted = points
    .map((point) => ({ ...point, ts: toDateMs(point.date) }))
    .filter((point): point is NumericPoint & { ts: number } => point.ts !== null)
    .sort((a, b) => a.ts - b.ts);
  let cursor = 0;
  let last: NumericPoint | null = null;
  return (date: string) => {
    const targetTs = toDateMs(date);
    if (targetTs === null || sorted.length === 0) return null;
    while (cursor < sorted.length && sorted[cursor].ts <= targetTs) {
      last = { date: sorted[cursor].date, value: sorted[cursor].value };
      cursor += 1;
    }
    return last;
  };
}

function buildGoldSeries(
  sharePoints: PricePoint[],
  goldPerOzTargetCurrency: NumericPoint[],
) {
  const lookupGold = forwardLookupByDate(goldPerOzTargetCurrency);
  const converted: Array<{ date: string; close: number; volume: number | null }> = [];
  const droppedDates: string[] = [];
  const samples: Array<{ date: string; sharePrice: number; goldPerOzTargetCurrency: number; priceInGoldOz: number }> = [];

  sharePoints.forEach((point) => {
    const goldPoint = lookupGold(point.date);
    if (!goldPoint || !Number.isFinite(goldPoint.value) || goldPoint.value <= 0) {
      droppedDates.push(point.date);
      return;
    }
    const priceInGoldOz = point.close / goldPoint.value;
    if (!Number.isFinite(priceInGoldOz) || priceInGoldOz <= 0) {
      droppedDates.push(point.date);
      return;
    }
    converted.push({ date: point.date, close: priceInGoldOz, volume: point.volume });
    if (samples.length < 5) {
      samples.push({
        date: point.date,
        sharePrice: point.close,
        goldPerOzTargetCurrency: goldPoint.value,
        priceInGoldOz,
      });
    }
  });

  return { converted, droppedDates, samples };
}

export default async function handler(req: any, res: any) {
  try {
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    const ticker = typeof req.query?.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const [payload, profilePayload, goldPayload] = await Promise.all([
      fetchApiV3Json<{ historical?: Array<Record<string, unknown>> }>(
        `historical-price-full/${encodeURIComponent(ticker)}`
      ),
      fetchApiV3Json<Array<Record<string, unknown>>>(`profile/${encodeURIComponent(ticker)}`).catch(() => []),
      fetchApiV3Json<{ historical?: Array<Record<string, unknown>> }>("historical-price-full/GCUSD"),
    ]);
    const points: PricePoint[] = (payload.historical ?? [])
      .filter((row) => typeof row?.date === "string" && typeof row?.close === "number")
      .map((row) => ({
        date: String(row.date),
        close: Number(row.close),
        volume: typeof row.volume === "number" ? Number(row.volume) : null,
      }))
      .reverse();
    const marketCurrency = normalizeCurrency(typeof profilePayload?.[0]?.currency === "string" ? String(profilePayload[0].currency) : null) ?? "USD";
    const goldUsdPoints: NumericPoint[] = (goldPayload.historical ?? [])
      .filter((row) => typeof row?.date === "string" && typeof row?.close === "number")
      .map((row) => ({
        date: String(row.date),
        value: Number(row.close),
      }))
      .reverse();

    if (points.length === 0) {
      res.status(200).json({ ok: true, ticker, marketCurrency, long: null, short: null });
      return;
    }

    let fxSeriesUsed: string | null = null;
    let fxFallbackUsed = false;
    let fxHistoryPoints: NumericPoint[] = [];
    if (marketCurrency !== "USD") {
      const fxSymbol = `USD${marketCurrency}`;
      const fxPayload = await fetchApiV3Json<{ historical?: Array<Record<string, unknown>> }>(
        `historical-price-full/${encodeURIComponent(fxSymbol)}`
      ).catch(() => null);
      fxHistoryPoints = (fxPayload?.historical ?? [])
        .filter((row) => typeof row?.date === "string" && typeof row?.close === "number")
        .map((row) => ({
          date: String(row.date),
          value: Number(row.close),
        }))
        .reverse();
      fxSeriesUsed = fxSymbol;
      if (fxHistoryPoints.length === 0) {
        fxFallbackUsed = true;
      }
    }

    const lookupFx = forwardLookupByDate(fxHistoryPoints);
    const goldPerOzTargetCurrency: NumericPoint[] = [];
    const droppedByMissingFx: string[] = [];
    for (const gold of goldUsdPoints) {
      if (marketCurrency === "USD") {
        goldPerOzTargetCurrency.push({ date: gold.date, value: gold.value });
        continue;
      }
      const fx = lookupFx(gold.date);
      if (!fx || !Number.isFinite(fx.value) || fx.value <= 0) {
        droppedByMissingFx.push(gold.date);
        continue;
      }
      goldPerOzTargetCurrency.push({ date: gold.date, value: gold.value * fx.value });
    }

    const longPoints = clampToRecentYears(points, LONG_YEARS);
    const longStart = points.length - longPoints.length;
    const closes = points.map((point) => point.close);
    const volumes = points.map((point) => point.volume);
    const smas = SMA_WINDOWS.map((window) => calculateSma(closes, window));

    const longData = [
      ["Date", "Close", "SMA200", "SMA50", "SMA20"],
      ...longPoints.map((point, index) => [
        point.date,
        point.close,
        smas[2][index + longStart],
        smas[1][index + longStart],
        smas[0][index + longStart],
      ]),
    ];
    const longVolume = [
      ["Date", "Volume"],
      ...longPoints.map((point, index) => [point.date, volumes[index + longStart]]),
    ];

    const shortPoints = points.slice(-SHORT_POINTS);
    const shortStart = points.length - shortPoints.length;
    const shortData = [
      ["Date", "Close", "SMA200", "SMA50", "SMA20"],
      ...shortPoints.map((point, index) => [
        point.date,
        point.close,
        smas[2][index + shortStart],
        smas[1][index + shortStart],
        smas[0][index + shortStart],
      ]),
    ];
    const shortVolume = [
      ["Date", "Volume"],
      ...shortPoints.map((point, index) => [point.date, volumes[index + shortStart]]),
    ];

    const longGoldSeries = buildGoldSeries(longPoints, goldPerOzTargetCurrency);
    const shortGoldSeries = buildGoldSeries(shortPoints, goldPerOzTargetCurrency);
    const longGoldCloses = longGoldSeries.converted.map((point) => point.close);
    const shortGoldCloses = shortGoldSeries.converted.map((point) => point.close);
    const longGoldSmas = SMA_WINDOWS.map((window) => calculateSma(longGoldCloses, window));
    const shortGoldSmas = SMA_WINDOWS.map((window) => calculateSma(shortGoldCloses, window));
    const longGoldData = longGoldSeries.converted.length === 0
      ? null
      : [
        ["Date", "Close", "SMA200", "SMA50", "SMA20"],
        ...longGoldSeries.converted.map((point, index) => [
          point.date,
          point.close,
          longGoldSmas[2][index],
          longGoldSmas[1][index],
          longGoldSmas[0][index],
        ]),
      ];
    const shortGoldData = shortGoldSeries.converted.length === 0
      ? null
      : [
        ["Date", "Close", "SMA200", "SMA50", "SMA20"],
        ...shortGoldSeries.converted.map((point, index) => [
          point.date,
          point.close,
          shortGoldSmas[2][index],
          shortGoldSmas[1][index],
          shortGoldSmas[0][index],
        ]),
      ];

    res.status(200).json({
      ok: true,
      ticker,
      marketCurrency,
      goldSeriesCurrency: marketCurrency,
      long: { price: longData, volume: longVolume, goldPrice: longGoldData },
      short: { price: shortData, volume: shortVolume, goldPrice: shortGoldData },
      goldDebug: {
        marketCurrency,
        goldSeriesBase: "GCUSD (USD/oz)",
        goldSeriesUsed: marketCurrency === "USD" ? "GCUSD" : "GCUSD converted to target currency via FX",
        fxSeriesUsed: marketCurrency === "USD" ? null : fxSeriesUsed,
        formula: marketCurrency === "USD"
          ? "price_in_gold_oz = share_price_USD / gold_price_USD_per_oz"
          : "price_in_gold_oz = share_price_target_ccy / (gold_price_USD_per_oz * fx_USD_to_target_ccy)",
        samples: shortGoldSeries.samples,
        dropped: {
          missingGoldOrShare: [...new Set([...longGoldSeries.droppedDates, ...shortGoldSeries.droppedDates])].slice(0, 50),
          missingFxForGoldDate: droppedByMissingFx.slice(0, 50),
        },
        fallbackUsed: fxFallbackUsed,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
