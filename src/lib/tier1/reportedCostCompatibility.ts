import {
  getCompatibleTier1CostBenchmark,
  type Tier1CostBenchmark,
} from './config.ts';
import type { ReportedCostEvidence } from './reportedCost.ts';

export type ReportedCostBenchmarkCompatibility = {
  status: 'COMPARABLE' | 'NOT_COMPARABLE' | 'INSUFFICIENT_DEFINITION';
  reason: string;
};

function benchmarkDeclaredBasis(benchmark: Tier1CostBenchmark): 'co_product' | null {
  if (benchmark.basisId === 'S_AND_P_CO_PRODUCT_C1_CU'
    || benchmark.basisId === 'S_AND_P_CO_PRODUCT_AISC_AU'
    || benchmark.basisId === 'S_AND_P_CO_PRODUCT_AISC_AG') return 'co_product';
  return null;
}

/** Single compatibility gate for reported project costs before percentile classification. */
export function assessReportedCostBenchmarkCompatibility(args: {
  evidence: ReportedCostEvidence;
  benchmark: Tier1CostBenchmark;
}): ReportedCostBenchmarkCompatibility {
  const { evidence, benchmark } = args;
  if (evidence.status !== 'AVAILABLE' || evidence.value === null || evidence.unit === null) {
    return { status: 'INSUFFICIENT_DEFINITION', reason: evidence.reason };
  }
  if (evidence.metric !== benchmark.metric) return { status: 'NOT_COMPARABLE', reason: `Rapporterad metric ${evidence.metric} matchar inte benchmarkens ${benchmark.metric}.` };
  if (evidence.unit !== benchmark.unit) return { status: 'NOT_COMPARABLE', reason: `Rapporterad enhet ${evidence.unit} matchar inte benchmarkens ${benchmark.unit}.` };

  const declaredBenchmarkBasis = benchmarkDeclaredBasis(benchmark);
  if (evidence.basis && evidence.basis !== 'unknown' && declaredBenchmarkBasis && evidence.basis !== declaredBenchmarkBasis) {
    return { status: 'NOT_COMPARABLE', reason: `Rapportens basis ${evidence.basis} är uttryckligen inkompatibel med benchmarkens ${declaredBenchmarkBasis}-basis.` };
  }

  // Legacy exact proof remains accepted for backwards compatibility. New project JSON
  // should store report semantics instead; richer benchmark contracts will replace this.
  if (evidence.basisId && evidence.costBaseYear !== null && evidence.sourceId && evidence.pageOrTable) {
    const compatible = getCompatibleTier1CostBenchmark({
      metal: benchmark.metal,
      metric: evidence.metric,
      basisId: evidence.basisId,
      costBaseYear: evidence.costBaseYear,
    });
    if (!compatible || compatible.basisId !== benchmark.basisId || compatible.metric !== benchmark.metric || compatible.dataPeriod !== benchmark.dataPeriod) {
      return { status: 'NOT_COMPARABLE', reason: `Rapporterad legacy cost-definition (${evidence.basisId}, ${evidence.costBaseYear}) matchar inte vald benchmark (${benchmark.basisId}, ${benchmark.dataPeriod}).` };
    }
    return { status: 'COMPARABLE', reason: `Rapporterad cost har verifierad legacy-kompatibilitet med ${benchmark.basisId} för benchmarkåret och source/page-table.` };
  }

  const missing = [
    !evidence.basis || evidence.basis === 'unknown' ? 'basis' : null,
    !evidence.denominator || evidence.denominator === 'unknown' ? 'denominator' : null,
    !evidence.period || evidence.period.kind === 'UNKNOWN' ? 'period' : null,
    evidence.costBaseYear === null ? 'costBaseYear' : null,
    !evidence.sourceId || !evidence.pageOrTable ? 'source/page-table' : null,
  ].filter(Boolean);

  return {
    status: 'INSUFFICIENT_DEFINITION',
    reason: `Rapporterat cost-värde bevaras som evidence men extern kvartil får inte klassificeras. ${missing.length ? `Saknar verifierad benchmark-semantik: ${missing.join(', ')}.` : 'Benchmarkens fulla denominator/allokerings/component-kontrakt är ännu inte källverifierat.'}`,
  };
}
