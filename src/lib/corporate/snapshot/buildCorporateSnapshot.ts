import type { CorporateFinancingOutput } from '../financing/types.ts';
import type { CorporateAggregationOutput } from '../types.ts';
import type { CorporateSnapshot, MarketValueInput, MarketValueOutput } from './types.ts';
import { makeNullLista2CfDcfMetrics, type Lista2CfDcfMetrics } from '../../snapshot/lista2CfDcf.ts';
import {
  makeNullLista3aProjectEfficiencyMetrics,
  type Lista3aProjectEfficiencyMetrics,
} from '../../snapshot/lista3aProjectEfficiency.ts';
import { makeNullLista4TenYearMetrics, type Lista4TenYearMetrics } from '../../snapshot/lista4TenYear.ts';

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function toStrictAdjustment(value: number | null | undefined, label: string): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite when provided`);
  }

  return value;
}

export function computeMarketValue(args: {
  market: MarketValueInput;
  financing: CorporateFinancingOutput;
}): MarketValueOutput {
  const shares_current = toFiniteOrNull(args.market.shares_current);
  const price_current_TargetCurrency = toFiniteOrNull(args.market.price_current_TargetCurrency);

  const preferredEquity = toStrictAdjustment(
    args.market.preferredEquity_TargetCurrency,
    'preferredEquity_TargetCurrency',
  );
  const minorityInterest = toStrictAdjustment(
    args.market.minorityInterest_TargetCurrency,
    'minorityInterest_TargetCurrency',
  );

  const EnterpriseAdjustments_TargetCurrency = preferredEquity + minorityInterest;

  const MarketCap_TargetCurrency =
    shares_current !== null && price_current_TargetCurrency !== null
      ? shares_current * price_current_TargetCurrency
      : null;

  const cashPost = toFiniteOrNull(args.financing.cash_t0_post_TargetCurrency);
  const debtPost = toFiniteOrNull(args.financing.debt_t0_post_TargetCurrency);

  const EV_TargetCurrency =
    MarketCap_TargetCurrency !== null && cashPost !== null && debtPost !== null
      ? MarketCap_TargetCurrency + debtPost - cashPost + EnterpriseAdjustments_TargetCurrency
      : null;

  const NPV_T = toFiniteOrNull(args.financing.NPV_today_TargetCurrency);
  const NAV_T = toFiniteOrNull(args.financing.NAV_today_TargetCurrency);

  const EV_over_NPV =
    EV_TargetCurrency !== null && NPV_T !== null && NPV_T > 0 ? EV_TargetCurrency / NPV_T : null;

  const EV_over_NAV =
    EV_TargetCurrency !== null && NAV_T !== null && NAV_T > 0 ? EV_TargetCurrency / NAV_T : null;

  const P_over_NAV =
    MarketCap_TargetCurrency !== null && NAV_T !== null && NAV_T > 0
      ? MarketCap_TargetCurrency / NAV_T
      : null;

  const EV_perShare_TargetCurrency =
    EV_TargetCurrency !== null && shares_current !== null && shares_current !== 0
      ? EV_TargetCurrency / shares_current
      : null;

  return {
    MarketCap_TargetCurrency,
    EnterpriseAdjustments_TargetCurrency,
    EV_TargetCurrency,
    EV_over_NPV,
    EV_over_NAV,
    P_over_NAV,
    EV_perShare_TargetCurrency,
  };
}

export function buildCorporateSnapshot(args: {
  targetCurrency: string;
  aggregation: CorporateAggregationOutput;
  financing: CorporateFinancingOutput;
  market: MarketValueInput;
  lista2CfDcf?: Lista2CfDcfMetrics;
  lista3aProjectEfficiency?: Lista3aProjectEfficiencyMetrics;
  lista4TenYear?: Lista4TenYearMetrics;
}): CorporateSnapshot {
  const marketValue = computeMarketValue({
    market: args.market,
    financing: args.financing,
  });

  const lista2 = args.lista2CfDcf ?? makeNullLista2CfDcfMetrics();
  const lista3a = args.lista3aProjectEfficiency ?? makeNullLista3aProjectEfficiencyMetrics();
  const lista4Base = args.lista4TenYear ?? makeNullLista4TenYearMetrics();
  const lista4: Lista4TenYearMetrics = {
    ...lista4Base,
    EV_over_Revenue_10Y:
      marketValue.EV_TargetCurrency !== null
      && lista4Base.Revenue_10Y_TargetCurrency !== null
      && lista4Base.Revenue_10Y_TargetCurrency !== 0
        ? marketValue.EV_TargetCurrency / lista4Base.Revenue_10Y_TargetCurrency
        : null,
  };

  return {
    targetCurrency: args.targetCurrency,
    aggregation: args.aggregation,
    financing: args.financing,
    marketValue,
    MarketCap_TargetCurrency: marketValue.MarketCap_TargetCurrency,
    EV_TargetCurrency: marketValue.EV_TargetCurrency,
    EV_perShare_TargetCurrency: marketValue.EV_perShare_TargetCurrency,
    EV_over_NPV: marketValue.EV_over_NPV,
    EV_over_NAV: marketValue.EV_over_NAV,
    P_over_NAV: marketValue.P_over_NAV,
    NPV_today_TargetCurrency: toFiniteOrNull(args.financing.NPV_today_TargetCurrency),
    NAV_today_TargetCurrency: toFiniteOrNull(args.financing.NAV_today_TargetCurrency),
    ...lista2,
    ...lista3a,
    ...lista4,
  };
}
