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

function parseMonthlyPeriod(rawPeriod: string): { dateUtc: string; sourcePeriod: string } | null {
  // IMF PCPS SDMX 2.1 currently emits monthly periods as YYYY-Mmm
  // (for example 2026-M07), while CSV/older fixtures may use YYYY-MM.
  // Normalize both to the canonical YYYY-MM source period used elsewhere.
  const match = /^(\d{4})-(?:M)?(\d{2})$/.exec(rawPeriod.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return {
    dateUtc: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    sourcePeriod: `${year}-${String(month).padStart(2, '0')}`,
  };
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
    const period = parseMonthlyPeriod(cells[timeIndex]?.trim() ?? '');
    const close = Number(cells[valueIndex]);
    if (!period || !Number.isFinite(close)) continue;
    rows.push({ ...period, close });
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

  // Live IMF PCPS structure-specific SDMX 2.1 example:
  // <Obs TIME_PERIOD="2026-M07" OBS_VALUE="66881.54062478261" ... />
  const obsTagPattern = /<(?:\w+:)?Obs\b([^>]*)\/?\s*>/g;
  let obsMatch: RegExpExecArray | null;
  while ((obsMatch = obsTagPattern.exec(text)) !== null) {
    const attrs = parseXmlAttributes(obsMatch[1]);
    const period = attrs.TIME_PERIOD ? parseMonthlyPeriod(attrs.TIME_PERIOD) : null;
    const close = Number(attrs.OBS_VALUE);
    if (!period || !Number.isFinite(close)) continue;
    rows.push({ ...period, close });
  }
  if (rows.length > 0) {
    return rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  }

  // Generic SDMX-ML 2.1 fallback: ObsDimension/ObsValue child elements.
  const genericObsPattern = /<(?:\w+:)?Obs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Obs>/g;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericObsPattern.exec(text)) !== null) {
    const body = genericMatch[1];
    const dimensionMatch = /<(?:\w+:)?ObsDimension\b([^>]*)\/?\s*>/.exec(body);
    const valueMatch = /<(?:\w+:)?ObsValue\b([^>]*)\/?\s*>/.exec(body);
    if (!dimensionMatch || !valueMatch) continue;
    const rawPeriod = parseXmlAttributes(dimensionMatch[1]).value;
    const period = rawPeriod ? parseMonthlyPeriod(rawPeriod) : null;
    const close = Number(parseXmlAttributes(valueMatch[1]).value);
    if (!period || !Number.isFinite(close)) continue;
    rows.push({ ...period, close });
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
      // Request the format whose live IMF PCPS response shape is covered by tests.
      Accept: 'application/vnd.sdmx.structurespecificdata+xml;version=2.1',
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
