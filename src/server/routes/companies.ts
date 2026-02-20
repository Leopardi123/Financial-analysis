import { refreshCompaniesMaster, searchCompaniesByName } from "../../../api/_company_master.js";
import { ensureSchema } from "../../../api/_migrate.js";

function extractBearer(authHeader: string | string[] | undefined) {
  if (typeof authHeader !== "string") {
    return null;
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function assertCompaniesSyncSecret(req: { headers: Record<string, string | string[] | undefined> }) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers["x-cron-secret"];
  const normalized = Array.isArray(provided) ? provided[0] : provided;
  const bearer = extractBearer(req.headers.authorization);

  if (!secret || (normalized !== secret && bearer !== secret)) {
    const error = new Error("Unauthorized: missing or invalid x-cron-secret header");
    (error as Error & { status?: number; header?: string }).status = 401;
    (error as Error & { status?: number; header?: string }).header = "x-cron-secret";
    throw error;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();

    if (req.method === "POST") {
      assertCompaniesSyncSecret(req);
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
    assertCompaniesSyncSecret(req);
    const summary = await refreshCompaniesMaster();
    res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({
      ok: false,
      error: (error as Error).message,
      header: (error as Error & { header?: string }).header ?? undefined,
    });
  }
}
