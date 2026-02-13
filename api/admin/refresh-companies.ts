import { assertAdminSecret } from "../_auth.js";
import { ensureSchema } from "../_migrate.js";
import { refreshCompaniesMaster } from "../_company_master.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    assertAdminSecret(req);
    await ensureSchema();
    const summary = await refreshCompaniesMaster();
    res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
