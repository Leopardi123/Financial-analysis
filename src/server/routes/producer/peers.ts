import {
  deleteCompanyCorporateProducerJson,
  getCompanyCorporateProducerJson,
  listCompanyCorporateProducerJsonRows,
  upsertCompanyCorporateProducerJson,
} from '../../../lib/db/companyCorporateProducer.ts';
import { stripGeneratedProducerEditorMetadata } from '../../../lib/miningProducer/editorMetadata.ts';
import {
  assertStoredProducerMatchesSymbol,
  parseStoredProducerJson,
  prepareStoredProducerForRun,
  selectReportedPriceDeckIdForYear,
} from '../../../lib/miningProducer/storedSource.ts';
import { validateProducerJsonV1 } from '../../../lib/miningProducer/schema.ts';
import type { ProducerCaseMode, ProducerJsonV1, ProducerPriceMode } from '../../../lib/miningProducer/types.ts';
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

function normalizeSymbol(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function parseBody(req: any): Record<string, unknown> {
  const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

async function handleCorporateGet(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const symbol = normalizeSymbol(req.query?.symbol);
  if (!symbol) {
    res.status(400).json({ ok: false, error: 'symbol is required' });
    return;
  }
  const row = await getCompanyCorporateProducerJson(symbol);
  if (!row) {
    res.status(200).json({ ok: true, record: null });
    return;
  }
  const producer = parseStoredProducerJson(row.raw_json);
  assertStoredProducerMatchesSymbol(producer, symbol);
  res.status(200).json({
    ok: true,
    record: {
      symbol: row.symbol,
      json_version: row.json_version,
      company_id: row.company_id,
      company_name: row.company_name,
      raw_json: producer,
      created_at_utc: row.created_at_utc,
      updated_at_utc: row.updated_at_utc,
    },
  });
}

async function handleCorporateUpsert(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const body = parseBody(req);
  const symbol = normalizeSymbol(body.symbol);
  if (!symbol) {
    res.status(400).json({ ok: false, error: 'symbol is required' });
    return;
  }
  const raw = body.raw_json;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    res.status(400).json({ ok: false, error: 'raw_json must be an object' });
    return;
  }
  const cleaned = stripGeneratedProducerEditorMetadata(raw);
  const producer = validateProducerJsonV1(cleaned as ProducerJsonV1);
  assertStoredProducerMatchesSymbol(producer, symbol);

  const saved = await upsertCompanyCorporateProducerJson({
    symbol,
    json_version: producer.version,
    company_id: producer.company.id,
    company_name: producer.company.name,
    raw_json: JSON.stringify(producer),
  });
  res.status(200).json({ ok: true, symbol: saved.symbol, updated_at_utc: saved.updated_at_utc });
}

async function handleCorporateDelete(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const body = parseBody(req);
  const symbol = normalizeSymbol(body.symbol);
  if (!symbol) {
    res.status(400).json({ ok: false, error: 'symbol is required' });
    return;
  }
  await deleteCompanyCorporateProducerJson(symbol);
  res.status(200).json({ ok: true, symbol });
}

async function loadStoredProducerSet(valuationDateUtc: string): Promise<{ producers: ProducerJsonV1[]; symbols: string[] }> {
  const rows = await listCompanyCorporateProducerJsonRows();
  const producers: ProducerJsonV1[] = [];
  const symbols: string[] = [];
  const companyIds = new Set<string>();

  for (const row of rows) {
    if (row.json_version !== 'producer_json_v1') {
      throw new Error(`Unsupported corporate JSON version for ${row.symbol}: ${row.json_version}`);
    }
    const stored = parseStoredProducerJson(row.raw_json);
    assertStoredProducerMatchesSymbol(stored, row.symbol);
    if (companyIds.has(stored.company.id)) {
      throw new Error(`Duplicate producer company.id in stored corporate JSON: ${stored.company.id}`);
    }
    companyIds.add(stored.company.id);
    producers.push(prepareStoredProducerForRun(stored, valuationDateUtc));
    symbols.push(row.symbol);
  }

  return { producers, symbols };
}

export default async function handler(req: any, res: any) {
  const action = String(req.query?.action ?? '').trim().toLowerCase();
  try {
    if (action === 'corporate-get') {
      await handleCorporateGet(req, res);
      return;
    }
    if (action === 'corporate-upsert') {
      await handleCorporateUpsert(req, res);
      return;
    }
    if (action === 'corporate-delete') {
      await handleCorporateDelete(req, res);
      return;
    }

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
    const stored = await loadStoredProducerSet(valuationDateUtc);
    const producers = stored.producers;

    let reportedPriceDeckIdByCompanyId: Record<string, string> | undefined;
    if (priceMode === 'REPORTED') {
      reportedPriceDeckIdByCompanyId = {};
      const diagnostics: string[] = [];
      for (const producer of producers) {
        const selected = selectReportedPriceDeckIdForYear(producer, selectedYear);
        if (!selected.id) {
          diagnostics.push(selected.diagnostic ?? `${producer.company.name}: REPORTED price deck unavailable`);
          continue;
        }
        reportedPriceDeckIdByCompanyId[producer.company.id] = selected.id;
      }
      if (diagnostics.length > 0) {
        res.status(400).json({ ok: false, error: 'REPORTED_PRICE_DECK_NOT_AVAILABLE', diagnostics });
        return;
      }
    }

    const result = await buildLiveProducerPeerTable({
      producers,
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
        companies: producers.map((producer) => producer.company.id),
        symbols: stored.symbols,
        sourceContract: 'producer_json_v1_db_only',
      },
      table: result.table,
      intervalEconomicsByCompanyId: result.intervalEconomicsByCompanyId,
      liveDiagnosticsByCompanyId: result.liveDiagnosticsByCompanyId,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
