import { ensureSchema } from "../../../../../api/_migrate.js";
import {
  getPortfolioConfig,
  listPortfolioConfigs,
  updatePortfolioConfig,
} from "../../../../lib/portfolio-admin/repository.js";
import type { PortfolioAdminConfig } from "../../../../lib/portfolio-admin/types.js";
import { validateGlobalTargetWeight } from "../../../../lib/portfolio-admin/validation.js";
import { buildDiagnostics, normalizePortfolioPayload, parseRequestBody } from "./_shared.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const payload = parseRequestBody(req);
    const portfolioId = String(payload?.portfolio_id ?? "").trim();
    if (!portfolioId) {
      res.status(400).json({ ok: false, error: "validation_error", errors: ["portfolio_id is required"] });
      return;
    }

    const existing = await getPortfolioConfig(portfolioId);
    if (!existing) {
      res.status(404).json({ ok: false, error: "portfolio_id not found" });
      return;
    }

    const normalized = normalizePortfolioPayload(payload, existing, "update");
    if (!normalized.ok) {
      res.status(400).json({ ok: false, error: "validation_error", errors: normalized.errors });
      return;
    }

    await updatePortfolioConfig(normalized.value as PortfolioAdminConfig);

    const portfolios = await listPortfolioConfigs();
    const updated = portfolios.find((portfolio) => portfolio.portfolio_id === portfolioId) ?? null;
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolio: updated,
      globalValidation: validateGlobalTargetWeight(portfolios),
      ...(debug ? { diagnostics: buildDiagnostics(portfolios) } : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
