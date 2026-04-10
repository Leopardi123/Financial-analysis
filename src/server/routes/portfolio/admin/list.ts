import { ensureSchema } from "../../../../../api/_migrate.js";
import { loadPortfolioConfigSourceOfTruth } from "../../../../lib/portfolio-admin/repository.js";
import { buildDiagnostics } from "./_shared.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const configSource = await loadPortfolioConfigSourceOfTruth();
    const portfolios = configSource.portfolios;
    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      portfolios,
      ...(debug
        ? {
          diagnostics: {
            ...buildDiagnostics(portfolios),
            endpoint_name: "/api/portfolio/admin/list",
            route_file: "src/server/routes/portfolio/admin/list.ts",
            function_name: configSource.diagnostics.function_name,
            database_url_masked: configSource.diagnostics.database_url_masked,
            source_table_names: configSource.diagnostics.source_table_names,
            exact_query_purpose: configSource.diagnostics.query_purpose,
            rows_found: configSource.diagnostics.rows_found,
            setup_state_returned: portfolios.length > 0 ? "configured" : "no_config",
            portfolio_ids_returned: configSource.diagnostics.portfolio_ids_returned,
            zero_rows_reason: portfolios.length > 0 ? null : "portfolio_admin_config_query_returned_zero_rows",
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
