import { assertAdminSecret } from "../../../../api/_auth.js";
import { ensureSchema } from "../../../../api/_migrate.js";
import { runAndPersistMacroSnapshots } from "../../../lib/macro/pipeline.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    assertAdminSecret(req);
    await ensureSchema();

    const region = String(req.query?.region ?? "US").toUpperCase();
    if (!["US", "EA", "SE"].includes(region)) {
      res.status(400).json({ ok: false, error: "Supported regions: US, EA, SE" });
      return;
    }

    const asOfDate = String(req.query?.asOfDate ?? "").trim() || undefined;
    const summary = await runAndPersistMacroSnapshots({ region, asOfDate });

    res.status(200).json({
      ok: true,
      mode: "persisted_snapshots",
      ...summary,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
