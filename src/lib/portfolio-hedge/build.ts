import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { getLatestPortfolioRisk } from "../portfolio-risk/build.js";

type HedgeSignal =
  | "hedge_not_needed"
  | "consider_hedge"
  | "hedge_recommended"
  | "hedge_urgent"
  | "reduce_exposure"
  | "rebalance_to_cash"
  | "increase_dry_powder"
  | "rotate_to_defensive_bucket"
  | "insufficient_data_for_hedge_signal"
  | "rebalance_to_defensive_bucket";

type DryPowderStatus =
  | "insufficient_dry_powder"
  | "adequate_dry_powder"
  | "deployable_cash_available"
  | "elevated_cash_buffer"
  | "unavailable";

type PortfolioHedgeRow = {
  portfolio_id: string;
  as_of_date: string;
  active: boolean;
  included_in_total_portfolio: boolean;
  portfolio_type: string;
  actual_weight_pct: number | null;
  hedging_allowed: boolean;
  allowed_hedge_types: string[];
  hedge_purposes: string[];
  hedge_need_score: number | null;
  hedge_status: HedgeSignal;
  suggested_hedge_type: string | null;
  hedge_policy_applied: "direct_policy" | "fallback_policy" | "insufficient_data";
  allows_direct_hedge: boolean;
};

function asNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJsonArray(input: unknown): string[] {
  if (typeof input !== "string") return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function riskContribution(riskStatus: string | null): number | null {
  switch (riskStatus) {
    case "calm": return 0;
    case "elevated": return 1;
    case "high": return 2;
    case "critical": return 3;
    default: return null;
  }
}

function trendContribution(trendStatus: string | null): number | null {
  switch (trendStatus) {
    case "strong_uptrend":
    case "improving":
      return 0;
    case "neutral":
      return 1;
    case "weakening":
      return 2;
    case "downtrend":
      return 3;
    default:
      return null;
  }
}

function weightContribution(weightStatus: string | null): number {
  switch (weightStatus) {
    case "underweight":
    case "overweight":
      return 1;
    case "critical_underweight":
    case "critical_overweight":
      return 2;
    default:
      return 0;
  }
}

function mapHedgeScoreToStatus(score: number): HedgeSignal {
  if (score <= 2) return "hedge_not_needed";
  if (score <= 4) return "consider_hedge";
  if (score <= 6) return "hedge_recommended";
  return "hedge_urgent";
}

function fallbackStatus(raw: HedgeSignal, portfolioType: string): HedgeSignal {
  if (raw === "hedge_not_needed") return "hedge_not_needed";
  if (raw === "consider_hedge") return "reduce_exposure";
  if (raw === "hedge_recommended") return "rebalance_to_cash";
  if (portfolioType === "stable_income") return "rotate_to_defensive_bucket";
  return "increase_dry_powder";
}

function pickSuggestedHedgeType(allowedTypes: string[], purposes: string[]): string | null {
  const hasPurpose = (items: string[]) => purposes.some((purpose) => items.includes(purpose));
  const pickFirst = (candidates: string[]) => candidates.find((candidate) => allowedTypes.includes(candidate)) ?? null;

  if (hasPurpose(["market_drawdown"])) {
    const pick = pickFirst(["index_put", "inverse_etf", "index_short", "cash"]);
    if (pick) return pick;
  }

  if (hasPurpose(["inflation_shock", "deflationary_stress"])) {
    const pick = pickFirst(["gold", "cash", "usd"]);
    if (pick) return pick;
  }

  if (hasPurpose(["usd_strength"])) {
    const pick = pickFirst(["usd", "cash"]);
    if (pick) return pick;
  }

  if (hasPurpose(["commodity_downturn"])) {
    const pick = pickFirst(["commodity_put", "producer_pair_hedge", "cash"]);
    if (pick) return pick;
  }

  return allowedTypes[0] ?? null;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [name]);
  return rows.length > 0;
}

async function macroOverlayContribution(snapshotDate: string): Promise<{ value: number; available: boolean }> {
  const exists = await tableExists("macro_regime_input");
  if (!exists) return { value: 0, available: false };
  let rows: any[] = [];
  try {
    rows = await query(
      `SELECT macro_regime
       FROM macro_regime_input
       WHERE as_of_date <= ?
       ORDER BY as_of_date DESC
       LIMIT 1`,
      [snapshotDate]
    ) as any[];
  } catch {
    return { value: 0, available: false };
  }
  const regime = String(rows[0]?.macro_regime ?? "").trim();
  if (!regime) return { value: 0, available: false };

  if (["contraction", "stagflation", "risk_off", "inflation_stress"].includes(regime)) {
    return { value: 1, available: true };
  }
  return { value: 0, available: true };
}

