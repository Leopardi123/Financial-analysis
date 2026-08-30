import {
  buildImfCommoditySdmxUrl,
  getImfCommodityPriceMapping,
  parseImfCommoditySdmxResponse,
} from '../src/lib/prices/providers/imfCommodity.ts';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const mapping = getImfCommodityPriceMapping('MO_USD_TONNE');
  if (!mapping) {
    res.status(500).json({ ok: false, error: 'Missing MO_USD_TONNE mapping' });
    return;
  }

  const fromUtc = '2026-01-01';
  const toUtc = new Date().toISOString().slice(0, 10);
  const url = buildImfCommoditySdmxUrl(mapping, { fromUtc, toUtc });

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.sdmx.structurespecificdata+xml;version=2.1',
      },
    });
    const text = await response.text();
    const rows = parseImfCommoditySdmxResponse(text, mapping);
    res.status(200).json({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      url,
      mapping,
      bodyPrefix: text.slice(0, 2000),
      parsedCount: rows.length,
      first: rows[0] ?? null,
      last: rows[rows.length - 1] ?? null,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      url,
      mapping,
    });
  }
}
