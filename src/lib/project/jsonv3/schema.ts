import type { FiscalTakeRule } from '../fiscal/types.ts';
import type { QtyUnit } from '../jsonv1/schema.ts';
import type { StreamMVIConfig } from '../streams/types.ts';

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

export type ProjectJsonV3ReportLockedFiscalTakeItem = {
  id: string;
  label?: string | null;
  reportFiscalTakeUSD: Array<number | null>;
  placement: 'REVENUE_DEDUCTION' | 'OPERATING_EXPENSE' | 'PRE_TAX_CHARGE' | 'POST_TAX_CHARGE';
  /**
   * Optional simplified dynamic rule for normal Spot/Bear/runtime scenarios.
   * Report reconciliation always uses reportFiscalTakeUSD instead.
   * If omitted, normal runtime fails closed rather than silently reusing the report-locked series.
   */
  runtimeProxyRule?: FiscalTakeRule | null;
  sourceId?: string | null;
  pageOrTable?: string | null;
  notes?: string | null;
};

export type ProjectJsonV3FiscalTakeModel =
  | { mode: 'UNKNOWN' }
  | { mode: 'NONE' }
  | {
      mode: 'RULES';
      /** Source-faithful dynamic fiscal rules that apply in both report and runtime scenarios. */
      items: FiscalTakeRule[];
      /** Individually report-locked takes may coexist with dynamic rules without becoming a second fiscal model. */
      reportLockedItems?: ProjectJsonV3ReportLockedFiscalTakeItem[] | null;
    }
  | {
      mode: 'LOCKED_SERIES';
      fiscalTakeUSD: Array<number | null>;
      placement: 'REVENUE_DEDUCTION' | 'OPERATING_EXPENSE' | 'PRE_TAX_CHARGE' | 'POST_TAX_CHARGE';
      notes?: string | null;
    };

export type ProjectJsonV3TaxModel =
  | { mode: 'UNKNOWN' }
  | { mode: 'FLAT_RATE'; taxRate: number; lossCarryforward?: boolean | null }
  | { mode: 'LOCKED_SERIES'; taxCashFlowUSD: Array<number | null> }
  | {
      mode: 'REPORT_LOCKED_WITH_RUNTIME_PROXY';
      reportTaxCashFlowUSD: Array<number | null>;
      runtime: {
        method: 'NOMINAL_RATE_WITH_LOSS_CARRYFORWARD';
        taxRate: number;
      };
      notes?: string | null;
    };

export type ProjectJsonV3RevenueBasis =
  | 'PAYABLE_DIRECT'
  | 'METAL_IN_PRODUCT_WITH_PAYABILITY_DEDUCTION';

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
  nameplateCapacity?: ProjectJsonV3ScheduleAnchor | null;
  notes?: string | null;
  /** Legacy flat placement fields are forbidden by the V3 validator. */
  productionStartYear?: never;
  constructionStartYear?: never;
  nameplateCapacityYear?: never;
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
  /** Scalar report price for keys whose report deck is constant through the relative model. */
  priceDeckByKey: Record<string, number>;
  /** Exact report-relative price series for keys whose report deck changes by period. */
  priceDeckSeriesByKey?: Record<string, Array<number | null>> | null;
  reportNPVPostTaxUSD: number;
  reportIRRPostTax: number;
  reportNPVPreTaxUSD?: number | null;
  reportIRRPreTax?: number | null;
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
    nameplateCapacityPeriod?: number | null;
    reportPeriodLabels?: Array<string | null> | null;
    phaseByPeriod: Array<'construction' | 'ramp_up' | 'operations' | 'closure'>;
    runtimePlacement?: ProjectJsonV3RuntimePlacement | null;
  };
  metals: {
    /** Directly reported payable quantity evidence; always retained when disclosed. */
    payableQtyByMetal: Record<string, Array<number | null>>;
    /** Optional directly reported metal-in-product/concentrate quantity evidence. */
    metalInProductQtyByMetal?: Record<string, Array<number | null>> | null;
    /** Exactly one active revenue quantity basis per economic metal. */
    revenueBasisByMetal: Record<string, ProjectJsonV3RevenueBasis>;
    payableQtyUnitByMetal: Record<string, QtyUnit>;
    priceKeyByMetal: Record<string, string>;
    auPriceKey: string | null;
  };
  streamsByMetal?: Record<string, StreamMVIConfig> | null;
  economics: {
    costModel: ProjectJsonV3CostModel;
    sellingModel: ProjectJsonV3SellingModel;
    fiscalTakeModel: ProjectJsonV3FiscalTakeModel;
    taxModel: ProjectJsonV3TaxModel;
    depreciationUSD?: Array<number | null> | null;
  };
  capital: {
    /** Report-defined initial/development project CAPEX; may extend into early production periods. */
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
