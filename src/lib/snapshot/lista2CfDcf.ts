type NullableNumber = number | null;

export type Lista2CfDcfMetrics = {
  CF_LOM_USD: NullableNumber;
  CF_LOM_perShare_USD: NullableNumber;
  CF_LOM_prodStart_perShare_USD: NullableNumber;
  DCF_prodStart_exCapex_USD: NullableNumber;
  DCF_prodStart_exCapex_perShare_USD: NullableNumber;
  DCF_prodStart_present_USD: NullableNumber;
  DCF_prodStart_present_perShare_USD: NullableNumber;
  CF_LOM_TargetCurrency: NullableNumber;
  CF_LOM_perShare_TargetCurrency: NullableNumber;
  CF_LOM_prodStart_perShare_TargetCurrency: NullableNumber;
  DCF_prodStart_exCapex_TargetCurrency: NullableNumber;
  DCF_prodStart_exCapex_perShare_TargetCurrency: NullableNumber;
  DCF_prodStart_present_TargetCurrency: NullableNumber;
  DCF_prodStart_present_perShare_TargetCurrency: NullableNumber;
  NPV_over_ETLV: NullableNumber;
  DCF_present_over_ETLV: NullableNumber;
  DCF_prodStart_over_ETLV: NullableNumber;
};

type Input = {
  fcfUSD_total: Array<number | null>;
  masterN: number;
  productionStartPeriod: number | null;
  discountRate: number;
  shares_post_financing: number | null;
  fx_USD_to_TargetCurrency: number | null;
  npvToday_USD: number | null;
};

export function makeNullLista2CfDcfMetrics(): Lista2CfDcfMetrics {
  return {
    CF_LOM_USD: null,
    CF_LOM_perShare_USD: null,
    CF_LOM_prodStart_perShare_USD: null,
    DCF_prodStart_exCapex_USD: null,
    DCF_prodStart_exCapex_perShare_USD: null,
    DCF_prodStart_present_USD: null,
    DCF_prodStart_present_perShare_USD: null,
    CF_LOM_TargetCurrency: null,
    CF_LOM_perShare_TargetCurrency: null,
    CF_LOM_prodStart_perShare_TargetCurrency: null,
    DCF_prodStart_exCapex_TargetCurrency: null,
    DCF_prodStart_exCapex_perShare_TargetCurrency: null,
    DCF_prodStart_present_TargetCurrency: null,
    DCF_prodStart_present_perShare_TargetCurrency: null,
    NPV_over_ETLV: null,
    DCF_present_over_ETLV: null,
    DCF_prodStart_over_ETLV: null,
  };
}

function toPerShare(value: NullableNumber, shares: number | null): NullableNumber {
  if (value === null || shares === null || !Number.isFinite(shares) || shares <= 0) {
    return null;
  }
  return value / shares;
}

function toTarget(value: NullableNumber, fx: number | null): NullableNumber {
  if (value === null || fx === null || !Number.isFinite(fx)) {
    return null;
  }
  return value * fx;
}

