import type { computeProducerCore } from "./_producer_core.js";

type ProducerCore = ReturnType<typeof computeProducerCore>;

function safeDiv(n: number | null, d: number | null): number | null {
  if (n === null || d === null || d === 0) return null;
  return n / d;
}

export function computeRrOverlay(producer: ProducerCore) {
  const p = producer.primitives;
  const rrScale10y = p.latest_annual_revenue === null ? null : p.latest_annual_revenue * 10;
  const rrScaleFlag = rrScale10y === null ? "Unknown" : rrScale10y >= 10_000_000_000 ? "InstitutionalScale" : "Subscale";

  const rrRoceFlag = p.roce === null
    ? "Unknown"
    : p.roce >= 0.2
      ? "Elite"
      : p.roce >= 0.1
        ? "Acceptable"
        : "Destroyer";

  const rrFcfSustaining = p.operating_cash_flow === null || p.capex_abs === null
    ? null
    : p.operating_cash_flow - p.capex_abs - (p.interest_expense_ttm ?? 0);

  const rrNetDebtFcf = rrFcfSustaining !== null && rrFcfSustaining > 0 ? safeDiv(p.net_debt, rrFcfSustaining) : null;
  const fortress = rrNetDebtFcf !== null && p.interest_coverage !== null
    ? rrNetDebtFcf < 1.5 && p.interest_coverage > 5
    : false;

  let classification = "Watchlist";
  if (rrScaleFlag === "InstitutionalScale" && rrRoceFlag === "Elite" && fortress) {
    classification = "Core Candidate";
  } else if (rrRoceFlag === "Destroyer") {
    classification = "Avoid";
  }

  return {
    rr_scale_10y_recoverable_value_usd: rrScale10y,
    rr_scale_flag: rrScaleFlag,
    rr_roce: p.roce,
    rr_roce_flag: rrRoceFlag,
    rr_cost_quartile: null,
    rr_cost_quartile_flags: { missing_benchmark: true },
    rr_reserve_life_years: null,
    rr_reserve_life_flags: { missing_reserves: true },
    rr_unit_margin_current: null,
    rr_margin_buffer_pct: p.operating_margin,
    rr_margin_buffer_flags: { proxy: true },
    rr_stress_flag: null,
    rr_operating_cf_adjusted: p.operating_cash_flow,
    rr_operating_cf_adjusted_flags: { proxy: true },
    rr_fcf_sustaining: rrFcfSustaining,
    rr_fcf_sustaining_flags: { missing_ga_split: true },
    rr_fcf_yield: safeDiv(rrFcfSustaining, p.market_cap),
    rr_ev_fcf: rrFcfSustaining !== null && rrFcfSustaining > 0 ? safeDiv(p.ev, rrFcfSustaining) : null,
    rr_net_debt: p.net_debt,
    rr_net_debt_fcf: rrNetDebtFcf,
    rr_interest_coverage: p.interest_coverage,
    rr_fortress_flag: fortress,
    rr_classification: classification,
    rr_fair_value_1: null,
    rr_fair_value_2: null,
    rr_fair_value_3: null,
    rr_fair_value_flags: {
      fv_requires_prices_and_aisc: true,
      fv3_requires_project_lom: true,
    },
    label: "RR Snapshot (Commodity Strength — MVP)",
    mvp_proxy: true,
  };
}
