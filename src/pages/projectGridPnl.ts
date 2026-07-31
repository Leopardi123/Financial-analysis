export type ProjectGridSeries = {
  revenueByMetal_USD?: Record<string, Array<number | null>>;
  totalRevenue_USD?: Array<number | null>;
  operatingCostsUSD?: Array<number | null>;
  sustainingCapexUSD?: Array<number | null>;
  siteGandA_USD?: Array<number | null>;
  royaltiesUSD?: Array<number | null>;
  royaltiesDetail?: Array<{
    id: string;
    label: string;
    base?: string | null;
    rateType?: string | null;
    rate?: number | null;
    royaltyUSD?: Array<number | null>;
  }>;
  reclamationUSD?: Array<number | null>;
  byproductCreditsUSD?: Array<number | null>;
  sustainingCostUSD?: Array<number | null>;
  depreciationUSD?: Array<number | null>;
  sustainingAdjustedOperatingEarningsUSD?: Array<number | null>;
  ebitdaUSD?: Array<number | null>;
  ebitUSD?: Array<number | null>;
  taxableIncomeUSD?: Array<number | null>;
  effectiveTaxRate?: Array<number | null>;
  taxUSD?: Array<number | null>;
  workingCapitalDeltaUSD?: Array<number | null>;
  capexUSD?: Array<number | null>;
  totalCapexUSD?: Array<number | null>;
  fcffUSD?: Array<number | null>;
};

