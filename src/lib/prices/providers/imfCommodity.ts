export type ImfCommodityPriceMapping = {
  priceKey: string;
  datasetSeriesId: string;
  dataflowRef: string;
  sdmxKey: string;
  providerUnit: 'USD_PER_TONNE';
  frequency: 'monthly';
  description: string;
};

export type ImfCommodityPriceRow = {
  dateUtc: string;
  close: number;
  sourcePeriod: string;
};

export const IMF_PRIMARY_COMMODITY_API_BASE_URL =
  'https://api.imf.org/external/sdmx/2.1/data';

// Backward-compatible diagnostic export. The source is now the SDMX API, not the workbook.
export const IMF_PRIMARY_COMMODITY_WORKBOOK_URL = IMF_PRIMARY_COMMODITY_API_BASE_URL;

export const IMF_COMMODITY_PRICE_MAPPINGS: readonly ImfCommodityPriceMapping[] = [
  {
    priceKey: 'MO_USD_TONNE',
    datasetSeriesId: 'PLMMODY',
    dataflowRef: 'IMF.RES,PCPS,9.0.0',
    sdmxKey: 'G001.PLMMODY.USD.M',
    providerUnit: 'USD_PER_TONNE',
    frequency: 'monthly',
    description: 'IMF Primary Commodity Price System molybdenum benchmark, monthly period average, USD per metric tonne',
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

function toMonthEndUtc(sourcePeriod: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(sourcePeriod.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function parseImfCommoditySdmxCsv(
  text: string,
  mapping: ImfCommodityPriceMapping,
): ImfCommodityPriceRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((value) => value.trim());
  const timeIndex = header.indexOf('TIME_PERIOD');
  const valueIndex = header.indexOf('OBS_VALUE');
  const indicatorIndex = header.indexOf('INDICATOR');
  if (timeIndex < 0 || valueIndex < 0) return [];

  const rows: ImfCommodityPriceRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    if (indicatorIndex >= 0 && cells[indicatorIndex]?.trim() !== mapping.datasetSeriesId) continue;
    const sourcePeriod = cells[timeIndex]?.trim() ?? '';
    const dateUtc = toMonthEndUtc(sourcePeriod);
    const close = Number(cells[valueIndex]);
    if (!dateUtc || !Number.isFinite(close)) continue;
    rows.push({ dateUtc, close, sourcePeriod });
  }
  return rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
}

function parseXmlAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attributePattern = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(input)) !== null) {
    attrs[match[1].split(':').pop() ?? match[1]] = match[2];
  }
  return attrs;
}

export function parseImfCommoditySdmxXml(text: string): ImfCommodityPriceRow[] {
  const rows: ImfCommodityPriceRow[] = [];

  const obsTagPattern = /<(?:\w+:)?Obs\b([^>]*)\/?\s*>/g;
  let obsMatch: RegExpExecArray | null;
  while ((obsMatch = obsTagPattern.exec(text)) !== null) {
    const attrs = parseXmlAttributes(obsMatch[1]);
    const sourcePeriod = attrs.TIME_PERIOD;
    const dateUtc = sourcePeriod ? toMonthEndUtc(sourcePeriod) : null;
    const close = Number(attrs.OBS_VALUE);
    if (!dateUtc || !Number.isFinite(close)) continue;
    rows.push({ dateUtc, close, sourcePeriod });
  }
  if (rows.length > 0) {
    return rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  }

  const genericObsPattern = /<(?:\w+:)?Obs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Obs>/g;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericObsPattern.exec(text)) !== null) {
    const body = genericMatch[1];
    const dimensionMatch = /<(?:\w+:)?ObsDimension\b([^>]*)\/?\s*>/.exec(body);
    const valueMatch = /<(?:\w+:)?ObsValue\b([^>]*)\/?\s*>/.exec(body);
    if (!dimensionMatch || !valueMatch) continue;
    const sourcePeriod = parseXmlAttributes(dimensionMatch[1]).value;
    const dateUtc = sourcePeriod ? toMonthEndUtc(sourcePeriod) : null;
    const close = Number(parseXmlAttributes(valueMatch[1]).value);
    if (!dateUtc || !Number.isFinite(close)) continue;
    rows.push({ dateUtc, close, sourcePeriod });
  }
  return rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
}

export function parseImfCommoditySdmxResponse(
  text: string,
  mapping: ImfCommodityPriceMapping,
): ImfCommodityPriceRow[] {
  const trimmed = text.trimStart();
  return trimmed.startsWith('<')
    ? parseImfCommoditySdmxXml(text)
    : parseImfCommoditySdmxCsv(text, mapping);
}

export function buildImfCommoditySdmxUrl(
  mapping: ImfCommodityPriceMapping,
  args: { fromUtc: string; toUtc: string },
): string {
  const startPeriod = args.fromUtc.slice(0, 7);
  const endPeriod = args.toUtc.slice(0, 7);
  const query = new URLSearchParams({ startPeriod, endPeriod });
  return `${IMF_PRIMARY_COMMODITY_API_BASE_URL}/${mapping.dataflowRef}/${mapping.sdmxKey}?${query.toString()}`;
}

export async function fetchImfCommodityPriceSeries(
  mapping: ImfCommodityPriceMapping,
  args: { fromUtc: string; toUtc: string },
  deps: { fetchFn?: typeof fetch } = {},
): Promise<ImfCommodityPriceRow[]> {
  const url = buildImfCommoditySdmxUrl(mapping, args);
  const response = await (deps.fetchFn ?? fetch)(url, {
    headers: {
      Accept: 'text/csv, application/vnd.sdmx.structurespecificdata+xml;version=2.1, application/xml;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`IMF SDMX commodity request failed: ${response.status}`);
  }
  const rows = parseImfCommoditySdmxResponse(await response.text(), mapping)
    .filter((row) => row.dateUtc >= args.fromUtc && row.dateUtc <= args.toUtc);
  if (rows.length === 0) {
    throw new Error(`IMF SDMX response contained no usable observations for ${mapping.sdmxKey}`);
  }
  return rows;
}
