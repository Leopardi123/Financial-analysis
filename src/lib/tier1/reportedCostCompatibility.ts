import {
  getCompatibleTier1CostBenchmark,
  type Tier1CostBenchmark,
} from './config.ts';
import type { ReportedCostEvidence } from './reportedCost.ts';

export type ReportedCostBenchmarkCompatibility = {
  status: 'COMPARABLE' | 'NOT_COMPARABLE' | 'INSUFFICIENT_DEFINITION';
  reason: string;
};

/**
 * Single compatibility gate for reported project costs before any percentile
 * classification. This is deliberately fail-closed on the benchmark claim,
 * while preserving the reported value as evidence elsewhere.
 *
 * Phase 0 uses the legacy basisId/costBaseYear proof when present. The richer
 * semantic cost contract will replace this legacy proof in the next schema
 * phase; callers must not add their own compatibility shortcuts.
 */
export function assessReportedCostBenchmarkCompatibility(args: {
  evidence: ReportedCostEvidence;
  benchmark: Tier1CostBenchmark;
}): ReportedCostBenchmarkCompatibility {
  const { evidence, benchmark } = args;

  if (evidence.status !== 'AVAILABLE' || evidence.value === null || evidence.unit === null) {
    return {
      status: 'INSUFFICIENT_DEFINITION',
      reason: evidence.reason,
    };
  }

  if (evidence.metric !== benchmark.metric) {
    return {
      status: 'NOT_COMPARABLE',
      reason: `Rapporterad metric ${evidence.metric} matchar inte benchmarkens ${benchmark.metric}.`,
    };
  }

  if (evidence.unit !== benchmark.unit) {
    return {
      status: 'NOT_COMPARABLE',
      reason: `Rapporterad enhet ${evidence.unit} matchar inte benchmarkens ${benchmark.unit}.`,
    };
  }

  if (!evidence.basisId || evidence.costBaseYear === null) {
    return {
      status: 'INSUFFICIENT_DEFINITION',
      reason: 'Rapporterat cost-värde bevaras som evidence, men basis och/eller costBaseYear saknas; extern kostnadskvartil får inte klassificeras.',
    };
  }

  if (!evidence.sourceId || !evidence.pageOrTable) {
    return {
      status: 'INSUFFICIENT_DEFINITION',
      reason: 'Rapporterat cost-värde bevaras som evidence, men source/page-table saknas; extern kostnadskvartil får inte klassificeras.',
    };
  }

  const compatible = getCompatibleTier1CostBenchmark({
    metal: benchmark.metal,
    metric: evidence.metric,
    basisId: evidence.basisId,
    costBaseYear: evidence.costBaseYear,
  });

  if (!compatible
    || compatible.basisId !== benchmark.basisId
    || compatible.metric !== benchmark.metric
    || compatible.dataPeriod !== benchmark.dataPeriod) {
    return {
      status: 'NOT_COMPARABLE',
      reason: `Rapporterad cost-definition (${evidence.basisId}, ${evidence.costBaseYear}) matchar inte vald benchmark (${benchmark.basisId}, ${benchmark.dataPeriod}).`,
    };
  }

  return {
    status: 'COMPARABLE',
    reason: `Rapporterad cost har verifierad legacy-kompatibilitet med ${benchmark.basisId} för benchmarkåret och har source/page-table.`,
  };
}
