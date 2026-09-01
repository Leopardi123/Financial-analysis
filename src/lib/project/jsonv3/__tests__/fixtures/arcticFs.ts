import type { ProjectJsonV3 } from '../../schema.ts';

function usdM(values: number[]): number[] {
  return values.map((value) => value * 1_000_000);
}
function operatingM(values: number[]): number[] {
  return usdM([0, 0, 0, ...values, 0]);
}
function operatingQty(values: number[], multiplier: number): number[] {
  return [0, 0, 0, ...values.map((value) => value * multiplier), 0];
}

export const ARCTIC_REPORT_PRE_TAX_FCFF_USD = usdM([
  -234.4, -473.2, -469.2,
  404.3, 408.7, 383.3, 374.1, 367.9, 364.9, 473.8, 426.9, 369.7, 470.1, 540.7, 462.9, 500.6,
  -428.4,
]);

export const ARCTIC_REPORT_POST_TAX_FCFF_USD = usdM([
  -234.4, -473.2, -469.2,
  393.8, 397.3, 353.3, 312.9, 303.3, 297.2, 367.5, 336.5, 293.0, 357.5, 408.4, 361.7, 442.7,
  -428.4,
]);

const payableCuKlb = [151175, 146013, 142583, 137387, 134852, 141803, 167411, 142499, 143517, 163112, 173249, 144427, 144855];
const payableZnKlb = [143256, 149381, 156519, 170411, 173700, 151480, 188011, 186782, 150724, 186729, 206931, 191688, 188157];
const payablePbKlb = [21068, 23396, 26443, 27266, 24590, 22721, 26400, 28209, 18325, 24684, 29618, 30845, 31220];
const payableAuKoz = [22, 29, 31, 34, 26, 26, 30, 34, 28, 38, 45, 38, 40];
const payableAgKoz = [2362, 2530, 2593, 2541, 2355, 2512, 2755, 2877, 2446, 3179, 3449, 3112, 3336];

const millFeedKt = [3012, 3650, 3650, 3650, 3650, 3650, 3650, 3651, 3650, 3650, 3650, 3650, 3529];

const miningM = [95.5, 91.0, 91.5, 92.0, 85.1, 93.4, 85.2, 82.6, 85.3, 75.7, 68.8, 64.5, 39.5];
const processingM = [72.0, 81.5, 82.1, 82.1, 82.1, 82.1, 82.1, 82.1, 82.1, 82.1, 82.1, 82.1, 80.3];
const waterTreatmentM = [4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2];
const siteGaM = [21.0, 21.0, 21.0, 21.0, 21.0, 21.0, 21.0, 21.0, 21.0, 21.0, 21.0, 21.0, 21.0];
const roadTollM = [9.1, 9.1, 31.1, 31.1, 31.1, 31.1, 31.1, 31.1, 31.1, 31.1, 31.1, 31.1, 31.1];
const offsiteM = [210.2, 213.4, 216.9, 219.4, 217.8, 211.4, 250.8, 232.1, 210.8, 246.8, 266.8, 237.3, 235.4];
const sustainingM = [8.0, 0, 2.8, 9.9, 0.2, 2.1, 13.4, 0.4, 9.1, 33.5, 31.9, 3.0, 0];

export const ARCTIC_REPORT_TAX_CASH_FLOW_USD = usdM([
  0, 0, 0,
  -10.4, -11.3, -30.0, -61.2, -64.6, -67.7, -106.4, -90.5, -76.6, -112.6, -132.3, -101.2, -57.9,
  0,
]);

/**
 * Arctic FS 2023 golden fixture.
 *
 * Report reconciliation uses the published Table 22-4 annual cash-tax series.
 * Runtime deliberately does NOT attempt to reproduce the EY federal/AST/AMLT
 * tax-planning model. Instead it uses a 19% dynamic effective cash-tax proxy.
 * At the report deck, on the same rounded public annual inputs, the proxy tax is
 * approximately US$1.054bn versus US$0.923bn reported (+14.2%). The bias is
 * intentionally modestly conservative rather than optimistic. The enum method
 * describes the simple engine mechanics; the 19% is not asserted to be a
 * statutory combined tax rate.
 */
