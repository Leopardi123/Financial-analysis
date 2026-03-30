import { assertAdminSecret } from "../../../../api/_auth.js";
import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

function normalizeTickers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
}

function deriveStatus(row: Record<string, unknown>) {
  const rawStatus = typeof row.price_data_status === "string" ? row.price_data_status : "pending";
  const lastUpdate = typeof row.price_last_update_at === "string" ? row.price_last_update_at : null;
  if (!lastUpdate) return rawStatus;
  const ageMs = Date.now() - Date.parse(lastUpdate);
  if (rawStatus === "ready" && Number.isFinite(ageMs) && ageMs > 48 * 60 * 60 * 1000) {
    return "stale";
  }
  return rawStatus;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    assertAdminSecret(req);
    await ensureSchema();

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const tickers = normalizeTickers(body.tickers);
    if (tickers.length === 0) {
      res.status(400).json({ ok: false, error: "No tickers provided" });
      return;
    }

    const rows = await query(
      `SELECT ticker, active, price_data_status, price_last_update_at, price_snapshot_at, price_last_error, price_init_requested_at
       FROM ${tables.companiesV2}
       WHERE ticker IN (${tickers.map(() => "?").join(",")})
       ORDER BY ticker`,
      tickers,
    ) as Array<Record<string, unknown>>;

    const data = rows.map((row) => ({
      ticker: String(row.ticker ?? ""),
      active: Number(row.active ?? 0) === 1,
      price_data_status: deriveStatus(row),
      price_last_update_at: row.price_last_update_at ?? null,
      price_snapshot_at: row.price_snapshot_at ?? null,
      price_last_error: row.price_last_error ?? null,
      price_init_requested_at: row.price_init_requested_at ?? null,
    }));

    res.status(200).json({ ok: true, rows: data });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