async function sectorOverlayContribution(snapshotDate: string, portfolioType: string): Promise<{ value: number; available: boolean }> {
  const exists = await tableExists("sector_regime_input");
  if (!exists) return { value: 0, available: false };
  let rows: any[] = [];
  try {
    rows = await query(
      `SELECT sector_regime
       FROM sector_regime_input
       WHERE as_of_date <= ? AND (regime_key = ? OR sector_id = ? OR portfolio_type = ?)
       ORDER BY as_of_date DESC
       LIMIT 1`,
      [snapshotDate, portfolioType, portfolioType, portfolioType]
    ) as any[];
  } catch {
    return { value: 0, available: false };
  }
  const regime = String(rows[0]?.sector_regime ?? "").trim();
  if (!regime) return { value: 0, available: false };

  if (["weakening", "contraction", "late_cycle", "risk_off"].includes(regime)) {
    return { value: 1, available: true };
  }
  return { value: 0, available: true };
}

function severityFromStatus(status: HedgeSignal): number {
  switch (status) {
    case "consider_hedge":
    case "reduce_exposure":
      return 1;
    case "hedge_recommended":
    case "rebalance_to_cash":
    case "rotate_to_defensive_bucket":
      return 2;
    case "hedge_urgent":
    case "increase_dry_powder":
      return 3;
    default:
      return 0;
  }
}

function requiredDryPowderMin(totalRiskStatus: string | null): { min: number; partialReason: string | null } {
  switch (totalRiskStatus) {
    case "calm": return { min: 5, partialReason: null };
    case "elevated": return { min: 8, partialReason: null };
    case "high": return { min: 12, partialReason: null };
    case "critical": return { min: 15, partialReason: null };
    default: return { min: 5, partialReason: "total_risk_unavailable_used_calm_baseline" };
  }
}

function classifyDryPowder(dp: number, min: number): DryPowderStatus {
  if (dp < min) return "insufficient_dry_powder";
  if (dp < min + 5) return "adequate_dry_powder";
  if (dp < min + 12) return "deployable_cash_available";
  return "elevated_cash_buffer";
}

