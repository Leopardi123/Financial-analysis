import { assertCronSecret } from "../../../../api/_auth.js";
import { query, execute } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { fetchApiV3Json, requireFmpApiKey } from "../../../../api/_fmp.js";
import { getLegacySymbolForPriceKey } from "../../../lib/prices/providers/legacyCommoditySymbolMap.js";

type Mode = "latest" | "recent" | "full";

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function minusDays(days: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString().slice(0, 10);
}

function normalizeFxSymbolInput(raw: unknown): string {
  const text = String(raw ?? "").trim().toUpperCase();
  if (!text) return "";
  const mapped = getLegacySymbolForPriceKey(text);
  if (mapped) return mapped.trim().toUpperCase();
  const compact = text.replace(/[\s_\/-]/g, "");
  return compact;
}

function normalizeMode(raw: unknown): Mode {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "latest" || value === "recent" || value === "full") return value;
  return "recent";
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    assertCronSecret(req);
    requireFmpApiKey();
    await ensureSchema();

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const symbol = normalizeFxSymbolInput(body.symbol);
    const mode = normalizeMode(body.mode);
    const quoteCurrency = symbol.length === 6 ? symbol.slice(3, 6) : null;

    if (!/^[A-Z]{6}$/.test(symbol)) {
      res.status(400).json({ ok: false, status: "error", error: "Invalid FX symbol. Use 6-letter pair (e.g. USDSEK, CADSEK, CADUSD)." });
      return;
    }

    const fromDefault = mode === "latest"
      ? minusDays(45)
      : mode === "full"
        ? minusDays(365 * 15)
        : minusDays(365 * 3);
    const toDefault = todayUtc();

    const from = isValidIsoDate(body.from) ? String(body.from) : fromDefault;
    const to = isValidIsoDate(body.to) ? String(body.to) : toDefault;

    const payload = await fetchApiV3Json<Array<Record<string, unknown>>>(`historical-chart/1day/${encodeURIComponent(symbol)}`, { from, to });
    const normalizedRows = (Array.isArray(payload) ? payload : [])
      .map((row) => {
        const priceDate = typeof row.date === "string" ? row.date.slice(0, 10) : "";
        const close = Number(row.close ?? NaN);
        const adjustedClose = Number(row.adjClose ?? NaN);
        const volume = Number(row.volume ?? NaN);
        if (!isValidIsoDate(priceDate) || !Number.isFinite(close) || close <= 0) return null;
        return {
          symbol,
          price_date: priceDate,
          close,
          adjusted_close: Number.isFinite(adjustedClose) ? adjustedClose : null,
          volume: Number.isFinite(volume) ? volume : null,
          source: "fmp",
          currency: quoteCurrency,
        };
      })
      .filter((row): row is { symbol: string; price_date: string; close: number; adjusted_close: number | null; volume: number | null; source: string; currency: string | null } => row !== null)
      .sort((a, b) => a.price_date.localeCompare(b.price_date));

    if (normalizedRows.length === 0) {
      res.status(200).json({
        ok: false,
        status: "error",
        symbol,
        mode,
        from,
        to,
        rows_inserted: 0,
        rows_updated: 0,
        rows_unchanged: 0,
        earliest_date_loaded: null,
        latest_date_loaded: null,
        error: "No FX history returned for requested range.",
        next_step: "Verify symbol format and provider coverage, then retry.",
      });
      return;
    }

    const existingRows = await query(
      `SELECT price_date, close, adjusted_close, volume
       FROM ${tables.dailyPriceHistory}
       WHERE symbol = ? AND price_date >= ? AND price_date <= ?`,
      [symbol, normalizedRows[0].price_date, normalizedRows[normalizedRows.length - 1].price_date],
    ) as Array<{ price_date?: unknown; close?: unknown; adjusted_close?: unknown; volume?: unknown }>;

    const existingByDate = new Map(existingRows.map((row) => [String(row.price_date ?? ""), row]));
    const now = new Date().toISOString();

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const row of normalizedRows) {
      const existing = existingByDate.get(row.price_date);
      if (!existing) {
        await execute(
          `INSERT INTO ${tables.dailyPriceHistory}
            (symbol, price_date, close, adjusted_close, volume, source, currency, updated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(symbol, price_date) DO UPDATE SET
             close = excluded.close,
             adjusted_close = excluded.adjusted_close,
             volume = excluded.volume,
             source = excluded.source,
             currency = excluded.currency,
             updated_at = excluded.updated_at`,
          [row.symbol, row.price_date, row.close, row.adjusted_close, row.volume, row.source, row.currency, now, now],
        );
        inserted += 1;
        continue;
      }

      const changed = Number(existing.close ?? NaN) !== row.close
        || Number(existing.adjusted_close ?? NaN) !== Number(row.adjusted_close ?? NaN)
        || Number(existing.volume ?? NaN) !== Number(row.volume ?? NaN);

      if (!changed) {
        unchanged += 1;
        continue;
      }

      await execute(
        `UPDATE ${tables.dailyPriceHistory}
         SET close = ?, adjusted_close = ?, volume = ?, source = ?, currency = ?, updated_at = ?
         WHERE symbol = ? AND price_date = ?`,
        [row.close, row.adjusted_close, row.volume, row.source, row.currency, now, row.symbol, row.price_date],
      );
      updated += 1;
    }

    res.status(200).json({
      ok: true,
      status: "success",
      symbol,
      mode,
      from,
      to,
      rows_inserted: inserted,
      rows_updated: updated,
      rows_unchanged: unchanged,
      earliest_date_loaded: normalizedRows[0]?.price_date ?? null,
      latest_date_loaded: normalizedRows[normalizedRows.length - 1]?.price_date ?? null,
      source: "fmp historical-chart/1day",
      table: tables.dailyPriceHistory,
      next_step: "Next step: rebuild portfolio history.",
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, status: "error", error: (error as Error).message });
  }
}
