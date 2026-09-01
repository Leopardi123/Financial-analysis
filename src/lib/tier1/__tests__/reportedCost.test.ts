import './reportedCostReportFixtures.test.ts';
import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS } from '../config.ts';
import { assessCostAgainstBenchmark } from '../costBenchmarkAssessment.ts';
import { extractReportedCostEvidence, extractReportedCostEvidenceCandidates, reportedCostWeightInBenchmarkUnits } from '../reportedCost.ts';
import { assessReportedCostBenchmarkCompatibility } from '../reportedCostCompatibility.ts';

const minimal = extractReportedCostEvidence({ economicsBreakdown: { reportedCostMetrics: [{ metric: 'C1_CU_USD_PER_LB', value: 1.21, unit: 'USD/lb' }] } }, 'C1_CU_USD_PER_LB');
assert.equal(minimal.status, 'AVAILABLE');
assert.equal(assessReportedCostBenchmarkCompatibility({ evidence: minimal, benchmark: TIER1_COST_BENCHMARKS.Cu }).status, 'INSUFFICIENT_DEFINITION');

const arcticCashCost = extractReportedCostEvidence({ economicsBreakdown: { reportedCostMetrics: [{
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'Cash Costs, Net of By-product Credits', value: 0.72, unit: 'USD/lb',
  basis: 'net_by_product', denominator: 'payable_primary_metal', period: { kind: 'LOM' }, quality: 'reported_exact',
  sourceId: 'arctic-fs-2023', pageOrTable: 'Table 22-2, p.390',
}] } }, 'C1_CU_USD_PER_LB');
assert.equal(arcticCashCost.status, 'AVAILABLE');
assert.equal(arcticCashCost.basis, 'net_by_product');
assert.equal(assessReportedCostBenchmarkCompatibility({ evidence: arcticCashCost, benchmark: TIER1_COST_BENCHMARKS.Cu }).status, 'NOT_COMPARABLE');

const bergCandidates = extractReportedCostEvidenceCandidates({ economicsBreakdown: { reportedCostMetrics: [
  { metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 cost – by-product basis', value: -0.17, unit: 'USD/lb', primaryMetal: 'Cu', basis: 'net_by_product', denominator: 'payable_primary_metal', period: { kind: 'LOM' }, quality: 'reported_exact', sourceId: 'berg-pfs-2026', pageOrTable: 'Table 22-3, p.323' },
  { metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 cost – co-product basis', value: 1.95, unit: 'USD/lb', primaryMetal: 'Cu', basis: 'co_product', denominator: 'metal_equivalent', period: { kind: 'LOM' }, quality: 'reported_exact', sourceId: 'berg-pfs-2026', pageOrTable: 'Table 22-3, p.323' },
] } }, 'C1_CU_USD_PER_LB');
assert.equal(bergCandidates.length, 2);
assert.equal(bergCandidates[0].value, -0.17);
assert.equal(bergCandidates[1].value, 1.95);
const bergSingle = extractReportedCostEvidence({ economicsBreakdown: { reportedCostMetrics: [
  { metric: 'C1_CU_USD_PER_LB', value: -0.17, unit: 'USD/lb', basis: 'net_by_product', denominator: 'payable_primary_metal', period: { kind: 'LOM' } },
  { metric: 'C1_CU_USD_PER_LB', value: 1.95, unit: 'USD/lb', basis: 'co_product', denominator: 'metal_equivalent', period: { kind: 'LOM' } },
] } }, 'C1_CU_USD_PER_LB');
assert.equal(bergSingle.status, 'INVALID');
assert.match(bergSingle.reason, /Arrayordning/);

const vizPeriodSelection = extractReportedCostEvidence({ economicsBreakdown: { reportedCostMetrics: [
  { metric: 'C1_CU_USD_PER_LB', value: 0.93, unit: 'USD/lb', basis: 'reported_other', denominator: 'payable_primary_metal', period: { kind: 'FIRST_N_OPERATING_YEARS', years: 8 }, costBaseYear: 2023, sourceId: 'viz-pfs', pageOrTable: 'Table 21.11' },
  { metric: 'C1_CU_USD_PER_LB', value: 1.25, unit: 'USD/lb', basis: 'reported_other', denominator: 'payable_primary_metal', period: { kind: 'LOM' }, costBaseYear: 2023, sourceId: 'viz-pfs', pageOrTable: 'Table 21.11' },
] } }, 'C1_CU_USD_PER_LB');
assert.equal(vizPeriodSelection.status, 'AVAILABLE');
assert.equal(vizPeriodSelection.value, 1.25);
assert.equal(vizPeriodSelection.period?.kind, 'LOM');

const exactCopper = extractReportedCostEvidence({ economicsBreakdown: { reportedCostMetrics: [{
  metric: 'C1_CU_USD_PER_LB', value: 1.21, unit: 'USD/lb', basisId: 'S_AND_P_CO_PRODUCT_C1_CU', costBaseYear: 2024, sourceId: 'pfs-2024', pageOrTable: 'Table 22-4',
}] } }, 'C1_CU_USD_PER_LB');
assert.equal(assessReportedCostBenchmarkCompatibility({ evidence: exactCopper, benchmark: TIER1_COST_BENCHMARKS.Cu }).status, 'COMPARABLE');
const exactCopperGate = assessCostAgainstBenchmark({ primaryMetal: 'Cu', primaryMetalRevenueShare: 0.90, metric: 'C1_CU_USD_PER_LB', value: exactCopper.value!, benchmark: TIER1_COST_BENCHMARKS.Cu, nowUtc: '2026-08-30T00:00:00Z' });
assert.equal(exactCopperGate.status, 'PASS');
assert.equal(exactCopperGate.tier, 1);

const wrongCopperYear = extractReportedCostEvidence({ economicsBreakdown: { reportedCostMetrics: [{ metric: 'C1_CU_USD_PER_LB', value: 1.21, unit: 'USD/lb', basisId: 'S_AND_P_CO_PRODUCT_C1_CU', costBaseYear: 2025, sourceId: 'pfs-2025', pageOrTable: 'Table 22-4' }] } }, 'C1_CU_USD_PER_LB');
assert.equal(assessReportedCostBenchmarkCompatibility({ evidence: wrongCopperYear, benchmark: TIER1_COST_BENCHMARKS.Cu }).status, 'NOT_COMPARABLE');

const wrongMetric = extractReportedCostEvidence({ economicsBreakdown: { reportedCostMetrics: [{ metric: 'AISC_AGEQ_USD_PER_TOZ', value: 12.9, unit: 'USD/toz' }] } }, 'AISC_AG_CO_PRODUCT_USD_PER_TOZ');
assert.equal(wrongMetric.status, 'INVALID');

const lbWeight = reportedCostWeightInBenchmarkUnits({ payableSeries: [0, 1000, 2000], payableUnit: 'kg', benchmarkUnit: 'USD/lb' });
assert.ok(lbWeight !== null && Math.abs(lbWeight - 6613.867865546327) < 1e-9);
const ozWeight = reportedCostWeightInBenchmarkUnits({ payableSeries: [0, 31.1034768], payableUnit: 'g', benchmarkUnit: 'USD/toz' });
assert.ok(ozWeight !== null && Math.abs(ozWeight - 1) < 1e-9);

console.log('reportedCost.test.ts passed');
