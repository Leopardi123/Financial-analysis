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

  // Layer 2 projects
  projects: CorporateProjectsInput;

  // Financing (cash-first)
  financing: Omit<CorporateFinancingInput, 'npvToday_USD_total'>;

  // Market (t=0)
  market: Omit<
    CorporateMarketValueInput,
    | 'cash_AfterCashFirst_TargetCurrency_t0'
    | 'debt_TargetCurrency_t0'
    | 'enterpriseAdjustments_TargetCurrency_t0'
    | 'npvToday_TargetCurrency'
    | 'navToday_TargetCurrency'
  >;

  // Equity raise -> shares_post_financing
  equityFinancing: Omit<CorporateEquityFinancingInput, 'shares_current'>;

  // Optional internal series scalars for per-share:
  // We will use financing + projects to compute cfLOM_target if available.
};

export type CorporatePipelineOutput = {
  projects: CorporateProjectsOutput;
  financing: CorporateFinancingOutput;
  marketValue: CorporateMarketValueOutput;
  equityFinancing: CorporateEquityFinancingOutput;
  perShare: CorporatePerShareOutput;
};
