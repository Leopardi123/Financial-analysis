import { ensureSchema } from "../../../../../api/_migrate.js";
import { readPortfolioHistoryCanonicalLatest } from "../../../../lib/portfolio-history/canonical.js";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeLatestContractRow(row: {
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  short_direction: string;
  medium_direction: string;
  long_direction: string;
  trend_status: string;
  trend_completeness: string;
}) {
  const reasons: string[] = [];
  const hasAllReturns = isFiniteNumber(row.return_20d) && isFiniteNumber(row.return_65d) && isFiniteNumber(row.return_200d);
  if (row.trend_completeness === "full" && !hasAllReturns) {
    reasons.push("latest_contract_violation_full_without_all_returns");
  }
  const downgradedCompleteness = hasAllReturns
    ? "full"
    : (isFiniteNumber(row.return_20d) || isFiniteNumber(row.return_65d) || isFiniteNumber(row.return_200d) ? "partial" : "unavailable");
  if (row.trend_completeness !== downgradedCompleteness) {
    reasons.push(`latest_completeness_downgraded:${row.trend_completeness}->${downgradedCompleteness}`);
  }
  const forceUnavailableDirections = downgradedCompleteness !== "full";
  return {
    ...row,
    trend_completeness: downgradedCompleteness,
    short_direction: forceUnavailableDirections ? "unavailable" : row.short_direction,
    medium_direction: forceUnavailableDirections ? "unavailable" : row.medium_direction,
    long_direction: forceUnavailableDirections ? "unavailable" : row.long_direction,
    trend_status: forceUnavailableDirections ? "unavailable" : row.trend_status,
    contract_error: reasons.length > 0,
    contract_reason: reasons.length > 0 ? reasons.join("|") : null,
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    await ensureSchema();
    const debug = String(req.query?.debug ?? "") === "1";
    const canonical = await readPortfolioHistoryCanonicalLatest();

    const portfolioDiagnostics = canonical.portfolios.map((p) => {
      const latestContract = normalizeLatestContractRow({
        return_20d: p.return_20d,
        return_65d: p.return_65d,
        return_200d: p.return_200d,
        short_direction: p.short_direction,
        medium_direction: p.medium_direction,
        long_direction: p.long_direction,
        trend_status: p.trend_status,
        trend_completeness: p.trend_completeness,
      });
      return {
        portfolio_id: p.portfolio_id,
        canonical: p,
        latest_contract: latestContract,
      };
    });

    const portfolios = portfolioDiagnostics.map(({ portfolio_id, canonical: p, latest_contract }) => ({
      portfolio_id,
      portfolio_name: p.portfolio_name,
      latest_date: p.last_history_date,
      latest_value_sek: p.latest_value_sek,
      return_20d: latest_contract.return_20d,
      return_65d: latest_contract.return_65d,
      return_200d: latest_contract.return_200d,
      return_20d_valid: p.return_20d_valid,
      return_65d_valid: p.return_65d_valid,
      return_200d_valid: p.return_200d_valid,
      invalid_reason_20d: p.invalid_reason_20d,
      invalid_reason_65d: p.invalid_reason_65d,
      invalid_reason_200d: p.invalid_reason_200d,
      short_direction: latest_contract.short_direction,
      medium_direction: latest_contract.medium_direction,
      long_direction: latest_contract.long_direction,
      trend_status: latest_contract.trend_status,
      trend_completeness: latest_contract.trend_completeness,
      data_quality: p.data_quality,
      consistency_hash: p.consistency_hash,
      serialization_contract_error: latest_contract.contract_error,
      serialization_contract_reason: latest_contract.contract_reason,
    }));

    const mismatches = portfolios.flatMap((p) => {
      const trace = canonical.portfolios.find((x) => x.portfolio_id === p.portfolio_id);
      if (!trace) return [`missing_trace:${p.portfolio_id}`];
      const reasons: string[] = [];
      if (p.latest_value_sek !== trace.latest_value_sek) reasons.push("latest_value_mismatch");
      if (p.return_65d !== trace.return_65d) reasons.push("return_65d_mismatch");
      if (p.trend_completeness !== trace.trend_completeness) reasons.push("trend_completeness_mismatch");
      if (p.serialization_contract_error) reasons.push(`serialization_contract_error:${p.serialization_contract_reason ?? "unknown"}`);
      return reasons.map((r) => `${p.portfolio_id}:${r}`);
    });

    res.status(200).json({
      ok: true,
      canonical_source_version: canonical.canonical_source_version,
      date_rule: canonical.date_rule,
      continuity_rule: canonical.continuity_rule,
      total_aggregation_rule: canonical.total_aggregation_rule,
      portfolios,
      total: canonical.total,
      ...(debug
        ? {
          diagnostics: {
            canonical,
            mismatch_flag: mismatches.length > 0,
            mismatch_reasons: mismatches,
            latest_trace_match: mismatches.length === 0,
            latest_card_match: null,
            ui_value_match: null,
            portfolios: portfolioDiagnostics.map(({ portfolio_id, canonical: p, latest_contract }) => ({
              portfolio_id,
              invalid_reason_20d: p.invalid_reason_20d,
              invalid_reason_65d: p.invalid_reason_65d,
              invalid_reason_200d: p.invalid_reason_200d,
              return_20d: latest_contract.return_20d,
              return_65d: latest_contract.return_65d,
              return_200d: latest_contract.return_200d,
              trend_completeness: latest_contract.trend_completeness,
              short_direction: latest_contract.short_direction,
              medium_direction: latest_contract.medium_direction,
              long_direction: latest_contract.long_direction,
              serialization_contract_error: latest_contract.contract_error,
              serialization_contract_reason: latest_contract.contract_reason,
              contract_debug: {
                canonical_return_20d: p.return_20d,
                canonical_return_65d: p.return_65d,
                canonical_return_200d: p.return_200d,
                canonical_trend_completeness: p.trend_completeness,
                canonical_short_direction: p.short_direction,
                canonical_medium_direction: p.medium_direction,
                canonical_long_direction: p.long_direction,
                latest_payload_return_20d: latest_contract.return_20d,
                latest_payload_return_65d: latest_contract.return_65d,
                latest_payload_return_200d: latest_contract.return_200d,
                latest_payload_trend_completeness: latest_contract.trend_completeness,
                latest_payload_short_direction: latest_contract.short_direction,
                latest_payload_medium_direction: latest_contract.medium_direction,
                latest_payload_long_direction: latest_contract.long_direction,
                contract_match_canonical_to_latest:
                  p.return_20d === latest_contract.return_20d
                  && p.return_65d === latest_contract.return_65d
                  && p.return_200d === latest_contract.return_200d
                  && p.trend_completeness === latest_contract.trend_completeness
                  && p.short_direction === latest_contract.short_direction
                  && p.medium_direction === latest_contract.medium_direction
                  && p.long_direction === latest_contract.long_direction,
                mismatch_stage: latest_contract.contract_error ? "latest_payload" : null,
                mismatch_reason: latest_contract.contract_reason,
              },
            })),
          },
        }
        : {}),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