export const ARCTIC_FS_V3: ProjectJsonV3 = {
  version: 'project_json_v3',
  meta: {
    projectId: 'arctic-fs-2023-golden',
    projectName: 'Arctic Project',
    currency: 'USD',
    notes: 'Arctic FS report-reconciliation fixture with user-supplied 2032 runtime production-start anchor. Annual published tables are rounded; no hidden balancing entries are added.',
  },
  time: {
    masterN: 16,
    productionStartPeriod: 3,
    nameplateCapacityPeriod: 4,
    reportPeriodLabels: ['-3', '-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'],
    phaseByPeriod: [
      'construction', 'construction', 'construction',
      'ramp_up',
      'operations', 'operations', 'operations', 'operations', 'operations', 'operations',
      'operations', 'operations', 'operations', 'operations', 'operations', 'operations',
      'closure',
    ],
    runtimePlacement: {
      productionStart: {
        year: 2032,
        sourceId: 'USER_SUPPLIED_2026-09-01',
        asOfDate: '2026-09-01',
        notes: 'Production-start year supplied by the user for current runtime placement. With productionStartPeriod=3 this implies t=0 in 2029.',
      },
      notes: 'Calendar placement only. It does not shift the FS-relative economics.',
    },
  },
  metals: {
    payableQtyByMetal: {
      Cu: operatingQty(payableCuKlb, 1_000),
      Zn: operatingQty(payableZnKlb, 1_000),
      Pb: operatingQty(payablePbKlb, 1_000),
      Au: operatingQty(payableAuKoz, 1_000),
      Ag: operatingQty(payableAgKoz, 1_000),
    },
    metalInProductQtyByMetal: null,
    revenueBasisByMetal: {
      Cu: 'PAYABLE_DIRECT',
      Zn: 'PAYABLE_DIRECT',
      Pb: 'PAYABLE_DIRECT',
      Au: 'PAYABLE_DIRECT',
      Ag: 'PAYABLE_DIRECT',
    },
    payableQtyUnitByMetal: {
      Cu: 'lb',
      Zn: 'lb',
      Pb: 'lb',
      Au: 'toz',
      Ag: 'toz',
    },
    priceKeyByMetal: {
      Cu: 'CU_USD_LB',
      Zn: 'ZN_USD_LB',
      Pb: 'PB_USD_LB',
      Au: 'XAU_USD_TOZ',
      Ag: 'XAG_USD_TOZ',
    },
    auPriceKey: 'XAU_USD_TOZ',
  },
  streamsByMetal: null,
  economics: {
    costModel: {
      mode: 'COMPONENTS',
      components: [
        { id: 'mining', label: 'Mining', category: 'mining', seriesUSD: operatingM(miningM), sourceId: 'arctic-fs-2023', pageOrTable: 'Table 22-4 pp.393-394' },
        { id: 'processing', label: 'Processing', category: 'processing', seriesUSD: operatingM(processingM), sourceId: 'arctic-fs-2023', pageOrTable: 'Table 22-4 pp.393-394' },
        { id: 'water_treatment', label: 'Water Treatment', category: 'other_site_opex', seriesUSD: operatingM(waterTreatmentM), sourceId: 'arctic-fs-2023', pageOrTable: 'Table 22-4 pp.393-394' },
        { id: 'site_ga', label: 'G&A', category: 'site_ga', seriesUSD: operatingM(siteGaM), sourceId: 'arctic-fs-2023', pageOrTable: 'Table 22-4 pp.393-394' },
        { id: 'road_toll', label: 'Road Toll', category: 'other_site_opex', seriesUSD: operatingM(roadTollM), sourceId: 'arctic-fs-2023', pageOrTable: 'Table 22-4 pp.393-394' },
      ],
    },
    sellingModel: {
      mode: 'AGGREGATE',
      sellingCostsUSD: operatingM(offsiteM),
    },
    fiscalTakeModel: {
      mode: 'NONE',
    },
    taxModel: {
      mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
      reportTaxCashFlowUSD: ARCTIC_REPORT_TAX_CASH_FLOW_USD,
      runtime: {
        method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD',
        taxRate: 0.19,
      },
      notes: 'REPORT: exact annual Table 22-4 cash tax from the EY-supported federal + Alaska State + AMLT model. RUNTIME: 19% conservative effective cash-tax proxy using the simple dynamic engine mechanics; this is not a statutory combined rate. It intentionally avoids modelling depletion pools, EICs, AMLT holiday detail, depreciation classes or other tax-planning mechanics. At the report deck it produces about 14% more LOM cash tax than the published US$922.7m, providing a controlled conservative bias rather than leaving tax unresolved or freezing report-dollar tax under Spot/Bear.',
    },
    depreciationUSD: null,
  },
  capital: {
    capexUSD: usdM([234.4, 473.2, 469.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    sustainingCapexUSD: operatingM(sustainingM),
    closureUSD: usdM([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 428.4]),
    workingCapitalDeltaUSD: null,
    terminalProceedsUSD: null,
  },
  operations: {
    capacity: {
      throughputUnit: 'tpd',
      nameplateThroughput: 10_000,
      utilizationPct: null,
    },
    oreMilledTonnes: operatingQty(millFeedKt, 1_000),
    oreTonnageUnit: 'tonne',
  },
  verification: {
    report: {
      sourceId: 'arctic-fs-2023',
      npvIrrPageOrTable: 'Table 22-2 pp.390-391; Table 22-3 p.392; Table 22-4 pp.393-394',
      pricesPageOrTable: 'Section 19.2; Table 19-1 p.324',
      periodsPageOrTable: 'Section 22.3; Table 22-4 pp.393-394',
      discountRate: 0.08,
      discountConvention: 'period_end_from_model_start',
      priceDeckByKey: {
        CU_USD_LB: 3.65,
        ZN_USD_LB: 1.15,
        PB_USD_LB: 1.00,
        XAU_USD_TOZ: 1650,
        XAG_USD_TOZ: 21,
      },
      reportNPVPostTaxUSD: 1_108_100_000,
      reportIRRPostTax: 0.228,
      reportNPVPreTaxUSD: 1_500_300_000,
      reportIRRPreTax: 0.258,
      toleranceRelative: 0.0225,
      reportInitialCapexUSD: 1_176_800_000,
      reportSustainingCapexUSD: 114_400_000,
      reportClosureUSD: 428_400_000,
      reportClosurePeriod: 16,
      reportWorkingCapitalUnwindUSD: null,
      reportWorkingCapitalUnwindPeriod: null,
      reportTerminalProceedsUSD: null,
      reportTerminalProceedsPeriod: null,
      assumptionsPageOrTable: 'Sections 19.2, 21.1.14, 21.2.1, 22.3-22.5; Tables 19-1, 21-18, 22-2, 22-3 and 22-4',
      assumptionsNotes: '100% Arctic Project basis. Annual payable quantities, site-cost components, off-site aggregate, CAPEX and cash tax are taken from the rounded published FS tables. The US$2.9691bn off-site aggregate already includes royalties, TC/RC, penalties, insurance, marketing/representation and concentrate transportation; fiscalTakeModel is therefore NONE to prevent double counting. No separate working-capital or terminal-proceeds line is disclosed in the published FS cash-flow table. The explicit 2.25% relative NPV/IRR tolerance is slightly wider than the normal 1-2% because the public annual payable/cash-flow rows and reported IRRs are rounded; hidden balancing entries are prohibited.',
    },
    reportedCostCheckpoints: [
      {
        metric: 'CASH_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB',
        value: 0.72,
        unit: 'USD/lb Cu payable',
        period: { kind: 'LOM' },
        sourceId: 'arctic-fs-2023',
        pageOrTable: 'Table 22-2 pp.390-391',
        definitionNotes: 'Exact report label: Cash Costs, Net of By-product Credits. Preserve as a report checkpoint; do not silently rename it C1 unless downstream compatibility rules prove the definitions equivalent.',
      },
      {
        metric: 'ALL_IN_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB',
        value: 1.61,
        unit: 'USD/lb Cu payable',
        period: { kind: 'LOM' },
        sourceId: 'arctic-fs-2023',
        pageOrTable: 'Table 22-2 pp.390-391',
        definitionNotes: 'Exact report label: All-in Cost, Net of By-product Credits. Report footnote says all-in cost includes all operating and sustaining capital costs. The FS does not call this AISC; do not relabel it AISC.',
      },
    ],
  },
};
