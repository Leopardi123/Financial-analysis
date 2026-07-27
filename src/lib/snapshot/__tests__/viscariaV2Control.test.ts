import assert from 'node:assert/strict';
import test from 'node:test';
import { computeProjectPhase1 } from '../../project/phase1.ts';
import { computeCorporateCashWaterfall } from '../../corporate/financing/cashWaterfall.ts';
import { deriveBuildFundingNeedUSD } from '../../corporate/financing/deriveBuildFundingNeed.ts';
import { computeLista2CfDcfMetrics } from '../lista2CfDcf.ts';

const masterN = 20;
const productionStartPeriod = 2;
const years = Array.from({ length: 21 }, (_, t) => 2027 + t - productionStartPeriod);
const capex = [88704175,242256893,105389029,...new Array(18).fill(0)];
const sustaining = [0,0,5193107,95190971,30323107,14486408,22294757,20549223,17714272,19106117,12027379,9197767,18956602,12358350,5737961,3964660,12034563,5404757,1780777,18956796,0];
const operating = [1232136,16680680,43693301,88906602,99887282,94267476,96366893,97478738,95253301,95875728,90576990,90813689,94082621,98013204,100175825,97303398,101067184,99068252,88420583,29647476,0];
const ga = [3182816,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,3182816,0];
const depreciation = [2317961,8205437,26302233,35981650,45391068,48470000,49987573,51125340,52894175,54618155,56622621,56477767,53083495,48948350,35010097,30366602,24210485,20260583,16254078,14449515,0];
const wc = [1237864,2401165,1781068,-27835922,-8519417,-4067767,-3091748,1765728,266117,3043301,-1944369,510485,10239709,4420000,9144272,2897184,573883,-747184,151165,4053301,3718447];
const royalties = [0,0,208058,2845922,3422136,3586019,3780971,3687670,3672816,3400485,3378738,3378932,2959320,2877670,2191845,1929903,1929417,1959320,1812427,950777,0];
const byproduct = [0,0,0,16059709,44782913,55246214,64609320,61795922,56472039,61887961,75448641,71642524,27430971,230583,0,0,289612,654757,413204,0,0];
const payableCu = [0,0,1934,24665,26818,27174,27942,27389,27845,24709,22994,23420,24451,26727,20376,17941,17905,18142,16803,8839,0];
const canonicalRevenue = payableCu.map((qty) => qty * 9500);
const explicitNetRevenue = [0,0,17339320,237158835,285180194,298835146,315077087,307305243,306068544,283377184,281563592,281574854,246608835,239805340,182652816,160823107,160787087,163276311,151037282,79229223,0];
const expectedFcff = [-94356991,-266795049,-144381554,51177470.9,127619955.22,154813298.96,157415923.17,147558793.1,153054587.15,130945781.97,146209583.01,146375350.07,96162691.87,99270785.17,51743941.97,43963671.04,33932248.86,44609294.93,45362679.1,16052337.37,-3718447];

const phase1 = computeProjectPhase1({
  masterN, productionStartPeriod, revenueUSD: explicitNetRevenue, operatingCostsUSD: operating,
  sustainingCapexUSD: sustaining, siteGandA_USD: ga, royaltiesUSD: royalties,
  reclamationUSD: new Array(21).fill(0), capexUSD: capex, byproductCreditsUSD: new Array(21).fill(0),
  depreciationUSD: depreciation, workingCapitalDeltaUSD: wc, taxRate: 0.206,
});

test('Viscaria supplied v2 arrays reproduce canonical FCFF period by period', () => {
  assert.equal(years.length, masterN + 1);
  for (const series of [capex,sustaining,operating,ga,depreciation,wc,royalties,byproduct,payableCu]) assert.equal(series.length, masterN + 1);
  phase1.fcffUSD.forEach((value, t) => assert.ok(Math.abs((value as number) - expectedFcff[t]) < 0.01, `FCFF mismatch t=${t}`));
  assert.equal(canonicalRevenue[2], 18_373_000, 'metal-price revenue remains available for scenarios');
  assert.equal(explicitNetRevenue[3], 237_158_835, 'base FCFF uses supplied total net revenue without re-adding by-product credits');
});

test('rolling Viscaria DCF, High and NAV use remaining rather than historical CAPEX', () => {
  for (let t = 0; t <= masterN; t += 1) {
    const metrics = computeLista2CfDcfMetrics({ fcfUSD_total: phase1.fcffUSD, capexUSD_total: capex, masterN, productionStartPeriod: t, discountRate: 0.1, shares_post_financing: 1, fx_USD_to_TargetCurrency: 1, npvToday_USD: 0, netCash_t0_post_TargetCurrency: 0 }).metrics;
    const dcfControl = expectedFcff.slice(t).reduce((sum, value, offset) => sum + value / 1.1 ** offset, 0);
    const remainingCapex = capex.slice(t).reduce((sum, value) => sum + value, 0);
    const historicalCapex = capex.slice(0, t).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs((metrics.NPV_prodStart_USD as number) - dcfControl) < 0.02, `rolling NPV t=${t}`);
    assert.ok(Math.abs((metrics.DCF_prodStart_exCapex_USD as number) - (dcfControl + remainingCapex)) < 0.02, `High t=${t}`);
    assert.ok(Math.abs((metrics.NAV_prodStart_TargetCurrency as number) - dcfControl) < 0.02, `NAV t=${t}`);
    if (historicalCapex > 0) assert.notEqual(metrics.NAV_prodStart_TargetCurrency, dcfControl - historicalCapex);
  }
});

test('Viscaria funding window excludes 2025, includes current 2026 and first-production 2027 CAPEX', () => {
  const eligible = deriveBuildFundingNeedUSD({ yearsByPeriod: years, masterN, capexUSD_total: capex, projects: [{ projectId: 'p1', masterN, productionStartPeriod, yearsByPeriod: years }], valuationYear: 2026 });
  assert.equal(eligible, 347_645_922);
});

test('cash waterfall handles fully and partially cash-funded remaining CAPEX exactly once', () => {
  const remainingCapex = [0, 242_256_893, 105_389_029];
  const base = { yearsByPeriod: [2025, 2026, 2027], useLatestQuarterlyCash: true, cashUsedPercent: 1, minimumCashReserve: 0, projects: [{ projectId: 'p1', constructionStartPeriod: 1, capexNeedByPeriod: remainingCapex, fcffIncludesConstructionCapex: true, fcffByPeriod: remainingCapex.map((value) => -value) }] };
  const full = computeCorporateCashWaterfall({ ...base, latestQuarterlyCash: 347_645_922, debtPercent: 0 });
  assert.equal(full.totalInitialCashUsed, 347_645_922); assert.equal(full.remainingExternalFundingNeed, 0); assert.equal(full.debtAdded, 0); assert.equal(full.equityRaised, 0);
  const partial = computeCorporateCashWaterfall({ ...base, latestQuarterlyCash: 100_000_000, debtPercent: 0.25 });
  assert.equal(partial.totalInitialCashUsed, 100_000_000); assert.equal(partial.remainingExternalFundingNeed, 247_645_922); assert.equal(partial.debtAdded, 61_911_480.5); assert.equal(partial.equityRaised, 185_734_441.5);
});
