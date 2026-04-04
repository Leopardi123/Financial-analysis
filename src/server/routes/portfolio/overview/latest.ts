import { ensureSchema } from "../../../../../api/_migrate.js";
import { getPortfolioOverviewLatest } from "../../../../lib/portfolio-overview/latest.js";
import { buildPortfolioSnapshots } from "../../../../lib/portfolio-snapshots/build.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    await buildPortfolioSnapshots();
    const debug = String(req.query?.debug ?? "") === "1";
    const payload = await getPortfolioOverviewLatest(debug);
    res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    const debug = String(req.query?.debug ?? "") === "1";
    const debugMessage = (error as Error).message;
    res.status(500).json({
      ok: false,
      error: {
        type: "data_access_error",
        message: "Portfolio data is temporarily unavailable.",
        ...(debug ? { debugMessage } : {}),
      },
    });
  }
}