export function computeLista2CfDcfMetrics(input: Input): {
  metrics: Lista2CfDcfMetrics;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const nullMetrics = makeNullLista2CfDcfMetrics();

  const expectedLength = input.masterN + 1;
  const normalizedFcf = new Array<number | null>(expectedLength).fill(null);
  if (input.fcfUSD_total.length !== expectedLength) {
    warnings.push(
      `Lista2 CF+DCF input normalized: fcfUSD_total length ${input.fcfUSD_total.length} adjusted to masterN+1 (${expectedLength})`,
    );
  }

  for (let t = 0; t < expectedLength; t += 1) {
    const rawValue = input.fcfUSD_total[t] ?? null;
    if (rawValue === null) {
      normalizedFcf[t] = null;
      continue;
    }
    if (!Number.isFinite(rawValue)) {
      normalizedFcf[t] = null;
      warnings.push(`fcfUSD_total: non-finite at t=${t}; set to null (value=${String(rawValue)})`);
      continue;
    }
    normalizedFcf[t] = rawValue;
  }

  if (normalizedFcf.every((value) => value === null)) {
    warnings.push('Lista2 CF+DCF skipped: fcfUSD_total has no finite periods after normalization');
    return { metrics: nullMetrics, warnings, errors };
  }

  if (!Number.isInteger(input.productionStartPeriod)) {
    warnings.push('Lista2 CF+DCF skipped: productionStartPeriod is missing');
    return { metrics: nullMetrics, warnings, errors };
  }

  const tp = input.productionStartPeriod as number;

  if (tp < 0 || tp > input.masterN) {
    errors.push(`Lista2 CF+DCF failed: productionStartPeriod ${tp} is outside [0, ${input.masterN}]`);
    return { metrics: nullMetrics, warnings, errors };
  }

  if (!(input.discountRate > 0) || !Number.isFinite(input.discountRate)) {
    errors.push('Lista2 CF+DCF failed: discountRate must be finite and > 0');
    return { metrics: nullMetrics, warnings, errors };
  }

  let cfLom = 0;
  let dcfProdStart_exCapex = 0;
  const dfToToday_tp = 1 / (1 + input.discountRate) ** tp;

  for (let t = 0; t <= input.masterN; t += 1) {
    const fcf = normalizedFcf[t];
    const finiteFcf = fcf !== null && Number.isFinite(fcf) ? fcf : 0;
    cfLom += finiteFcf;

    if (t >= tp) {
      const dfToProdStart = (1 / (1 + input.discountRate) ** t) / dfToToday_tp;
      dcfProdStart_exCapex += finiteFcf * dfToProdStart;
    }
  }

  const dcfProdStart_present = dcfProdStart_exCapex * dfToToday_tp;

  const shares =
    input.shares_post_financing !== null && Number.isFinite(input.shares_post_financing) && input.shares_post_financing > 0
      ? input.shares_post_financing
      : null;
  if (shares === null) {
    warnings.push('Lista2 CF+DCF per-share metrics set to null: shares_post_financing_fd <= 0 or missing');
  }

  const fx =
    input.fx_USD_to_TargetCurrency !== null && Number.isFinite(input.fx_USD_to_TargetCurrency)
      ? input.fx_USD_to_TargetCurrency
      : null;
  if (fx === null) {
    warnings.push('Lista2 CF+DCF target-currency metrics set to null: fx_USD_to_TargetCurrency missing');
  }

  const CF_LOM_perShare_USD = toPerShare(cfLom, shares);
  const DCF_prodStart_exCapex_perShare_USD = toPerShare(dcfProdStart_exCapex, shares);
  const DCF_prodStart_present_perShare_USD = toPerShare(dcfProdStart_present, shares);

  const CF_LOM_TargetCurrency = toTarget(cfLom, fx);
  const CF_LOM_perShare_TargetCurrency = toTarget(CF_LOM_perShare_USD, fx);
  const DCF_prodStart_exCapex_TargetCurrency = toTarget(dcfProdStart_exCapex, fx);
  const DCF_prodStart_exCapex_perShare_TargetCurrency = toTarget(DCF_prodStart_exCapex_perShare_USD, fx);
  const DCF_prodStart_present_TargetCurrency = toTarget(dcfProdStart_present, fx);
  const DCF_prodStart_present_perShare_TargetCurrency = toTarget(DCF_prodStart_present_perShare_USD, fx);

  const cfDenominator = cfLom !== 0 ? cfLom : null;

  return {
    metrics: {
      CF_LOM_USD: cfLom,
      CF_LOM_perShare_USD,
      CF_LOM_prodStart_perShare_USD: CF_LOM_perShare_USD,
      DCF_prodStart_exCapex_USD: dcfProdStart_exCapex,
      DCF_prodStart_exCapex_perShare_USD,
      DCF_prodStart_present_USD: dcfProdStart_present,
      DCF_prodStart_present_perShare_USD,
      CF_LOM_TargetCurrency,
      CF_LOM_perShare_TargetCurrency,
      CF_LOM_prodStart_perShare_TargetCurrency: CF_LOM_perShare_TargetCurrency,
      DCF_prodStart_exCapex_TargetCurrency,
      DCF_prodStart_exCapex_perShare_TargetCurrency,
      DCF_prodStart_present_TargetCurrency,
      DCF_prodStart_present_perShare_TargetCurrency,
      NPV_over_ETLV:
        cfDenominator !== null && input.npvToday_USD !== null && Number.isFinite(input.npvToday_USD)
          ? input.npvToday_USD / cfDenominator
          : null,
      DCF_present_over_ETLV: cfDenominator !== null ? dcfProdStart_present / cfDenominator : null,
      DCF_prodStart_over_ETLV: cfDenominator !== null ? dcfProdStart_exCapex / cfDenominator : null,
    },
    warnings,
    errors,
  };
}