export type ProjectGridPnlSeries = {
  revenueByMetal: Record<string, Array<number | null>>;
  grossRevenue: Array<number | null>;
  operatingCosts: Array<number | null>;
  royalties: Array<number | null>;
  royaltyRatePct: Array<number | null>;
  royaltiesSourceUsed: 'royaltiesDetail-current-run' | 'series.royaltiesUSD-fallback' | 'null';
  royaltiesDetailFailureReason: string | null;
  fallbackReason: string | null;
  royaltiesResolvedNumeric: boolean;
  computedPeriods: number;
  skippedPeriods: number;
  grossRevenueNullPeriods: number[];
  royaltiesRuleCount: number;
  royaltiesRateTypes: string[];
  royaltiesBases: string[];
  effectiveRoyaltyRateByPeriod: Array<number | null>;
  siteGandA: Array<number | null>;
  grossProfit: Array<number | null>;
  ebitda: Array<number | null>;
  sustainingAdjustedOperatingEarnings: Array<number | null>;
  ebit: Array<number | null>;
  taxableIncome: Array<number | null>;
  tax: Array<number | null>;
  effectiveTaxRate: Array<number | null>;
  sustainingCapex: Array<number | null>;
  reclamation: Array<number | null>;
  workingCapitalDelta: Array<number | null>;
  byproductCredits: Array<number | null>;
  capex: Array<number | null>;
  fcff: Array<number | null>;
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildProjectGridPnl(series: ProjectGridSeries, length: number): ProjectGridPnlSeries {
  const revenueByMetal = series.revenueByMetal_USD ?? {};
  const royaltiesFromDetail = (() => {
    const detail = (series.royaltiesDetail ?? []) as Array<{ royaltyUSD?: Array<number | null> }>;
    if (detail.length === 0 || !Array.isArray(detail[0]?.royaltyUSD)) return undefined;
    return Array.from({ length }, (_, t) => {
      let sum = 0;
      let hasFinite = false;
      for (const item of detail) {
        const value = item.royaltyUSD?.[t];
        if (typeof value === 'number' && Number.isFinite(value)) {
          sum += value;
          hasFinite = true;
        }
      }
      return hasFinite ? sum : null;
    });
  })();

  const sortedMetals = Object.keys(revenueByMetal).sort((a, b) => a.localeCompare(b));
  const grossRevenueFromMetals = Array.from({ length }, (_, t) => {
    if (sortedMetals.length === 0) return null;
    let sum = 0;
    for (const metal of sortedMetals) {
      const value = finiteOrNull(revenueByMetal[metal]?.[t]);
      if (value === null) return null;
      sum += value;
    }
    return sum;
  });
  const grossRevenue = Array.from({ length }, (_, t) => finiteOrNull(series.totalRevenue_USD?.[t]) ?? grossRevenueFromMetals[t]);

  const operatingCosts = Array.from({ length }, (_, t) => finiteOrNull(series.operatingCostsUSD?.[t]));
  const siteGandA = Array.from({ length }, (_, t) => finiteOrNull(series.siteGandA_USD?.[t]));
  const royalties = Array.from({ length }, (_, t) => finiteOrNull((royaltiesFromDetail ?? series.royaltiesUSD)?.[t]));
  const royaltiesSourceUsed: 'royaltiesDetail-current-run' | 'series.royaltiesUSD-fallback' | 'null' = royaltiesFromDetail
    ? 'royaltiesDetail-current-run'
    : Array.isArray(series.royaltiesUSD)
      ? 'series.royaltiesUSD-fallback'
      : 'null';
  const royaltiesDetailFailureReason = royaltiesFromDetail
    ? null
    : Array.isArray(series.royaltiesDetail)
      ? 'royaltiesDetail present but no usable royaltyUSD detail series for display source'
      : 'royaltiesDetail missing';
  const fallbackReason = royaltiesSourceUsed === 'series.royaltiesUSD-fallback'
    ? 'royaltiesDetail current-run computation not usable for display source; using explicit series.royaltiesUSD'
    : null;
  const byproductCredits = Array.from({ length }, (_, t) => finiteOrNull(series.byproductCreditsUSD?.[t]) ?? 0);
  const depreciation = Array.from({ length }, (_, t) => finiteOrNull(series.depreciationUSD?.[t]) ?? 0);
  const tax = Array.from({ length }, (_, t) => finiteOrNull(series.taxUSD?.[t]));
  const sustainingCapex = Array.from({ length }, (_, t) => finiteOrNull(series.sustainingCapexUSD?.[t]));
  const reclamation = Array.from({ length }, (_, t) => finiteOrNull(series.reclamationUSD?.[t]));
  const workingCapitalDelta = Array.from({ length }, (_, t) => finiteOrNull(series.workingCapitalDeltaUSD?.[t]));
  const capex = Array.from({ length }, (_, t) => finiteOrNull(series.capexUSD?.[t]));
  const grossRevenueNullPeriods = grossRevenue
    .map((value, t) => (value === null ? t : null))
    .filter((t): t is number => t !== null);
  const royaltyRatePct = Array.from({ length }, (_, t) => {
    if (royaltiesSourceUsed !== 'royaltiesDetail-current-run') return null;
    const gross = grossRevenue[t];
    const royalty = royalties[t];
    if (gross === null || royalty === null) return null;
    if (gross === 0) return royalty === 0 ? 0 : null;
    return (royalty / gross) * 100;
  });
  const computedPeriods = royalties.filter((value) => value !== null).length;
  const skippedPeriods = royalties.length - computedPeriods;
  const royaltiesResolvedNumeric = computedPeriods > 0;
  const royaltiesRuleCount = Array.isArray(series.royaltiesDetail) ? series.royaltiesDetail.length : 0;
  const royaltiesRateTypes = Array.from(new Set((series.royaltiesDetail ?? []).map((item) => (typeof item.rateType === 'string' ? item.rateType : null)).filter((item): item is string => Boolean(item)))).sort((a, b) => a.localeCompare(b));
  const royaltiesBases = Array.from(new Set((series.royaltiesDetail ?? []).map((item) => (typeof item.base === 'string' ? item.base : null)).filter((item): item is string => Boolean(item)))).sort((a, b) => a.localeCompare(b));

  const grossProfit = Array.from({ length }, (_, t) => {
    const revenue = grossRevenue[t];
    const opCost = operatingCosts[t];
    const royalty = royalties[t];
    if (revenue === null || opCost === null || royalty === null) return null;
    return revenue - opCost - royalty - byproductCredits[t];
  });

  const ebitdaFromComponents = Array.from({ length }, (_, t) => {
    const revenue = grossRevenue[t];
    const opCost = operatingCosts[t];
    const gna = siteGandA[t];
    const royalty = royalties[t];
    const recl = reclamation[t];
    if (revenue === null || opCost === null || gna === null || royalty === null || recl === null) return null;
    return revenue - opCost - gna - royalty - recl + byproductCredits[t];
  });
  const ebitda = Array.from({ length }, (_, t) => finiteOrNull(series.ebitdaUSD?.[t]) ?? ebitdaFromComponents[t]);
  const sustainingAdjustedOperatingEarnings = Array.from({ length }, (_, t) => {
    const explicit = finiteOrNull(series.sustainingAdjustedOperatingEarningsUSD?.[t]);
    const ebitdaValue = ebitda[t];
    const sustaining = sustainingCapex[t];
    return explicit ?? (ebitdaValue === null || sustaining === null ? null : ebitdaValue - sustaining);
  });

  const ebitFromComponents = Array.from({ length }, (_, t) => {
    const operatingEarnings = sustainingAdjustedOperatingEarnings[t];
    if (operatingEarnings === null) return null;
    return operatingEarnings - (depreciation[t] ?? 0);
  });
  const ebit = Array.from({ length }, (_, t) => finiteOrNull(series.ebitUSD?.[t]) ?? ebitFromComponents[t]);

  const taxableIncomeFromComponents = Array.from({ length }, (_, t) => {
    const ebitValue = ebit[t];
    if (ebitValue === null) return null;
    return Math.max(0, ebitValue);
  });
  const taxableIncome = Array.from({ length }, (_, t) => finiteOrNull(series.taxableIncomeUSD?.[t]) ?? taxableIncomeFromComponents[t]);

  const effectiveTaxRateFromComponents = Array.from({ length }, (_, t) => {
    const taxable = taxableIncome[t];
    const taxValue = tax[t];
    if (taxable === null || taxValue === null || taxable === 0) return null;
    return taxValue / taxable;
  });
  const effectiveTaxRate = Array.from({ length }, (_, t) => finiteOrNull(series.effectiveTaxRate?.[t]) ?? effectiveTaxRateFromComponents[t]);

  const fcffFromComponents = Array.from({ length }, (_, t) => {
    const revenue = grossRevenue[t];
    const opCost = operatingCosts[t];
    const gna = siteGandA[t];
    const royalty = royalties[t];
    const taxValue = tax[t];
    const sustaining = sustainingCapex[t];
    const recl = reclamation[t];
    const wcDelta = workingCapitalDelta[t];
    const capexValue = capex[t];
    if (revenue === null || opCost === null || gna === null || royalty === null || taxValue === null || sustaining === null || recl === null || wcDelta === null || capexValue === null) {
      return null;
    }
    return revenue - opCost - gna - royalty - taxValue - sustaining - recl - wcDelta - capexValue + byproductCredits[t];
  });
  const fcff = Array.from({ length }, (_, t) => finiteOrNull(series.fcffUSD?.[t]) ?? fcffFromComponents[t]);

  return {
    revenueByMetal,
    grossRevenue,
    operatingCosts,
    royalties,
    royaltyRatePct,
    royaltiesSourceUsed,
    royaltiesDetailFailureReason,
    fallbackReason,
    royaltiesResolvedNumeric,
    computedPeriods,
    skippedPeriods,
    grossRevenueNullPeriods,
    royaltiesRuleCount,
    royaltiesRateTypes,
    royaltiesBases,
    effectiveRoyaltyRateByPeriod: royaltyRatePct,
    siteGandA,
    grossProfit,
    ebitda,
    sustainingAdjustedOperatingEarnings,
    ebit,
    taxableIncome,
    tax,
    effectiveTaxRate,
    sustainingCapex,
    reclamation,
    workingCapitalDelta,
    byproductCredits,
    capex,
    fcff,
  };
}
