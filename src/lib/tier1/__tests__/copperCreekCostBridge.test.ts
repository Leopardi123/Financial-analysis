import assert from 'node:assert/strict';
import { COPPER_CREEK_LB_PER_TONNE, COPPER_CREEK_PEA_V3 } from '../../project/jsonv3/__tests__/fixtures/copperCreekPea.ts';
import { S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, assessCuC1DefinitionReadiness } from '../costDefinitionContract.ts';

const M = 1_000_000;
const raw = COPPER_CREEK_PEA_V3;
const costModel = raw.economics.costModel;
const sellingModel = raw.economics.sellingModel;
const fiscalModel = raw.economics.fiscalTakeModel;

function sumNumeric(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
}

assert.equal(raw.streamsByMetal, null, 'Copper Creek has no metal stream, so generic stream-treatment uncertainty is not project-applicable.');
assert.equal(costModel.mode, 'COMPONENTS');
assert.equal(sellingModel.mode, 'COMPONENTS');
assert.equal(fiscalModel.mode, 'RULES');
if (costModel.mode !== 'COMPONENTS' || sellingModel.mode !== 'COMPONENTS' || fiscalModel.mode !== 'RULES') {
  throw new Error('Copper Creek component cost, selling and fiscal models are required.');
}

// Authoritative LOM totals from Table 22-3. The annual rows are rounded and
// therefore do not sum perfectly to these published total/average cells.
const reportOperatingUSD = 5_130.2 * M;
const reportTcRcPenaltiesUSD = 669.7 * M;
const reportTransportationUSD = 246.4 * M;
const reportOffsiteUSD = 916.1 * M;
const reportRoyaltyUSD = 337.8 * M;
const reportAgRevenueUSD = 194 * M;
const reportMoRevenueUSD = 586 * M;
const reportPayableCuLb = 3_162 * M;
const reportSustainingUSD = 68.8 * M;
const reportClosureUSD = 169.8 * M;

assert.ok(Math.abs(reportTcRcPenaltiesUSD + reportTransportationUSD - reportOffsiteUSD) < 1, 'Copper Creek Table 22-3 off-site total must equal TC/RC/penalties plus transportation.');

// Table 22-3 is mathematically self-consistent: Cash Cost (By-Product Basis)
// uses operating + all off-site costs less Ag/Mo revenue over payable Cu. It
// EXCLUDES royalties; AISC then adds royalties, sustaining capital and closure.
// This directly conflicts with the Table 22-1 footnote saying royalties are in
// cash cost. Preserve the source conflict instead of silently normalising it.
const reportCashNumeratorUSD = reportOperatingUSD + reportOffsiteUSD - reportAgRevenueUSD - reportMoRevenueUSD;
const reportCashCost = reportCashNumeratorUSD / reportPayableCuLb;
const reportAiscNumeratorUSD = reportCashNumeratorUSD + reportRoyaltyUSD + reportSustainingUSD + reportClosureUSD;
const reportAisc = reportAiscNumeratorUSD / reportPayableCuLb;

assert.ok(Math.abs(reportCashCost - 1.6654965211891208) < 1e-12);
assert.ok(Math.abs(reportCashCost - 1.67) < 0.005, 'Copper Creek Table 22-3 cash cost must reconstruct to reported 1.67 USD/lb.');
assert.ok(Math.abs(reportAisc - 1.8477862112586974) < 1e-12);
assert.ok(Math.abs(reportAisc - 1.85) < 0.005, 'Copper Creek Table 22-3 AISC must reconstruct to reported 1.85 USD/lb.');

// Year 1 (2026) independently reproduces the published 2.34 / 2.44 rows from
// canonical quantities and report-deck prices. This also source-locks payable Cu
// as the denominator rather than recovered/produced Cu.
const t = raw.time.productionStartPeriod;
const reportDeck = raw.verification?.report?.priceDeckByKey;
assert.ok(reportDeck);
if (!reportDeck) throw new Error('Copper Creek report price deck is required.');
const agPrice = reportDeck.XAG_USD_TOZ;
const moPricePerTonne = reportDeck.MO_USD_TONNE;
assert.equal(typeof agPrice, 'number');
assert.equal(typeof moPricePerTonne, 'number');
if (typeof agPrice !== 'number' || typeof moPricePerTonne !== 'number') {
  throw new Error('Copper Creek Ag and Mo report prices must be numeric.');
}
const moPricePerLb = moPricePerTonne / COPPER_CREEK_LB_PER_TONNE;
assert.equal(agPrice, 20);
assert.ok(Math.abs(moPricePerLb - 13) < 1e-12);

