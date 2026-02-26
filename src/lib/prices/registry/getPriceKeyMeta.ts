type QueryFn = (sql: string, params?: Array<string | number | null>) => Promise<any[]>;

export interface PriceKeyMeta {
  price_key: string;
  canonical_unit: string;
  kind: string;
  decimals: number;
  description: string;
}

export interface ProviderMapping {
  provider: string;
  provider_symbol: string;
  provider_kind: string;
  provider_unit: string;
  notes: string | null;
}

const UNIT_TOKEN = /(?:^|\s)unit\s*=\s*([A-Z0-9_]+)/i;

function inferCommodityUnitFromSymbol(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  if (upper.includes('HG')) {
    return 'USD_PER_LB';
  }
  if (upper.includes('GC') || upper.includes('SI')) {
    return 'USD_PER_TOZ';
  }
  return null;
}

export function parseProviderUnitFromNotes(notes: string | null | undefined): string | null {
  if (!notes) {
    return null;
  }
  const match = notes.match(UNIT_TOKEN);
  return match ? match[1].toUpperCase() : null;
}

async function defaultQuery(sql: string, params: Array<string | number | null> = []): Promise<any[]> {
  const db = await import('../../../../api/_db.js');
  return db.query(sql, params);
}

export async function getPriceKeyMeta(price_key: string, deps: { queryFn?: QueryFn } = {}): Promise<PriceKeyMeta> {
  const queryFn = deps.queryFn ?? defaultQuery;
  const rows = await queryFn(
    `SELECT price_key, canonical_unit, kind, decimals, description
     FROM price_key_registry
     WHERE price_key = ?
     LIMIT 1`,
    [price_key],
  ) as PriceKeyMeta[];

  if (!rows[0]) {
    throw new Error(`Unknown price key: ${price_key}`);
  }

  return rows[0];
}

export async function getProviderMapping(price_key: string, deps: { queryFn?: QueryFn } = {}): Promise<ProviderMapping> {
  const queryFn = deps.queryFn ?? defaultQuery;
  const rows = await queryFn(
    `SELECT provider, provider_symbol, provider_kind, notes
     FROM price_provider_map
     WHERE price_key = ?
     LIMIT 1`,
    [price_key],
  ) as Array<{ provider: string; provider_symbol: string; provider_kind: string; notes: string | null }>;

  const row = rows[0];
  if (!row) {
    throw new Error(`No provider mapping for price key: ${price_key}`);
  }

  let provider_unit = parseProviderUnitFromNotes(row.notes);
  if (!provider_unit) {
    if (row.provider_kind === 'forex') {
      const parts = price_key.split('_');
      const ccy = parts[parts.length - 1] ?? 'CCY';
      provider_unit = `FX_USD_TO_${ccy.toUpperCase()}`;
    } else if (row.provider_kind === 'commodity') {
      provider_unit = inferCommodityUnitFromSymbol(row.provider_symbol);
      if (!provider_unit) {
        throw new Error(`Missing provider unit for commodity mapping: ${price_key} (${row.provider_symbol})`);
      }
    }
  }

  if (!provider_unit) {
    throw new Error(`Unable to infer provider unit for ${price_key}`);
  }

  return {
    provider: row.provider,
    provider_symbol: row.provider_symbol,
    provider_kind: row.provider_kind,
    provider_unit,
    notes: row.notes,
  };
}
