import assert from 'node:assert/strict';
import { computeProjectPhase1 } from '../../src/lib/project/phase1.ts';
import { computeProjectPhase2 } from '../../src/lib/project/phase2.ts';

const revenue = [0,0,17339320,237158835,285180194,298835146,315077087,307305243,306068544,283377184,281563592,281574854,246608835,239805340,182652816,160823107,160787087,163276311,151037282,79229223,0];
const operating = [1232136,16680680,43693301,88906602,99887282,94267476,96366893,97478738,95253301,95875728,90576990,90813689,94082621,98013204,100175825,97303398,101067184,99068252,88420583,29647476,0];
const sustaining = [0,0,5193107,95190971,30323107,14486408,22294757,20549223,17714272,19106117,12027379,9197767,18956602,12358350,5737961,3964660,12034563,5404757,1780777,18956796,0];
const ga = [3182816,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,5456311,3182816,0];
const royalties = [0,0,208058,2845922,3422136,3586019,3780971,3687670,3672816,3400485,3378738,3378932,2959320,2877670,2191845,1929903,1929417,1959320,1812427,950777,0];
const credits = [0,0,0,16059709,44782913,55246214,64609320,61795922,56472039,61887961,75448641,71642524,27430971,230583,0,0,289612,654757,413204,0,0];
const depreciation = [2317961,8205437,26302233,35981650,45391068,48470000,49987573,51125340,52894175,54618155,56622621,56477767,53083495,48948350,35010097,30366602,24210485,20260583,16254078,14449515,0];
const capex = [88704175,242256893,105389029,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
const wc = [1237864,2401165,1781068,-27835922,-8519417,-4067767,-3091748,1765728,266117,3043301,-1944369,510485,10239709,4420000,9144272,2897184,573883,-747184,151165,4053301,3718447];
const zeros = revenue.map(() => 0);
const taxRate = 0.206;

const current = computeProjectPhase1({masterN:20,productionStartPeriod:2,revenueUSD:revenue,operatingCostsUSD:operating,sustainingCapexUSD:sustaining,siteGandA_USD:ga,royaltiesUSD:royalties,reclamationUSD:zeros,byproductCreditsUSD:credits,depreciationUSD:depreciation,taxRate,capexUSD:capex,workingCapitalDeltaUSD:wc});

// Exact pre-change implementation from parent of 00b9bd1.
const legacyEbit = revenue.map((r,t) => r-operating[t]-sustaining[t]-ga[t]-royalties[t]+credits[t]-depreciation[t]);
const legacyTax = legacyEbit.map(v => Math.max(0,v)*taxRate);
const legacyFcff = legacyEbit.map((v,t) => v-legacyTax[t]+depreciation[t]-capex[t]-sustaining[t]-wc[t]);

for (let t=0;t<revenue.length;t++) {
  assert.equal(current.ebitUSD[t], legacyEbit[t], `EBIT changed t=${t}`);
  assert.equal(current.taxUSD[t], legacyTax[t], `tax changed t=${t}`);
  assert.equal((current.fcffUSD[t] as number)-legacyFcff[t], sustaining[t], `FCFF delta != sustaining t=${t}`);
}

const before = computeProjectPhase2({masterN:20,productionStartPeriod:2,discountRate:0.10,fcffUSD:legacyFcff});
const after = computeProjectPhase2({masterN:20,productionStartPeriod:2,discountRate:0.10,fcffUSD:current.fcffUSD});
const sum = (xs: Array<number|null>) => xs.reduce<number>((a,v)=>a+(v??0),0);
const rows = revenue.map((_,t)=>({t,year:2025+t,sustainingCapexUSD:sustaining[t],ebitBefore:legacyEbit[t],ebitAfter:current.ebitUSD[t],taxBefore:legacyTax[t],taxAfter:current.taxUSD[t],fcffBefore:legacyFcff[t],fcffAfter:current.fcffUSD[t],delta:(current.fcffUSD[t] as number)-legacyFcff[t]}));

console.log(JSON.stringify({rows,totals:{sustainingCapexUSD:sum(sustaining),fcffBeforeUSD:sum(legacyFcff),fcffAfterUSD:sum(current.fcffUSD),fcffDeltaUSD:sum(current.fcffUSD)-sum(legacyFcff),npv10BeforeUSD:before.npvToday_USD,npv10AfterUSD:after.npvToday_USD,npv10DeltaUSD:(after.npvToday_USD as number)-(before.npvToday_USD as number),npv10DeltaSEK:((after.npvToday_USD as number)-(before.npvToday_USD as number))*10.3},byproduct:{creditsTotalUSD:sum(credits),note:'Provided revenueUSD already includes Fe net revenue; adding credits again is a separate, verified data/model double count.'}},null,2));
