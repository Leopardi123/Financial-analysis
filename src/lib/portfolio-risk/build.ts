import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";

type RiskStatus = "calm" | "elevated" | "high" | "critical" | "unavailable";

type PortfolioRiskRow = {
  portfolio_id: string;
  as_of_date: string;
  portfolio_type: string;
  strategic_risk_level: string;
  active: boolean;
  included_in_total_portfolio: boolean;
  actual_weight_pct: number | null;
  target_weight_pct: number | null;
  max_weight_pct: number | null;
  trend_status: string | null;
  annualized_vol_65d: number | null;
  current_drawdown_pct: number | null;
  top_holding_weight_pct: number | null;
  cyclicality_score: number | null;
  volatility_component_score: number | null;
  drawdown_component_score: number | null;
  concentration_component_score: number | null;
  cyclicality_component_score: number | null;
  risk_score: number | null;
  risk_status: RiskStatus;
  risk_mismatch_flag: boolean | null;
  risk_debug_json: string | null;
};

function asNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function riskStatusFromScore(score: number | null): RiskStatus {
  if (score === null || !Number.isFinite(score)) return "unavailable";
  if (score < 0.75) return "calm";
  if (score < 1.5) return "elevated";
  if (score < 2.25) return "high";
  return "critical";
}

function average(nums: Array<number | null>): number | null {
  const valid = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function strategicExpectedMax(level: string): number {
  switch (level) {
    case "low": return 1.0;
    case "medium": return 1.5;
    case "high": return 2.0;
    case "extreme": return 3.0;
    default: return 3.0;
  }
}

function baseCyclicalityScore(portfolioType: string): number {
  switch (portfolioType) {
    case "stable_income": return 0;
    case "growth": return 1;
    case "commodity_majors": return 1;
    case "commodity_junior": return 2;
    case "opportunistic": return 0;
    default: return 0;
  }
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [name]);
  return rows.length > 0;
}

async function getHistoryRows(portfolioId: string, asOfDate: string) {
  const rows = await query(
    `SELECT as_of_date, daily_return_pct, market_value
     FROM ${tables.portfolioHistoryDaily}
     WHERE portfolio_id = ? AND as_of_date <= ?
     ORDER BY as_of_date ASC`,
    [portfolioId, asOfDate]
  );
  return rows.map((row: any) => ({
    as_of_date: String(row.as_of_date ?? ""),
    daily_return_pct: asNum(row.daily_return_pct),
    market_value: asNum(row.market_value),
  }));
}

function deriveDailyReturns(historyRows: Array<{ daily_return_pct: number | null; market_value: number | null }>): number[] {
  const explicit = historyRows
    .map((row) => row.daily_return_pct)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (explicit.length >= 65) {
    return explicit;
  }

  const returns: number[] = [];
  for (let i = 1; i < historyRows.length; i += 1) {
    const prev = historyRows[i - 1].market_value;
    const curr = historyRows[i].market_value;
    if (typeof prev !== "number" || typeof curr !== "number" || prev === 0) continue;
    returns.push(((curr / prev) - 1) * 100);
  }
  return returns;
}

