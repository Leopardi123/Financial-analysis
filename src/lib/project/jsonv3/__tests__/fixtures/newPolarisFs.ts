import type { ProjectJsonV3 } from '../../schema.ts';

export const NEW_POLARIS_CAD_TO_USD = 0.725;
export const NEW_POLARIS_REPORT_PERIODS = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function cadM(values: number[]): number[] {
  return values.map((value) => value * 1_000_000 * NEW_POLARIS_CAD_TO_USD);
}

const payableAuOz = [0, 0, 59042, 97802, 93473, 87330, 94013, 82686, 92211, 87449, 14463, 0, 0, 0];
const oreMilledTonnes = [0, 0, 237781, 365998, 365999, 364898, 366000, 365994, 365997, 335930, 61575, 0, 0, 0];

const miningCadM = [0, 0, 18.1, 55.4, 53.5, 51.2, 53.1, 50.1, 47.4, 43.7, 10.8, 0, 0, 0];
const processingCadM = [0, 0, 18.3, 22.4, 22.7, 22.7, 22.7, 22.7, 22.7, 21.8, 6.6, 0, 0, 0];
const gaCadM = [0, 0, 22.7, 22.7, 22.7, 22.7, 22.7, 22.7, 22.7, 22.7, 9.4, 0, 0, 0];
const preProductionOpexCadM = [0, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const offsiteCadM = [0, 0, 12.9, 25.4, 27.2, 30.2, 29.4, 28.5, 30.4, 29.1, 5.2, 0, 0, 0];
const initialCapexCadM = [127.1, 123.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const sustainingCadM = [0, 0, 53.3, 64.3, 19.8, 20.6, 21.8, 20.5, 18.8, 5.8, 0.1, 0, 0, 0];
const closureCadM = [0, 1.0, 1.0, 1.0, 1.0, 10.3, 6.2, 0, 0, 0, 0, 0, 0, 0];
const workingCapitalDeltaCadM = [0, 0, 24.5, 0.8, 0.5, -1.2, -1.5, -0.3, 4.8, -5.6, -21.9, 0, 0, 0];
const terminalProceedsCadM = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 19.1, 0, 0, 0];
const reportTaxCashFlowCadM = [0, 0, -2.6, -4.2, -36.2, -47.6, -61.2, -51.1, -64.0, -63.5, -12.5, 0, 0, 0];

export const NEW_POLARIS_REPORT_PRE_TAX_FCFF_USD = cadM([-127.1, -124.4, 53.0, 145.4, 175.0, 144.9, 170.0, 141.1, 171.4, 184.2, 58.7, 0, 0, 0]);
export const NEW_POLARIS_REPORT_POST_TAX_FCFF_USD = cadM([-127.1, -124.4, 50.3, 141.2, 138.8, 97.3, 108.8, 89.9, 107.4, 120.7, 46.2, 0, 0, 0]);

export const NEW_POLARIS_FS_V3: ProjectJsonV3 = {
  version: 'project_json_v3',
  meta: {
    projectId: 'new-polaris-fs-2025-golden',
    projectName: 'New Polaris Gold Project',
    currency: 'USD',
    notes: 'Golden FS reconciliation fixture. Table 22-2 is reported in real 2025 Canadian dollars. Every CAD cash-flow input and report target is converted to canonical USD using the report assumption 1 CAD = 0.725 USD. The report gold price remains US$2,500/oz. Runtime calendar placement is intentionally null until current company schedule guidance is sourced.',
  },
  time: {
    masterN: 13,
    productionStartPeriod: 2,
    nameplateCapacityPeriod: 3,
    reportPeriodLabels: NEW_POLARIS_REPORT_PERIODS,
    phaseByPeriod: ['construction', 'construction', 'ramp_up', ...new Array(7).fill('operations'), 'operations', 'closure', 'closure', 'closure'],
    runtimePlacement: null,
  },
  metals: {
    payableQtyByMetal: { Au: payableAuOz },
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
        { id: 'mine', label: 'Mine operating costs', category: 'mining', seriesUSD: cadM(miningCadM), sourceId: 'new-polaris-fs-2025', pageOrTable: 'Table 22-2 p.264' },
        { id: 'mill', label: 'Mill processing costs', category: 'processing', seriesUSD: cadM(processingCadM), sourceId: 'new-polaris-fs-2025', pageOrTable: 'Table 22-2 p.264' },
        { id: 'ga', label: 'G&A costs', category: 'site_ga', seriesUSD: cadM(gaCadM), sourceId: 'new-polaris-fs-2025', pageOrTable: 'Table 22-2 p.264' },
        { id: 'preproduction_opex', label: 'Pre-production OPEX', category: 'other_site_opex', seriesUSD: cadM(preProductionOpexCadM), sourceId: 'new-polaris-fs-2025', pageOrTable: 'Table 22-2 p.264' },
      ],
    },
    sellingModel: {
      mode: 'COMPONENTS',
      components: [
        { id: 'freight_marketing', label: 'Total freight and marketing charge', category: 'other_offsite', seriesUSD: cadM(offsiteCadM), sourceId: 'new-polaris-fs-2025', pageOrTable: 'Table 22-2 p.264' },
      ],
    },
    fiscalTakeModel: {
      mode: 'NONE',
    },
    taxModel: {
      mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY',
      reportTaxCashFlowUSD: cadM(reportTaxCashFlowCadM),
      runtime: { method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD', taxRate: 0.27 },
      notes: 'REPORT: exact rounded annual unlevered cash-tax series from Table 22-2, converted at 1 CAD = 0.725 USD. RUNTIME: the disclosed 27% federal plus provincial corporate income-tax rate with loss carryforward. The report tax model also includes BC Mineral Tax (2% net current proceeds and 13% net revenue) and an opening C$6.8m tax loss; those pools are not guessed into the runtime proxy.',
    },
    depreciationUSD: null,
  },
  capital: {
    capexUSD: cadM(initialCapexCadM),
    sustainingCapexUSD: cadM(sustainingCadM),
    closureUSD: cadM(closureCadM),
    workingCapitalDeltaUSD: cadM(workingCapitalDeltaCadM),
    terminalProceedsUSD: cadM(terminalProceedsCadM),
  },
  operations: {
    capacity: { throughputUnit: 'tpd', nameplateThroughput: 1000, utilizationPct: null },
    oreMilledTonnes,
    oreTonnageUnit: 'tonne',
  },
  verification: {
    report: {
      sourceId: 'new-polaris-fs-2025',
      npvIrrPageOrTable: 'Section 22.4 and Tables 22-1 to 22-2 pp.263-264',
      pricesPageOrTable: 'Section 22.2 p.261; Tables 22-1 to 22-2 pp.263-264',
      periodsPageOrTable: 'Table 22-2 p.264 (report columns -2, -1, 1...12 mapped directly to relative t=0...13)',
      discountRate: 0.05,
      discountConvention: 'mid_year',
      priceDeckByKey: { XAU_USD_TOZ: 2500 },
      reportNPVPostTaxUSD: 425_000_000 * NEW_POLARIS_CAD_TO_USD,
      reportIRRPostTax: 0.3090,
      reportNPVPreTaxUSD: 666_000_000 * NEW_POLARIS_CAD_TO_USD,
      reportIRRPreTax: 0.3842,
      toleranceRelative: 0.02,
      reportInitialCapexUSD: 250_400_000 * NEW_POLARIS_CAD_TO_USD,
      reportSustainingCapexUSD: 225_000_000 * NEW_POLARIS_CAD_TO_USD,
      reportClosureUSD: 20_500_000 * NEW_POLARIS_CAD_TO_USD,
      reportClosurePeriod: 6,
      reportWorkingCapitalUnwindUSD: 21_900_000 * NEW_POLARIS_CAD_TO_USD,
      reportWorkingCapitalUnwindPeriod: 10,
      reportTerminalProceedsUSD: 19_100_000 * NEW_POLARIS_CAD_TO_USD,
      reportTerminalProceedsPeriod: 10,
      assumptionsPageOrTable: 'Sections 22.2-22.4 pp.261-264; Tables 22-1 and 22-2',
      assumptionsNotes: '100% project basis, unlevered and 100% equity funded, real 2025 dollars, two-year construction, mine life 8.3 years, full production by Q2 of the first operating year, all product sold in the year produced, constant US$2,500/oz gold, no inflation/escalation, cash flows discounted to the start of project execution, and 1 CAD = 0.725 USD. Section 22.3.4 explicitly includes no royalty in the economics because Canagold challenges the historic net-profit interest. Table 22-2 annual rows are rounded; no balancing entries are introduced.',
    },
    reportedCostCheckpoints: [
      { metric: 'CASH_COST_AU_USD_PER_OZ', value: 998, unit: 'USD/oz Au', period: { kind: 'LOM' }, sourceId: 'new-polaris-fs-2025', pageOrTable: 'Table 22-1 p.263; Table 22-2 p.264', definitionNotes: 'Report definition: mining, processing, mine-level G&A, off-site charges and royalties. The economic model includes no royalties.' },
      { metric: 'AISC_AU_USD_PER_OZ', value: 1248, unit: 'USD/oz Au', period: { kind: 'LOM' }, sourceId: 'new-polaris-fs-2025', pageOrTable: 'Table 22-1 p.263; Table 22-2 p.264', definitionNotes: 'Report definition: total cash cost plus sustaining CAPEX and closure CAPEX.' },
    ],
  },
};