export async function buildPortfolioHedgeAndDryPowder() {
  const latestSnapshotRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
  const snapshotDate = String(latestSnapshotRows[0]?.as_of_date ?? "").trim();

  if (!snapshotDate) {
    return {
      portfolios: [] as PortfolioHedgeRow[],
      total: {
        total_hedge_signal: "insufficient_data_for_hedge_signal" as HedgeSignal,
        weighted_average_hedge_severity: null,
        dry_powder_status: "unavailable" as DryPowderStatus,
        opportunistic_weight_pct: null,
        required_min_dry_powder_pct: null,
      },
      debug: { portfolios: [] as any[], total: {} },
    };
  }

  const macroOverlay = await macroOverlayContribution(snapshotDate);

  const rows = await query(
    `SELECT s.portfolio_id, s.as_of_date, s.actual_weight_pct, s.weight_status, s.trend_status, s.risk_status,
            a.portfolio_type, a.active, a.included_in_total_portfolio,
            a.hedging_allowed, a.allowed_hedge_types_json, a.hedge_purpose_json
     FROM ${tables.portfolioSnapshots} s
     LEFT JOIN ${tables.portfolioAdminConfig} a ON a.portfolio_id = s.portfolio_id
     WHERE s.as_of_date = ?
     ORDER BY s.portfolio_id ASC`,
    [snapshotDate]
  );

  const out: PortfolioHedgeRow[] = [];
  const debugPortfolios: any[] = [];

  for (const row of rows as any[]) {
    const portfolioId = String(row.portfolio_id ?? "");
    const portfolioType = String(row.portfolio_type ?? "");
    const active = Number(row.active ?? 0) === 1;
    const included = Number(row.included_in_total_portfolio ?? 0) === 1;
    const hedgingAllowed = Number(row.hedging_allowed ?? 0) === 1;
    const allowedTypes = parseJsonArray(row.allowed_hedge_types_json);
    const hedgePurposes = parseJsonArray(row.hedge_purpose_json);

    const riskStatus = row.risk_status == null ? null : String(row.risk_status);
    const trendStatus = row.trend_status == null ? null : String(row.trend_status);
    const wStatus = row.weight_status == null ? null : String(row.weight_status);

    const riskPart = riskContribution(riskStatus);
    const trendPart = trendContribution(trendStatus);
    const weightPart = weightContribution(wStatus);
    const sectorOverlay = await sectorOverlayContribution(snapshotDate, portfolioType);

    let hedgeNeedScore: number | null = null;
    let rawStatus: HedgeSignal = "insufficient_data_for_hedge_signal";
    let finalStatus: HedgeSignal = "insufficient_data_for_hedge_signal";
    let suggested: string | null = null;
    let policyApplied: PortfolioHedgeRow["hedge_policy_applied"] = "insufficient_data";
    let completeness: "full" | "partial" | "unavailable" = "unavailable";

    if (riskPart !== null && trendPart !== null) {
      hedgeNeedScore = riskPart + trendPart + weightPart + macroOverlay.value + sectorOverlay.value;
      rawStatus = mapHedgeScoreToStatus(hedgeNeedScore);

      const allowsDirect = hedgingAllowed && allowedTypes.length > 0;
      if (allowsDirect) {
        finalStatus = rawStatus;
        suggested = pickSuggestedHedgeType(allowedTypes, hedgePurposes);
        policyApplied = "direct_policy";
      } else {
        finalStatus = fallbackStatus(rawStatus, portfolioType);
        suggested = null;
        policyApplied = "fallback_policy";
      }
      completeness = macroOverlay.available && sectorOverlay.available ? "full" : "partial";
    }

    const allowsDirect = hedgingAllowed && allowedTypes.length > 0;

    await execute(
      `UPDATE ${tables.portfolioSnapshots}
       SET hedge_need_score = ?,
           hedge_status = ?,
           suggested_hedge_type = ?,
           hedge_policy_applied = ?,
           hedge_debug_json = ?
       WHERE portfolio_id = ? AND as_of_date = ?`,
      [
        hedgeNeedScore,
        finalStatus,
        suggested,
        policyApplied,
        JSON.stringify({
          portfolio_id: portfolioId,
          inputs: {
            risk_status: riskStatus,
            trend_status: trendStatus,
            weight_status: wStatus,
            hedging_allowed: hedgingAllowed,
            allowed_hedge_types: allowedTypes,
            hedge_purposes: hedgePurposes,
          },
          score_components: {
            risk_contribution: riskPart,
            trend_contribution: trendPart,
            weight_contribution: weightPart,
            macro_overlay_contribution: macroOverlay.value,
            sector_overlay_contribution: sectorOverlay.value,
          },
          hedge_need_score: hedgeNeedScore,
          raw_hedge_status: rawStatus,
          final_hedge_status: finalStatus,
          suggested_hedge_type: suggested,
          hedge_policy_applied: policyApplied,
          signal_completeness: completeness,
        }),
        portfolioId,
        snapshotDate,
      ]
    );

    out.push({
      portfolio_id: portfolioId,
      as_of_date: snapshotDate,
      active,
      included_in_total_portfolio: included,
      portfolio_type: portfolioType,
      actual_weight_pct: asNum(row.actual_weight_pct),
      hedging_allowed: hedgingAllowed,
      allowed_hedge_types: allowedTypes,
      hedge_purposes: hedgePurposes,
      hedge_need_score: hedgeNeedScore,
      hedge_status: finalStatus,
      suggested_hedge_type: suggested,
      hedge_policy_applied: policyApplied,
      allows_direct_hedge: allowsDirect,
    });

    debugPortfolios.push({
      portfolio_id: portfolioId,
      inputs: {
        risk_status: riskStatus,
        trend_status: trendStatus,
        weight_status: wStatus,
        hedging_allowed: hedgingAllowed,
        allowed_hedge_types: allowedTypes,
        hedge_purposes: hedgePurposes,
      },
      score_components: {
        risk_contribution: riskPart,
        trend_contribution: trendPart,
        weight_contribution: weightPart,
        macro_overlay_contribution: macroOverlay.value,
        sector_overlay_contribution: sectorOverlay.value,
      },
      hedge_need_score: hedgeNeedScore,
      raw_hedge_status: rawStatus,
      final_hedge_status: finalStatus,
      suggested_hedge_type: suggested,
      hedge_policy_applied: policyApplied,
      signal_completeness: completeness,
    });
  }

  const included = out.filter((item) => item.active && item.included_in_total_portfolio);
  const severityRows = included.map((item) => ({
    portfolio_id: item.portfolio_id,
    actual_weight_pct: item.actual_weight_pct ?? 0,
    severity_score: severityFromStatus(item.hedge_status),
    hedge_status: item.hedge_status,
  }));

  const totalWeight = severityRows.reduce((sum, row) => sum + row.actual_weight_pct, 0);
  const weightedAvgSeverity = totalWeight > 0
    ? severityRows.reduce((sum, row) => sum + row.severity_score * row.actual_weight_pct, 0) / totalWeight
    : null;

  const urgentOverride = severityRows.some((row) => row.actual_weight_pct > 20 && (row.hedge_status === "hedge_urgent" || row.hedge_status === "increase_dry_powder"));

  let totalHedgeSignal: HedgeSignal = "hedge_not_needed";
  if (urgentOverride) {
    totalHedgeSignal = "hedge_urgent";
  } else if ((weightedAvgSeverity ?? 0) >= 2.0) {
    totalHedgeSignal = "hedge_recommended";
  } else if ((weightedAvgSeverity ?? 0) >= 1.0) {
    totalHedgeSignal = "consider_hedge";
  }

  const anyDirectAllowed = included.some((item) => item.allows_direct_hedge);
  if ((totalHedgeSignal === "hedge_recommended" || totalHedgeSignal === "hedge_urgent") && !anyDirectAllowed) {
    totalHedgeSignal = (weightedAvgSeverity ?? 0) >= 2.5 ? "increase_dry_powder" : "rebalance_to_defensive_bucket";
  }

  const risk = await getLatestPortfolioRisk();
  const totalRiskStatus = risk.total.total_risk_status;
  const dryMin = requiredDryPowderMin(totalRiskStatus);

  const opportunistic = included.find((item) => item.portfolio_type === "opportunistic") ?? null;
  const opportunisticWeight = opportunistic?.actual_weight_pct ?? null;
  const dryPowderStatus: DryPowderStatus = typeof opportunisticWeight === "number"
    ? classifyDryPowder(opportunisticWeight, dryMin.min)
    : "unavailable";

  return {
    portfolios: out,
    total: {
      total_hedge_signal: totalHedgeSignal,
      weighted_average_hedge_severity: weightedAvgSeverity,
      dry_powder_status: dryPowderStatus,
      opportunistic_weight_pct: opportunisticWeight,
      required_min_dry_powder_pct: typeof opportunisticWeight === "number" ? dryMin.min : null,
    },
    debug: {
      portfolios: debugPortfolios,
      total: {
        included_portfolios: included.map((item) => item.portfolio_id),
        portfolio_severity_map: severityRows,
        weighted_average_hedge_severity: weightedAvgSeverity,
        urgent_override_triggered: urgentOverride,
        total_hedge_signal: totalHedgeSignal,
        dry_powder: {
          opportunistic_weight_pct: opportunisticWeight,
          total_risk_status: totalRiskStatus,
          required_min_pct: typeof opportunisticWeight === "number" ? dryMin.min : null,
          dry_powder_status: dryPowderStatus,
          partial_reason: dryMin.partialReason,
        },
      },
    },
  };
}

