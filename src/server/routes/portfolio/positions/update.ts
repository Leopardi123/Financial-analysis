import { ensureSchema } from "../../../../../api/_migrate.js";
import { updatePortfolioPosition } from "../../../../lib/portfolio-positions/repository.js";
import { normalizePositionPayload } from "../../../../lib/portfolio-positions/validation.js";
import { buildPortfolioSnapshots } from "../../../../lib/portfolio-snapshots/build.js";
import { buildPortfolioHistory } from "../../../../lib/portfolio-history/build.js";
import { resolvePositionSymbol } from "../../../../lib/portfolio-positions/symbolResolution.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    await ensureSchema();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const id = Number(body.id ?? NaN);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, error: "id is required" });
      return;
    }

    const normalized = normalizePositionPayload(body);
    if (!normalized.ok) {
      res.status(400).json({ ok: false, errors: normalized.errors });
      return;
    }

    const symbolResolution = await resolvePositionSymbol(normalized.value.symbol);
    normalized.value.resolved_symbol = symbolResolution.resolved_symbol;

    await updatePortfolioPosition(id, normalized.value);
    await buildPortfolioSnapshots();
    await buildPortfolioHistory();
    res.status(200).json({
      ok: true,
      symbol_resolution: symbolResolution,
      warnings: symbolResolution.warnings,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
