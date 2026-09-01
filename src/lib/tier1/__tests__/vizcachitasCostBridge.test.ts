import assert from 'node:assert/strict';
import { VIZCACHITAS_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/vizcachitasPfs.ts';
import { S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, assessCuC1DefinitionReadiness } from '../costDefinitionContract.ts';

const LB_PER_TONNE = 2204.6226218487757;
const raw = VIZCACHITAS_PFS_V3;
const start = raw.time.productionStartPeriod;
const first8 = Array.from({ length: 8 }, (_, index) => start + index);

assert.equal(raw.streamsByMetal, null, 'Vizcachitas has no stream contract, so generic stream-treatment uncertainty is not project-applicable.');
assert.equal(raw.economics.costModel.mode, 'COMPONENTS');
if (raw.economics.costModel.mode !== 'COMPONENTS') throw new Error('Vizcachitas cost components required.');

const componentById = new Map(raw.economics.costModel.components.map((component) => [component.id, component]));
function componentValue(id: string, t: number): number {
  const value = componentById.get(id)?.seriesUSD[t];
  assert.equal(typeof value, 'number', `Vizcachitas ${id}[${t}] must be numeric.`);
  return value as number;
}

const containedCu = raw.metals.metalInProductQtyByMetal?.Cu;
const payableCu = raw.metals.payableQtyByMetal.Cu;
const payableMo = raw.metals.payableQtyByMetal.Mo;
const payableAg = raw.metals.payableQtyByMetal.Ag;
assert.ok(containedCu && payableCu && payableMo && payableAg);

function reportDefinedC1Pool(t: number): number {
  // Section 21.2.3 defines Vizcachitas C1 as mining + processing. Table 22.7
  // exposes Stockpile Rehandling separately, so it is not silently folded into
  // this report-defined bridge.
  return componentValue('mining_opex', t) + componentValue('processing_opex', t);
}

const reportSiteC1PoolUSD = first8.reduce((sum, t) => sum + reportDefinedC1Pool(t), 0);
const containedCuLb = first8.reduce((sum, t) => sum + ((containedCu?.[t] as number) ?? 0) * LB_PER_TONNE, 0);
const payableCuLb = first8.reduce((sum, t) => sum + ((payableCu[t] as number) ?? 0) * LB_PER_TONNE, 0);
const reportBasisC1ProducedCu = reportSiteC1PoolUSD / containedCuLb;
const samePoolOnPaidCu = reportSiteC1PoolUSD / payableCuLb;

// Table 21.11 reports 0.93 USD/lb Cu for the first eight years and explicitly
// defines Vizcachitas C1 as mining + processing per pound copper produced.
// Rounded annual Table 22.7 rows reconstruct that reported basis within 1 cent,
// while merely switching the denominator to payable Cu moves the metric.
assert.ok(Math.abs(reportBasisC1ProducedCu - 0.9205063747772041) < 1e-9);
assert.ok(Math.abs(reportBasisC1ProducedCu - 0.93) < 0.01);
assert.ok(Math.abs(samePoolOnPaidCu - 0.9538762781787814) < 1e-9);
assert.ok(samePoolOnPaidCu - reportBasisC1ProducedCu > 0.03, 'Produced-Cu and paid-Cu denominators must not be treated as interchangeable.');

const lomProductionPeriods = payableCu
  .map((value, t) => ({ value, t }))
  .filter(({ value, t }) => t >= start && typeof value === 'number' && value > 0)
  .map(({ t }) => t);
const lomReportPoolUSD = lomProductionPeriods.reduce((sum, t) => sum + reportDefinedC1Pool(t), 0);
const lomContainedCuLb = lomProductionPeriods.reduce((sum, t) => sum + (((containedCu?.[t] as number) ?? 0) * LB_PER_TONNE), 0);
const lomReportBasisC1 = lomReportPoolUSD / lomContainedCuLb;
assert.ok(Math.abs(lomReportBasisC1 - 1.2544224226436176) < 1e-9);
assert.ok(Math.abs(lomReportBasisC1 - 1.25) < 0.01, 'Rounded Table 22.7 rows should reconcile the report LOM C1 within one cent.');

const verification = raw.verification?.report;
assert.ok(verification, 'Vizcachitas report verification is required.');
assert.equal(verification?.pricesPageOrTable, 'Table 22.1 p.351; Summary/Table 1.3 and Section 25.14 confirm Mo price basis');
assert.equal(verification?.npvIrrPageOrTable, 'Table 22.8 p.363');
assert.equal(verification?.discountRate, 0.08);

const priceCu = verification?.priceDeckByKey.CU_USD_LB;
const priceMo = verification?.priceDeckByKey.MO_USD_TONNE;
const priceAg = verification?.priceDeckByKey.XAG_USD_TOZ;
assert.equal(priceCu, 3.68);
assert.ok(typeof priceMo === 'number' && priceMo > 0);
assert.equal(priceAg, 21.79);

let grossPayableRevenueCuUSD = 0;
let grossPayableRevenueMoUSD = 0;
let grossPayableRevenueAgUSD = 0;
let diagnosticAllocatedCuCostUSD = 0;
for (const t of first8) {
  const cuRevenue = (payableCu[t] as number) * LB_PER_TONNE * (priceCu as number);
  const moRevenue = (payableMo[t] as number) * (priceMo as number);
  const agRevenue = (payableAg[t] as number) * (priceAg as number);
  const total = cuRevenue + moRevenue + agRevenue;
  assert.ok(total > 0);
  grossPayableRevenueCuUSD += cuRevenue;
  grossPayableRevenueMoUSD += moRevenue;
  grossPayableRevenueAgUSD += agRevenue;
  diagnosticAllocatedCuCostUSD += reportDefinedC1Pool(t) * (cuRevenue / total);
}

const grossPayableCuShare = grossPayableRevenueCuUSD
  / (grossPayableRevenueCuUSD + grossPayableRevenueMoUSD + grossPayableRevenueAgUSD);
const grossRevenueWeightedDiagnosticC1 = diagnosticAllocatedCuCostUSD / payableCuLb;

assert.ok(Math.abs(grossPayableCuShare - 0.8984478340879477) < 1e-9);
assert.ok(Math.abs(grossRevenueWeightedDiagnosticC1 - 0.8557933816530243) < 1e-9);

// This diagnostic is deliberately NOT promoted to S&P-compatible C1. S&P/SNL
// co-product methodology requires a net-revenue vector. Vizcachitas reports LOM
// net-revenue contributions as rounded 88% Cu / 10% Mo / balance Ag, but Table
// 22.7 aggregates Selling & Payability Expenses across products and does not
// expose an exact annual net-revenue vector by product. The exact current C1
// component boundary and 2023-real -> 2024-actual cost-vintage alignment also
// remain unresolved.
const readiness = assessCuC1DefinitionReadiness(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, { hasStreams: false });
assert.deepEqual(readiness, {
  status: 'NOT_VERIFIED',
  blockers: [
    'exact allocation revenue/price vector',
    'full current C1 component boundary',
    'project-to-benchmark cost-vintage alignment',
  ],
});

console.log('vizcachitasCostBridge.test.ts passed');
