import { computeCorporateFinancing } from '../financing/engine.ts';
import type { CorporateFinancingInput, CorporateFinancingOutput } from '../financing/types.ts';
import { computeCorporateEquityFinancing } from '../financingEquity/engine.ts';
import type {
  CorporateEquityFinancingInput,
  CorporateEquityFinancingOutput,
} from '../financingEquity/types.ts';
import { computeCorporateMarketValue } from '../marketValue/engine.ts';
import type { CorporateMarketValueOutput } from '../marketValue/types.ts';
import { computeCorporatePerShare } from '../perShare/engine.ts';
import type { CorporatePerShareOutput } from '../perShare/types.ts';
import { computeCorporateFromProjectInputs } from '../projects/fromProjectInputs.ts';
import type {
  CorporateFromProjectInputsInput,
  CorporateFromProjectInputsOutput,
} from '../projects/fromProjectInputs.ts';
import type { CorporateProjectsOutput } from '../projects/types.ts';

export type CorporateFullPipelineFromProjectInputsInput = {
  projects: CorporateFromProjectInputsInput;
  financing: Omit<CorporateFinancingInput, 'npvToday_USD_total'>;
  market: {
    price_current_TargetCurrency: number | null;
    shares_current: number | null;
  };
  equityFinancing: Omit<CorporateEquityFinancingInput, 'shares_current'>;
  diagnose?: boolean | null;
  validate?: boolean | null;
};

export type CorporateFullPipelineFromProjectInputsOutput = {
  projectStage: CorporateFromProjectInputsOutput;
  corporateProjects: CorporateProjectsOutput;
  financing: CorporateFinancingOutput;
  marketValue: CorporateMarketValueOutput;
  equityFinancing: CorporateEquityFinancingOutput;
  perShare: CorporatePerShareOutput;
};

export function computeCorporateFullPipelineFromProjectInputs(
  input: CorporateFullPipelineFromProjectInputsInput,
): CorporateFullPipelineFromProjectInputsOutput {
  const projectStage = computeCorporateFromProjectInputs({
    ...input.projects,
    validate: input.validate ?? input.projects.validate,
    diagnose: input.diagnose ?? input.projects.diagnose,
  });

  const corporateProjects = projectStage.corporateProjects;

  const financing = computeCorporateFinancing({
    ...input.financing,
    npvToday_USD_total: corporateProjects.npvToday_USD_total,
  });

  const marketValue = computeCorporateMarketValue({
    price_current_TargetCurrency: input.market.price_current_TargetCurrency,
    shares_current: input.market.shares_current,
    cash_AfterCashFirst_TargetCurrency_t0: financing.cash_AfterCashFirst_TargetCurrency_t0,
    debt_TargetCurrency_t0: financing.debt_TargetCurrency_t0,
    enterpriseAdjustments_TargetCurrency_t0: financing.enterpriseAdjustments_TargetCurrency_t0,
    npvToday_TargetCurrency: financing.npvToday_TargetCurrency,
    navToday_TargetCurrency: financing.navToday_TargetCurrency,
  });

  const equityFinancing = computeCorporateEquityFinancing({
    shares_current: input.market.shares_current,
    ...input.equityFinancing,
  });

  const cfLOM_USD_total = corporateProjects.cfLOM_USD_total;
  const fx = input.financing.fx_USD_to_TargetCurrency;
  const cfLOM_TargetCurrency =
    cfLOM_USD_total !== null && Number.isFinite(cfLOM_USD_total) && fx !== null && Number.isFinite(fx)
      ? cfLOM_USD_total * fx
      : null;

  const perShare = computeCorporatePerShare({
    shares_post_financing: equityFinancing.shares_post_financing,
    npvToday_TargetCurrency: financing.npvToday_TargetCurrency,
    navToday_TargetCurrency: financing.navToday_TargetCurrency,
    cfLOM_TargetCurrency,
    dcfProdStart_present_TargetCurrency: null,
  });

  return {
    projectStage,
    corporateProjects,
    financing,
    marketValue,
    equityFinancing,
    perShare,
  };
}
