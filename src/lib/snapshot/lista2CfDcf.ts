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
  NAV_prodStart_TargetCurrency: NullableNumber;
  NAV_prodStart_perShare_TargetCurrency: NullableNumber;
  NPV_prodStart_USD: NullableNumber;
  NPV_prodStart_TargetCurrency: NullableNumber;
  NPV_prodStart_perShare_TargetCurrency: NullableNumber;
  InitialCAPEX_incremental_USD: NullableNumber;
  InitialCAPEX_incremental_TargetCurrency: NullableNumber;
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
  netCash_t0_post_TargetCurrency?: number | null;
  capexUSD_total?: Array<number | null>;
  initialCapexStartPeriod?: number;
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
    NAV_prodStart_TargetCurrency: null,
    NAV_prodStart_perShare_TargetCurrency: null,
    NPV_prodStart_USD: null,
    NPV_prodStart_TargetCurrency: null,
    NPV_prodStart_perShare_TargetCurrency: null,
    InitialCAPEX_incremental_USD: null,
    InitialCAPEX_incremental_TargetCurrency: null,
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

function deriveRemainingInitialCapexUSD(
  capexUSD: Array<number | null> | undefined,
  valuationPeriod: number,
  masterN: number,
): NullableNumber {
  if (capexUSD === undefined) return 0;
  if (!Array.isArray(capexUSD) || capexUSD.length < masterN + 1) return null;
  const slice = capexUSD.slice(valuationPeriod, masterN + 1);
  if (slice.some((v) => v === null || !Number.isFinite(v))) return null;
  return (slice as number[]).reduce((sum, v) => sum + v, 0);
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

  const CF_LOM_TargetCurrency = toTarget(cfLom, fx);
  const CF_LOM_perShare_TargetCurrency = toTarget(CF_LOM_perShare_USD, fx);
  const remainingInitialCapexUSD = deriveRemainingInitialCapexUSD(input.capexUSD_total, tp, input.masterN);
  if (remainingInitialCapexUSD === null) {
    warnings.push('Lista2 CF+DCF rolling metrics set to null: missing remaining capexUSD_total from valuation period');
  }
  // Canonical High anchor: the DCF at the supplied production-start period.
  // Initial CAPEX is never added back period by period. Callers that render a
  // pre-production curve discount this single anchor back from the real TP.
  const dcfProdStartPresentUSD = dcfProdStart_exCapex * dfToToday_tp;
  const NPV_prodStart_USD =
    Number.isFinite(dcfProdStart_exCapex) ? dcfProdStart_exCapex : null;
  const NPV_prodStart_TargetCurrency = toTarget(NPV_prodStart_USD, fx);
  const netCash_t0_post_TargetCurrency =
    input.netCash_t0_post_TargetCurrency !== null
    && input.netCash_t0_post_TargetCurrency !== undefined
    && Number.isFinite(input.netCash_t0_post_TargetCurrency)
      ? input.netCash_t0_post_TargetCurrency
      : null;
  const NAV_prodStart_TargetCurrency =
    NPV_prodStart_TargetCurrency !== null && netCash_t0_post_TargetCurrency !== null
      ? NPV_prodStart_TargetCurrency + netCash_t0_post_TargetCurrency
      : null;
  const NAV_prodStart_perShare_TargetCurrency = toPerShare(NAV_prodStart_TargetCurrency, shares);
  const NPV_prodStart_perShare_TargetCurrency = toPerShare(NPV_prodStart_TargetCurrency, shares);
  const InitialCAPEX_incremental_TargetCurrency = toTarget(remainingInitialCapexUSD, fx);

  const cfDenominator = cfLom !== 0 ? cfLom : null;

  return {
    metrics: {
      CF_LOM_USD: cfLom,
      CF_LOM_perShare_USD,
      CF_LOM_prodStart_perShare_USD: CF_LOM_perShare_USD,
      DCF_prodStart_exCapex_USD: dcfProdStart_exCapex,
      DCF_prodStart_exCapex_perShare_USD: toPerShare(dcfProdStart_exCapex, shares),
      DCF_prodStart_present_USD: dcfProdStartPresentUSD,
      DCF_prodStart_present_perShare_USD: toPerShare(dcfProdStartPresentUSD, shares),
      CF_LOM_TargetCurrency,
      CF_LOM_perShare_TargetCurrency,
      CF_LOM_prodStart_perShare_TargetCurrency: CF_LOM_perShare_TargetCurrency,
      DCF_prodStart_exCapex_TargetCurrency: toTarget(dcfProdStart_exCapex, fx),
      DCF_prodStart_exCapex_perShare_TargetCurrency: toTarget(toPerShare(dcfProdStart_exCapex, shares), fx),
      DCF_prodStart_present_TargetCurrency: toTarget(dcfProdStartPresentUSD, fx),
      DCF_prodStart_present_perShare_TargetCurrency: toTarget(toPerShare(dcfProdStartPresentUSD, shares), fx),
      NAV_prodStart_TargetCurrency,
      NAV_prodStart_perShare_TargetCurrency,
      NPV_prodStart_USD,
      NPV_prodStart_TargetCurrency,
      NPV_prodStart_perShare_TargetCurrency,
      InitialCAPEX_incremental_USD: remainingInitialCapexUSD,
      InitialCAPEX_incremental_TargetCurrency,
      NPV_over_ETLV:
        cfDenominator !== null && input.npvToday_USD !== null && Number.isFinite(input.npvToday_USD)
          ? input.npvToday_USD / cfDenominator
          : null,
      DCF_present_over_ETLV: cfDenominator !== null ? dcfProdStartPresentUSD / cfDenominator : null,
      DCF_prodStart_over_ETLV: cfDenominator !== null ? dcfProdStart_exCapex / cfDenominator : null,
    },
    warnings,
    errors,
  };
}
