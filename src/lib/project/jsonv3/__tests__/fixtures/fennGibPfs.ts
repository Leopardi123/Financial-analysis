import type { ProjectJsonV3 } from '../../schema.ts';

export const FENN_GIB_CAD_TO_USD = 1 / 1.35;
export const FENN_GIB_REPORT_PERIODS = ['-3', '-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'];
export const FENN_GIB_REPORT_SUMMARY_SUSTAINING_CAPEX_CAD = 60_900_000;
export const FENN_GIB_REPORT_CASHFLOW_SUSTAINING_CAPEX_CAD = 68_200_000;

const M = 1_000_000;
function cadM(values: number[]): number[] {
  return values.map((value) => value * M * FENN_GIB_CAD_TO_USD);
}
function kt(values: number[]): number[] {
  return values.map((value) => value * 1_000);
}

const recoveredGoldKoz = [0, 0, 0, 57.3, 82.1, 70.4, 69.8, 73.3, 75.1, 58.2, 54.2, 52.7, 61.5, 68.4, 63, 61.4, 53.7, 18.7, 0];
const payableGoldOz = recoveredGoldKoz.map((value) => value * 1_000 * 0.9995);
const refiningTransportUSD = payableGoldOz.map((value) => value * 5);
const royaltiesAndRefiningCadM = [0, 0, 0, 4.4, 6.1, 5.1, 5, 5.5, 5.6, 4.3, 3.9, 3.7, 5.1, 5.5, 4.9, 4.5, 3.8, 1.3, 0];
const reportRoyaltyUSD = royaltiesAndRefiningCadM.map(
  (value, t) => Math.max(0, value * M * FENN_GIB_CAD_TO_USD - refiningTransportUSD[t]),
);

export const FENN_GIB_REPORT_GROSS_REVENUE_USD = cadM([0, 0, 0, 239.7, 343.3, 294.5, 292, 306.7, 314.1, 243.6, 226.8, 220.3, 257.3, 286.1, 263.4, 256.9, 224.6, 78, 0]);
export const FENN_GIB_REPORT_PRE_TAX_FCFF_USD = cadM([-93.1, -188.3, -168.6, 123.5, 222.4, 187.5, 177.2, 191.3, 195.2, 132.6, 109.8, 98.8, 142.9, 173.2, 166.3, 168.7, 146.8, 46.4, -46.2]);
export const FENN_GIB_REPORT_POST_TAX_FCFF_USD = cadM([-93.1, -188.3, -168.6, 123.5, 208.4, 174.1, 123.4, 131.9, 135.3, 94.4, 75.2, 68, 95.9, 116.1, 112.2, 114.2, 99.8, 34.5, -45.9]);

