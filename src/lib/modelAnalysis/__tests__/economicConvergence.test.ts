import assert from 'node:assert/strict';
import { accelerateThroughput, buildEconomicConvergence, rerunEconomicModel, solveDiscountRate, type EconomicModelInput } from '../economicConvergence.ts';
import { buildConvergencePackages } from '../convergence.ts';
import type { CorporateSnapshotSeries } from '../../corporate/snapshot/types.ts';

const z = [0, 0, 0, 0];
const series: CorporateSnapshotSeries = {
  periodIndex: [0,1,2,3], yearsByPeriod: [2026,2027,2028,2029], oreMinedTonnes: z, oreMilledTonnes: [0,100,100,100], throughputUnit: 'tpa', nameplateThroughput: 100, utilizationPct: 100,
  payableQtyByMetal: { Au: [0,10,10,10] }, payableQtyUnitByMetal: { Au: 'toz' }, priceUsedByMetal_USD: { Au: [100,100,100,100] }, revenueByMetal_USD: { Au: [0,1000,1000,1000] }, totalRevenue_USD: [0,1000,1000,1000],
  operatingCostsUSD: [0,200,200,200], sustainingCapexUSD: [0,100,100,100], siteGandA_USD: z, royaltiesUSD: [0,50,50,50], reclamationUSD: [0,0,0,80], byproductCreditsUSD: z,
  sustainingCostUSD: [0,350,350,430], ebitdaUSD: [0,650,650,570], depreciationUSD: z, ebitUSD: [0,650,650,570], taxableIncomeUSD: [0,650,650,570], effectiveTaxRate: [null,.2,.2,.2], taxUSD: [0,130,130,114], workingCapitalDeltaUSD: [0,20,0,-20], fcffUSD: [0,400,420,356], capexUSD: z, totalCapexUSD: [0,100,100,100], royaltiesDetail: [{ id:'r', label:'NSR', royaltyUSD:[0,50,50,50] }],
};
const baseInput: EconomicModelInput = { series, discountRate:.1, fx:1, shares:100, netCashTarget:0, referencePeriod:1, dcfPerShare:9, evPerShare:39, hasRoyaltyRules:true };

const scenarios = buildEconomicConvergence(baseInput);
for (const id of ['price','opex','sustaining']) {
  const item = scenarios.find((scenario) => scenario.id === id);
  assert.ok(item, `${id} package is numeric`);
  assert.ok(item.residualGapPct < 2 || item.status === 'Delvis gapstängande');
}
const royaltyInput = { ...baseInput, dcfPerShare: 1, evPerShare: 30 };
const royalty = buildEconomicConvergence(royaltyInput).find((item) => item.id === 'royalty');
assert.ok(royalty && royalty.status === 'Delvis gapstängande', 'royalty elimination partially closes gap');
assert.ok((royalty.neutralRoyaltyBuybackUSD ?? 0) > 0, 'neutral royalty buyback is discounted incremental after-tax FCFF');

const outsideMultiple = buildConvergencePackages({ dcfPerShare: 14.7, referenceMultiple:6, multiplePoints:[{multiple:5,valuePerShare:25},{multiple:6,valuePerShare:30},{multiple:7,valuePerShare:35}], currency:'SEK' }).find((item) => item.id === 'ev-multiple')!;
assert.equal(outsideMultiple.status, 'Matematiskt lösbart – utanför modellintervall');
assert.match(outsideMultiple.changedAssumptions[0], /2\.94×/);

const discount = solveDiscountRate({ ...baseInput, evPerShare: rerunEconomicModel(baseInput, undefined, 1, .5)?.dcf ?? 0 });
assert.equal(discount?.status, 'Matematiskt lösbart – utanför modellintervall');

const accelerated = accelerateThroughput(series, 1, 2);
assert.ok(accelerated);
assert.equal(accelerated.payableQtyByMetal.Au.reduce((a,b)=>a+b,0), 30, 'LOM production unchanged');
assert.equal(accelerated.reclamationUSD[accelerated.newLastPeriod], 80, 'closure moved to new final period');
assert.equal(accelerated.workingCapitalDeltaUSD[accelerated.newLastPeriod], 0, 'working-capital unwind moved net to new final period');

const unavailable = buildEconomicConvergence({ ...baseInput, series: { ...series, operatingCostsUSD:z, sustainingCapexUSD:z, royaltiesUSD:z, priceUsedByMetal_USD:{} }, hasRoyaltyRules:false });
assert.equal(unavailable.length, 0, 'no speculative packages emitted without underlying series');
console.log('Economic convergence deterministic tests passed');
