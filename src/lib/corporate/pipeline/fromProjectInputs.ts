import { computeCorporateFinancing } from '../financing/engine.ts';
import type { CorporateFinancingInput, CorporateFinancingOutput } from '../financing/types.ts';
import { computeCorporateEquityFinancing } from '../financingEquity/engine.ts';
import type {
  CorporateEquityFinancingInput,
  CorporateEquityFinancingOutput,
} from '../financingEquity/types.ts';
import { computeCorporateMarketValue } from '../marketValue/engine.ts';
import type { CorporateMarketValueOutput } from '../marketValue/types.ts';
import { computeCorporateOverheadOverlay } from '../overhead/engine.ts';
import type { CorporateOverheadOverlayOutput } from '../overhead/types.ts';
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
  financing: Omit<CorporateFinancingInput, 'NPV_today_USD' | 'shares_current' | 'price_current_TargetCurrency'>;
  market: {
    price_current_TargetCurrency: number | null;
    shares_current: number | null;
  };
  equityFinancing: Omit<CorporateEquityFinancingInput, 'shares_current'>;
  overhead?: {
    enabled: boolean;
    corpGA_cash_USD: (number | null)[];
    corpSBC_USD: (number | null)[];
  } | null;
  diagnose?: boolean | null;
  validate?: boolean | null;
};

export type CorporateFullPipelineFromProjectInputsOutput = {
  projectStage: CorporateFromProjectInputsOutput;
  corporateProjects: CorporateProjectsOutput;
  overheadOverlay: CorporateOverheadOverlayOutput | null;
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

  let overheadOverlay: CorporateOverheadOverlayOutput | null = null;
  let npvUSD_for_financing = corporateProjects.npvToday_USD_total;

  if (input.overhead?.enabled) {
    overheadOverlay = computeCorporateOverheadOverlay({
      masterN: input.projects.masterN,
      discountRate: input.projects.discountRate,
      fcffUSD_total: corporateProjects.fcffUSD_total,
      corpGA_cash_USD: input.overhead.corpGA_cash_USD,
      corpSBC_USD: input.overhead.corpSBC_USD,
    });

    npvUSD_for_financing = overheadOverlay.npvToday_USD_after_overhead;
  }

  const financing = computeCorporateFinancing({
    ...input.financing,
    NPV_today_USD: npvUSD_for_financing,
    shares_current: input.market.shares_current,
    price_current_TargetCurrency: input.market.price_current_TargetCurrency,
  });

  const marketValue = computeCorporateMarketValue({
    price_current_TargetCurrency: input.market.price_current_TargetCurrency,
    shares_current: input.market.shares_current,
    cash_AfterCashFirst_TargetCurrency_t0: financing.cash_t0_post_TargetCurrency,
    debt_TargetCurrency_t0: financing.debt_t0_post_TargetCurrency,
    enterpriseAdjustments_TargetCurrency_t0: 0,
    npvToday_TargetCurrency: financing.NPV_today_TargetCurrency,
    navToday_TargetCurrency: financing.NAV_today_TargetCurrency,
  });

  const equityFinancing = computeCorporateEquityFinancing({
    shares_current: input.market.shares_current,
    ...input.equityFinancing,
  });

  const cfLOM_USD_total = corporateProjects.cfLOM_USD_total;
  const fx = input.financing.fx_USD_to_TargetCurrency;
  const cfLOM_TargetCurrency =
    cfLOM_USD_total !== null && Number.isFinite(cfLOM_USD_total) && Number.isFinite(fx)
      ? cfLOM_USD_total * fx
      : null;

  const perShare = computeCorporatePerShare({
    shares_post_financing: financing.shares_post_financing ?? equityFinancing.shares_post_financing,
    npvToday_TargetCurrency: financing.NPV_today_TargetCurrency,
    navToday_TargetCurrency: financing.NAV_today_TargetCurrency,
    cfLOM_TargetCurrency,
    dcfProdStart_present_TargetCurrency: null,
  });

  return {
    projectStage,
    corporateProjects,
    overheadOverlay,
    financing,
    marketValue,
    equityFinancing,
    perShare,
  };
}