const year1OperatingUSD = costModel.components.reduce(
  (total, component) => total + (typeof component.seriesUSD[t] === 'number' ? component.seriesUSD[t] : 0),
  0,
);
const year1OffsiteUSD = sellingModel.components.reduce(
  (total, component) => total + (typeof component.seriesUSD[t] === 'number' ? component.seriesUSD[t] : 0),
  0,
);
const year1PayableCuLb = raw.metals.payableQtyByMetal.Cu[t] ?? 0;
const year1AgRevenueUSD = (raw.metals.payableQtyByMetal.Ag[t] ?? 0) * agPrice;
const year1MoRevenueUSD = (raw.metals.payableQtyByMetal.Mo[t] ?? 0) * moPricePerLb;
const reportLockedRoyalty = fiscalModel.reportLockedItems?.find((item) => item.id === 'combined_south32_franco_royalties');
assert.ok(reportLockedRoyalty);
if (!reportLockedRoyalty) throw new Error('Copper Creek report-locked royalty series is required.');
const year1RoyaltyUSD = reportLockedRoyalty.reportFiscalTakeUSD[t] ?? 0;
const year1SustainingUSD = raw.capital.sustainingCapexUSD[t] ?? 0;
const year1ClosureUSD = raw.capital.closureUSD[t] ?? 0;
const year1CashCost = (year1OperatingUSD + year1OffsiteUSD - year1AgRevenueUSD - year1MoRevenueUSD) / year1PayableCuLb;
const year1Aisc = (year1OperatingUSD + year1OffsiteUSD - year1AgRevenueUSD - year1MoRevenueUSD + year1RoyaltyUSD + year1SustainingUSD + year1ClosureUSD) / year1PayableCuLb;
assert.ok(Math.abs(year1CashCost - 2.3417977528089886) < 1e-12);
assert.ok(Math.abs(year1CashCost - 2.34) < 0.01);
assert.ok(Math.abs(year1Aisc - 2.444044943820225) < 1e-12);
assert.ok(Math.abs(year1Aisc - 2.44) < 0.01);

// Rounded canonical annual rows remain close to the authoritative report totals
// without hidden balancing entries.
const canonicalOperatingUSD = costModel.components.reduce((total, component) => total + sumNumeric(component.seriesUSD), 0);
const canonicalOffsiteUSD = sellingModel.components.reduce((total, component) => total + sumNumeric(component.seriesUSD), 0);
const canonicalRoyaltyUSD = sumNumeric(reportLockedRoyalty.reportFiscalTakeUSD);
const canonicalPayableCuLb = sumNumeric(raw.metals.payableQtyByMetal.Cu);
const canonicalAgRevenueUSD = sumNumeric(raw.metals.payableQtyByMetal.Ag) * agPrice;
const canonicalMoRevenueUSD = sumNumeric(raw.metals.payableQtyByMetal.Mo) * moPricePerLb;
const canonicalCashCost = (canonicalOperatingUSD + canonicalOffsiteUSD - canonicalAgRevenueUSD - canonicalMoRevenueUSD) / canonicalPayableCuLb;
const canonicalAisc = (canonicalOperatingUSD + canonicalOffsiteUSD - canonicalAgRevenueUSD - canonicalMoRevenueUSD + canonicalRoyaltyUSD + sumNumeric(raw.capital.sustainingCapexUSD) + sumNumeric(raw.capital.closureUSD)) / canonicalPayableCuLb;
assert.ok(Math.abs(canonicalOperatingUSD - reportOperatingUSD) <= 0.3 * M);
assert.ok(Math.abs(canonicalOffsiteUSD - reportOffsiteUSD) <= 0.3 * M);
assert.ok(Math.abs(canonicalRoyaltyUSD - reportRoyaltyUSD) <= 0.2 * M);
assert.ok(Math.abs(canonicalPayableCuLb - reportPayableCuLb) <= 1 * M);
assert.ok(Math.abs(canonicalCashCost - 1.67) < 0.01);
assert.ok(Math.abs(canonicalAisc - 1.85) < 0.01);

const cashCheckpoint = raw.verification?.reportedCostCheckpoints?.find((row) => row.metric === 'CASH_COST_BY_PRODUCT_CU_USD_PER_LB');
const aiscCheckpoint = raw.verification?.reportedCostCheckpoints?.find((row) => row.metric === 'AISC_CU_BY_PRODUCT_USD_PER_LB');
assert.equal(cashCheckpoint?.value, 1.67);
assert.equal(aiscCheckpoint?.value, 1.85);
assert.match(cashCheckpoint?.definitionNotes ?? '', /do not silently rename to C1/i);
assert.match(aiscCheckpoint?.definitionNotes ?? '', /report explicitly labels/i);

// Copper Creek is constant Q1 2023 USD, while the external S&P curve is 2024
// actual. The report metric is also explicitly by-product basis, not the required
// S&P net-revenue co-product C1. No percentile claim is therefore allowed.
const readiness = assessCuC1DefinitionReadiness(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, { hasStreams: false });
assert.deepEqual(readiness, {
  status: 'NOT_VERIFIED',
  blockers: [
    'exact allocation revenue/price vector',
    'full current C1 component boundary',
    'project-to-benchmark cost-vintage alignment',
  ],
});

console.log('copperCreekCostBridge.test.ts passed');
