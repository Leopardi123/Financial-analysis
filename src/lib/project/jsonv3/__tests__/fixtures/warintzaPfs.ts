import type { ProjectJsonV3 } from '../../schema.ts';
const M=1_000_000, LB=2204.6226218487757;
const pad=(a:number[])=>[0,0,0,...a,0];
const mon=(a:number[])=>pad(a.map(v=>v*M));
const kt=(a:number[])=>pad(a.map(v=>v*1000));
const koz=(a:number[])=>pad(a.map(v=>v*1000));
export const WARINTZA_REPORT_POST_TAX_FCFF_USD=[-933,-1475,-1322,1066,1785,1454,1417,984,1027,1103,831,917,770,429,522,813,843,820,569,636,813,312,179,122,19,-200].map(v=>v*M) as readonly number[];
export const WARINTZA_PFS_V3: ProjectJsonV3={
version:'project_json_v3',
meta:{projectId:'warintza-pfs-2025-golden',projectName:'Warintza',currency:'USD',notes:'PFS golden fixture; runtimePlacement intentionally null.'},
time:{masterN:25,productionStartPeriod:3,nameplateCapacityPeriod:4,reportPeriodLabels:['-3','-2','-1','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23'],phaseByPeriod:['construction','construction','construction','ramp_up',...new Array(21).fill('operations'),'closure'] as ProjectJsonV3['time']['phaseByPeriod'],runtimePlacement:null},
metals:{payableQtyByMetal:{
Cu:kt([200,269,235,229,176,185,190,163,162,139,108,119,155,162,157,121,128,153,92,70,59,36]),
Au:koz([46,55,65,56,52,53,45,33,42,38,33,35,37,40,31,28,32,31,23,24,24,13]),
Ag:koz([1285,2892,1794,1091,1191,927,838,1112,1439,1675,594,610,728,668,829,1002,1031,1233,1052,884,960,345]),
Mo:kt([9.4,13.7,10.6,12.8,7.5,8.7,10.5,7.7,8.1,6.8,4.6,5.6,7.9,7.7,7.6,6,6.3,7.6,1.5,1.4,1.9,.2])},
metalInProductQtyByMetal:null,revenueBasisByMetal:{Cu:'PAYABLE_DIRECT',Au:'PAYABLE_DIRECT',Ag:'PAYABLE_DIRECT',Mo:'PAYABLE_DIRECT'},payableQtyUnitByMetal:{Cu:'tonne',Au:'toz',Ag:'toz',Mo:'tonne'},priceKeyByMetal:{Cu:'CU_USD_LB',Au:'XAU_USD_TOZ',Ag:'XAG_USD_TOZ',Mo:'MO_USD_TONNE'},auPriceKey:'XAU_USD_TOZ'},
streamsByMetal:{Au:{streamMetal:'Au',deliveryMode:'DIRECT_QTY_SERIES',deliveredQtyByPeriod:koz([9,12,10,10,8,8,8,7,7,6,5,5,7,7,7,5,6,7,4,3,3,2]),inputPayableBasis:'POST_STREAM',purchasePrice:{kind:'CUMULATIVE_QTY_TIERED_PCT_OF_SPOT',tiers:[{upToCumulativeQty:90000,value:.2},{upToCumulativeQty:null,value:.6}]},start_t:3,end_t:24,sourceId:'warintza-pfs-2025',pageOrTable:'Section 22.1.4.1 p.344; Table 22.8 pp.350-351'}},
economics:{
costModel:{mode:'COMPONENTS',components:[
{id:'mining',category:'mining',seriesUSD:mon([194,203,197,203,199,211,185,167,146,142,149,140,130,129,121,119,114,108,73,70,68,48]),sourceId:'warintza-pfs-2025',pageOrTable:'Table 22.8 pp.350-351'},
{id:'processing',category:'processing',seriesUSD:mon([303,336,336,336,336,336,336,336,336,336,336,336,336,336,336,336,336,336,336,336,336,230]),sourceId:'warintza-pfs-2025',pageOrTable:'Table 22.8 pp.350-351'},
{id:'site_ga',category:'site_ga',seriesUSD:mon([46,46,46,46,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,47,32]),sourceId:'warintza-pfs-2025',pageOrTable:'Table 22.8 pp.350-351'}]},
sellingModel:{mode:'AGGREGATE',sellingCostsUSD:mon([192,262,224,226,167,177,187,158,162,138,106,117,151,156,152,122,129,153,82,66,50,27])},
fiscalTakeModel:{mode:'RULES',items:[
{id:'ecuador_government_royalty',placement:'REVENUE_DEDUCTION',base:{line:'NET_SMELTER_RETURN',deductions:['STREAM_PURCHASE_REVENUE']},rate:{type:'FIXED',rate:.04},start_t:3,end_t:24,sourceId:'warintza-pfs-2025',pageOrTable:'Section 22.1.4.2 p.344; Table 22.8'},
{id:'royal_gold_post_stream_nsr',placement:'REVENUE_DEDUCTION',base:{line:'NET_SMELTER_RETURN',deductions:['STREAM_PURCHASE_REVENUE']},rate:{type:'FIXED',rate:.0045},start_t:3,end_t:24,sourceId:'warintza-pfs-2025',pageOrTable:'Section 22.1.4.1 p.344; Table 22.8'},
{id:'south32_nsr',placement:'REVENUE_DEDUCTION',base:{line:'NET_SMELTER_RETURN',deductions:['STREAM_PURCHASE_REVENUE']},rate:{type:'FIXED',rate:.02},start_t:3,end_t:24,sourceId:'warintza-pfs-2025',pageOrTable:'Section 22.1.4.3 p.344; Table 22.8'}]},
taxModel:{mode:'REPORT_LOCKED_WITH_RUNTIME_PROXY',reportTaxCashFlowUSD:[0,0,0,-340,-587,-450,-519,-306,-358,-392,-279,-295,-215,-171,-218,-355,-374,-358,-237,-266,-354,-118,-53,-42,-1,0].map(v=>v*M),runtime:{method:'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD',taxRate:.32},notes:'Report tax is Table 22.8 total taxes net of disclosed VAT recovery; runtime is a simplified nominal proxy.'},
depreciationUSD:[0,0,0,...[366,375,389,397,404,348,357,370,378,385,130,129,120,119,118,117,114,109,109,113,80,89].map(v=>v*M),83*M]},
capital:{capexUSD:[933*M,1475*M,1322*M,...new Array(23).fill(0)],sustainingCapexUSD:mon([273,87,143,81,67,79,85,130,86,69,63,68,58,68,57,49,40,46,45,45,45,31]),closureUSD:[...new Array(25).fill(0),200*M],workingCapitalDeltaUSD:null,terminalProceedsUSD:new Array(26).fill(0)},
operations:{capacity:{throughputUnit:'tpd',nameplateThroughput:165000,utilizationPct:null},oreMilledTonnes:pad([54.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,60.2,41.3].map(v=>v*M)),oreTonnageUnit:'tonne'},
verification:{report:{sourceId:'warintza-pfs-2025',npvIrrPageOrTable:'Table 22.5 p.346; Table 22.7 pp.348-349',pricesPageOrTable:'Table 22.1 p.342; Table 22.8 p.351',periodsPageOrTable:'Section 22 p.342; Table 22.8 pp.350-351',discountRate:.08,discountConvention:'period_end',priceDeckByKey:{CU_USD_LB:4.5,XAG_USD_TOZ:28,MO_USD_TONNE:20*LB},priceDeckSeriesByKey:{XAU_USD_TOZ:[2800,2800,2800,2800,2800,2800,...new Array(20).fill(2500)]},reportNPVPostTaxUSD:4617*M,reportIRRPostTax:.26,toleranceRelative:.02,reportInitialCapexUSD:3729*M,reportSustainingCapexUSD:1713*M,reportClosureUSD:200*M,reportClosurePeriod:25,assumptionsPageOrTable:'Sections 22.1.2-22.1.4 pp.342-344; Tables 22.4-22.8 pp.345-351',assumptionsNotes:'Gold is 2800/oz for production Years 1-3 and 2500/oz thereafter. Pre-tax checkpoints omitted because Table 22.8 separately discloses VAT recovery while the after-tax canonical tax leg nets VAT recovery.'},reportedCostCheckpoints:[
{metric:'C1_CU_USD_PER_LB',value:1.01,unit:'USD/lb payable Cu',period:{kind:'LOM'},sourceId:'warintza-pfs-2025',pageOrTable:'Table 22.4 p.345'},
{metric:'AISC_CU_USD_PER_LB',value:1.25,unit:'USD/lb payable Cu',period:{kind:'LOM'},sourceId:'warintza-pfs-2025',pageOrTable:'Table 22.4 p.345'}]}
};