export const FENN_GIB_PFS_V3: ProjectJsonV3 = {
  version: 'project_json_v3',
  meta: {
    projectId: 'fenn-gib-pfs-2025-golden',
    projectName: 'Fenn-Gib Gold Project',
    currency: 'USD',
    notes: 'NI 43-101 PFS golden fixture. All Table 22-2 C$ cash-flow rows are converted to canonical USD with the report-locked C$1.35/US$1 assumption. The relative report axis Y-3..Y16 is preserved exactly and runtime calendar placement is sourced to the report: t=0/2026, first production t=3/2029, first full 4,800 t/d year t=4/2030. Table 21-1/Table 22-1 report C$60.9m sustaining capital while annual Table 22-2 cash-flow rows sum to C$68.2m; the annual cash-flow series is canonical for economic reconciliation and the discrepancy is retained explicitly in test evidence.',
  },
  time: {
    masterN: 18,
    productionStartPeriod: 3,
    nameplateCapacityPeriod: 4,
    reportPeriodLabels: FENN_GIB_REPORT_PERIODS,
    phaseByPeriod: ['construction', 'construction', 'construction', 'ramp_up', ...new Array(14).fill('operations'), 'closure'] as ProjectJsonV3['time']['phaseByPeriod'],
    runtimePlacement: {
      constructionStart: {
        year: 2026,
        sourceId: 'fenn-gib-pfs-2025',
        pageOrTable: 'Section 21.2.2.1 p.241; Section 22.3 p.274',
        asOfDate: '2025-12-19',
        notes: 'PFS states the project capital-cost estimate starts January 1, 2026 and pre-production lasts 36 months.',
      },
      productionStart: {
        year: 2029,
        sourceId: 'fenn-gib-pfs-2025',
        pageOrTable: 'Section 21.2.2.1 p.241; Section 22.3 p.274; Table 22-2 p.278',
        asOfDate: '2025-12-19',
        notes: 'Three-year pre-production period beginning January 1, 2026 maps report Year 1 / t=3 to 2029.',
      },
      nameplateCapacity: {
        year: 2030,
        sourceId: 'fenn-gib-pfs-2025',
        pageOrTable: 'Table 22-2 p.278; Section 17.1 p.187',
        asOfDate: '2025-12-19',
        notes: 'Report Year 2 / t=4 is the first full 1.752 Mt annual processed-tonnage year at the 4,800 t/d design rate.',
      },
      notes: 'All three sourced anchors imply the same t=0 calendar year 2026; no timeline interpolation or shift is used.',
    },
  },
  metals: {
    payableQtyByMetal: { Au: payableGoldOz },
    metalInProductQtyByMetal: null,
    revenueBasisByMetal: { Au: 'PAYABLE_DIRECT' },
    payableQtyUnitByMetal: { Au: 'toz' },
    priceKeyByMetal: { Au: 'XAU_USD_TOZ' },
    auPriceKey: 'XAU_USD_TOZ',
  },
  streamsByMetal: null,
  economics: {
    costModel: {
      mode: 'COMPONENTS',
      components: [
        { id: 'mining', label: 'Mining Cost', category: 'mining', seriesUSD: cadM([0, 0, 0, 47.3, 56.4, 54.3, 57.8, 55.3, 61.2, 62.9, 64.7, 70.9, 58.8, 57.7, 44.5, 37.5, 29.9, 11.3, 0]), sourceId: 'fenn-gib-pfs-2025', pageOrTable: 'Table 22-2 p.278' },
        { id: 'processing', label: 'Processing Cost', category: 'processing', seriesUSD: cadM([0, 0, 0, 28.9, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 33.3, 20.9, 0]), sourceId: 'fenn-gib-pfs-2025', pageOrTable: 'Table 22-2 p.278' },
        { id: 'site_ga', label: 'G&A Costs', category: 'site_ga', seriesUSD: cadM([0, 0, 0, 10.8, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 11.9, 6.2, 0]), sourceId: 'fenn-gib-pfs-2025', pageOrTable: 'Table 22-2 p.278' },
      ],
    },
    sellingModel: {
      mode: 'COMPONENTS',
      components: [{
        id: 'dore_refining_transport',
        label: 'Doré refining and transport',
        category: 'other_offsite',
        seriesUSD: refiningTransportUSD,
        sourceId: 'fenn-gib-pfs-2025',
        pageOrTable: 'Table 22-1 pp.275-276; Table 22-2 p.278',
      }],
    },
    fiscalTakeModel: {
      mode: 'RULES',
      items: [],
      reportLockedItems: [{
        id: 'property_nsr_royalties',
        label: 'Property NSR royalties',
        reportFiscalTakeUSD: reportRoyaltyUSD,
        placement: 'REVENUE_DEDUCTION',
        runtimeProxyRule: {
          id: 'property_nsr_royalties_runtime',
          label: 'LOM-average NSR royalty proxy',
          placement: 'REVENUE_DEDUCTION',
          base: { line: 'NET_SMELTER_RETURN' },
          rate: { type: 'FIXED', rate: 0.017 },
          start_t: 3,
          end_t: 17,
          sourceId: 'fenn-gib-pfs-2025',
          pageOrTable: 'Section 22.3.4 p.274; Table 22-1 pp.275-276; Section 4.8 pp.42-43',
          notes: 'Report reconciliation uses the annual royalty residual after separating the disclosed US$5/oz refining/transport charge from Table 22-2 Royalties & Refining Costs. Runtime uses the report-disclosed 1.7% LOM-average NSR because annual claim-level royalty allocation is not disclosed; no property-level production allocation is guessed.',
        },
        sourceId: 'fenn-gib-pfs-2025',
        pageOrTable: 'Section 22.3.4 p.274; Table 22-2 p.278',
        notes: 'The report states approximately C$64m undiscounted LOM royalties and provides only a combined annual Royalties & Refining Costs row. Annual report leg is therefore locked to that row less the independently disclosed US$5/oz refining/transport charge.',
      }],
    },
    taxModel: {
      mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
      reportTaxCashFlowUSD: cadM([0, 0, 0, 0, -14, -13.5, -53.9, -59.4, -60, -38.2, -34.6, -30.8, -46.9, -57, -54.1, -54.5, -47, -11.9, 0.3]),
      runtime: { method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD', taxRate: 0.265 },
      notes: 'REPORT: exact rounded Table 22-2 combined mining/provincial/federal tax cash-flow series, including Mayfair historical tax positions and construction-start tax basis. RUNTIME: simplified 26.5% combined federal/Ontario corporate income-tax proxy with loss carryforward; it does not pretend to reconstruct Ontario mining tax, historical tax pools or depreciation basis. Report reconciliation never uses this proxy.',
    },
    depreciationUSD: null,
  },
  capital: {
    capexUSD: cadM([93.1, 188.3, 168.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    sustainingCapexUSD: cadM([0, 0, 0, 12.7, 6.1, 6.1, 7.2, 8, 6.8, 4.5, 4.7, 2.8, 1.4, 2.2, 3.2, 0.9, 0.9, 0.7, 0]),
    closureUSD: cadM([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 49.4]),
    workingCapitalDeltaUSD: cadM([0, 0, 0, 12.2, 7.2, -3.8, -0.5, 1.4, 0.1, -5.8, -1.5, -1, 3.9, 2.4, -0.7, 0.1, -2, -8.8, -3.1]),
    terminalProceedsUSD: new Array(19).fill(0),
  },
  operations: {
    capacity: { throughputUnit: 'tpd', nameplateThroughput: 4800, utilizationPct: null },
    oreMilledTonnes: kt([0, 0, 0, 1447, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 906, 0]),
    oreMinedTonnes: kt([0, 0, 773, 674, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 1752, 906, 0]),
    oreTonnageUnit: 'tonne',
    gradeByMetal: { Au: [0, 0, 0, 1.44, 1.65, 1.4, 1.39, 1.46, 1.49, 1.18, 1.1, 1.07, 1.24, 1.36, 1.26, 1.23, 1.09, 0.76, 0] },
    gradeUnitByMetal: { Au: 'g/t' },
    recoveryPctByMetal: { Au: [0, 0, 0, 85.8, 88.4, 89.2, 89.2, 89.5, 89.6, 88, 87.5, 87.3, 88.4, 89, 88.5, 88.4, 87.4, 84.3, 0] },
  },
  verification: {
    report: {
      sourceId: 'fenn-gib-pfs-2025',
      npvIrrPageOrTable: 'Section 22.4 and Table 22-1 pp.274-276; annual cash flow Table 22-2 p.278',
      pricesPageOrTable: 'Section 22.3 p.274; Table 22-1 pp.275-276',
      periodsPageOrTable: 'Section 21.2.2.1 p.241; Section 22.3 p.274; Table 22-2 p.278',
      discountRate: 0.05,
      discountConvention: 'period_end_from_model_start',
      priceDeckByKey: { XAU_USD_TOZ: 3100 },
      reportNPVPostTaxUSD: 651_700_000 * FENN_GIB_CAD_TO_USD,
      reportIRRPostTax: 0.241,
      reportNPVPreTaxUSD: 980_500_000 * FENN_GIB_CAD_TO_USD,
      reportIRRPreTax: 0.288,
      toleranceRelative: 0.02,
      reportInitialCapexUSD: 450_000_000 * FENN_GIB_CAD_TO_USD,
      reportSustainingCapexUSD: FENN_GIB_REPORT_CASHFLOW_SUSTAINING_CAPEX_CAD * FENN_GIB_CAD_TO_USD,
      reportClosureUSD: 49_400_000 * FENN_GIB_CAD_TO_USD,
      reportClosurePeriod: 18,
      reportWorkingCapitalUnwindUSD: 3_100_000 * FENN_GIB_CAD_TO_USD,
      reportWorkingCapitalUnwindPeriod: 18,
      reportTerminalProceedsUSD: 0,
      reportTerminalProceedsPeriod: null,
      assumptionsPageOrTable: 'Sections 21.2.1-21.2.2 pp.240-241; Sections 22.2-22.4 pp.273-278; Tables 22-1 and 22-2',
      assumptionsNotes: '100% project basis; real Q3 2025 C$; C$1.35/US$1; US$3,100/oz Au; 99.95% payable; US$5/oz refining and transport; 1.7% LOM-average NSR; 36-month pre-production from Jan 1 2026; annual end-period cash flows discounted to start of construction; 100% equity except equipment leases. Table 22-1/21-1 reports C$60.9m sustaining capital, while Table 22-2 annual sustaining cash-flow rows sum to C$68.2m. The annual Table 22-2 series is used for NPV/IRR reconciliation and the discrepancy is explicitly retained rather than balanced away.',
    },
    reportedCostCheckpoints: [
      {
        metric: 'CASH_COST_AU_USD_PER_OZ',
        value: 1203,
        unit: 'USD/oz Au',
        period: { kind: 'LOM' },
        sourceId: 'fenn-gib-pfs-2025',
        pageOrTable: 'Table 22-1 pp.275-276',
        definitionNotes: 'Report cash cost checkpoint. Evidence only; canonical economics remain the annual Table 22-2 cost series.',
      },
      {
        metric: 'AISC_AU_USD_PER_OZ',
        value: 1292,
        unit: 'USD/oz Au',
        period: { kind: 'LOM' },
        sourceId: 'fenn-gib-pfs-2025',
        pageOrTable: 'Table 22-1 pp.275-276',
        definitionNotes: 'Report AISC checkpoint. Evidence only; it is not stored as a parallel calculation input.',
      },
    ],
  },
};
