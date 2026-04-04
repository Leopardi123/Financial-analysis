import { getDb } from "../../../../api/_db.js";
import { normalizeName } from "../../../../api/_company_master.js";

type SearchRow = {
  symbol?: unknown;
  company_id?: unknown;
  ticker?: unknown;
  name?: unknown;
  exchange?: unknown;
  type?: unknown;
};

type CachedEntry = {
  expiresAt: number;
  results: Array<{ symbol: string; name: string; exchange: string | null; type: string | null; company_id: number | null }>;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_KEYS = 200;
const cache = new Map<string, CachedEntry>();

function setCache(key: string, value: CachedEntry) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX_KEYS) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      cache.delete(oldest);
    }
  }
}

export default async function handler(req: any, res: any) {
  const startedAt = Date.now();
  let tAuthMs = 0;
  let tDbConnectMs = 0;
  let tDbQueryMs = 0;
  let tSerializeMs = 0;
  const routeKey = "companies/search";

  const respond = (status: number, payload: Record<string, unknown>) => {
    const serializeStart = Date.now();
    const withTimings = {
      ...payload,
      timings: {
        t_total_ms: Date.now() - startedAt,
        t_auth_ms: tAuthMs,
        t_db_connect_ms: tDbConnectMs,
        t_db_query_ms: tDbQueryMs,
        t_serialize_ms: 0,
      },
    };
    tSerializeMs = Date.now() - serializeStart;
    (withTimings.timings as Record<string, number>).t_serialize_ms = tSerializeMs;
    (withTimings.timings as Record<string, number>).t_total_ms = Date.now() - startedAt;

    res.setHeader("x-t-total-ms", String((withTimings.timings as Record<string, number>).t_total_ms));
    res.setHeader("x-t-db-ms", String(tDbQueryMs));
    res.setHeader("x-t-routekey", routeKey);
    res.status(status).json(withTimings);
  };

  try {
    const q = typeof req.query?.q === "string" ? req.query.q : "";
    const text = q.trim();
    if (text.length < 2) {
      respond(200, { ok: true, results: [], cacheHit: false });
      return;
    }

    const normalized = normalizeName(text);
    const cacheKey = normalized || text.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      respond(200, { ok: true, results: cached.results, cacheHit: true });
      return;
    }

    const dbConnectStart = Date.now();
    const db = getDb();
    tDbConnectMs = Date.now() - dbConnectStart;

    const dbQueryStart = Date.now();
    const rows = await db.execute({
      sql: `SELECT
              v2.ticker AS symbol,
              COALESCE(c.name, v2.ticker) AS name,
              c.exchange AS exchange,
              c.type AS type,
              v2.id AS company_id
            FROM companies_v2 v2
            LEFT JOIN companies c ON c.symbol = v2.ticker
            WHERE v2.active = 1
              AND (
                UPPER(v2.ticker) LIKE ?
                OR LOWER(COALESCE(c.name, v2.ticker)) LIKE ?
                OR c.normalized_name LIKE ?
              )
            ORDER BY
              CASE WHEN UPPER(v2.ticker) = ? THEN 0 ELSE 1 END,
              CASE WHEN UPPER(v2.ticker) LIKE ? THEN 0 ELSE 1 END,
              v2.ticker ASC
            LIMIT 20`,
      args: [
        `%${text.toUpperCase()}%`,
        `%${text.toLowerCase()}%`,
        `%${cacheKey}%`,
        text.toUpperCase(),
        `${text.toUpperCase()}%`,
      ],
    });
    tDbQueryMs = Date.now() - dbQueryStart;

    const results = (rows.rows as SearchRow[]).map((row) => ({
      symbol: String(row.symbol ?? row.ticker ?? "").toUpperCase(),
      name: String(row.name ?? row.ticker ?? ""),
      exchange: row.exchange ? String(row.exchange) : null,
      type: row.type ? String(row.type) : null,
      company_id: Number.isInteger(Number(row.company_id ?? NaN)) ? Number(row.company_id) : null,
    })).filter((row) => row.symbol.length > 0);

    setCache(cacheKey, { results, expiresAt: Date.now() + CACHE_TTL_MS });
    respond(200, { ok: true, results, cacheHit: false });
  } catch (error) {
    respond(500, { ok: false, error: (error as Error).message });
  }
}
