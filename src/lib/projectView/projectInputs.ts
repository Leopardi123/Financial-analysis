export type MetricValue = { value: number | null; reason: string | null };

export type ProjectInputs = {
  fx: number | null;
  r: number | null;
  tp: number | null;
  masterN: number | null;
  price: number | null;
  sharesCurrent: number | null;
  cash0: number | null;
  debt0: number | null;
  sharesPostFinancing: number | null;
  series: {
    fcfUSD?: number[] | null;
    capexUSD?: number[] | null;
    grossRevenueUSD?: number[] | null;
    auPriceUSD?: number[] | null;
    operatingCostsUSD?: number[] | null;
    sustainingCapexUSD?: number[] | null;
    siteGandAUSD?: number[] | null;
    royaltiesUSD?: number[] | null;
    reclamationAccrualUSD?: number[] | null;
    byproductCreditsUSD?: number[] | null;
    ebitUSD?: number[] | null;
    nopatUSD?: number[] | null;
    effectiveTaxRate?: number[] | null;
    taxUSD?: number[] | null;
    federalIncomeTaxUSD?: number[] | null;
    df_now?: number[] | null;
    payableAuEqOz?: number[] | null;
    sustainingCostUSD?: number[] | null;
  };
};

function asFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asFiniteSeries(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : Number.NaN));
}

