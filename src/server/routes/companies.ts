import { assertAdminSecret } from "../../../api/_auth.js";
import { refreshCompaniesMaster, searchCompaniesByName } from "../../../api/_company_master.js";
import { ensureSchema } from "../../../api/_migrate.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();

    if (req.method === "POST") {
      assertAdminSecret(req);
      const summary = await refreshCompaniesMaster();
      res.status(200).json({ ok: true, ...summary });
      return;
    }

    const q = typeof req.query?.q === "string" ? req.query.q : "";
    if (q.trim().length >= 2) {
      const results = await searchCompaniesByName(q);
      res.status(200).json({ ok: true, results });
      return;
    }

    // Vercel Cron invokes GET requests. Allow authenticated refresh without q.
    assertAdminSecret(req);
    const summary = await refreshCompaniesMaster();
    res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
