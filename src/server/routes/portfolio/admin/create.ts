import { ensureSchema } from "../../../../../api/_migrate.js";
import {
  getPortfolioConfig,
  insertPortfolioConfig,
  listPortfolioConfigs,
} from "../../../../lib/portfolio-admin/repository.js";
import type { PortfolioAdminConfig } from "../../../../lib/portfolio-admin/types.js";
import { validateGlobalTargetWeight } from "../../../../lib/portfolio-admin/validation.js";
import { buildDiagnostics, buildValidationPayload, normalizePortfolioPayload, parseRequestBody } from "./_shared.js";

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
      res.status(400).json({ ok: false, error: buildValidationPayload(["portfolio_id is required"]) });
      return;
    }

    const existing = await getPortfolioConfig(portfolioId);
    if (existing) {
      res.status(409).json({ ok: false, error: "portfolio_id already exists" });
      return;
    }

    const normalized = normalizePortfolioPayload(payload, null, "create");
    if (!normalized.ok) {
      res.status(400).json({ ok: false, error: buildValidationPayload(normalized.errors) });
      return;
    }

    await insertPortfolioConfig(normalized.value as PortfolioAdminConfig);

    const portfolios = await listPortfolioConfigs();
    const created = portfolios.find((portfolio) => portfolio.portfolio_id === portfolioId) ?? null;
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolio: created,
      globalValidation: validateGlobalTargetWeight(portfolios),
      ...(debug ? { diagnostics: buildDiagnostics(portfolios) } : {}),
    });
  } catch (error) {
    const message = (error as Error).message || "Unexpected error";
    if (message.includes("Unsupported type of value")) {
      res.status(400).json({
        ok: false,
        error: buildValidationPayload(["max_hedge_pct must be a finite number or null"], "Please verify numeric inputs"),
      });
      return;
    }
    res.status(500).json({ ok: false, error: message });
  }
}