function firstFiniteSeries(...candidates: unknown[]): number[] | null {
  for (const candidate of candidates) {
    const normalized = asFiniteSeries(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function derivePayableAuEqOz(grossRevenueUSD: number[] | null, auPriceUSD: number[] | null): number[] | null {
  if (grossRevenueUSD === null || auPriceUSD === null) return null;
  const length = Math.min(grossRevenueUSD.length, auPriceUSD.length);
  if (length === 0) return [];
  const payable = new Array<number>(length).fill(Number.NaN);
  for (let t = 0; t < length; t += 1) {
    const gross = grossRevenueUSD[t];
    const auPrice = auPriceUSD[t];
    payable[t] = Number.isFinite(gross) && Number.isFinite(auPrice) && auPrice > 0
      ? gross / auPrice
      : Number.NaN;
  }
  return payable;
}

function asIntegerOrNull(value: unknown): number | null {
  return Number.isInteger(value) ? Number(value) : null;
}

function normalizeRate(value: unknown): number | null {
  const parsed = asFinite(value);
  if (parsed === null) return null;
  if (parsed > 0 && parsed <= 1) return parsed;
  if (parsed > 1 && parsed <= 100) return parsed / 100;
  return null;
}

export function getProjectInputs(rawState: {
  snapshot?: Record<string, unknown> | null;
  parsedProject?: Record<string, any> | null;
  discountRateInput?: string | number | null;
  targetCurrency?: string | null;
}): ProjectInputs {
  const snapshot = (rawState.snapshot ?? {}) as Record<string, unknown>;
  const series = (snapshot.series ?? {}) as Record<string, unknown>;
  const market = ((snapshot.market ?? snapshot.marketInput) ?? {}) as Record<string, unknown>;
  const financing = (snapshot.financing ?? {}) as Record<string, unknown>;
  const aggregation = (snapshot.aggregation ?? {}) as Record<string, unknown>;
  const parsed = (rawState.parsedProject ?? {}) as Record<string, any>;

  const targetCurrency = typeof snapshot.targetCurrency === 'string' ? snapshot.targetCurrency : rawState.targetCurrency;

  const fx = asFinite(snapshot.fx_USD_to_TargetCurrency)
    ?? asFinite(snapshot.fxUsdToTargetCurrency)
    ?? (targetCurrency === 'USD' ? 1 : null);

  const r = normalizeRate(snapshot.discountRate)
    ?? normalizeRate(aggregation.discountRate)
    ?? normalizeRate(parsed?.engineInputWithoutPrices?.phase2?.discountRate)
    ?? normalizeRate(rawState.discountRateInput);

  const grossRevenueUSD = firstFiniteSeries(
    series.grossRevenueUSD,
    series.totalRevenue_USD,
    aggregation.grossRevenueUSD_total,
    aggregation.revenueUSD_total,
  );
  const auPriceUSD = firstFiniteSeries(
    aggregation.auPriceUSDPerOz,
    series.auPriceUSDPerOz,
  );
  const modeledTimeline = (snapshot.modeledValuationTimeline ?? null) as { tps?: unknown } | null;
  const timelineTps = Array.isArray(modeledTimeline?.tps)
    ? modeledTimeline.tps.filter((value): value is number => Number.isInteger(value)).sort((a, b) => a - b)
    : [];

  const payableAuEqOz = firstFiniteSeries(
    aggregation.payableAuEqOz_total,
    series.payableAuEqOz,
  ) ?? derivePayableAuEqOz(grossRevenueUSD, auPriceUSD);

  return {
    fx,
    r,
    tp: asIntegerOrNull(aggregation.productionStartPeriod)
      ?? (timelineTps.length > 0 ? timelineTps[0] : null)
      ?? asIntegerOrNull(parsed?.engineInputWithoutPrices?.productionStartPeriod),
    masterN: asIntegerOrNull(aggregation.corporateMasterN) ?? asIntegerOrNull(parsed?.engineInputWithoutPrices?.masterN),
    price: asFinite(market.price_current_TargetCurrency),
    sharesCurrent: asFinite(market.shares_current),
    cash0: asFinite(financing.cash_t0_post_TargetCurrency) ?? asFinite(financing.cash_t0_pre_TargetCurrency),
    debt0: asFinite(financing.debt_t0_post_TargetCurrency) ?? asFinite(financing.debt_t0_pre_TargetCurrency),
    sharesPostFinancing: asFinite(financing.shares_post_financing),
    series: {
      fcfUSD: asFiniteSeries(series.fcffUSD),
      capexUSD: asFiniteSeries(series.capexUSD),
      grossRevenueUSD,
      auPriceUSD,
      operatingCostsUSD: asFiniteSeries(series.operatingCostsUSD),
      sustainingCapexUSD: asFiniteSeries(series.sustainingCapexUSD),
      siteGandAUSD: asFiniteSeries(series.siteGandA_USD),
      royaltiesUSD: asFiniteSeries(series.royaltiesUSD),
      reclamationAccrualUSD: asFiniteSeries(series.reclamationUSD),
      byproductCreditsUSD: asFiniteSeries(series.byproductCreditsUSD),
      ebitUSD: asFiniteSeries(series.ebitUSD),
      nopatUSD: asFiniteSeries(series.nopatUSD),
      effectiveTaxRate: asFiniteSeries(series.effectiveTaxRate),
      taxUSD: asFiniteSeries(series.taxUSD),
      federalIncomeTaxUSD: asFiniteSeries((series.taxesDetail as Record<string, unknown> | undefined)?.federalIncomeTaxUSD),
      df_now: asFiniteSeries(series.df_now),
      payableAuEqOz,
      sustainingCostUSD: asFiniteSeries(aggregation.sustainingCostUSD_total),
    },
  };
}

export function validateProjectInputs(inputs: ProjectInputs): string[] {
  const issues: string[] = [];
  if (!(typeof inputs.fx === 'number' && inputs.fx > 0)) issues.push('Missing fx_USD_to_TargetCurrency');
  if (!(typeof inputs.r === 'number' && inputs.r > 0)) issues.push('Missing discountRate r');
  if (!Number.isInteger(inputs.tp)) issues.push('Missing tp');
  if (!Number.isInteger(inputs.masterN)) issues.push('Missing masterN');
  if (!(typeof inputs.price === 'number' && inputs.price > 0)) issues.push('Missing price_current_TargetCurrency');
  if (!(typeof inputs.sharesCurrent === 'number' && inputs.sharesCurrent > 0)) issues.push('Missing shares_current');
  if (inputs.series.fcfUSD === null) issues.push('Missing series fcfUSD');
  if (inputs.series.capexUSD === null) issues.push('Missing series capexUSD');
  if (inputs.series.grossRevenueUSD === null) issues.push('Missing series grossRevenue_USD');
  return issues;
}
