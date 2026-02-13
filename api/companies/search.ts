import { searchCompaniesByName } from "../_company_master.js";
import { ensureSchema } from "../_migrate.js";

export default async function handler(req: any, res: any) {
  try {
    const q = typeof req.query?.q === "string" ? req.query.q : "";
    if (q.trim().length < 2) {
      res.status(200).json({ ok: true, results: [] });
      return;
    }

    await ensureSchema();
    const results = await searchCompaniesByName(q);
    res.status(200).json({ ok: true, results });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
