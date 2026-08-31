import type { QtyUnit } from '../jsonv1/schema.ts';

export type ProjectJsonV3CostComponentCategory =
  | 'mining'
  | 'processing'
  | 'site_ga'
  | 'other_site_opex';

export type ProjectJsonV3SellingComponentCategory =
  | 'treatment_charge'
  | 'refining_charge'
  | 'transport'
  | 'insurance'
  | 'marketing'
  | 'other_offsite';

export type ProjectJsonV3SeriesComponent<TCategory extends string> = {
  id: string;
  label?: string | null;
  category: TCategory;
  seriesUSD: Array<number | null>;
  sourceId?: string | null;
  pageOrTable?: string | null;
};

export type ProjectJsonV3CostModel =
  | { mode: 'UNKNOWN' }
  | { mode: 'AGGREGATE'; operatingCostsUSD: Array<number | null>; siteGandA_USD?: Array<number | null> | null }
  | { mode: 'COMPONENTS'; components: Array<ProjectJsonV3SeriesComponent<ProjectJsonV3CostComponentCategory>> };

export type ProjectJsonV3SellingModel =
  | { mode: 'UNKNOWN' }
  | { mode: 'NONE' }
  | { mode: 'AGGREGATE'; sellingCostsUSD: Array<number | null> }
  | { mode: 'COMPONENTS'; components: Array<ProjectJsonV3SeriesComponent<ProjectJsonV3SellingComponentCategory>> };

export type ProjectJsonV3RoyaltyModel =
  | { mode: 'UNKNOWN' }
  | { mode: 'NONE' }
  | { mode: 'RULES'; items: Array<unknown> }
  | { mode: 'LOCKED_SERIES'; royaltiesUSD: Array<number | null> };

export type ProjectJsonV3TaxModel =
  | { mode: 'UNKNOWN' }
  | { mode: 'FLAT_RATE'; taxRate: number }
  | { mode: 'LOCKED_SERIES'; taxCashFlowUSD: Array<number | null> };

export type ProjectJsonV3ScheduleAnchor = {
  year: number;
  sourceId: string;
  pageOrTable?: string | null;
  asOfDate?: string | null;
  notes?: string | null;
};

export type ProjectJsonV3RuntimePlacement = {
  constructionStart?: ProjectJsonV3ScheduleAnchor | null;
  productionStart?: ProjectJsonV3ScheduleAnchor | null;
  notes?: string | null;
  /** Legacy flat placement fields are forbidden by the V3 validator. */
  productionStartYear?: never;
  constructionStartYear?: never;
  sourceId?: never;
  pageOrTable?: never;
  asOfDate?: never;
};

export type ProjectJsonV3ReportedCostCheckpoint = {
  metric: string;
  value: number;
  unit: string;
  period?: { kind: 'LOM' | 'FIRST_N_OPERATING_YEARS' | 'STEADY_STATE' | 'OTHER'; years?: number; label?: string } | null;
  sourceId: string;
  pageOrTable: string;
  definitionNotes?: string | null;
};

export type ProjectJsonV3ReportVerification = {
  sourceId: string;
  npvIrrPageOrTable: string;
  pricesPageOrTable: string;
  periodsPageOrTable?: string | null;
  discountRate: number;
  discountConvention: 'period_end' | 'mid_year';
  priceDeckByKey: Record<string, number>;
  reportNPVPostTaxUSD: number;
  reportIRRPostTax: number;
  toleranceRelative?: number;
  reportInitialCapexUSD?: number | null;
  reportSustainingCapexUSD?: number | null;
  reportClosureUSD?: number | null;
  reportClosurePeriod?: number | null;
  reportWorkingCapitalUnwindUSD?: number | null;
  reportWorkingCapitalUnwindPeriod?: number | null;
  reportTerminalProceedsUSD?: number | null;
  reportTerminalProceedsPeriod?: number | null;
  assumptionsPageOrTable?: string | null;
  assumptionsNotes?: string | null;
};

export type ProjectJsonV3 = {
  version: 'project_json_v3';
  meta?: {
    projectId?: string;
    projectName?: string;
    currency?: 'USD';
    notes?: string;
    disabled?: boolean;
  };
  time: {
    masterN: number;
    productionStartPeriod: number;
    reportPeriodLabels?: Array<string | null> | null;
    phaseByPeriod: Array<'construction' | 'ramp_up' | 'operations' | 'closure'>;
    runtimePlacement?: ProjectJsonV3RuntimePlacement | null;
  };
  metals: {
    payableQtyByMetal: Record<string, Array<number | null>>;
    payableQtyUnitByMetal: Record<string, QtyUnit>;
    priceKeyByMetal: Record<string, string>;
    auPriceKey: string | null;
  };
  streamsByMetal?: Record<string, unknown> | null;
  economics: {
    costModel: ProjectJsonV3CostModel;
    sellingModel: ProjectJsonV3SellingModel;
    royaltyModel: ProjectJsonV3RoyaltyModel;
    taxModel: ProjectJsonV3TaxModel;
    depreciationUSD?: Array<number | null> | null;
  };
  capital: {
    capexUSD: Array<number | null>;
    sustainingCapexUSD: Array<number | null>;
    closureUSD: Array<number | null>;
    workingCapitalDeltaUSD?: Array<number | null> | null;
    terminalProceedsUSD?: Array<number | null> | null;
  };
  operations?: {
    capacity: { throughputUnit: 'tpd' | 'tpa' | null; nameplateThroughput: number | null; utilizationPct?: number | null };
    oreMilledTonnes?: Array<number | null>;
    oreMinedTonnes?: Array<number | null>;
    oreTonnageUnit?: 'tonne' | 'short_ton' | 'long_ton' | null;
    gradeByMetal?: Record<string, Array<number | null>>;
    gradeUnitByMetal?: Record<string, string>;
    recoveryPctByMetal?: Record<string, Array<number | null>>;
  } | null;
  verification?: {
    report?: ProjectJsonV3ReportVerification | null;
    reportedCostCheckpoints?: ProjectJsonV3ReportedCostCheckpoint[] | null;
  } | null;
};