export async function getLatestPortfolioHedgeAndDryPowder() {
  const latestSnapshotRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
  const snapshotDate = String(latestSnapshotRows[0]?.as_of_date ?? "").trim();
  if (!snapshotDate) {
    return {
      portfolios: [] as any[],
      total: {
        total_hedge_signal: "insufficient_data_for_hedge_signal" as HedgeSignal,
        weighted_average_hedge_severity: null,
        dry_powder_status: "unavailable" as DryPowderStatus,
        opportunistic_weight_pct: null,
        required_min_dry_powder_pct: null,
      },
      debug: { portfolios: [], total: {} },
    };
  }

  const rows = await query(
    `SELECT s.portfolio_id, s.as_of_date, s.hedge_need_score, s.hedge_status, s.suggested_hedge_type,
            s.hedge_policy_applied, s.hedge_debug_json, s.actual_weight_pct,
            a.active, a.included_in_total_portfolio, a.portfolio_type, a.hedging_allowed,
            a.allowed_hedge_types_json, a.hedge_purpose_json
     FROM ${tables.portfolioSnapshots} s
     LEFT JOIN ${tables.portfolioAdminConfig} a ON a.portfolio_id = s.portfolio_id
     WHERE s.as_of_date = ?
     ORDER BY s.portfolio_id ASC`,
    [snapshotDate]
  );

  const portfolios = rows.map((row: any): PortfolioHedgeRow => {
    const hedgingAllowed = Number(row.hedging_allowed ?? 0) === 1;
    const allowedTypes = parseJsonArray(row.allowed_hedge_types_json);
    return {
      portfolio_id: String(row.portfolio_id ?? ""),
      as_of_date: String(row.as_of_date ?? ""),
      active: Number(row.active ?? 0) === 1,
      included_in_total_portfolio: Number(row.included_in_total_portfolio ?? 0) === 1,
      portfolio_type: String(row.portfolio_type ?? ""),
      actual_weight_pct: asNum(row.actual_weight_pct),
      hedging_allowed: hedgingAllowed,
      allowed_hedge_types: allowedTypes,
      hedge_purposes: parseJsonArray(row.hedge_purpose_json),
      hedge_need_score: asNum(row.hedge_need_score),
      hedge_status: String(row.hedge_status ?? "insufficient_data_for_hedge_signal") as HedgeSignal,
      suggested_hedge_type: row.suggested_hedge_type == null ? null : String(row.suggested_hedge_type),
      hedge_policy_applied: String(row.hedge_policy_applied ?? "insufficient_data") as PortfolioHedgeRow["hedge_policy_applied"],
      allows_direct_hedge: hedgingAllowed && allowedTypes.length > 0,
    };
  });

  const included = portfolios.filter((item) => item.active && item.included_in_total_portfolio);
  const severityRows = included.map((item) => ({
    portfolio_id: item.portfolio_id,
    actual_weight_pct: item.actual_weight_pct ?? 0,
    severity_score: severityFromStatus(item.hedge_status),
    hedge_status: item.hedge_status,
  }));

  const totalWeight = severityRows.reduce((sum, row) => sum + row.actual_weight_pct, 0);
  const weightedAvgSeverity = totalWeight > 0
    ? severityRows.reduce((sum, row) => sum + row.severity_score * row.actual_weight_pct, 0) / totalWeight
    : null;

  const urgentOverride = severityRows.some((row) => row.actual_weight_pct > 20 && (row.hedge_status === "hedge_urgent" || row.hedge_status === "increase_dry_powder"));

  let totalHedgeSignal: HedgeSignal = "hedge_not_needed";
  if (urgentOverride) totalHedgeSignal = "hedge_urgent";
  else if ((weightedAvgSeverity ?? 0) >= 2.0) totalHedgeSignal = "hedge_recommended";
  else if ((weightedAvgSeverity ?? 0) >= 1.0) totalHedgeSignal = "consider_hedge";

  const anyDirectAllowed = included.some((item) => item.allows_direct_hedge);
  if ((totalHedgeSignal === "hedge_recommended" || totalHedgeSignal === "hedge_urgent") && !anyDirectAllowed) {
    totalHedgeSignal = (weightedAvgSeverity ?? 0) >= 2.5 ? "increase_dry_powder" : "rebalance_to_defensive_bucket";
  }

  const risk = await getLatestPortfolioRisk();
  const totalRiskStatus = risk.total.total_risk_status;
  const dryMin = requiredDryPowderMin(totalRiskStatus);

  const opportunistic = included.find((item) => item.portfolio_type === "opportunistic") ?? null;
  const opportunisticWeight = opportunistic?.actual_weight_pct ?? null;
  const dryPowderStatus: DryPowderStatus = typeof opportunisticWeight === "number"
    ? classifyDryPowder(opportunisticWeight, dryMin.min)
    : "unavailable";

  return {
    portfolios,
    total: {
      total_hedge_signal: totalHedgeSignal,
      weighted_average_hedge_severity: weightedAvgSeverity,
      dry_powder_status: dryPowderStatus,
      opportunistic_weight_pct: opportunisticWeight,
      required_min_dry_powder_pct: typeof opportunisticWeight === "number" ? dryMin.min : null,
    },
    debug: {
      portfolios: rows.map((row: any) => {
        if (typeof row.hedge_debug_json !== "string" || !row.hedge_debug_json.trim()) {
          return { portfolio_id: String(row.portfolio_id ?? "") };
        }
        try {
          return JSON.parse(row.hedge_debug_json);
        } catch {
          return { portfolio_id: String(row.portfolio_id ?? "") };
        }
      }),
      total: {
        included_portfolios: included.map((item) => item.portfolio_id),
        portfolio_severity_map: severityRows,
        weighted_average_hedge_severity: weightedAvgSeverity,
        urgent_override_triggered: urgentOverride,
        total_hedge_signal: totalHedgeSignal,
        dry_powder: {
          opportunistic_weight_pct: opportunisticWeight,
          total_risk_status: totalRiskStatus,
          required_min_pct: typeof opportunisticWeight === "number" ? dryMin.min : null,
          dry_powder_status: dryPowderStatus,
          partial_reason: dryMin.partialReason,
        },
      },
    },
  };
}
