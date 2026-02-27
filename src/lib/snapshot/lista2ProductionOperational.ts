type NullableNumber = number | null;

export type Lista2ProductionOperationalMetrics = {
  Time_to_production: NullableNumber;
  LOM_periods: NullableNumber;
  LOM_production_AuEq_Oz: NullableNumber;
  Annual_production_AuEq_Oz: NullableNumber;
  AISC_AuEq_USD_per_Oz_LOM: NullableNumber;
  CAPEX_per_annual_AuEq_Oz: NullableNumber;
};

export function makeNullLista2ProductionOperationalMetrics(): Lista2ProductionOperationalMetrics {
  return {
    Time_to_production: null,
    LOM_periods: null,
    LOM_production_AuEq_Oz: null,
    Annual_production_AuEq_Oz: null,
    AISC_AuEq_USD_per_Oz_LOM: null,
    CAPEX_per_annual_AuEq_Oz: null,
  };
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function computeLista2ProductionOperationalMetrics(args: {
  masterN: number;
  productionStartPeriod: number | null;
  payableAuEqOz_total: Array<number | null>;
  aiscAuEqUSDPerOz_LOM: number | null;
  capexUSD_total: Array<number | null>;
}): Lista2ProductionOperationalMetrics {
  const out = makeNullLista2ProductionOperationalMetrics();

  if (!Number.isInteger(args.productionStartPeriod)) {
    return out;
  }

  const tp = args.productionStartPeriod as number;
  out.Time_to_production = tp;

  if (tp < 0 || tp > args.masterN) {
    out.LOM_periods = 0;
    out.LOM_production_AuEq_Oz = 0;
    return out;
  }

  let lomPeriods = 0;
  let lomProduction = 0;
  for (let t = tp; t <= args.masterN; t += 1) {
    const payable = args.payableAuEqOz_total[t];
    if (!finite(payable) || payable <= 0) {
      continue;
    }
    lomPeriods += 1;
    lomProduction += payable;
  }

  out.LOM_periods = lomPeriods;
  out.LOM_production_AuEq_Oz = lomProduction;
  out.Annual_production_AuEq_Oz = lomPeriods > 0 ? lomProduction / lomPeriods : null;
  out.AISC_AuEq_USD_per_Oz_LOM = finite(args.aiscAuEqUSDPerOz_LOM) ? args.aiscAuEqUSDPerOz_LOM : null;

  if (out.Annual_production_AuEq_Oz !== null && out.Annual_production_AuEq_Oz > 0) {
    let initialCapex = 0;
    for (let t = 0; t < tp; t += 1) {
      const capex = args.capexUSD_total[t];
      if (!finite(capex)) {
        initialCapex = NaN;
        break;
      }
      if (capex < 0) {
        initialCapex += capex;
      }
    }

    if (Number.isFinite(initialCapex)) {
      out.CAPEX_per_annual_AuEq_Oz = Math.abs(initialCapex) / out.Annual_production_AuEq_Oz;
    }
  }

  return out;
}
