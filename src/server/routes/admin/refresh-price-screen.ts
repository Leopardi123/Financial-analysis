import { assertCronSecret } from "../../../../api/_auth.js";
import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { requireFmpApiKey } from "../../../../api/_fmp.js";
import { ingestManySymbols } from "../../../lib/prices/screening/ingest.js";

export default async function handler(req: any, res: any) {
  try {
    assertCronSecret(req);
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    await ensureSchema();

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const debug = String(req.query?.debug ?? body.debug ?? "") === "1" || body.debug === true;

    const explicitSymbols = Array.isArray(body.symbols)
      ? body.symbols.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean)
      : [];

    let symbols = explicitSymbols;
    if (symbols.length === 0) {
      const rows = await query(
        `SELECT ticker
         FROM ${tables.companiesV2}
         WHERE active = 1
         ORDER BY ticker`,
      ) as unknown as Array<{ ticker: string }>;
      symbols = rows.map((row) => String(row.ticker).trim().toUpperCase()).filter(Boolean);
    }

    if (symbols.length === 0) {
      res.status(200).json({ ok: true, total: 0, succeeded: 0, failed: 0, changedSymbols: 0, writtenDailyRows: 0, snapshotWrites: 0, results: [], failures: [] });
      return;
    }

    const result = await ingestManySymbols({ symbols, debug });
    res.status(result.ok ? 200 : 207).json(result);
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
