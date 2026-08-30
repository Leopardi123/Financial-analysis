export type ImfCommodityPriceMapping = {
  priceKey: string;
  datasetSeriesId: string;
  providerUnit: 'USD_PER_TONNE';
  frequency: 'monthly';
  description: string;
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
