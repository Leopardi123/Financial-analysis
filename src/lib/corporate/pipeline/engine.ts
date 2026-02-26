import { computeCorporateFinancing } from '../financing/engine.ts';
import { computeCorporateEquityFinancing } from '../financingEquity/engine.ts';
import { computeCorporateMarketValue } from '../marketValue/engine.ts';
import { computeCorporatePerShare } from '../perShare/engine.ts';
import { computeCorporateProjects } from '../projects/engine.ts';
import type { CorporatePipelineInput, CorporatePipelineOutput } from './types.ts';

export function computeCorporatePipeline(input: CorporatePipelineInput): CorporatePipelineOutput {
  const projects = computeCorporateProjects({
    ...input.projects,
    discountRate: input.discountRate,
  });

  const financing = computeCorporateFinancing({
    ...input.financing,
    npvToday_USD_total: projects.npvToday_USD_total,
  });

  const marketValue = computeCorporateMarketValue({
    ...input.market,
    cash_AfterCashFirst_TargetCurrency_t0: financing.cash_AfterCashFirst_TargetCurrency_t0,
    debt_TargetCurrency_t0: financing.debt_TargetCurrency_t0,
    enterpriseAdjustments_TargetCurrency_t0: financing.enterpriseAdjustments_TargetCurrency_t0,
    npvToday_TargetCurrency: financing.npvToday_TargetCurrency,
    navToday_TargetCurrency: financing.navToday_TargetCurrency,
  });

  const equityFinancing = computeCorporateEquityFinancing({
    ...input.equityFinancing,
    shares_current: input.market.shares_current,
  });

  const cfLOM_USD_total = projects.cfLOM_USD_total;
  const dcfProdStart_present_USD_total = projects.dcfProdStart_present_USD_total;
  const fx = input.financing.fx_USD_to_TargetCurrency;
  const cfLOM_TargetCurrency =
    cfLOM_USD_total !== null && Number.isFinite(cfLOM_USD_total) && fx !== null && Number.isFinite(fx)
      ? cfLOM_USD_total * fx
      : null;
  const dcfProdStart_present_TargetCurrency =
    dcfProdStart_present_USD_total !== null &&
    Number.isFinite(dcfProdStart_present_USD_total) &&
    fx !== null &&
    Number.isFinite(fx)
      ? dcfProdStart_present_USD_total * fx
      : null;

  const perShare = computeCorporatePerShare({
    shares_post_financing: equityFinancing.shares_post_financing,
    npvToday_TargetCurrency: financing.npvToday_TargetCurrency,
    navToday_TargetCurrency: financing.navToday_TargetCurrency,
    cfLOM_TargetCurrency,
    dcfProdStart_present_TargetCurrency,
  });

  return {
    projects,
    financing,
    marketValue,
    equityFinancing,
    perShare,
  };
}
