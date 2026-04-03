import { query } from "../../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../../api/_migrate.js";
import type { AllocationPlanStatus, WeightStatus } from "../../../../lib/portfolio-snapshots/types.js";

function computeAllocationPlanStatus(weightStatuses: WeightStatus[]): AllocationPlanStatus {
  if (weightStatuses.some((status) => status === "critical_underweight" || status === "critical_overweight")) {
    return "materially_outside_allocation_plan";
  }
  if (weightStatuses.some((status) => status === "underweight" || status === "overweight" || status === "unavailable")) {
    return "outside_allocation_plan";
  }
  return "within_allocation_plan";
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();
    const latestRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
    const asOfDate = String(latestRows[0]?.as_of_date ?? "").trim();

    if (!asOfDate) {
      res.status(200).json({
        ok: true,
        portfolios: [],
        total: { total_market_value: 0, allocation_plan_status: "outside_allocation_plan" },
      });
      return;
    }

    const rows = await query(
      `SELECT s.portfolio_id,
              s.market_value,
              s.actual_weight_pct,
              s.target_weight_pct,
              s.min_weight_pct,
              s.max_weight_pct,
              s.weight_status,
              s.rebalance_status,
              a.active,
              a.included_in_total_portfolio,
              s.debug_payload_json
       FROM ${tables.portfolioSnapshots} s
       LEFT JOIN ${tables.portfolioAdminConfig} a ON a.portfolio_id = s.portfolio_id
       WHERE s.as_of_date = ?
       ORDER BY a.sort_order ASC, s.portfolio_id ASC`,
      [asOfDate]
    );

    const portfolios = rows.map((row: any) => ({
      portfolio_id: String(row.portfolio_id ?? ""),
      market_value: row.market_value == null ? null : Number(row.market_value),
      actual_weight_pct: row.actual_weight_pct == null ? null : Number(row.actual_weight_pct),
      target_weight_pct: Number(row.target_weight_pct ?? 0),
      min_weight_pct: Number(row.min_weight_pct ?? 0),
      max_weight_pct: Number(row.max_weight_pct ?? 0),
      weight_status: String(row.weight_status ?? "unavailable"),
      rebalance_status: String(row.rebalance_status ?? "unavailable"),
      active: Number(row.active ?? 0) === 1,
      included_in_total_portfolio: Number(row.included_in_total_portfolio ?? 0) === 1,
      debug_payload_json: row.debug_payload_json == null ? null : String(row.debug_payload_json),
    }));

    const included = portfolios.filter((row) => row.active && row.included_in_total_portfolio);
    const totalMarketValue = included.reduce((sum, row) => sum + (typeof row.market_value === "number" ? row.market_value : 0), 0);
    const allocationPlanStatus = computeAllocationPlanStatus(
      included.map((row) => row.weight_status as WeightStatus)
    );

    const debug = String(req.query?.debug ?? "") === "1";

    res.status(200).json({
      ok: true,
      as_of_date: asOfDate,
      portfolios: portfolios.map(({ active, included_in_total_portfolio, debug_payload_json, ...rest }) => rest),
      total: {
        total_market_value: totalMarketValue,
        allocation_plan_status: allocationPlanStatus,
      },
      ...(debug
        ? {
          diagnostics: {
            total_market_value: totalMarketValue,
            included_portfolios: included.map((row) => row.portfolio_id),
            excluded_portfolios: portfolios
              .filter((row) => !(row.active && row.included_in_total_portfolio))
              .map((row) => row.portfolio_id),
            perPortfolio: portfolios.map((row) => {
              const parsedDebug = row.debug_payload_json ? JSON.parse(row.debug_payload_json) : null;
              return {
                portfolio_id: row.portfolio_id,
                market_value: row.market_value,
                actual_weight_pct: row.actual_weight_pct,
                bandWidth: parsedDebug?.bandWidth ?? null,
                distanceToEdge: parsedDebug?.distanceToEdge ?? null,
                weight_status: row.weight_status,
                rebalance_status: row.rebalance_status,
              };
            }),
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
