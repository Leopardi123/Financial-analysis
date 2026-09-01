import type { ProjectJsonV3 } from '../../schema.ts';

export const COPPER_CREEK_LB_PER_TONNE = 2204.6226218487757;
export const COPPER_CREEK_REPORT_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043, 2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055, 2056, 2057, 2058, 2059, 2060, 2061, 2062];

function usdM(values: number[]): number[] { return values.map((value) => value * 1_000_000); }
function millionLb(values: number[]): number[] { return values.map((value) => value * 1_000_000); }
function thousandOz(values: number[]): number[] { return values.map((value) => value * 1_000); }

const payableCuMlb = [0, 0, 89, 178, 114, 106, 85, 107, 104, 105, 82, 85, 105, 111, 108, 107, 106, 112, 115, 109, 111, 127, 124, 123, 119, 115, 109, 101, 90, 76, 51, 33, 33, 23, 0, 0, 0, 0, 0];
const payableAgKoz = [0, 0, 204, 464, 213, 139, 207, 182, 279, 436, 664, 852, 918, 832, 615, 426, 275, 211, 184, 169, 174, 183, 192, 199, 206, 214, 218, 216, 207, 191, 143, 108, 108, 74, 0, 0, 0, 0, 0];
const payableMoMlb = [0, 0, 0, 0, 0.9, 1.9, 1.5, 3.2, 0.8, 0.8, 1.4, 1.9, 2.8, 3.2, 3, 2.5, 2.1, 1.7, 1.5, 1.3, 1.2, 1.3, 1.1, 1.1, 1.1, 1.1, 1, 1, 0.9, 0.9, 1, 1.1, 1.1, 0.8, 0, 0, 0, 0, 0];
const tcRcPenaltiesM = [0, 0, 15.8, 32.6, 16.8, 21.2, 17.6, 22.3, 21.8, 21.9, 18.3, 19.5, 25, 26.5, 25.7, 24.7, 23.8, 24.3, 24.8, 23.2, 23.5, 26.8, 26, 25.7, 25, 24.2, 23, 21.3, 19, 16.2, 11.3, 8.1, 8.1, 5.6, 0, 0, 0, 0, 0];
const transportationM = [0, 0, 6.5, 13.2, 7, 7.8, 6.4, 7.7, 8.3, 8.3, 6.5, 6.8, 8.5, 8.9, 8.7, 8.6, 8.5, 8.9, 9.2, 8.6, 8.8, 10.1, 9.8, 9.7, 9.4, 9.1, 8.7, 8, 7.1, 6, 4, 2.7, 2.7, 1.8, 0, 0, 0, 0, 0];
const royaltyM = [0, 0, 8.8, 12.2, 9.4, 12.5, 10.1, 13.1, 11.4, 11.5, 9.5, 10, 12.6, 13.2, 12.8, 12.4, 12, 12.4, 12.7, 12, 12.1, 13.8, 13.5, 13.3, 12.9, 12.5, 11.9, 11.1, 9.9, 8.4, 5.7, 4, 0, 0, 0, 0, 0, 0, 0];
const miningM = [0, 0, 109.5, 109.6, 109.5, 108, 107.1, 109.5, 58.4, 57.8, 31.4, 45.4, 63.8, 74.3, 74.3, 74.2, 74, 74.5, 74.4, 74.4, 75.2, 78.1, 79.9, 80.2, 80.2, 80.5, 80.2, 80.2, 80.2, 75.1, 45.2, 16.1, 16.1, 11.1, 0, 0, 0, 0, 0];
const millNonOxideM = [0, 0, 48.4, 64.3, 68.7, 68.9, 68.5, 69.2, 69, 69.1, 68.9, 69, 69.2, 68.9, 68.9, 68.9, 68.9, 68.9, 68.9, 68.9, 68.9, 68.9, 68.9, 69.2, 69.2, 69.4, 69.2, 69.2, 69.2, 69.2, 69, 68.7, 68.7, 47.3, 0, 0, 0, 0, 0];
const millOxideM = [0, 0, 13.8, 22.5, 35.5, 24.3, 11, 25.3, 0.2, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const gaM = [0, 0, 18.5, 23, 25.1, 23.8, 22.3, 24.3, 20.2, 19.7, 19, 18.7, 18.3, 17.6, 16.9, 16.5, 16.3, 16.2, 16.1, 15.9, 15.8, 15.7, 15.3, 14.9, 14.3, 13.8, 13.2, 12.4, 11.7, 11.3, 11.2, 11.1, 11.1, 7.6, 0, 0.1, 0.1, 0.1, 0.1];
const projectCapexM = [184.7, 613.2, 0, 0, 91.8, 68.5, 78.5, 84.3, 136.4, 172, 151.9, 104.7, 124, 107.5, 66.6, 60.3, 61.6, 51.4, 37, 46.6, 37, 34.9, 24.7, 12.8, 17.9, 9.5, 10.2, 8.5, 18.2, 3.5, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const sustainingM = [0, 0, 0.3, 4.5, 0, 56.8, 2.3, 0, 0, 0, 4.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const closureM = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11.3, 2.5, 2.5, 16.9, 136.6, 0, 0, 0, 0, 0];
const reportTaxCashFlowM = [0, 0, 0, -15.4, -2, -1.3, -0.4, -1.6, -2.1, -2.6, -2.5, -3.8, -5.8, -6.7, -7.1, -20.9, -24.3, -28.9, -33.8, -28.1, -31.2, -41.9, -40.7, -41.9, -39.1, -38.2, -34.9, -30.1, -21.5, -15.7, -7.8, -4.3, -4.9, -2.8, 0, 0, 0, 0, 0];
const concentratorFeedKt = [0, 0, 8250, 11000, 11000, 11000, 11000, 11000, 11000, 11000, 11000, 11000, 11000, 11000, 10950, 10949, 10950, 10950, 10949, 10949, 10949, 10949, 10949, 10949, 10993, 10992, 11023, 10992, 10992, 10992, 11000, 11003, 10997, 11000, 7564, 0, 0, 0, 0];

export const COPPER_CREEK_REPORT_PRE_TAX_FCFF_USD = usdM([-184.7, -613.2, 120.6, 405.6, 85.6, 39.3, 20.8, 96.3, 86.6, 56.5, 32.5, 88.4, 134.7, 162.7, 189.8, 183.4, 170.2, 193, 217.9, 183.8, 199.1, 253.7, 250.5, 257.9, 240.5, 235.7, 216.1, 190.1, 141.9, 102.5, 58.8, 30.3, 19.9, -111.3, 0, -0.1, -0.1, -0.1, -0.1]);
export const COPPER_CREEK_REPORT_POST_TAX_FCFF_USD = usdM([-184.7, -613.2, 120.6, 390.2, 83.6, 38, 20.3, 94.8, 84.5, 53.9, 30, 84.6, 129, 156, 182.7, 162.5, 146, 164.2, 184.1, 155.8, 167.9, 211.9, 209.8, 215.9, 201.4, 197.5, 181.3, 160, 120.5, 86.8, 50.9, 26, 14.9, -114.1, 0, -0.1, -0.1, -0.1, -0.1]);

export const COPPER_CREEK_PEA_V3: ProjectJsonV3 = {
  version: 'project_json_v3',
  meta: {
    projectId: 'copper-creek-pea-2023-golden',
    projectName: 'Copper Creek Project',
    currency: 'USD',
    notes: 'Golden PEA reconciliation fixture. Table 22-3 publishes calendar columns 2024-2062, but V3 keeps canonical economics on relative t=0..38 and does not preserve those stale report calendar years as runtime placement. Runtime placement is intentionally null until current company schedule guidance is sourced.',
  },
  time: {
    masterN: 38,
    productionStartPeriod: 2,
    nameplateCapacityPeriod: 3,
    reportPeriodLabels: null,
    phaseByPeriod: ['construction', 'construction', 'ramp_up', ...new Array(31).fill('operations'), ...new Array(5).fill('closure')],
    runtimePlacement: null,
  },
  metals: {
    payableQtyByMetal: { Cu: millionLb(payableCuMlb), Ag: thousandOz(payableAgKoz), Mo: millionLb(payableMoMlb) },
    metalInProductQtyByMetal: null,
    revenueBasisByMetal: { Cu: 'PAYABLE_DIRECT', Ag: 'PAYABLE_DIRECT', Mo: 'PAYABLE_DIRECT' },
    payableQtyUnitByMetal: { Cu: 'lb', Ag: 'toz', Mo: 'lb' },
    priceKeyByMetal: { Cu: 'CU_USD_LB', Ag: 'XAG_USD_TOZ', Mo: 'MO_USD_TONNE' },
    auPriceKey: 'XAU_USD_TOZ',
  },
  streamsByMetal: null,
  economics: {
    costModel: {
      mode: 'COMPONENTS',
      components: [
        { id: 'mine', label: 'Mine operating costs', category: 'mining', seriesUSD: usdM(miningM), sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-3 pp.353-354' },
        { id: 'mill_non_oxide', label: 'Mill Processing (No Oxides)', category: 'processing', seriesUSD: usdM(millNonOxideM), sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-3 pp.353-354' },
        { id: 'mill_oxide', label: 'Mill Processing (Oxides)', category: 'processing', seriesUSD: usdM(millOxideM), sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-3 pp.353-354' },
        { id: 'ga', label: 'G&A Costs', category: 'site_ga', seriesUSD: usdM(gaM), sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-3 pp.353-354' },
      ],
    },
    sellingModel: {
      mode: 'COMPONENTS',
      components: [
        { id: 'tcrc_penalties', label: 'Total TC, RC & Penalties', category: 'other_offsite', seriesUSD: usdM(tcRcPenaltiesM), sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-3 p.354' },
        { id: 'transport', label: 'Transportation', category: 'transport', seriesUSD: usdM(transportationM), sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-3 p.354' },
      ],
    },
    fiscalTakeModel: {
      mode: 'RULES', items: [],
      reportLockedItems: [{
        id: 'combined_south32_franco_royalties',
        label: 'Table 22-3 combined South32 + Franco royalties',
        reportFiscalTakeUSD: usdM(royaltyM),
        placement: 'REVENUE_DEDUCTION',
        runtimeProxyRule: {
          id: 'combined_south32_franco_royalties_runtime_proxy',
          label: 'Conservative combined royalty proxy',
          placement: 'REVENUE_DEDUCTION',
          base: { line: 'NET_SMELTER_RETURN' },
          rate: { type: 'FIXED', rate: 0.03 },
          start_t: 2, end_t: 33,
          sourceId: 'copper-creek-pea-2023',
          pageOrTable: 'Section 4.3.2-4.3.3 pp.54-55; Table 22-3 pp.353-354',
          notes: 'Report leg uses exact combined annual royalty cash flow. Runtime cannot allocate royalty-bearing tonnes by claim from public Table 22-3, so it uses 3% of all project NSR as a deliberately simple conservative proxy. This approximates the report-deck combined royalty within a modest upward buffer and avoids pretending to know annual claim-level production.',
        },
        sourceId: 'copper-creek-pea-2023',
        pageOrTable: 'Section 4.3.2-4.3.3 pp.54-55; Table 22-3 pp.353-354',
        notes: 'South32 is a sliding net-returns royalty on most PEA inventory, reaching 3% above US$1.20/lb Cu. Franco carries a 1% NSR on a small portion plus US$0.5m/year for six years after commercial production. The public annual model discloses only their combined royalty cash flow, so reconciliation is report-locked and runtime uses one conservative transparent proxy.',
      }],
    },
    taxModel: {
      mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
      reportTaxCashFlowUSD: usdM(reportTaxCashFlowM),
      runtime: { method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD', taxRate: 0.095 },
      notes: 'REPORT: exact Table 22-3 annual cash-tax series, total US$542.3m. RUNTIME: 9.5% effective cash-tax proxy with loss carryforward. This is not a statutory combined rate. The PEA tax model includes federal/state income tax, Arizona severance tax, depreciation/depletion and FDII; reproducing those pools would be tax planning. At the report deck, the 9.5% proxy plus runtime royalty proxy produces about 9.8% more LOM cash tax than the report, deliberately modestly conservative.',
    },
    depreciationUSD: null,
  },
  capital: {
    capexUSD: usdM(projectCapexM),
    sustainingCapexUSD: usdM(sustainingM),
    closureUSD: usdM(closureM),
    workingCapitalDeltaUSD: new Array(39).fill(0),
    terminalProceedsUSD: new Array(39).fill(0),
  },
  operations: {
    capacity: { throughputUnit: 'tpd', nameplateThroughput: 30000, utilizationPct: null },
    oreMilledTonnes: concentratorFeedKt.map((value) => value * 1_000),
    oreTonnageUnit: 'tonne',
  },
  verification: {
    report: {
      sourceId: 'copper-creek-pea-2023',
      npvIrrPageOrTable: 'Section 22.1 and Table 22-1 pp.348-349; Table 22-3 pp.353-354',
      pricesPageOrTable: 'Section 22.4.1 p.351; Table 22-1 pp.348-349; Table 22-3 p.353',
      periodsPageOrTable: 'Section 22.4.1 p.351; Table 22-3 pp.353-354 (calendar columns 2024-2062; economic order mapped to relative t=0..38)',
      discountRate: 0.07,
      discountConvention: 'period_end_from_model_start',
      priceDeckByKey: { CU_USD_LB: 3.80, XAG_USD_TOZ: 20, MO_USD_TONNE: 13 * COPPER_CREEK_LB_PER_TONNE },
      reportNPVPostTaxUSD: 713_000_000,
      reportIRRPostTax: 0.156,
      reportNPVPreTaxUSD: 846_500_000,
      reportIRRPreTax: 0.165,
      toleranceRelative: 0.02,
      reportSustainingCapexUSD: 68_800_000,
      reportClosureUSD: 169_800_000,
      reportClosurePeriod: 33,
      reportWorkingCapitalUnwindUSD: null,
      reportWorkingCapitalUnwindPeriod: null,
      reportTerminalProceedsUSD: 0,
      reportTerminalProceedsPeriod: null,
      assumptionsPageOrTable: 'Sections 4.3.2-4.3.3 pp.54-55; Sections 21.2.9, 22.1, 22.3-22.5 pp.341, 348-354; Table 22-1 and Table 22-3',
      assumptionsNotes: '100% project basis, constant Q1 2023 USD, 100% equity, two-year construction, end-of-period cash flows discounted to start of construction. Table 22-3 directly reports payable Cu/Ag/Mo, off-site costs, combined royalties, operating costs, initial/expansion/sustaining/closure capital and cash tax. Change in Working Capital is blank/zero throughout and the published FCFF identity closes without a WC leg. Annual rows are rounded; no balancing entries are introduced. Initial capital US$797.9m and expansion capital US$1,620.6m are hard-checked separately in the Copper Creek golden test because the current verification checkpoint type has only one undifferentiated capex-total slot.',
    },
    reportedCostCheckpoints: [
      { metric: 'CASH_COST_BY_PRODUCT_CU_USD_PER_LB', value: 1.67, unit: 'USD/lb Cu', period: { kind: 'LOM' }, sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-1 pp.348-349; Table 22-3 p.354', definitionNotes: 'Report label Cash Cost / Cash Costs (By-Product Basis). Footnote: cash costs consist of mining costs, processing costs, mine-level G&A and refining charges and royalties. Preserve report label; do not silently rename to C1 unless downstream compatibility rules prove equivalence.' },
      { metric: 'AISC_CU_BY_PRODUCT_USD_PER_LB', value: 1.85, unit: 'USD/lb Cu', period: { kind: 'LOM' }, sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-1 pp.348-349; Table 22-3 p.354', definitionNotes: 'Report explicitly labels this All-in Sustaining Cost (AISC). Footnote: AISC includes cash costs plus sustaining capital and closure costs; Table 22-3 also states AISC includes cash costs plus sustaining capital, royalties and closure costs. Retain the report definition as checkpoint evidence.' },
    ],
  },
};
