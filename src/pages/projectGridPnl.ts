export type ProjectGridSeries = {
  revenueByMetal_USD?: Record<string, Array<number | null>>;
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
  taxUSD?: Array<number | null>;
  workingCapitalDeltaUSD?: Array<number | null>;
  capexUSD?: Array<number | null>;
  totalCapexUSD?: Array<number | null>;
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
  royaltiesDetailPresent: boolean;
  royaltiesDetailRuleCount: number;
  royaltiesDetailComputable: boolean;
  royaltiesDetailBaseNormalized: string | null;
  royaltiesDetailRateTypeNormalized: string | null;
  royaltiesDetailRateParsed: number | null;
  royaltyRatePercentResolved: number | null;
  royaltiesFailureReason: string | null;
  royaltiesRateTypes: string[];
  royaltiesBases: string[];
  royaltiesRuleDiagnostics: Array<{
    id: string;
    label: string;
    baseRaw: string | null;
    baseNormalized: string | null;
    rateTypeRaw: string | null;
    rateTypeNormalized: string | null;
    rateRaw: number | null;
    rateParsed: number | null;
    computable: boolean;
    failureReason: string | null;
  }>;
  royaltiesPeriodDiagnostics: Array<{
    periodIndex: number;
    grossRevenueUSD: number | null;
    royaltiesUSDResolved: number | null;
    royaltyRatePctResolved: number | null;
    sourceUsed: 'royaltiesDetail-current-run' | 'series.royaltiesUSD-fallback' | 'null';
    detailComputableRuleCount: number;
    failedAtStep: 'none' | 'rule-detection' | 'gross-revenue-missing' | 'fallback-series-null' | 'no-source';
    failureReason: string | null;
  }>;
  effectiveRoyaltyRateByPeriod: Array<number | null>;
  siteGandA: Array<number | null>;
  grossProfit: Array<number | null>;
  ebitda: Array<number | null>;
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

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized.length > 0 ? normalized : null;
}

