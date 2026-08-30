import { resolvePriceSeries } from '../resolve.ts';
import {
  buildImfCommoditySdmxUrl,
  fetchImfCommodityPriceSeries,
  getImfCommodityPriceMapping,
  parseImfCommoditySdmxResponse,
} from '../providers/imfCommodity.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

(async function runImfProjectResolverTests() {
  const mapping = getImfCommodityPriceMapping('MO_USD_TONNE');
  assert(mapping, 'MO_USD_TONNE must have a verified IMF mapping');
  assertEqual(mapping?.datasetSeriesId, 'PLMMODY', 'verified IMF indicator');
  assertEqual(mapping?.dataflowRef, 'IMF.RES,PCPS,9.0.0', 'verified IMF PCPS dataflow');
  assertEqual(mapping?.sdmxKey, 'G001.PLMMODY.USD.M', 'verified IMF PCPS SDMX key');

  const url = buildImfCommoditySdmxUrl(mapping!, { fromUtc: '2026-05-01', toUtc: '2026-07-31' });
  assertEqual(
    url,
    'https://api.imf.org/external/sdmx/2.1/data/IMF.RES,PCPS,9.0.0/G001.PLMMODY.USD.M?startPeriod=2026-05&endPeriod=2026-07',
    'IMF SDMX URL',
  );

  const csv = [
    'COUNTRY,INDICATOR,DATA_TRANSFORMATION,FREQUENCY,TIME_PERIOD,OBS_VALUE',
    'G001,PLMMODY,USD,M,2026-05,65640',
    'G001,PLMMODY,USD,M,2026-06,66690',
    'G001,PLMMODY,USD,M,2026-07,66882',
  ].join('\n');
  const csvRows = parseImfCommoditySdmxResponse(csv, mapping!);
  assertEqual(csvRows.length, 3, 'SDMX CSV parser observation count');
  assertEqual(csvRows[2]?.close, 66882, 'SDMX CSV parser latest Mo value');
  assertEqual(csvRows[2]?.dateUtc, '2026-07-31', 'SDMX CSV parser month end');

  const xml = `<?xml version="1.0"?><DataSet><Series COUNTRY="G001" INDICATOR="PLMMODY" DATA_TRANSFORMATION="USD" FREQUENCY="M"><Obs TIME_PERIOD="2026-06" OBS_VALUE="66690"/><Obs TIME_PERIOD="2026-07" OBS_VALUE="66882"/></Series></DataSet>`;
  const xmlRows = parseImfCommoditySdmxResponse(xml, mapping!);
  assertEqual(xmlRows.length, 2, 'SDMX XML parser observation count');
  assertEqual(xmlRows[1]?.close, 66882, 'SDMX XML parser latest Mo value');

  let requestedUrl = '';
  const fetched = await fetchImfCommodityPriceSeries(
    mapping!,
    { fromUtc: '2026-05-01', toUtc: '2026-07-31' },
    {
      fetchFn: async (input) => {
        requestedUrl = String(input);
        return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv' } });
      },
    },
  );
  assertEqual(requestedUrl, url, 'provider requests the verified IMF SDMX URL');
  assertEqual(fetched.length, 3, 'provider returns historical monthly observations');

  const rows = [
    { dateUtc: '2026-05-31', close: 65640, sourcePeriod: '2026-05' },
    { dateUtc: '2026-06-30', close: 66690, sourcePeriod: '2026-06' },
    { dateUtc: '2026-07-31', close: 66882, sourcePeriod: '2026-07' },
  ];

  const spot = await resolvePriceSeries(
    {
      price_key: 'MO_USD_TONNE',
      anchorDatesUtc: ['2026-08-30'],
      scenario: { mode: 'spot' },
      allowRefresh: false,
    },
    {
      fetchImfCommodityPriceSeriesFn: async (resolvedMapping) => {
        assertEqual(resolvedMapping.datasetSeriesId, 'PLMMODY', 'resolver IMF indicator');
        assertEqual(resolvedMapping.sdmxKey, 'G001.PLMMODY.USD.M', 'resolver IMF SDMX key');
        return rows;
      },
    },
  );

  assertEqual(spot.values[0], 66882, 'spot mode uses latest available IMF monthly benchmark');
  assertEqual(spot.meta?.provider, 'IMF', 'resolver exposes IMF provider metadata');
  assertEqual(spot.meta?.sourceIdentifier, 'PLMMODY', 'resolver exposes verified IMF source identifier');
  assert(
    spot.warnings.some((warning) => warning.includes('latest available monthly benchmark')),
    'spot mode explains that IMF value is a monthly benchmark rather than a spot quote',
  );

  const percentile = await resolvePriceSeries(
    {
      price_key: 'MO_USD_TONNE',
      anchorDatesUtc: ['2026-08-30'],
      scenario: { mode: 'percentile', lookbackYears: 1, percentile: 50 },
      allowRefresh: false,
    },
    {
      fetchImfCommodityPriceSeriesFn: async () => rows,
    },
  );

  assertEqual(percentile.values[0], 66690, 'percentile mode uses IMF monthly observations');
  console.log('IMF project resolver tests passed');
})();
