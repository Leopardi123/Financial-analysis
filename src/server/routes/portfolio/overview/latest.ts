import { ensureSchema } from "../../../../../api/_migrate.js";
import { getPortfolioOverviewLatest } from "../../../../lib/portfolio-overview/latest.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const debug = String(req.query?.debug ?? "") === "1";
    const payload = await getPortfolioOverviewLatest(debug);
    res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