function normalizeRateType(value: string | null | undefined): string | null {
  const token = normalizeToken(value);
  if (token === null) return null;
  const compact = token.replace(/_/g, '');
  if (compact === 'nsrpct') return 'nsr_pct';
  if (compact === 'advalorempct') return 'ad_valorem_pct';
  return token;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function buildProjectGridPnl(series: ProjectGridSeries, length: number): ProjectGridPnlSeries {
  const revenueByMetal = series.revenueByMetal_USD ?? {};
  const royaltiesDetailItems = series.royaltiesDetail ?? [];
  const royaltiesDetailPresent = Array.isArray(series.royaltiesDetail);
  const royaltiesDetailRuleCount = royaltiesDetailItems.length;

  const sortedMetals = Object.keys(revenueByMetal).sort((a, b) => a.localeCompare(b));
  const grossRevenue = Array.from({ length }, (_, t) => {
    if (sortedMetals.length === 0) return null;
    let sum = 0;
    let hasFinite = false;
    for (const metal of sortedMetals) {
      const value = finiteOrNull(revenueByMetal[metal]?.[t]);
      if (value === null) continue;
      sum += value;
      hasFinite = true;
    }
    return hasFinite ? sum : null;
  });

  const operatingCosts = Array.from({ length }, (_, t) => finiteOrNull(series.operatingCostsUSD?.[t]));
  const siteGandA = Array.from({ length }, (_, t) => finiteOrNull(series.siteGandA_USD?.[t]));

  const firstComputableRule = royaltiesDetailItems.find((item) => {
    const baseNormalized = normalizeToken(item.base ?? null);
    const rateParsed = parseFiniteNumber(item.rate);
    return baseNormalized === 'revenue' && rateParsed !== null;
  });
  const royaltiesDetailBaseNormalized = firstComputableRule ? normalizeToken(firstComputableRule.base ?? null) : null;
  const royaltiesDetailRateTypeNormalized = firstComputableRule ? normalizeRateType(firstComputableRule.rateType ?? null) : null;
  const royaltiesDetailRateParsed = firstComputableRule ? parseFiniteNumber(firstComputableRule.rate) : null;
  const royaltiesDetailComputable = firstComputableRule !== undefined;
  const royaltiesRuleDiagnostics = royaltiesDetailItems.map((item) => {
    const baseNormalized = normalizeToken(item.base ?? null);
    const rateTypeNormalized = normalizeRateType(item.rateType ?? null);
    const rateParsed = parseFiniteNumber(item.rate);
    const computable = baseNormalized === 'revenue' && rateParsed !== null;
    const failureReason = computable
      ? null
      : baseNormalized !== 'revenue'
        ? `Unsupported base (${String(item.base ?? null)} -> ${String(baseNormalized)})`
        : 'Rate is missing or non-numeric';
    return {
      id: item.id,
      label: item.label,
      baseRaw: item.base ?? null,
      baseNormalized,
      rateTypeRaw: item.rateType ?? null,
      rateTypeNormalized,
      rateRaw: typeof item.rate === 'number' && Number.isFinite(item.rate) ? item.rate : null,
      rateParsed,
      computable,
      failureReason,
    };
  });

  const royaltiesFromDetail = royaltiesDetailComputable
    ? Array.from({ length }, (_, t) => {
      const gross = grossRevenue[t];
      if (gross === null) return null;
      let sum = 0;
      for (const item of royaltiesDetailItems) {
        const baseNormalized = normalizeToken(item.base ?? null);
        const rateParsed = parseFiniteNumber(item.rate);
        const isComputableRule = baseNormalized === 'revenue' && rateParsed !== null;
        if (!isComputableRule) continue;
        sum += gross * ((rateParsed as number) / 100);
      }
      return sum;
    })
    : undefined;

  const royalties = Array.from({ length }, (_, t) => finiteOrNull((royaltiesFromDetail ?? series.royaltiesUSD)?.[t]));
  const royaltiesSourceUsed: 'royaltiesDetail-current-run' | 'series.royaltiesUSD-fallback' | 'null' = royaltiesFromDetail
    ? 'royaltiesDetail-current-run'
    : Array.isArray(series.royaltiesUSD)
      ? 'series.royaltiesUSD-fallback'
      : 'null';
  const royaltiesDetailFailureReason = royaltiesFromDetail
    ? null
    : royaltiesDetailPresent
      ? 'royaltiesDetail present but no computable current-run percentage rule found'
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
  const royaltyRatePercentResolved = royaltiesSourceUsed === 'royaltiesDetail-current-run' ? royaltiesDetailRateParsed : null;
  const royaltiesFailureReason = royaltiesResolvedNumeric
    ? null
    : royaltiesSourceUsed === 'null'
      ? 'No royalties source resolved (neither computable royaltiesDetail nor series.royaltiesUSD)'
      : royaltiesSourceUsed === 'series.royaltiesUSD-fallback'
        ? 'Current-run royaltiesDetail not computable; fallback series.royaltiesUSD contains no numeric values'
        : 'Current-run royaltiesDetail computable, but grossRevenueUSD is null in all periods';
  const royaltiesPeriodDiagnostics = Array.from({ length }, (_, t) => {
    const gross = grossRevenue[t];
    const royalty = royalties[t];
    const ratePct = royaltyRatePct[t];
    const detailComputableRuleCount = royaltiesRuleDiagnostics.filter((rule) => rule.computable).length;
    let failedAtStep: 'none' | 'rule-detection' | 'gross-revenue-missing' | 'fallback-series-null' | 'no-source' = 'none';
    let failureReason: string | null = null;

    if (royalty === null) {
      if (royaltiesSourceUsed === 'royaltiesDetail-current-run') {
        if (detailComputableRuleCount === 0) {
          failedAtStep = 'rule-detection';
          failureReason = 'No computable royaltiesDetail rule for current-run percentage royalties';
        } else if (gross === null) {
          failedAtStep = 'gross-revenue-missing';
          failureReason = 'Gross revenue is null this period, cannot compute percentage royalty';
        } else {
          failedAtStep = 'rule-detection';
          failureReason = 'Royalties unresolved despite computable rule (unexpected)';
        }
      } else if (royaltiesSourceUsed === 'series.royaltiesUSD-fallback') {
        failedAtStep = 'fallback-series-null';
        failureReason = 'Fallback series.royaltiesUSD is null/non-numeric this period';
      } else {
        failedAtStep = 'no-source';
        failureReason = 'No royalties source available (detail non-computable and fallback missing)';
      }
    }

    return {
      periodIndex: t,
      grossRevenueUSD: gross,
      royaltiesUSDResolved: royalty,
      royaltyRatePctResolved: ratePct,
      sourceUsed: royaltiesSourceUsed,
      detailComputableRuleCount,
      failedAtStep,
      failureReason,
    };
  });

  const grossProfit = Array.from({ length }, (_, t) => {
    const revenue = grossRevenue[t];
    const opCost = operatingCosts[t];
    const royalty = royalties[t];
    if (revenue === null || opCost === null || royalty === null) return null;
    return revenue - opCost - royalty - byproductCredits[t];
  });


  const ebitda = Array.from({ length }, (_, t) => {
    const revenue = grossRevenue[t];
    const opCost = operatingCosts[t];
    const royalty = royalties[t];
    if (revenue === null || opCost === null || royalty === null) return null;
    return revenue - opCost - royalty;
  });

  const ebit = Array.from({ length }, (_, t) => {
    const revenue = grossRevenue[t];
    const opCost = operatingCosts[t];
    const gna = siteGandA[t];
    const royalty = royalties[t];
    if (revenue === null || opCost === null || gna === null || royalty === null) return null;
    return revenue - opCost - gna - royalty + byproductCredits[t];
  });

  const taxableIncome = Array.from({ length }, (_, t) => {
    const ebitValue = ebit[t];
    if (ebitValue === null) return null;
    return ebitValue - depreciation[t];
  });

  const effectiveTaxRate = Array.from({ length }, (_, t) => {
    const taxable = taxableIncome[t];
    const taxValue = tax[t];
    if (taxable === null || taxValue === null || taxable === 0) return null;
    return taxValue / taxable;
  });

  const fcff = Array.from({ length }, (_, t) => {
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
    royaltiesDetailPresent,
    royaltiesDetailRuleCount,
    royaltiesDetailComputable,
    royaltiesDetailBaseNormalized,
    royaltiesDetailRateTypeNormalized,
    royaltiesDetailRateParsed,
    royaltyRatePercentResolved,
    royaltiesFailureReason,
    royaltiesRateTypes,
    royaltiesBases,
    royaltiesRuleDiagnostics,
    royaltiesPeriodDiagnostics,
    effectiveRoyaltyRateByPeriod: royaltyRatePct,
    siteGandA,
    grossProfit,
    ebitda,
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
