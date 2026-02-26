import type { CorporateProjectsInput, CorporateProjectsOutput } from '../projects/types.ts';
import type { CorporateFinancingInput, CorporateFinancingOutput } from '../financing/types.ts';
import type { CorporateMarketValueInput, CorporateMarketValueOutput } from '../marketValue/types.ts';
import type {
  CorporateEquityFinancingInput,
  CorporateEquityFinancingOutput,
} from '../financingEquity/types.ts';
import type { CorporatePerShareOutput } from '../perShare/types.ts';

export type CorporatePipelineInput = {
  discountRate: number;
  projects: CorporateProjectsInput;

  financing: Omit<CorporateFinancingInput, 'NPV_today_USD' | 'shares_current' | 'price_current_TargetCurrency'>;

  market: Omit<
    CorporateMarketValueInput,
    | 'cash_AfterCashFirst_TargetCurrency_t0'
    | 'debt_TargetCurrency_t0'
    | 'enterpriseAdjustments_TargetCurrency_t0'
    | 'npvToday_TargetCurrency'
    | 'navToday_TargetCurrency'
  >;

  equityFinancing: Omit<CorporateEquityFinancingInput, 'shares_current'>;
};

export type CorporatePipelineOutput = {
  projects: CorporateProjectsOutput;
  financing: CorporateFinancingOutput;
  marketValue: CorporateMarketValueOutput;
  equityFinancing: CorporateEquityFinancingOutput;
  perShare: CorporatePerShareOutput;
};
