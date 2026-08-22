export type ProducerPriceMode = 'SPOT' | 'LT' | 'REPORTED';
export type ProducerCaseMode = 'BASE' | 'GROWTH';

export type NumericClaim =
  | { kind: 'point'; value: number }
  | { kind: 'approximate'; value: number }
  | { kind: 'range'; low: number; high: number }
  | { kind: 'upper_bound'; value: number }
  | { kind: 'lower_bound'; value: number };

export type PeriodClaim =
  | { kind: 'year'; year: number }
  | { kind: 'year_range_average'; startYear: number; endYear: number }
  | { kind: 'year_range_total'; startYear: number; endYear: number };

export type EstimateClass =
  | 'actual'
  | 'company_guidance'
  | 'company_target'
  | 'technical_report'
  | 'mine_plan'
  | 'mine_plan_derived'
  | 'analyst_consensus'
  | 'derived'
  | 'scenario';

export type Provenance = {
  sourceId: string;
  estimateClass: EstimateClass;
  confidence?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
  locator?: string;
  rawText?: string;
};

export type SourceRef = {
  id: string;
  sourceType:
    | 'company_release'
    | 'company_presentation'
    | 'financial_statement'
    | 'technical_report'
    | 'regulatory_filing'
    | 'analyst_report'
    | 'other';
  publisher: string;
  title: string;
  publishedDate?: string;
  url?: string;
};

export type ReportedPriceDeck = {
  id: string;
  label: string;
  metals?: Record<string, { value: number; unit: string }>;
  fx?: Record<string, number>;
  provenance: Provenance;
};

export type OwnershipPeriod = {
  effectiveFrom: string;
  effectiveTo?: string;
  ownershipPct: number;
  provenance: Provenance;
};

export type ProductionMeasure = 'produced' | 'sold' | 'payable';
export type ProductionUnit = 'toz' | 'koz' | 'Moz' | 'tonne' | 'kt' | 'lb';

export type ProductionDisclosure = {
  id: string;
  metal: string;
  measure: ProductionMeasure;
  period: PeriodClaim;
  quantity: NumericClaim;
  unit: ProductionUnit;
  basis: 'attributable' | 'project_100pct';
  provenance: Provenance;
};

export type CostDenominator = {
  metal: string;
  unit: 'toz' | 'tonne' | 'lb';
  measure: ProductionMeasure;
};

export type PriceLinkedCostOutput =
  | {
      kind: 'fixed_amount';
      currency: string;
    }
  | {
      kind: 'per_unit';
      currency: string;
      denominator: CostDenominator;
      netOfByproductCredits?: boolean;
    };

export type CostModel =
  | { type: 'fixed_amount'; amount: NumericClaim; currency: string }
  | {
      type: 'per_unit';
      amount: NumericClaim;
      currency: string;
      denominator: CostDenominator;
      netOfByproductCredits?: boolean;
      sourcePriceDeckRef?: string;
    }
  | {
      type: 'percent_revenue';
      rate: NumericClaim;
      revenueScope: { type: 'total_metal_revenue' } | { type: 'metal'; metal: string };
    }
  | {
      type: 'price_linked';
      referenceValue: NumericClaim;
      output: PriceLinkedCostOutput;
      sensitivities: Array<{
        driverMetal: string;
        referencePrice: number;
        driverPriceUnit: string;
        slope: number;
      }>;
      sourcePriceDeckRef: string;
    }
  | {
      type: 'reported_total';
      amount: NumericClaim;
      currency: string;
      sourcePriceDeckRef?: string;
      priceSensitivity: 'not_price_sensitive' | 'unknown';
    }
  | { type: 'derived'; method: string; inputIds: string[] };

export type CostDisclosure = {
  id: string;
  component:
    | 'cash_operating_cost'
    | 'royalty'
    | 'production_tax'
    | 'tc_rc'
    | 'site_gna'
    | 'corporate_gna'
    | 'sustaining_capex'
    | 'sustaining_exploration'
    | 'deferred_stripping'
    | 'underground_development'
    | 'growth_capex'
    | 'growth_exploration'
    | 'cash_income_tax'
    | 'working_capital_delta'
    | 'reclamation_cash'
    | 'reclamation_accretion'
    | 'other_recurring_operating'
    | 'other_cash';
  period: PeriodClaim;
  economicBasis: 'project_100pct' | 'attributable' | 'company';
  canonicalClassification:
    | 'operating'
    | 'sustaining'
    | 'growth'
    | 'tax'
    | 'working_capital'
    | 'noncash'
    | 'excluded'
    | 'unknown';
  model: CostModel;
  provenance: Provenance;
};

export type ReportedMetric = {
  id: string;
  scope: { type: 'company' } | { type: 'project'; projectId: string };
  period: PeriodClaim;
  metric: 'revenue' | 'ebitda' | 'fcf' | 'cash_cost' | 'aisc' | 'aueq' | 'production';
  value: NumericClaim;
  unit: string;
  sourcePriceDeckRef?: string;
  definition?: {
    includes?: string[];
    excludes?: string[];
    netOfByproductCredits?: boolean;
    denominatorMeasure?: ProductionMeasure;
  };
  provenance: Provenance;
};

export type ProducerProject = {
  id: string;
  name: string;
  primaryMetal: string;
  statusAsOfValuationDate:
    | 'operating'
    | 'ramp_up'
    | 'construction'
    | 'sanctioned'
    | 'development'
    | 'study'
    | 'care_maintenance'
    | 'closed';
  ownership: OwnershipPeriod[];
  production: ProductionDisclosure[];
  costs?: CostDisclosure[];
  reportedMetrics?: ReportedMetric[];
};

export type ProducerJsonV1 = {
  version: 'producer_json_v1';
  company: {
    id: string;
    name: string;
    reportingCurrency?: string;
    primarySecurity?: {
      ticker: string;
      exchange?: string;
      quoteCurrency: string;
      securityType?: 'common' | 'adr';
      adrRatio?: number;
    };
  };
  valuation: {
    valuationDateUtc: string;
  };
  reportedPriceDecks?: ReportedPriceDeck[];
  projects: ProducerProject[];
  corporateCosts?: CostDisclosure[];
  reportedMetrics?: ReportedMetric[];
  sources: SourceRef[];
};

export type ProducerRunContext = {
  valuationDateUtc: string;
  selectedYear: number;
  priceMode: ProducerPriceMode;
  caseMode: ProducerCaseMode;
};
