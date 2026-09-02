import assert from 'node:assert/strict';
import { ARCTIC_FS_V3 } from '../../project/jsonv3/__tests__/fixtures/arcticFs.ts';
import { S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, assessCuC1DefinitionReadiness } from '../costDefinitionContract.ts';

const M = 1_000_000;
const raw = ARCTIC_FS_V3;

function sumNumeric(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
}

assert.equal(raw.streamsByMetal, null, 'Arctic has no metal stream, so generic stream-treatment uncertainty is not project-applicable.');
assert.equal(raw.economics.costModel.mode, 'COMPONENTS');
assert.equal(raw.economics.sellingModel.mode, 'AGGREGATE');
if (raw.economics.costModel.mode !== 'COMPONENTS' || raw.economics.sellingModel.mode !== 'AGGREGATE') {
  throw new Error('Arctic component cost model and aggregate selling model are required.');
}

// Table 22-2 report totals. These are the authoritative LOM cost-checkpoint
// inputs because Table 22-4 annual rows are rounded and differ slightly when summed.
const reportRecoveredMetalValueM = {
  Cu: 7_055.0,
  Pb: 334.8,
  Zn: 2_580.3,
  Au: 697.8,
  Ag: 757.0,
} as const;
const reportTotalRecoveredMetalValueUSD = 11_424.9 * M;
const reportOffsiteUSD = 2_969.1 * M;
const reportOnsiteUSD = 2_793.6 * M;
const reportInitialCapexUSD = 1_176.8 * M;
const reportSustainingCapexUSD = 114.4 * M;
const reportClosureUSD = 428.4 * M;
const reportTotalCapitalUSD = 1_719.6 * M;
const reportPayableCuLb = 1_932_882_000;

assert.ok(Math.abs(Object.values(reportRecoveredMetalValueM).reduce((total, value) => total + value, 0) * M - reportTotalRecoveredMetalValueUSD) < 1, 'Arctic Table 22-2 recovered-metal values must sum to total recovered metal value.');
assert.ok(Math.abs(reportInitialCapexUSD + reportSustainingCapexUSD + reportClosureUSD - reportTotalCapitalUSD) < 1, 'Arctic Table 22-2 capital rows must sum to total capital expenditure.');

// The published 0.72 cash-cost checkpoint is exactly a by-product-credit
// construction: all site operating cost + all off-site cost, less non-Cu metal
// value, over payable copper. Do not rename this to S&P co-product C1.
const byProductCreditsUSD = (reportRecoveredMetalValueM.Pb + reportRecoveredMetalValueM.Zn + reportRecoveredMetalValueM.Au + reportRecoveredMetalValueM.Ag) * M;
const reportCashCostNetByProduct = (reportOnsiteUSD + reportOffsiteUSD - byProductCreditsUSD) / reportPayableCuLb;
assert.ok(Math.abs(reportCashCostNetByProduct - 0.7205820117317038) < 1e-12);
assert.ok(Math.abs(reportCashCostNetByProduct - 0.72) < 0.005, 'Arctic Table 22-2 cash cost must reconstruct to reported 0.72 USD/lb payable Cu.');

// Table 22-2's reported 1.61 all-in checkpoint mathematically reconciles only
// when the full published capital total is added. Adding sustaining capex alone
// does not reproduce the reported number. This is why the FS label must remain
// "All-in Cost" and must not be silently normalized to conventional AISC.
const sustainingOnlyDiagnostic = (reportOnsiteUSD + reportOffsiteUSD - byProductCreditsUSD + reportSustainingCapexUSD) / reportPayableCuLb;
const reportAllInNetByProduct = (reportOnsiteUSD + reportOffsiteUSD - byProductCreditsUSD + reportTotalCapitalUSD) / reportPayableCuLb;
assert.ok(Math.abs(sustainingOnlyDiagnostic - 0.7797682424483229) < 1e-12);
assert.ok(Math.abs(reportAllInNetByProduct - 1.6102379762447987) < 1e-12);
assert.ok(Math.abs(reportAllInNetByProduct - 1.61) < 0.005, 'Arctic Table 22-2 all-in cost must reconstruct to reported 1.61 USD/lb payable Cu.');
assert.ok(Math.abs(sustainingOnlyDiagnostic - 1.61) > 0.8, 'Arctic 1.61 must not be interpreted as a sustaining-only AISC bridge.');

// The report gives a full gross recovered-metal-value vector. A gross-value
// co-product allocation is therefore computable as a diagnostic, but SNL/S&P
// requires net-revenue pro-rata. Arctic publishes off-site costs only as one
// aggregate in Table 22-2 / Table 22-4, not a product-level net-revenue vector.
const grossCuShare = reportRecoveredMetalValueM.Cu * M / reportTotalRecoveredMetalValueUSD;
const grossValueCoProductDiagnostic = (reportOnsiteUSD + reportOffsiteUSD) * grossCuShare / reportPayableCuLb;
assert.ok(Math.abs(grossCuShare - 0.6175108753687122) < 1e-12);
assert.ok(Math.abs(grossValueCoProductDiagnostic - 1.8410487145554035) < 1e-12);
assert.equal(raw.economics.sellingModel.mode, 'AGGREGATE', 'Arctic exact per-product net-revenue allocation is unavailable in canonical FS evidence.');

// Rounded annual fixture rows remain close to the authoritative report totals,
// but are not used to manufacture balancing entries.
const annualOnsiteUSD = raw.economics.costModel.components.reduce((total, component) => total + sumNumeric(component.seriesUSD), 0);
const annualOffsiteUSD = sumNumeric(raw.economics.sellingModel.sellingCostsUSD);
const annualSustainingUSD = sumNumeric(raw.capital.sustainingCapexUSD);
assert.ok(Math.abs(annualOnsiteUSD - reportOnsiteUSD) <= 1 * M, 'Rounded Arctic annual on-site rows should stay within US$1m of Table 22-2 total.');
assert.ok(Math.abs(annualOffsiteUSD - reportOffsiteUSD) < 1, 'Arctic annual off-site aggregate should sum exactly to Table 22-2 total.');
assert.ok(Math.abs(annualSustainingUSD - reportSustainingCapexUSD) <= 0.2 * M, 'Rounded Arctic annual sustaining rows should stay within US$0.2m of Table 22-2 total.');

const cashCheckpoint = raw.verification?.reportedCostCheckpoints?.find((row) => row.metric === 'CASH_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB');
const allInCheckpoint = raw.verification?.reportedCostCheckpoints?.find((row) => row.metric === 'ALL_IN_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB');
assert.equal(cashCheckpoint?.value, 0.72);
assert.equal(allInCheckpoint?.value, 1.61);
assert.match(cashCheckpoint?.definitionNotes ?? '', /do not silently rename/i);
assert.match(allInCheckpoint?.definitionNotes ?? '', /does not call this AISC/i);

// Section 22.3 says the model is in real dollars with relative Year -3 as the
// base year, but does not source-lock a calendar cost year compatible with the
// 2024 S&P snapshot. Runtime placement must not be reused as cost vintage.
const readiness = assessCuC1DefinitionReadiness(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, { hasStreams: false });
assert.deepEqual(readiness, {
  status: 'NOT_VERIFIED',
  blockers: [
    'exact allocation revenue/price vector',
    'full current C1 component boundary',
    'project-to-benchmark cost-vintage alignment',
  ],
});

console.log('arcticCostBridge.test.ts passed');
