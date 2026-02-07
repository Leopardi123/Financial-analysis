import { assertCronSecret } from "../_auth.js";
import { ensureSchema } from "../_migrate.js";

export default async function handler(req: any, res: any) {
  try {
    assertCronSecret(req);

    await ensureSchema();

    res.status(200).json({ ok: true });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