function annualizedVol65(dailyReturnsPct: number[]): number | null {
  if (dailyReturnsPct.length < 65) return null;
  const sample = dailyReturnsPct.slice(-65).map((r) => r / 100);
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
  const variance = sample.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / sample.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function volatilityScore(vol: number | null): number | null {
  if (vol === null) return null;
  if (vol < 15) return 0;
  if (vol < 25) return 1;
  if (vol < 40) return 2;
  return 3;
}

function currentDrawdown(historyRows: Array<{ market_value: number | null }>): { value: number | null; mode: "200d" | "fallback_65d" | "unavailable" } {
  const values = historyRows
    .map((row) => row.market_value)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  if (values.length < 65) return { value: null, mode: "unavailable" };

  const lookbackValues = values.length >= 200 ? values.slice(-200) : values;
  const peak = Math.max(...lookbackValues);
  const current = lookbackValues[lookbackValues.length - 1];
  if (!Number.isFinite(peak) || peak <= 0 || !Number.isFinite(current)) {
    return { value: null, mode: "unavailable" };
  }

  return {
    value: ((peak - current) / peak) * 100,
    mode: values.length >= 200 ? "200d" : "fallback_65d",
  };
}

function drawdownScore(drawdownPct: number | null): number | null {
  if (drawdownPct === null) return null;
  if (drawdownPct < 8) return 0;
  if (drawdownPct < 15) return 1;
  if (drawdownPct < 25) return 2;
  return 3;
}

async function getPositionColumnSet(): Promise<Set<string>> {
  const info = await query(`PRAGMA table_info(${tables.portfolioPositions})`) as Array<{ name?: unknown }>;
  return new Set(info.map((row) => String(row.name ?? "").toLowerCase()));
}

async function concentrationFromPositions(
  portfolioId: string,
  snapshotDate: string,
  positionColumns: Set<string>
): Promise<{ topHoldingWeightPct: number | null; score: number | null; positionsSource: string; juniorExposurePct: number | null }> {
  if (!(await tableExists(tables.portfolioPositions))) {
    return { topHoldingWeightPct: null, score: null, positionsSource: "unavailable", juniorExposurePct: null };
  }

  const latestDateRows = await query(
    `SELECT MAX(as_of_date) AS as_of_date
     FROM ${tables.portfolioPositions}
     WHERE portfolio_id = ? AND active_position = 1 AND as_of_date <= ?`,
    [portfolioId, snapshotDate]
  );
  let latestDate = String(latestDateRows[0]?.as_of_date ?? "").trim();
  if (!latestDate) {
    const fallbackRows = await query(
      `SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioPositions} WHERE portfolio_id = ? AND active_position = 1`,
      [portfolioId]
    );
    latestDate = String(fallbackRows[0]?.as_of_date ?? "").trim();
  }

  if (!latestDate) {
    return { topHoldingWeightPct: null, score: null, positionsSource: "unavailable", juniorExposurePct: null };
  }

  const hasWeight = positionColumns.has("weight_pct");
  const hasJunior = positionColumns.has("is_junior");
  const hasPreRevenue = positionColumns.has("is_pre_revenue");

  const rows = await query(
    `SELECT COALESCE(market_value, shares * COALESCE(manual_price, avg_cost)) AS market_value${hasWeight ? ", weight_pct" : ""}${hasJunior ? ", is_junior" : ""}${hasPreRevenue ? ", is_pre_revenue" : ""}
     FROM ${tables.portfolioPositions}
     WHERE portfolio_id = ? AND as_of_date = ? AND active_position = 1`,
    [portfolioId, latestDate]
  );

  if (rows.length === 0) {
    return { topHoldingWeightPct: null, score: null, positionsSource: "unavailable", juniorExposurePct: null };
  }

  const marketValues = rows.map((row: any) => asNum(row.market_value) ?? 0);
  const totalMarketValue = marketValues.reduce((a, b) => a + b, 0);

  const weights = rows.map((row: any, i: number) => {
    const fromWeight = hasWeight ? asNum(row.weight_pct) : null;
    if (fromWeight !== null) return fromWeight;
    const mv = marketValues[i];
    return totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : null;
  });

  const topHoldingWeightPct = weights
    .filter((w): w is number => typeof w === "number" && Number.isFinite(w))
    .reduce((max, value) => Math.max(max, value), 0);

  let score: number | null = null;
  if (topHoldingWeightPct > 0 || totalMarketValue > 0) {
    if (topHoldingWeightPct < 12) score = 0;
    else if (topHoldingWeightPct < 20) score = 1;
    else if (topHoldingWeightPct < 30) score = 2;
    else score = 3;
  }

  let juniorExposurePct: number | null = null;
  if (hasJunior || hasPreRevenue) {
    const juniorWeight = rows.reduce((sum, row: any, idx: number) => {
      const isJunior = Number(row.is_junior ?? 0) === 1 || Number(row.is_pre_revenue ?? 0) === 1;
      if (!isJunior) return sum;
      const w = weights[idx];
      return sum + (typeof w === "number" ? w : 0);
    }, 0);
    juniorExposurePct = juniorWeight;
  }

  return {
    topHoldingWeightPct: topHoldingWeightPct || null,
    score,
    positionsSource: latestDate === snapshotDate ? "positions_exact_snapshot_date" : "positions_latest_available",
    juniorExposurePct,
  };
}

function computeTotalRisk(portfolios: PortfolioRiskRow[]) {
  const included = portfolios.filter((row) => row.active && row.included_in_total_portfolio && row.risk_score !== null && row.actual_weight_pct !== null);

  if (included.length === 0) {
    return {
      total_risk_score: null,
      total_risk_status: "unavailable" as RiskStatus,
      included_portfolios: [] as string[],
      debug: {
        included_portfolios: [] as string[],
        weighted_base_total_risk_score: null,
        escalations: {
          junior_overweight: false,
          single_portfolio_gt_55pct: false,
          high_risk_portfolios_gt_50pct: false,
        },
        final_total_risk_score: null,
        final_total_risk_status: "unavailable",
      },
    };
  }

  const totalWeight = included.reduce((sum, row) => sum + (row.actual_weight_pct ?? 0), 0);
  const weightedBase = totalWeight > 0
    ? included.reduce((sum, row) => sum + ((row.risk_score ?? 0) * (row.actual_weight_pct ?? 0)), 0) / totalWeight
    : average(included.map((row) => row.risk_score)) ?? null;

  const juniorOverweight = portfolios.some((row) => row.portfolio_type === "commodity_junior"
    && row.actual_weight_pct !== null
    && row.max_weight_pct !== null
    && row.actual_weight_pct > row.max_weight_pct);

  const singleGt55 = portfolios.some((row) => row.active && row.included_in_total_portfolio && (row.actual_weight_pct ?? 0) > 55);

  const highRiskWeight = portfolios
    .filter((row) => row.active && row.included_in_total_portfolio && (row.risk_status === "high" || row.risk_status === "critical"))
    .reduce((sum, row) => sum + (row.actual_weight_pct ?? 0), 0);
  const highRiskOver50 = portfolios
    .filter((row) => row.active && row.included_in_total_portfolio && (row.risk_status === "high" || row.risk_status === "critical"))
    .length >= 2 && highRiskWeight > 50;

  const escalation = juniorOverweight || singleGt55 || highRiskOver50 ? 0.25 : 0;
  const finalScore = weightedBase === null ? null : weightedBase + escalation;
  const finalStatus = riskStatusFromScore(finalScore);

  return {
    total_risk_score: finalScore,
    total_risk_status: finalStatus,
    included_portfolios: included.map((row) => row.portfolio_id),
    debug: {
      included_portfolios: included.map((row) => row.portfolio_id),
      weighted_base_total_risk_score: weightedBase,
      escalations: {
        junior_overweight: juniorOverweight,
        single_portfolio_gt_55pct: singleGt55,
        high_risk_portfolios_gt_50pct: highRiskOver50,
      },
      final_total_risk_score: finalScore,
      final_total_risk_status: finalStatus,
    },
  };
}

export async function buildPortfolioRisk() {
  const latestSnapshotRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
  const snapshotDate = String(latestSnapshotRows[0]?.as_of_date ?? "").trim();
  if (!snapshotDate) {
    return {
      portfolios: [] as PortfolioRiskRow[],
      total: {
        total_risk_score: null,
        total_risk_status: "unavailable" as RiskStatus,
        included_portfolios: [] as string[],
      },
      debug: {
        portfolios: [] as any[],
        total: {
          included_portfolios: [],
          weighted_base_total_risk_score: null,
          escalations: {
            junior_overweight: false,
            single_portfolio_gt_55pct: false,
            high_risk_portfolios_gt_50pct: false,
          },
          final_total_risk_score: null,
          final_total_risk_status: "unavailable",
        },
      },
    };
  }

  const snapshotRows = await query(
    `SELECT s.portfolio_id, s.as_of_date, s.actual_weight_pct, s.target_weight_pct, s.max_weight_pct, s.trend_status,
            a.portfolio_type, a.strategic_risk_level, a.active, a.included_in_total_portfolio, a.max_junior_exposure_pct
     FROM ${tables.portfolioSnapshots} s
     LEFT JOIN ${tables.portfolioAdminConfig} a ON a.portfolio_id = s.portfolio_id
     WHERE s.as_of_date = ?
     ORDER BY s.portfolio_id ASC`,
    [snapshotDate]
  );

  const positionColumns = await getPositionColumnSet().catch(() => new Set<string>());

  const portfolioOutputs: PortfolioRiskRow[] = [];
  const portfolioDebug: any[] = [];

  for (const row of snapshotRows as any[]) {
    const portfolioId = String(row.portfolio_id ?? "");
    const portfolioType = String(row.portfolio_type ?? "");
    const strategicRiskLevel = String(row.strategic_risk_level ?? "medium");
    const active = Number(row.active ?? 0) === 1;
    const included = Number(row.included_in_total_portfolio ?? 0) === 1;

    const historyRows = await getHistoryRows(portfolioId, snapshotDate);
    const dailyReturns = deriveDailyReturns(historyRows);
    const annualizedVol = annualizedVol65(dailyReturns);
    const volScore = volatilityScore(annualizedVol);

    const dd = currentDrawdown(historyRows);
    const ddScore = drawdownScore(dd.value);

    const concentration = await concentrationFromPositions(portfolioId, snapshotDate, positionColumns);

    const baseCyc = baseCyclicalityScore(portfolioType);
    let cycScore = baseCyc;
    let escalationApplied = false;

    const actualWeight = asNum(row.actual_weight_pct);
    const targetWeight = asNum(row.target_weight_pct);
    const trendStatus = row.trend_status == null ? null : String(row.trend_status);

    if (portfolioType === "commodity_junior"
      && actualWeight !== null
      && targetWeight !== null
      && actualWeight > targetWeight
      && trendStatus === "downtrend") {
      cycScore = Math.min(3, cycScore + 1);
      escalationApplied = true;
    }

    const policyThreshold = asNum(row.max_junior_exposure_pct);
    if (portfolioType !== "commodity_junior" && policyThreshold !== null && concentration.juniorExposurePct !== null && concentration.juniorExposurePct > policyThreshold) {
      cycScore = Math.min(3, cycScore + 1);
      escalationApplied = true;
    }

    const cycComponent = cycScore;

    const componentScores: Array<number | null> = [volScore, ddScore, concentration.score, cycComponent];
    const availableComponentCount = componentScores.filter((x) => x !== null).length;
    const riskScore = average(componentScores);
    const riskStatus = riskStatusFromScore(riskScore);

    const expectedMax = strategicExpectedMax(strategicRiskLevel);
    const mismatch = riskScore === null ? null : riskScore > (expectedMax + 0.75);

    const riskDebug = {
      portfolio_id: portfolioId,
      history_source: historyRows.length > 0 ? "portfolio_history_daily" : "unavailable",
      positions_source: concentration.positionsSource,
      volatility_component: {
        annualized_vol_65d: annualizedVol,
        score: volScore,
      },
      drawdown_component: {
        current_drawdown_pct: dd.value,
        score: ddScore,
        lookback_mode: dd.mode,
      },
      concentration_component: {
        top_holding_weight_pct: concentration.topHoldingWeightPct,
        score: concentration.score,
      },
      cyclicality_component: {
        base_score: baseCyc,
        escalation_applied: escalationApplied,
        final_score: cycComponent,
      },
      available_component_count: availableComponentCount,
      risk_score: riskScore,
      risk_status: riskStatus,
      strategic_risk_level: strategicRiskLevel,
      risk_mismatch_flag: mismatch,
      risk_completeness: availableComponentCount >= 2 ? "full" : availableComponentCount === 1 ? "partial" : "unavailable",
    };

    await execute(
      `UPDATE ${tables.portfolioSnapshots}
       SET annualized_vol_65d = ?,
           current_drawdown_pct = ?,
           top_holding_weight_pct = ?,
           cyclicality_score = ?,
           volatility_component_score = ?,
           drawdown_component_score = ?,
           concentration_component_score = ?,
           cyclicality_component_score = ?,
           risk_score = ?,
           risk_status = ?,
           risk_mismatch_flag = ?,
           risk_debug_json = ?
       WHERE portfolio_id = ? AND as_of_date = ?`,
      [
        annualizedVol,
        dd.value,
        concentration.topHoldingWeightPct,
        cycScore,
        volScore,
        ddScore,
        concentration.score,
        cycComponent,
        riskScore,
        riskStatus,
        mismatch === null ? null : mismatch ? 1 : 0,
        JSON.stringify(riskDebug),
        portfolioId,
        snapshotDate,
      ]
    );

    const output: PortfolioRiskRow = {
      portfolio_id: portfolioId,
      as_of_date: snapshotDate,
      portfolio_type: portfolioType,
      strategic_risk_level: strategicRiskLevel,
      active,
      included_in_total_portfolio: included,
      actual_weight_pct: actualWeight,
      target_weight_pct: targetWeight,
      max_weight_pct: asNum(row.max_weight_pct),
      trend_status: trendStatus,
      annualized_vol_65d: annualizedVol,
      current_drawdown_pct: dd.value,
      top_holding_weight_pct: concentration.topHoldingWeightPct,
      cyclicality_score: cycScore,
      volatility_component_score: volScore,
      drawdown_component_score: ddScore,
      concentration_component_score: concentration.score,
      cyclicality_component_score: cycComponent,
      risk_score: riskScore,
      risk_status: riskStatus,
      risk_mismatch_flag: mismatch,
      risk_debug_json: JSON.stringify(riskDebug),
    };

    portfolioOutputs.push(output);
    portfolioDebug.push(riskDebug);
  }

  const total = computeTotalRisk(portfolioOutputs);

  return {
    portfolios: portfolioOutputs,
    total: {
      total_risk_score: total.total_risk_score,
      total_risk_status: total.total_risk_status,
      included_portfolios: total.included_portfolios,
    },
    debug: {
      portfolios: portfolioDebug,
      total: total.debug,
    },
  };
}

export async function getLatestPortfolioRisk() {
  const latestSnapshotRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
  const snapshotDate = String(latestSnapshotRows[0]?.as_of_date ?? "").trim();
  if (!snapshotDate) {
    return {
      portfolios: [] as PortfolioRiskRow[],
      total: { total_risk_score: null, total_risk_status: "unavailable" as RiskStatus, included_portfolios: [] as string[] },
      debug: { portfolios: [] as any[], total: null },
    };
  }

  const rows = await query(
    `SELECT s.portfolio_id, s.as_of_date,
            s.annualized_vol_65d, s.current_drawdown_pct, s.top_holding_weight_pct,
            s.cyclicality_score, s.volatility_component_score, s.drawdown_component_score,
            s.concentration_component_score, s.cyclicality_component_score,
            s.risk_score, s.risk_status, s.risk_mismatch_flag, s.risk_debug_json,
            s.actual_weight_pct, s.target_weight_pct, s.max_weight_pct, s.trend_status,
            a.portfolio_type, a.strategic_risk_level, a.active, a.included_in_total_portfolio
     FROM ${tables.portfolioSnapshots} s
     LEFT JOIN ${tables.portfolioAdminConfig} a ON a.portfolio_id = s.portfolio_id
     WHERE s.as_of_date = ?
     ORDER BY s.portfolio_id ASC`,
    [snapshotDate]
  );

  const portfolios = rows.map((row: any): PortfolioRiskRow => ({
    portfolio_id: String(row.portfolio_id ?? ""),
    as_of_date: String(row.as_of_date ?? ""),
    portfolio_type: String(row.portfolio_type ?? ""),
    strategic_risk_level: String(row.strategic_risk_level ?? "medium"),
    active: Number(row.active ?? 0) === 1,
    included_in_total_portfolio: Number(row.included_in_total_portfolio ?? 0) === 1,
    actual_weight_pct: asNum(row.actual_weight_pct),
    target_weight_pct: asNum(row.target_weight_pct),
    max_weight_pct: asNum(row.max_weight_pct),
    trend_status: row.trend_status == null ? null : String(row.trend_status),
    annualized_vol_65d: asNum(row.annualized_vol_65d),
    current_drawdown_pct: asNum(row.current_drawdown_pct),
    top_holding_weight_pct: asNum(row.top_holding_weight_pct),
    cyclicality_score: asNum(row.cyclicality_score),
    volatility_component_score: asNum(row.volatility_component_score),
    drawdown_component_score: asNum(row.drawdown_component_score),
    concentration_component_score: asNum(row.concentration_component_score),
    cyclicality_component_score: asNum(row.cyclicality_component_score),
    risk_score: asNum(row.risk_score),
    risk_status: String(row.risk_status ?? "unavailable") as RiskStatus,
    risk_mismatch_flag: row.risk_mismatch_flag == null ? null : Number(row.risk_mismatch_flag) === 1,
    risk_debug_json: row.risk_debug_json == null ? null : String(row.risk_debug_json),
  }));

  const total = computeTotalRisk(portfolios);

  return {
    portfolios,
    total: {
      total_risk_score: total.total_risk_score,
      total_risk_status: total.total_risk_status,
      included_portfolios: total.included_portfolios,
    },
    debug: {
      portfolios: portfolios.map((p) => {
        if (!p.risk_debug_json) return { portfolio_id: p.portfolio_id };
        try {
          return JSON.parse(p.risk_debug_json);
        } catch {
          return { portfolio_id: p.portfolio_id };
        }
      }),
      total: total.debug,
    },
  };
}
