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
    const allowed = new Set(["US", "EA", "SE", "GLOBAL"]);
    if (!allowed.has(region)) {
      res.status(400).json({ ok: false, error: "Unsupported region" });
      return;
    }

    const asOfDate = String(req.query?.asOfDate ?? "").trim() || undefined;
    if (region === "GLOBAL") {
      const summaries = await Promise.all(["US", "EA", "SE"].map((r) => runAndPersistMacroSnapshots({ region: r, asOfDate })));
      res.status(200).json({ ok: true, mode: "persisted_snapshots", region, summaries });
      return;
    }

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
