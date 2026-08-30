import * as XLSX from 'xlsx';

export type ImfCommodityPriceMapping = {
  priceKey: string;
  datasetSeriesId: string;
  providerUnit: 'USD_PER_TONNE';
  frequency: 'monthly';
  description: string;
};

export type ImfCommodityPriceRow = {
  dateUtc: string;
  close: number;
  sourcePeriod: string;
};

export const IMF_PRIMARY_COMMODITY_WORKBOOK_URL =
  'https://www.imf.org/-/media/files/research/commodityprices/monthly/external-data.xlsx';

export const IMF_COMMODITY_PRICE_MAPPINGS: readonly ImfCommodityPriceMapping[] = [
  {
    priceKey: 'MO_USD_TONNE',
    datasetSeriesId: 'PLMMODY',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF Primary Commodity Prices molybdenum benchmark, monthly period average, USD per metric tonne',
  },
] as const;

const IMF_COMMODITY_PRICE_MAP = new Map(
  IMF_COMMODITY_PRICE_MAPPINGS.map((mapping) => [mapping.priceKey, mapping]),
);

export function getImfCommodityPriceMapping(priceKey: string): ImfCommodityPriceMapping | null {
  return IMF_COMMODITY_PRICE_MAP.get(priceKey) ?? null;
}

export function isImfCommodityPriceKey(priceKey: string): boolean {
  return IMF_COMMODITY_PRICE_MAP.has(priceKey);
}

function toMonthEndUtc(year: number, monthOneBased: number): string {
  return new Date(Date.UTC(year, monthOneBased, 0)).toISOString().slice(0, 10);
}

function parseMonthlyHeader(value: unknown): { dateUtc: string; sourcePeriod: string } | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + 1;
    return {
      dateUtc: toMonthEndUtc(year, month),
      sourcePeriod: `${year}-${String(month).padStart(2, '0')}`,
    };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m) {
      return {
        dateUtc: toMonthEndUtc(parsed.y, parsed.m),
        sourcePeriod: `${parsed.y}-${String(parsed.m).padStart(2, '0')}`,
      };
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = /^(\d{4})[-/]?(\d{1,2})$/.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) {
        return {
          dateUtc: toMonthEndUtc(year, month),
          sourcePeriod: `${year}-${String(month).padStart(2, '0')}`,
        };
      }
    }
  }
  return null;
}

export function parseImfCommodityWorkbook(
  bytes: ArrayBuffer,
  mapping: ImfCommodityPriceMapping,
): ImfCommodityPriceRow[] {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const seriesColumn = row.findIndex((cell) => String(cell ?? '').trim() === mapping.datasetSeriesId);
      if (seriesColumn < 0) continue;

      const result: ImfCommodityPriceRow[] = [];
      for (let i = r + 1; i < rows.length; i += 1) {
        const dataRow = rows[i] ?? [];
        const date = parseMonthlyHeader(dataRow[0]);
        const close = Number(dataRow[seriesColumn]);
        if (!date || !Number.isFinite(close)) continue;
        result.push({ ...date, close });
      }
      if (result.length > 0) return result;
    }
  }
  throw new Error(`IMF workbook does not contain verified series ${mapping.datasetSeriesId}`);
}

export async function fetchImfCommodityPriceSeries(
  mapping: ImfCommodityPriceMapping,
  args: { fromUtc: string; toUtc: string },
  deps: { fetchFn?: typeof fetch } = {},
): Promise<ImfCommodityPriceRow[]> {
  const response = await (deps.fetchFn ?? fetch)(IMF_PRIMARY_COMMODITY_WORKBOOK_URL, {
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
  if (!response.ok) {
    throw new Error(`IMF commodity workbook request failed: ${response.status}`);
  }
  const rows = parseImfCommodityWorkbook(await response.arrayBuffer(), mapping);
  return rows.filter((row) => row.dateUtc >= args.fromUtc && row.dateUtc <= args.toUtc);
}
