import type { ProjectJsonV3 } from '../../schema.ts';

export const VIZCACHITAS_REPORT_POST_TAX_FCFF_USD = [
  -475138000, -624859000, -1003373000, 348490000, 1162732000, 791242000, 671202000, 534848000,
  574589000, 552579000, 209121000, 382010000, 403031000, 439431000, 421515000, 381379000,
  505076000, 407983000, 399011000, 263959000, 428147000, 409140000, 301301000, 501025000,
  491980000, 524848000, 491218000, 259781000, -3228000, -1399000, -88036000, -88036000,
  -88036000
] as const;
export const VIZCACHITAS_REPORT_PRE_TAX_FCFF_USD = [
  -475138000, -624859000, -1003373000, 348490000, 1179198000, 1032770000, 863845000, 750776000,
  749734000, 715754000, 354443000, 510664000, 514014000, 580030000, 552491000, 528327000,
  695064000, 555405000, 529699000, 358473000, 582447000, 563738000, 416716000, 687256000,
  673449000, 718253000, 673817000, 365407000, -3228000, -1399000, -88036000, -88036000,
  -88036000
] as const;

export const VIZCACHITAS_PFS_V3: ProjectJsonV3 = {
  version: 'project_json_v3',
  meta: {
    projectId: 'vizcachitas-pfs-2023-golden',
    projectName: 'Vizcachitas',
    currency: 'USD',
    notes: 'Golden PFS reconciliation fixture. Economic arrays are relative to Table 22.7 periods. runtimePlacement is intentionally null because the PFS financial model is not placed on a projected calendar.',
  },
  time: {
    masterN: 32,
    productionStartPeriod: 3,
    nameplateCapacityPeriod: 4,
    reportPeriodLabels: ['-3', '-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'],
    phaseByPeriod: ['construction', 'construction', 'construction', 'ramp_up', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'closure', 'closure', 'closure', 'closure'],
    runtimePlacement: null,
  },
  metals: {
    payableQtyByMetal: {
      Cu: [0, 0, 0, 146560, 231950, 200390, 172680, 181600, 168390, 159570, 151760, 151250, 147420, 155070, 143500, 153070, 171020, 150560, 133990, 119890, 150550, 146540, 126490, 153270, 144110, 147710, 133390, 90870, 4250, 0, 0, 0, 0],
      Mo: [0, 0, 0, 2000, 5260, 5410, 5040, 5990, 5890, 4160, 3850, 3520, 3740, 6900, 4730, 4080, 5510, 4690, 6820, 3640, 3980, 4340, 3100, 5730, 7550, 5120, 5900, 3530, 370, 0, 0, 0, 0],
      Ag: [0, 0, 0, 929800, 1485000, 1534400, 1296300, 1302400, 1290500, 1301500, 1246800, 1314100, 1204900, 1320000, 1226900, 1141100, 1126800, 1161700, 1148600, 1031700, 1146000, 1283800, 978000, 916400, 910300, 1174000, 1117700, 824200, 27700, 0, 0, 0, 0],
    },
    metalInProductQtyByMetal: {
      Cu: [0, 0, 0, 151870, 240360, 207660, 178940, 188180, 174500, 165350, 157260, 156740, 152760, 160690, 148710, 158620, 177220, 156020, 138850, 124240, 156010, 151850, 131080, 158820, 149340, 153060, 138230, 94160, 4400, 0, 0, 0, 0],
      Mo: [0, 0, 0, 2050, 5400, 5550, 5170, 6150, 6050, 4270, 3950, 3610, 3830, 7070, 4850, 4190, 5650, 4810, 7000, 3740, 4090, 4450, 3180, 5880, 7750, 5250, 6050, 3620, 380, 0, 0, 0, 0],
      Ag: [0, 0, 0, 1033200, 1650000, 1704900, 1440400, 1447100, 1433900, 1446200, 1385300, 1460200, 1338700, 1466600, 1363200, 1267900, 1252000, 1290800, 1276200, 1146400, 1273400, 1426500, 1086600, 1018300, 1011400, 1304500, 1241900, 915800, 30800, 0, 0, 0, 0],
    },
    revenueBasisByMetal: { Cu: 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION', Mo: 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION', Ag: 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION' },
    payableQtyUnitByMetal: { Cu: 'tonne', Mo: 'tonne', Ag: 'toz' },
    priceKeyByMetal: { Cu: 'CU_USD_LB', Mo: 'MO_USD_TONNE', Ag: 'XAG_USD_TOZ' },
    auPriceKey: 'XAU_USD_TOZ',
  },
  streamsByMetal: null,
  economics: {
    costModel: {
      mode: 'COMPONENTS',
      components: [
        { id: 'mining_opex', label: 'Mining Opex', category: 'mining', seriesUSD: [0,39106000,76392000,129057000,170281000,171952000,179105000,197429000,194860000,197509000,261171000,282446000,312837000,328709000,308050000,325185000,315671000,318169000,322658000,310484000,308955000,306566000,282738000,258214000,247595000,165237000,123579000,91678000,14426000,636000,0,0,0], sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362' },
        { id: 'stockpile_rehandling', label: 'Stockpile Rehandling Cost', category: 'mining', seriesUSD: [0,0,0,3379000,0,0,489000,0,0,4016000,6177000,3259000,0,0,1526000,2677000,0,207000,1163000,16586000,4694000,6114000,14829000,2876000,2041000,0,3533000,22056000,0,0,0,0,0], sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362' },
        { id: 'processing_opex', label: 'Processing Opex', category: 'processing', seriesUSD: [0,0,0,121287000,188345000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193374000,193301000,185765000,191735000,193288000,192865000,176823000,20929000,584000,0,0,0], sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362' },
        { id: 'surface_infrastructure', label: 'Surface Infrastructure', category: 'other_site_opex', seriesUSD: [0,0,0,37288000,57904000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59450000,59428000,57111000,58946000,59424000,59294000,54362000,6434000,179000,0,0,0], sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362' },
        { id: 'site_ga', label: 'G&A', category: 'site_ga', seriesUSD: [0,0,0,10333000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15121000,15115000,14473000,15039000,15121000,15078000,13715000,556000,0,0,0,0], sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362' },
      ],
    },
    sellingModel: {
      mode: 'COMPONENTS',
      components: [
        { id: 'selling_payability_ex_engine_payability', label: 'Selling & Payability Expenses net of engine-derived payability deduction', category: 'other_offsite', seriesUSD: [0,0,0,118125843,193145677,169653665,147415458,156982032,146482474,134678422,127813560,126389482,124358451,139943725,124223479,129329456,147556674,129461114,123216228,102633125,127032553,125427118,106149714,134576442,133029056,128694643,120085763,80384662,4381103,0,0,0,0], sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Tables 22.6-22.7, pp.357-362' },
        { id: 'receivables_finance_advance', label: 'Finance Advance', category: 'other_offsite', seriesUSD: [0,0,0,4951000,8066000,7086000,6146000,6533000,6102000,5634000,5348000,5301000,5194000,5792000,5180000,5404000,6128000,5394000,5100000,4295000,5314000,5239000,4440000,5570000,5479000,5351000,4977000,3343000,177000,0,0,0,0], sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362; Working Capital assumptions Table 22.2 p.351' },
      ],
    },
    fiscalTakeModel: {
      mode: 'RULES',
      items: [{ id: 'project_nsr_2pct', label: 'Project Net Smelter Return', placement: 'REVENUE_DEDUCTION', base: { line: 'NET_SMELTER_RETURN' }, rate: { type: 'FIXED', rate: 0.02 }, start_t: 3, end_t: 28, sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.1 p.351 and Table 22.7 pp.359-362', notes: '2% project NSR is applied after payability, selling/off-site deductions and Finance Advance, matching the Table 22.7 Project Net Smelter Return row.' }],
      reportLockedItems: [{
        id: 'chile_mining_royalty_tax', label: 'Mining Royalty Tax',
        reportFiscalTakeUSD: [0,0,0,17480000,63080000,45900000,28773000,32510000,41464000,37919000,28509000,26122000,22748000,32721000,24953000,28857000,43520000,28251000,24416000,15696000,33759000,33206000,21526000,50529000,50027000,59448000,57374000,27964000,0,0,0,0,0],
        placement: 'PRE_TAX_CHARGE',
        runtimeProxyRule: {
          id: 'chile_mining_royalty_tax_runtime_proxy', label: 'Mining Royalty Tax simplified runtime proxy', placement: 'PRE_TAX_CHARGE', base: { line: 'EBIT_BEFORE_FISCAL' },
          rate: { type: 'TIERED_MARGIN', numeratorLine: 'EBIT_BEFORE_FISCAL', denominatorLine: 'NET_SMELTER_RETURN', tiers: [{threshold:0,rate:0.05},{threshold:0.35,rate:0.08},{threshold:0.4,rate:0.105},{threshold:0.45,rate:0.13},{threshold:0.5,rate:0.155},{threshold:0.55,rate:0.18},{threshold:0.6,rate:0.21},{threshold:0.65,rate:0.24},{threshold:0.7,rate:0.275},{threshold:0.75,rate:0.31},{threshold:0.8,rate:0.345},{threshold:0.85,rate:0.14}] },
          start_t: 3, end_t: 28, sourceId: 'vizcachitas-pfs-2023 + chile-law-20469', pageOrTable: 'PFS Table 22.4 p.353; Chile Law 20.469 historical Article 64 bis/ter',
          notes: 'Runtime-only approximation. The PFS states Mining Operating Income is determined under specific tax rules; report reconciliation therefore uses the published annual Mining Royalty Tax series instead.'
        },
        sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7 pp.359-362; Section 22.1.4.2 pp.352-353', notes: 'Exact report cash-tax series for PFS reconciliation. Runtime uses the separately identified simplified margin proxy rather than reusing this locked series under changed prices.'
      }],
    },
    taxModel: {
      mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
      reportTaxCashFlowUSD: [0,0,0,0,-16466000,-241528000,-192643000,-215928000,-175146000,-163175000,-145322000,-128654000,-110983000,-140599000,-130977000,-146948000,-189988000,-147422000,-130688000,-94514000,-154300000,-154597000,-115415000,-186231000,-181469000,-193406000,-182598000,-105626000,0,0,0,0,0],
      runtime: { method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD', taxRate: 0.27 },
      notes: 'PFS report leg uses published First Category Tax cash flows. Runtime uses nominal 27% with loss carryforward only; tax planning and detailed tax depreciation are outside dashboard scope.',
    },
    depreciationUSD: null,
  },
  capital: {
    capexUSD: [475138000,585753000,926981000,453083000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    sustainingCapexUSD: [0,0,0,0,151395000,84924000,50572000,229612000,126859000,51725000,291894000,109156000,57705000,101335000,17312000,69969000,64497000,50556000,8118000,2661000,4783000,7956000,1058000,4231000,984000,172000,726000,4514000,977000,0,0,0,0],
    closureUSD: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,88036000,88036000,88036000],
    workingCapitalDeltaUSD: null,
    terminalProceedsUSD: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  },
  operations: {
    capacity: { throughputUnit: 'tpd', nameplateThroughput: 136000, utilizationPct: null },
    oreMilledTonnes: [0,0,0,33921000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49640000,49620000,47514000,49372000,49640000,49498000,45024000,1825000,0,0,0,0],
    oreTonnageUnit: 'tonne',
  },
  verification: {
    report: {
      sourceId: 'vizcachitas-pfs-2023',
      npvIrrPageOrTable: 'Table 22.8 p.363',
      pricesPageOrTable: 'Table 22.1 p.351; Summary/Table 1.3 and Section 25.14 confirm Mo price basis',
      periodsPageOrTable: 'Section 22.1.1 p.350; Tables 22.6-22.7 pp.357-362',
      discountRate: 0.08,
      discountConvention: 'mid_year',
      priceDeckByKey: { CU_USD_LB: 3.68, MO_USD_TONNE: 28439.63182122, XAG_USD_TOZ: 21.79 },
      reportNPVPostTaxUSD: 2776000000,
      reportIRRPostTax: 0.242,
      reportNPVPreTaxUSD: 3999000000,
      reportIRRPreTax: 0.285,
      toleranceRelative: 0.01,
      reportInitialCapexUSD: 2440955000,
      reportSustainingCapexUSD: 1493691000,
      reportClosureUSD: 264107000,
      reportClosurePeriod: 32,
      reportTerminalProceedsUSD: 0,
      assumptionsPageOrTable: 'Section 22.1 pp.350-356; Tables 22.1-22.7',
      assumptionsNotes: '2023 real USD, unlevered 100% equity asset-level cash flow. PFS has no projected calendar schedule. Working-capital receivables pipeline is financed at 3.5% and appears as Finance Advance in Table 22.7; there is no separate working-capital delta/unwind row. No salvage/residual value is assumed.',
    },
    reportedCostCheckpoints: [
      { metric: 'C1', value: 0.93, unit: 'USD_per_lb_Cu_produced', period: { kind: 'FIRST_N_OPERATING_YEARS', years: 8 }, sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 21.11 p.349', definitionNotes: 'Cash costs are calculated per pound copper produced. C1 first 8 years.' },
      { metric: 'C1', value: 1.25, unit: 'USD_per_lb_Cu_produced', period: { kind: 'LOM' }, sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 21.11 p.349', definitionNotes: 'Cash costs are calculated per pound copper produced. C1 LOM.' },
      { metric: 'AISC', value: 2.13, unit: 'USD_per_lb_Cu_produced', period: { kind: 'FIRST_N_OPERATING_YEARS', years: 8 }, sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 21.11 p.349', definitionNotes: 'AISC first 8 years; report definition includes all cash costs, sustaining capital and product selling expenses.' },
      { metric: 'AISC', value: 2.35, unit: 'USD_per_lb_Cu_produced', period: { kind: 'LOM' }, sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 21.11 p.349', definitionNotes: 'AISC LOM; report definition includes all cash costs, sustaining capital and product selling expenses.' },
    ],
  },
};
