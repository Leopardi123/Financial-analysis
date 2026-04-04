import { ensureSchema } from "../../../../../api/_migrate.js";
import { listPortfolioConfigs } from "../../../../lib/portfolio-admin/repository.js";
import { buildDiagnostics } from "./_shared.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const portfolios = await listPortfolioConfigs();
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolios,
      ...(debug ? { diagnostics: buildDiagnostics(portfolios) } : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
