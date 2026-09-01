export type FiscalPlacement =
  | 'REVENUE_DEDUCTION'
  | 'OPERATING_EXPENSE'
  | 'PRE_TAX_CHARGE'
  | 'POST_TAX_CHARGE';

export type FiscalLedgerLine =
  | 'GROSS_METAL_VALUE'
  | 'PAYABILITY_DEDUCTION'
  | 'REVENUE_AFTER_PAYABILITY'
  | 'STREAM_TAKE'
  | 'STREAM_PURCHASE_REVENUE'
  | 'TREATMENT_CHARGE'
  | 'REFINING_CHARGE'
  | 'TRANSPORT'
  | 'INSURANCE'
  | 'MARKETING'
  | 'OTHER_OFFSITE'
  | 'OFFSITE_TOTAL'
  | 'NET_SMELTER_RETURN'
  | 'MINING_COST'
  | 'PROCESSING_COST'
  | 'SITE_GA'
  | 'OTHER_SITE_OPEX'
  | 'SITE_OPEX_TOTAL'
  | 'EBITDA_BEFORE_FISCAL'
  | 'DEPRECIATION'
  | 'EBIT_BEFORE_FISCAL'
  | 'INITIAL_CAPEX'
  | 'SUSTAINING_CAPEX'
  | 'RECLAMATION';

export type FiscalRateDefinition =
  | { type: 'FIXED'; rate: number }
  | {
      type: 'TIERED_PRICE';
      priceKey: string;
      tiers: Array<{ threshold: number; rate: number }>;
    }
  | {
      type: 'TIERED_MARGIN';
      numeratorLine: FiscalLedgerLine;
      denominatorLine: FiscalLedgerLine;
      tiers: Array<{ threshold: number; rate: number }>;
    };

export type FiscalTakeFormulaRule = {
  id: string;
  label?: string | null;
  placement: FiscalPlacement;
  base: {
    line: FiscalLedgerLine;
    deductions?: FiscalLedgerLine[] | null;
    floorAtZero?: boolean | null;
  };
  rate: FiscalRateDefinition;
  start_t?: number | null;
  end_t?: number | null;
  sourceId?: string | null;
  pageOrTable?: string | null;
  notes?: string | null;
};

/**
 * Source-locked fiscal cash-flow item. It may coexist with formula rules inside
 * one fiscalTakeModel.RULES list when the technical report contains multiple
 * takes with different bases/placements and one of them cannot be faithfully
 * reconstructed. The locked series is deliberately scenario-limited; callers
 * must not interpret it as a dynamic royalty formula.
 */
export type FiscalTakeLockedSeriesRule = {
  id: string;
  label?: string | null;
  placement: FiscalPlacement;
  lockedSeriesUSD: Array<number | null>;
  sourceId: string;
  pageOrTable: string;
  notes?: string | null;
};

export type FiscalTakeRule = FiscalTakeFormulaRule | FiscalTakeLockedSeriesRule;

export type FiscalTakeEngineInput = {
  masterN: number;
  rules: FiscalTakeRule[];
  ledgerUSD: Partial<Record<FiscalLedgerLine, Array<number | null>>>;
  priceSeriesByKey?: Record<string, Array<number | null>> | null;
};

export type FiscalTakeEngineOutput = {
  revenueDeductionUSD: Array<number | null>;
  operatingExpenseUSD: Array<number | null>;
  preTaxChargeUSD: Array<number | null>;
  postTaxChargeUSD: Array<number | null>;
  byRuleUSD: Record<string, Array<number | null>>;
  diagnostics: string[];
};
