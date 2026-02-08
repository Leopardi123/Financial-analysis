import { requireFmpApiKey } from "../_fmp.js";

type PricePoint = {
  date: string;
  close: number;
  volume: number | null;
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

export default async function handler(req: any, res: any) {
  try {
    const apiKey = requireFmpApiKey();
    if (!apiKey) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    const ticker = typeof req.query?.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(
      ticker
    )}?serietype=line&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      res.status(502).json({ ok: false, error: `FMP price request failed (${response.status})` });
      return;
    }

    const payload = (await response.json()) as { historical?: Array<Record<string, unknown>> };
    const points: PricePoint[] = (payload.historical ?? [])
      .filter((row) => typeof row?.date === "string" && typeof row?.close === "number")
      .map((row) => ({
        date: String(row.date),
        close: Number(row.close),
        volume: typeof row.volume === "number" ? Number(row.volume) : null,
      }))
      .reverse();

    if (points.length === 0) {
      res.status(200).json({ ok: true, ticker, long: null, short: null });
      return;
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

    res.status(200).json({
      ok: true,
      ticker,
      long: { price: longData, volume: longVolume },
      short: { price: shortData, volume: shortVolume },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
