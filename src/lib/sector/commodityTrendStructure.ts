export type CommodityPricePoint = {
  date: string;
  value: number | null;
};

export type CommodityTrendPoint = {
  date: string;
  sma50: number | null;
  sma200: number | null;
  sma500: number | null;
  indexSma50: number | null;
  indexSma200: number | null;
  indexSma500: number | null;
  spread50_200: number | null;
  spread200_500: number | null;
};

export type CommodityTrendStructure = {
  windowStartDate: string | null;
  windowEndDate: string | null;
  points: CommodityTrendPoint[];
  hasSma500Coverage: boolean;
  missingHistoryReason: string | null;
  debug: {
    orderingLatest: "bullish_stack" | "mixed" | "insufficient";
    shortSpreadDirection: "widening" | "narrowing" | "flat" | "insufficient";
    longSpreadDirection: "widening" | "narrowing" | "flat" | "insufficient";
  };
};

function parseDate(date: string): Date | null {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function computeSma(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  let validCount = 0;

  for (let i = 0; i < values.length; i += 1) {
    const next = values[i];
    if (typeof next === "number" && Number.isFinite(next)) {
      sum += next;
      validCount += 1;
    }

    if (i >= period) {
      const leaving = values[i - period];
      if (typeof leaving === "number" && Number.isFinite(leaving)) {
        sum -= leaving;
        validCount -= 1;
      }
    }

    if (i >= period - 1 && validCount === period) {
      out[i] = sum / period;
    }
  }

  return out;
}

function normalizeFromBase(series: Array<number | null>): Array<number | null> {
  const base = series.find((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (base === undefined || Math.abs(base) < 1e-12) return series.map(() => null);
  return series.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return (value / base) * 100;
  });
}

function diffDirection(values: Array<number | null>): "widening" | "narrowing" | "flat" | "insufficient" {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length < 2) return "insufficient";
  const delta = numeric[numeric.length - 1] - numeric[0];
  if (Math.abs(delta) < 1e-6) return "flat";
  return delta > 0 ? "widening" : "narrowing";
}

export function buildCommodityTrendStructure(pricePoints: CommodityPricePoint[], months = 5): CommodityTrendStructure {
  const sorted = [...pricePoints]
    .map((point) => ({ ...point, parsed: parseDate(point.date) }))
    .filter((point) => point.parsed !== null)
    .sort((a, b) => (a.parsed!.getTime() - b.parsed!.getTime()));

  if (sorted.length === 0) {
    return {
      windowStartDate: null,
      windowEndDate: null,
      points: [],
      hasSma500Coverage: false,
      missingHistoryReason: "Ingen prisserie tillgänglig för att beräkna trendstruktur.",
      debug: {
        orderingLatest: "insufficient",
        shortSpreadDirection: "insufficient",
        longSpreadDirection: "insufficient",
      },
    };
  }

  const dates = sorted.map((point) => point.date);
  const values = sorted.map((point) => (typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null));
  const sma50 = computeSma(values, 50);
  const sma200 = computeSma(values, 200);
  const sma500 = computeSma(values, 500);

  const endDate = sorted[sorted.length - 1].parsed!;
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - Math.max(1, months));

  const windowIndices = sorted
    .map((point, idx) => ({ idx, ts: point.parsed!.getTime() }))
    .filter((point) => point.ts >= startDate.getTime())
    .map((point) => point.idx);

  if (windowIndices.length === 0) {
    return {
      windowStartDate: null,
      windowEndDate: dates[dates.length - 1] ?? null,
      points: [],
      hasSma500Coverage: false,
      missingHistoryReason: "Ingen data i valt 5-månadersfönster.",
      debug: {
        orderingLatest: "insufficient",
        shortSpreadDirection: "insufficient",
        longSpreadDirection: "insufficient",
      },
    };
  }

  const windowSma50 = windowIndices.map((index) => sma50[index]);
  const windowSma200 = windowIndices.map((index) => sma200[index]);
  const windowSma500 = windowIndices.map((index) => sma500[index]);

  const indexed50 = normalizeFromBase(windowSma50);
  const indexed200 = normalizeFromBase(windowSma200);
  const indexed500 = normalizeFromBase(windowSma500);

  const points: CommodityTrendPoint[] = windowIndices.map((index, i) => {
    const spread50_200 = typeof sma50[index] === "number" && typeof sma200[index] === "number"
      ? sma50[index]! - sma200[index]!
      : null;
    const spread200_500 = typeof sma200[index] === "number" && typeof sma500[index] === "number"
      ? sma200[index]! - sma500[index]!
      : null;

    return {
      date: dates[index],
      sma50: sma50[index],
      sma200: sma200[index],
      sma500: sma500[index],
      indexSma50: indexed50[i],
      indexSma200: indexed200[i],
      indexSma500: indexed500[i],
      spread50_200,
      spread200_500,
    };
  });

  const hasSma500Coverage = points.some((point) => typeof point.sma500 === "number");
  const latest = points[points.length - 1] ?? null;
  const orderingLatest = latest && typeof latest.sma50 === "number" && typeof latest.sma200 === "number" && typeof latest.sma500 === "number"
    ? (latest.sma50 > latest.sma200 && latest.sma200 > latest.sma500 ? "bullish_stack" : "mixed")
    : "insufficient";

  return {
    windowStartDate: points[0]?.date ?? null,
    windowEndDate: points[points.length - 1]?.date ?? null,
    points,
    hasSma500Coverage,
    missingHistoryReason: hasSma500Coverage
      ? null
      : "Lång trend (SMA500) saknar tillräcklig historik i underlaget.",
    debug: {
      orderingLatest,
      shortSpreadDirection: diffDirection(points.map((point) => point.spread50_200)),
      longSpreadDirection: diffDirection(points.map((point) => point.spread200_500)),
    },
  };
}
