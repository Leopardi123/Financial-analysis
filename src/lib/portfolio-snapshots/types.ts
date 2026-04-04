import type { RebalanceMode } from "../portfolio-admin/types.js";

export type WeightStatus =
  | "within_band"
  | "watch"
  | "underweight"
  | "overweight"
  | "critical_underweight"
  | "critical_overweight"
  | "unavailable";

export type RebalanceStatus = "no_action" | "monitor" | "rebalance_soon" | "rebalance_now" | "unavailable";

export type SignalCompleteness = "full" | "partial" | "unavailable";

export type AllocationPlanStatus =
  | "within_allocation_plan"
  | "outside_allocation_plan"
  | "materially_outside_allocation_plan";

export type SnapshotBuildRow = {
  portfolio_id: string;
  as_of_date: string;
  market_value: number | null;
  actual_weight_pct: number | null;
  target_weight_pct: number;
  min_weight_pct: number;
  max_weight_pct: number;
  weight_status: WeightStatus;
  rebalance_status: RebalanceStatus;
  signal_completeness: SignalCompleteness;
  cash_value: number | null;
  cash_weight_pct: number | null;
  debug_payload_json: string | null;
  rebalance_mode: RebalanceMode;
  active: boolean;
  included_in_total_portfolio: boolean;
};
