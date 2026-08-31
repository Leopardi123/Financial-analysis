import type { ProjectJsonV3 } from '../../schema.ts';

export const BERG_CAD_TO_USD = 0.73;
export const BERG_LB_PER_TONNE = 2204.6226218487757;

function cadM(values: number[]): number[] {
  return values.map((value) => value * 1_000_000 * BERG_CAD_TO_USD);
}
function operatingCadM(values: number[]): number[] {
  return cadM([0, 0, 0, ...values, 0]);
}
function operatingQty(values: number[], multiplier: number): number[] {
  return [0, 0, 0, ...values.map((value) => value * multiplier), 0];
}

export const BERG_REPORT_POST_TAX_FCFF_USD = cadM([-929, -1329, -1402, 1349, 1419, 963, 1034, 1532, 1108, 781, 670, 416, 539, 205, 540, 658, 194, 636, 844, 617, 749, 682, 478, 750, 847, 662, 692, 558, 446, 660, 475, 21]);
export const BERG_REPORT_PRE_TAX_FCFF_USD = cadM([-1183, -1694, -1800, 1441, 1793, 1149, 1333, 2079, 1647, 1146, 1009, 606, 859, 264, 890, 1019, 353, 1002, 1331, 1020, 1148, 1046, 736, 1195, 1329, 1010, 1088, 856, 692, 1053, 732, 21]);

const payableCuMlb = [228, 293, 205, 252, 316, 221, 163, 183, 134, 152, 110, 156, 165, 127, 187, 212, 179, 157, 147, 124, 159, 155, 126, 136, 113, 102, 123, 67];
const payableMoMlb = [22, 22, 15, 17, 29, 32, 25, 18, 16, 20, 6, 23, 19, 10, 16, 25, 27, 24, 23, 16, 25, 29, 22, 27, 19, 19, 26, 22];
const payableAgKoz = [3499, 4427, 3249, 3602, 4404, 3771, 3107, 2561, 2059, 2887, 1845, 3787, 2763, 1814, 2748, 3142, 2889, 2604, 2440, 2237, 3621, 3849, 2518, 2142, 2080, 2115, 2171, 1447];
const payableAuKoz = [17, 21, 18, 23, 25, 19, 16, 17, 12, 13, 15, 13, 13, 15, 17, 17, 14, 12, 11, 11, 12, 12, 10, 9, 10, 10, 9, 4];
const oreProcessedMt = [32, 48, 48, 48, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 25];
const totalOpexCadM = [615.8, 743.6, 755.4, 791.1, 794.7, 790.6, 742.5, 722.0, 760.5, 682.3, 756.6, 759.7, 655.9, 607.4, 682.8, 765.7, 751.4, 567.8, 577.3, 556.1, 571.4, 583.5, 516.0, 554.6, 483.2, 553.0, 463.4, 326.2];
const offsiteCadM = [156.8, 192.8, 133.4, 161.6, 215.0, 167.8, 126.4, 125.4, 96.0, 112.7, 69.6, 118.9, 118.6, 83.3, 125.9, 152.3, 137.0, 120.7, 113.2, 91.9, 123.8, 128.3, 101.5, 114.1, 90.0, 83.3, 105.3, 68.7];
const sustainingCadM = [18.0, 71.7, 37.2, 86.1, 66.4, 65.7, 40.0, 44.9, 46.8, 87.3, 35.4, 78.9, 35.4, 261.9, 40.1, 46.4, 233.9, 53.1, 37.5, 77.0, 46.9, 40.4, 26.4, 27.3, 25.2, 26.4, 24.5, 47.7];
const workingCapitalCashImpactCadM = [-133.6, -65.9, 69.6, -30.3, -65.5, 47.4, 47.4, 8.6, 35.2, -26.9, 59.5, -68.3, 3.2, 43.3, -48.0, -30.9, 15.3, 12.5, 9.5, 25.5, -43.2, -8.4, 35.2, -12.7, 26.7, 9.4, -30.2, 37.7, 78.1];

