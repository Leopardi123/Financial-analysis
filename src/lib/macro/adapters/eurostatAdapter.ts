import { fetchJsonWithPolicies } from "./httpClient.ts";

type EurostatDimension = {
  category?: {
    index?: Record<string, number>;
  };
};

type EurostatResponse = {
  value?: Record<string, number>;
  id?: string[];
  size?: number[];
  dimension?: Record<string, EurostatDimension>;
};

function toIsoDateFromPeriod(period: string): string | null {
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-28`;
  if (/^\d{4}M\d{2}$/.test(period)) return `${period.slice(0, 4)}-${period.slice(5, 7)}-28`;
  if (/^\d{4}$/.test(period)) return `${period}-12-28`;
  return null;
}

function computeStride(size: number[], dimIndex: number): number {
  return size.slice(dimIndex + 1).reduce((acc, item) => acc * item, 1);
}

function resolveCategoryIndex(
  payload: EurostatResponse,
  dimName: string,
  preferredCode: string | undefined,
): number {
  const categories = payload.dimension?.[dimName]?.category?.index ?? {};
  if (preferredCode && categories[preferredCode] !== undefined) return categories[preferredCode] as number;
  const first = Object.entries(categories).sort((a, b) => a[1] - b[1])[0];
  return first ? first[1] : 0;
}

export async function fetchEurostatSeries(params: {
  dataset: string;
  filters: Record<string, string>;
}): Promise<Array<{ date: string; value: number | null }>> {
  const url = new URL(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${params.dataset}`);
  for (const [k, v] of Object.entries(params.filters)) {
    url.searchParams.set(k, v);
  }

  const payload = await fetchJsonWithPolicies<EurostatResponse>({ url: url.toString() });
  const ids = payload.id ?? [];
  const sizes = payload.size ?? [];
  const timeDimIndex = ids.indexOf("time");
  const timeCategories = payload.dimension?.time?.category?.index ?? {};

  if (timeDimIndex < 0 || ids.length === 0 || sizes.length !== ids.length) {
    return [];
  }

  const fixedIndexes = new Map<number, number>();
  ids.forEach((dimName, dimIndex) => {
    if (dimName === "time") return;
    fixedIndexes.set(dimIndex, resolveCategoryIndex(payload, dimName, params.filters[dimName]));
  });

  return Object.entries(timeCategories)
    .map(([period, timeCategoryIndex]) => {
      const date = toIsoDateFromPeriod(period);
      if (!date) return null;

      let flatIndex = 0;
      ids.forEach((dimName, dimIndex) => {
        const stride = computeStride(sizes, dimIndex);
        const dimCategoryIndex = dimName === "time"
          ? Number(timeCategoryIndex)
          : (fixedIndexes.get(dimIndex) ?? 0);
        flatIndex += dimCategoryIndex * stride;
      });

      const raw = payload.value?.[String(flatIndex)] ?? null;
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      return { date, value };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
