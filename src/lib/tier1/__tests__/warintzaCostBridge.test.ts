import assert from 'node:assert/strict';
import { WARINTZA_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/warintzaPfs.ts';
import {
  S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  assessCuC1DefinitionReadiness,
} from '../costDefinitionContract.ts';

const M = 1_000_000;
const LB_PER_TONNE = 2204.6226218487757;
const raw = WARINTZA_PFS_V3;
const length = raw.time.masterN + 1;

function sumSeries(values: readonly (number | null | undefined)[]): number {
  return values.reduce((total, value) => total + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0);
}

const stream = raw.streamsByMetal?.Au;
if (!stream) throw new Error('Warintza golden fixture must preserve the Royal Gold Au stream.');
assert.equal(stream.deliveryMode, 'DIRECT_QTY_SERIES');
assert.equal(stream.inputPayableBasis, 'POST_STREAM');
assert.equal(stream.purchasePrice.kind, 'CUMULATIVE_QTY_TIERED_PCT_OF_SPOT');
if (stream.purchasePrice.kind !== 'CUMULATIVE_QTY_TIERED_PCT_OF_SPOT') {
  throw new Error('Warintza Royal Gold purchase price must remain cumulative-quantity tiered.');
}
assert.deepEqual(stream.purchasePrice.tiers, [
  { upToCumulativeQty: 90_000, value: 0.2 },
  { upToCumulativeQty: null, value: 0.6 },
]);

const report = raw.verification?.report;
if (!report) throw new Error('Warintza golden fixture requires verification.report.');
const goldPriceSeries = report.priceDeckSeriesByKey?.XAU_USD_TOZ;
if (!goldPriceSeries) throw new Error('Warintza report gold price series is required.');
assert.equal(goldPriceSeries.length, length);
assert.equal(stream.deliveredQtyByPeriod.length, length);

let cumulativeDeliveredAuOz = 0;
let reconstructedStreamRevenueUSD = 0;
for (let t = 0; t < length; t += 1) {
  const deliveredOz = stream.deliveredQtyByPeriod[t] ?? 0;
  const goldPrice = goldPriceSeries[t] ?? 0;
  const firstTierRemainingOz = Math.max(0, 90_000 - cumulativeDeliveredAuOz);
  const firstTierOz = Math.min(deliveredOz, firstTierRemainingOz);
  const secondTierOz = deliveredOz - firstTierOz;
  reconstructedStreamRevenueUSD += firstTierOz * goldPrice * 0.2 + secondTierOz * goldPrice * 0.6;
  cumulativeDeliveredAuOz += deliveredOz;
}
assert.equal(cumulativeDeliveredAuOz, 146_000, 'Rounded annual Table 22-8 stream deliveries must total 146 koz.');
assert.ok(
  Math.abs(reconstructedStreamRevenueUSD - 130.86 * M) < 1,
  `Warintza Royal Gold stream purchase revenue must reconstruct to US$130.86m from the source-locked annual series, received ${reconstructedStreamRevenueUSD}.`,
);

assert.equal(raw.economics.costModel.mode, 'COMPONENTS');
if (raw.economics.costModel.mode !== 'COMPONENTS') {
  throw new Error('Warintza canonical cost components are required.');
}
assert.equal(raw.economics.sellingModel.mode, 'AGGREGATE');
if (raw.economics.sellingModel.mode !== 'AGGREGATE') {
  throw new Error('Warintza aggregate selling-cost series is required.');
}

const miningComponent = raw.economics.costModel.components.find((component) => component.id === 'mining');
const processingComponent = raw.economics.costModel.components.find((component) => component.id === 'processing');
const gaComponent = raw.economics.costModel.components.find((component) => component.id === 'site_ga');
if (!miningComponent || !processingComponent || !gaComponent) {
  throw new Error('Warintza canonical mining, processing and site_ga components are required.');
}

const canonicalMiningUSD = sumSeries(miningComponent.seriesUSD);
const canonicalProcessingUSD = sumSeries(processingComponent.seriesUSD);
const canonicalGaUSD = sumSeries(gaComponent.seriesUSD);
const canonicalSellingUSD = sumSeries(raw.economics.sellingModel.sellingCostsUSD);

// Table 22.8 annual rows are rounded to US$1m. Their canonical sums therefore
// reconcile to the more precise Table 22.6 LOM totals within the disclosed
// annual rounding envelope, without changing Project economics.
assert.equal(canonicalMiningUSD, 3_116 * M);
assert.ok(Math.abs(canonicalProcessingUSD - 7_250 * M) <= 3 * M);
assert.ok(Math.abs(canonicalGaUSD - 1_010 * M) <= 5 * M);
assert.equal(canonicalSellingUSD, 3_204 * M);

const payableCuTonnes = sumSeries(raw.metals.payableQtyByMetal.Cu);
const payableAuOz = sumSeries(raw.metals.payableQtyByMetal.Au);
const payableAgOz = sumSeries(raw.metals.payableQtyByMetal.Ag);
const payableMoTonnes = sumSeries(raw.metals.payableQtyByMetal.Mo);
assert.equal(payableCuTonnes, 3_308_000);
assert.equal(payableAuOz, 836_000);
assert.equal(payableAgOz, 24_180_000);
assert.ok(Math.abs(payableMoTonnes - 154_100) < 1e-6);

// Table 22.6 LOM values are the denominator/oracle for the published C1 bridge.
// The annual payable rows in Table 22.8 are rounded, explaining the small
// 3,308 kt vs 3,306 kt and analogous differences above.
const reportPayableCuLb = 3_306_000 * LB_PER_TONNE;
const reportLomUSD = {
  mining: 3_116 * M,
  processing: 7_250 * M,
  ga: 1_010 * M,
  deductions: 3_204 * M,
  royalties: 2_529 * M,
  streamRevenue: 131 * M,
  auRevenue: 2_140 * M,
  agRevenue: 677 * M,
  moRevenue: 6_792 * M,
  sustaining: 1_713 * M,
};

const minePerLb = reportLomUSD.mining / reportPayableCuLb;
const plantPerLb = reportLomUSD.processing / reportPayableCuLb;
const gaPerLb = reportLomUSD.ga / reportPayableCuLb;
const tcrcPerLb = reportLomUSD.deductions / reportPayableCuLb;

// Warintza's stream economics are explicit in the PFS. The post-stream Au
// payable series is credited as Au revenue; the separate stream purchase
// revenue is added back against the royalty/stream burden.
const royaltyAndStreamingPerLb = (reportLomUSD.royalties - reportLomUSD.streamRevenue) / reportPayableCuLb;
const byProductsPerLb = -(reportLomUSD.auRevenue + reportLomUSD.agRevenue + reportLomUSD.moRevenue) / reportPayableCuLb;
const reconstructedC1 = minePerLb + plantPerLb + gaPerLb + tcrcPerLb + royaltyAndStreamingPerLb + byProductsPerLb;
const sustainingPerLb = reportLomUSD.sustaining / reportPayableCuLb;
const reconstructedAisc = reconstructedC1 + sustainingPerLb;

assert.ok(Math.abs(minePerLb - 0.43) < 0.005);
assert.ok(Math.abs(plantPerLb - 0.99) < 0.005);
assert.ok(Math.abs(gaPerLb - 0.14) < 0.005);
assert.ok(Math.abs(tcrcPerLb - 0.44) < 0.005);
assert.ok(Math.abs(royaltyAndStreamingPerLb - 0.33) < 0.005);
assert.ok(Math.abs(byProductsPerLb - (-1.32)) < 0.005);
assert.ok(Math.abs(reconstructedC1 - 1.01) < 0.005);
assert.ok(Math.abs(sustainingPerLb - 0.24) < 0.005);
assert.ok(Math.abs(reconstructedAisc - 1.25) < 0.005);

// This report C1 is an exact by-product-credit bridge, not an S&P co-product
// allocation. Warintza also has a real gold stream, so stream treatment cannot
// be waived as project-inapplicable.
const readiness = assessCuC1DefinitionReadiness(
  S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  { hasStreams: true },
);
assert.deepEqual(readiness, {
  status: 'NOT_VERIFIED',
  blockers: [
    'exact allocation revenue/price vector',
    'stream treatment',
    'full current C1 component boundary',
    'project-to-benchmark cost-vintage alignment',
  ],
});

console.log('warintzaCostBridge.test.ts passed');
