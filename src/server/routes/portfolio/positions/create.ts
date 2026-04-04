import { ensureSchema } from "../../../../../api/_migrate.js";
import { createPortfolioPosition } from "../../../../lib/portfolio-positions/repository.js";
import { normalizePositionPayload } from "../../../../lib/portfolio-positions/validation.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    await ensureSchema();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const normalized = normalizePositionPayload(body);
    if (!normalized.ok) {
      res.status(400).json({ ok: false, errors: normalized.errors });
      return;
    }

    await createPortfolioPosition(normalized.value);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