export const BERG_PFS_V3: ProjectJsonV3 = {
  version: 'project_json_v3',
  meta: {
    projectId: 'berg-pfs-2026-golden',
    projectName: 'Berg Copper Project',
    currency: 'USD',
    notes: 'Golden PFS reconciliation fixture. Table 22-4 is reported in C$ and all canonical USD cash-flow inputs are converted with the report-locked CAD:USD 0.73 assumption. Runtime calendar placement is intentionally null.',
  },
  time: {
    masterN: 31,
    productionStartPeriod: 3,
    nameplateCapacityPeriod: null,
    reportPeriodLabels: ['-3', '-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'],
    phaseByPeriod: ['construction', 'construction', 'construction', ...new Array(28).fill('operations'), 'closure'],
    runtimePlacement: null,
  },
  metals: {
    payableQtyByMetal: {
      Cu: operatingQty(payableCuMlb, 1_000_000),
      Mo: operatingQty(payableMoMlb, 1_000_000),
      Ag: operatingQty(payableAgKoz, 1_000),
      Au: operatingQty(payableAuKoz, 1_000),
    },
    metalInProductQtyByMetal: null,
    revenueBasisByMetal: { Cu: 'PAYABLE_DIRECT', Mo: 'PAYABLE_DIRECT', Ag: 'PAYABLE_DIRECT', Au: 'PAYABLE_DIRECT' },
    payableQtyUnitByMetal: { Cu: 'lb', Mo: 'lb', Ag: 'toz', Au: 'toz' },
    priceKeyByMetal: { Cu: 'CU_USD_LB', Mo: 'MO_USD_TONNE', Ag: 'XAG_USD_TOZ', Au: 'XAU_USD_TOZ' },
    auPriceKey: 'XAU_USD_TOZ',
  },
  streamsByMetal: null,
  economics: {
    costModel: {
      mode: 'AGGREGATE',
      operatingCostsUSD: operatingCadM(totalOpexCadM),
    },
    sellingModel: {
      mode: 'AGGREGATE',
      sellingCostsUSD: operatingCadM(offsiteCadM),
    },
    fiscalTakeModel: {
      mode: 'RULES',
      items: [{
        id: 'royal_gold_nsr_1pct',
        label: 'Royal Gold 1% NSR',
        placement: 'REVENUE_DEDUCTION',
        base: { line: 'NET_SMELTER_RETURN' },
        rate: { type: 'FIXED', rate: 0.01 },
        start_t: 3,
        end_t: 30,
        sourceId: 'berg-pfs-2026',
        pageOrTable: 'Section 1.4 p.2; Sections 22.3.4 and Table 22-4 pp.319, 323-324',
        notes: 'PFS states a 1% project NSR. Table 22-4 royalty equals approximately 1% of net revenue after off-site costs; the rule remains dynamic under changed price scenarios.',
      }],
    },
    taxModel: {
      mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
      reportTaxCashFlowUSD: cadM([254.7, 365.2, 398.3, -91.4, -374.8, -185.9, -299.7, -547.3, -538.5, -364.9, -339.8, -189.8, -319.6, -59.7, -349.6, -360.8, -158.5, -366.3, -486.3, -402.9, -399.4, -363.5, -257.7, -444.2, -481.3, -347.4, -396.3, -298.2, -246.3, -393.3, -257.0, 0]),
      runtime: {
        method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD',
        taxRate: 0.27,
      },
      notes: 'Report reconciliation uses the annual Table 22-4 Tax paid series, which includes the PFS tax model and CTM investment tax credit. Runtime uses a deliberately simplified 27% nominal proxy (15% federal general rate + 12% BC general corporate rate, official 2026 rates) with loss carryforward; it is not a reconstruction of BC Mineral Tax or tax planning.',
    },
    depreciationUSD: null,
  },
  capital: {
    capexUSD: cadM([1183.2, 1694.4, 1800.3, ...new Array(29).fill(0)]),
    sustainingCapexUSD: operatingCadM(sustainingCadM),
    closureUSD: cadM([...new Array(31).fill(0), 235.7]),
    workingCapitalDeltaUSD: cadM([0, 0, 0, ...workingCapitalCashImpactCadM.map((value) => -value)]),
    terminalProceedsUSD: cadM([...new Array(31).fill(0), 179.1]),
  },
  operations: {
    capacity: { throughputUnit: 'tpd', nameplateThroughput: 120000, utilizationPct: null },
    oreMilledTonnes: operatingQty(oreProcessedMt, 1_000_000),
    oreTonnageUnit: 'tonne',
  },
  verification: {
    report: {
      sourceId: 'berg-pfs-2026',
      npvIrrPageOrTable: 'Section 22.4 p.320; Table 22-3 pp.321-322',
      pricesPageOrTable: 'Section 22.3.1 p.318; Table 22-4 p.323',
      periodsPageOrTable: 'Table 22-4 pp.323-325',
      discountRate: 0.08,
      discountConvention: 'mid_year',
      priceDeckByKey: {
        CU_USD_LB: 4.75,
        MO_USD_TONNE: 20 * BERG_LB_PER_TONNE,
        XAG_USD_TOZ: 45,
        XAU_USD_TOZ: 3500,
      },
      reportNPVPostTaxUSD: 4_592_000_000 * BERG_CAD_TO_USD,
      reportIRRPostTax: 0.2379,
      reportNPVPreTaxUSD: 6_611_000_000 * BERG_CAD_TO_USD,
      reportIRRPreTax: 0.2376,
      toleranceRelative: 0.02,
      reportInitialCapexUSD: 4_677_900_000 * BERG_CAD_TO_USD,
      reportSustainingCapexUSD: 1_728_600_000 * BERG_CAD_TO_USD,
      reportClosureUSD: 235_700_000 * BERG_CAD_TO_USD,
      reportClosurePeriod: 31,
      reportWorkingCapitalUnwindUSD: 78_100_000 * BERG_CAD_TO_USD,
      reportWorkingCapitalUnwindPeriod: 31,
      reportTerminalProceedsUSD: 179_100_000 * BERG_CAD_TO_USD,
      reportTerminalProceedsPeriod: 31,
      assumptionsPageOrTable: 'Sections 22.2-22.3 pp.317-319; Table 22-4 pp.323-325',
      assumptionsNotes: 'All economic cash-flow rows are translated from report C$ to canonical USD using the report CAD:USD=0.73 assumption. Payable quantities are used exactly as rounded/published in Table 22-4; no contained/recovered metal chain or runtime FX is substituted for report reconciliation.',
    },
    reportedCostCheckpoints: [
      {
        metric: 'C1_CU_BY_PRODUCT_USD_PER_LB',
        value: -0.17,
        unit: 'USD/lb Cu',
        period: { kind: 'LOM' },
        sourceId: 'berg-pfs-2026',
        pageOrTable: 'Table 22-3 pp.321-322; Table 22-4 p.324',
        definitionNotes: 'By-product basis: mine, mill and G&A costs, off-site costs and royalties less by-product credits. The report checkpoint is retained as evidence only and does not override canonical project economics.',
      },
      {
        metric: 'C1_CUEQ_CO_PRODUCT_USD_PER_LB',
        value: 1.95,
        unit: 'USD/lb CuEq',
        period: { kind: 'LOM' },
        sourceId: 'berg-pfs-2026',
        pageOrTable: 'Table 22-3 pp.321-322; Table 22-4 p.324',
        definitionNotes: 'Co-product C1 checkpoint using the report CuEq formula. Evidence only; not a parallel economic input.',
      },
    ],
  },
};