import { buildGminProducerJsonV1 } from '../../../lib/miningProducer/data/gmin.ts';
import type { ProducerCaseMode, ProducerPriceMode } from '../../../lib/miningProducer/types.ts';
import { buildLiveProducerPeerTable } from '../../miningProducer/buildLivePeerTable.ts';

function parseYear(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null;
}

function parsePriceMode(value: unknown): ProducerPriceMode | null {
  const mode = String(value ?? 'SPOT').trim().toUpperCase();
  return mode === 'SPOT' || mode === 'LT' || mode === 'REPORTED' ? mode : null;
}

function parseCaseMode(value: unknown): ProducerCaseMode | null {
  const mode = String(value ?? 'BASE').trim().toUpperCase();
  return mode === 'BASE' || mode === 'GROWTH' ? mode : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const selectedYear = parseYear(req.query?.year);
  if (selectedYear === null) {
    res.status(400).json({ ok: false, error: 'year query parameter must be an integer between 1900 and 2200' });
    return;
  }

  const priceMode = parsePriceMode(req.query?.price);
  if (priceMode === null) {
    res.status(400).json({ ok: false, error: 'price must be SPOT, LT or REPORTED' });
    return;
  }

  const caseMode = parseCaseMode(req.query?.case);
  if (caseMode === null) {
    res.status(400).json({ ok: false, error: 'case must be BASE or GROWTH' });
    return;
  }

  if (priceMode === 'LT') {
    res.status(400).json({
      ok: false,
      error: 'LT_PRICE_DECK_NOT_CONFIGURED',
      diagnostics: ['Producer LT mode requires an explicit versioned long-term metal price deck; no LT prices are guessed.'],
    });
    return;
  }

  const valuationDateUtc = new Date().toISOString().slice(0, 10);
  const gmin = buildGminProducerJsonV1(valuationDateUtc);

  let reportedPriceDeckIdByCompanyId: Record<string, string> | undefined;
  if (priceMode === 'REPORTED') {
    if (selectedYear === 2026) {
      reportedPriceDeckIdByCompanyId = { gmin: 'gmin-guidance-2026' };
    } else if (selectedYear === 2027) {
      reportedPriceDeckIdByCompanyId = { gmin: 'gmin-guidance-2027' };
    } else {
      res.status(400).json({
        ok: false,
        error: 'REPORTED_PRICE_DECK_NOT_AVAILABLE',
        diagnostics: [`GMIN has explicit reported price decks for 2026 and 2027 only; ${selectedYear} must not inherit either deck.`],
      });
      return;
    }
  }

  try {
    const result = await buildLiveProducerPeerTable({
      producers: [gmin],
      context: {
        valuationDateUtc,
        selectedYear,
        priceMode,
        caseMode,
      },
      reportedPriceDeckIdByCompanyId,
    });

    res.status(200).json({
      ok: true,
      dataset: {
        companies: ['gmin'],
        sourceContract: 'producer_json_v1',
      },
      table: result.table,
      liveDiagnosticsByCompanyId: result.liveDiagnosticsByCompanyId,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: (error as Error).message,
    });
  }
}
