export type SnapshotRequest = {
  targetCurrency: string;
  discountRate: number;
  fx_USD_to_TargetCurrency: number;
  market: {
    shares_current: number;
    price_current_TargetCurrency: number;
    preferredEquity_TargetCurrency?: number | null;
    minorityInterest_TargetCurrency?: number | null;
  };
  balanceSheet: {
    cash_t0_TargetCurrency?: number | null;
    debt_t0_TargetCurrency?: number | null;
  };
  financingPlan: {
    debt_fraction?: number | null;
    equity_fraction?: number | null;
    use_cash_first?: boolean;
    cash_use_cap_TargetCurrency?: number | null;
    equity_raise_price_TargetCurrency?: number | null;
  };
  buildFundingNeed_USD?: number | null;
  projects: Array<{
    projectId: string;
    rawJson: Record<string, unknown>;
  }>;
};

type ValidationOk = { ok: true; value: SnapshotRequest; warnings: string[] };
type ValidationError = { ok: false; errors: string[]; warnings: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return asFiniteNumber(value);
}

export function validateSnapshotRequest(body: unknown): ValidationOk | ValidationError {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(body)) {
    return {
      ok: false,
      errors: ['Request body must be a JSON object'],
      warnings,
    };
  }

  const targetCurrency = typeof body.targetCurrency === 'string' ? body.targetCurrency.trim() : '';
  if (!targetCurrency) {
    errors.push('targetCurrency is required and must be a non-empty string');
  }

  const discountRate = asFiniteNumber(body.discountRate);
  if (discountRate === null || !(discountRate > 0 && discountRate <= 0.25)) {
    errors.push('discountRate must satisfy 0 < r <= 0.25');
  }

  const fx = asFiniteNumber(body.fx_USD_to_TargetCurrency);
  if (fx === null || fx <= 0) {
    errors.push('fx_USD_to_TargetCurrency must be finite and > 0');
  }

  const market = isObject(body.market) ? body.market : null;
  if (!market) {
    errors.push('market is required and must be an object');
  }

  const sharesCurrent = market ? asFiniteNumber(market.shares_current) : null;
  if (sharesCurrent === null || sharesCurrent <= 0) {
    errors.push('market.shares_current must be finite and > 0');
  }

  const priceCurrent = market ? asFiniteNumber(market.price_current_TargetCurrency) : null;
  if (priceCurrent === null || priceCurrent <= 0) {
    errors.push('market.price_current_TargetCurrency must be finite and > 0');
  }

  const preferredEquity = market ? asNullableFiniteNumber(market.preferredEquity_TargetCurrency) : undefined;
  if (market && market.preferredEquity_TargetCurrency !== undefined && preferredEquity === null && market.preferredEquity_TargetCurrency !== null) {
    errors.push('market.preferredEquity_TargetCurrency must be finite, null, or omitted');
  }

  const minorityInterest = market ? asNullableFiniteNumber(market.minorityInterest_TargetCurrency) : undefined;
  if (market && market.minorityInterest_TargetCurrency !== undefined && minorityInterest === null && market.minorityInterest_TargetCurrency !== null) {
    errors.push('market.minorityInterest_TargetCurrency must be finite, null, or omitted');
  }

  const balanceSheet = isObject(body.balanceSheet) ? body.balanceSheet : null;
  if (!balanceSheet) {
    errors.push('balanceSheet is required and must be an object');
  }

  const cashT0 = balanceSheet ? asNullableFiniteNumber(balanceSheet.cash_t0_TargetCurrency) : undefined;
  if (balanceSheet && balanceSheet.cash_t0_TargetCurrency !== undefined && cashT0 === null && balanceSheet.cash_t0_TargetCurrency !== null) {
    errors.push('balanceSheet.cash_t0_TargetCurrency must be finite, null, or omitted');
  }

  const debtT0 = balanceSheet ? asNullableFiniteNumber(balanceSheet.debt_t0_TargetCurrency) : undefined;
  if (balanceSheet && balanceSheet.debt_t0_TargetCurrency !== undefined && debtT0 === null && balanceSheet.debt_t0_TargetCurrency !== null) {
    errors.push('balanceSheet.debt_t0_TargetCurrency must be finite, null, or omitted');
  }

  const financingPlan = isObject(body.financingPlan) ? body.financingPlan : null;
  if (!financingPlan) {
    errors.push('financingPlan is required and must be an object');
  }

  const debtFraction = financingPlan ? asNullableFiniteNumber(financingPlan.debt_fraction) : undefined;
  if (financingPlan && financingPlan.debt_fraction !== undefined && debtFraction === null && financingPlan.debt_fraction !== null) {
    errors.push('financingPlan.debt_fraction must be finite, null, or omitted');
  }

  const equityFraction = financingPlan ? asNullableFiniteNumber(financingPlan.equity_fraction) : undefined;
  if (financingPlan && financingPlan.equity_fraction !== undefined && equityFraction === null && financingPlan.equity_fraction !== null) {
    errors.push('financingPlan.equity_fraction must be finite, null, or omitted');
  }

  const useCashFirst = financingPlan?.use_cash_first;
  if (financingPlan && useCashFirst !== undefined && typeof useCashFirst !== 'boolean') {
    errors.push('financingPlan.use_cash_first must be boolean when provided');
  }

  const cashUseCap = financingPlan ? asNullableFiniteNumber(financingPlan.cash_use_cap_TargetCurrency) : undefined;
  if (financingPlan && financingPlan.cash_use_cap_TargetCurrency !== undefined && cashUseCap === null && financingPlan.cash_use_cap_TargetCurrency !== null) {
    errors.push('financingPlan.cash_use_cap_TargetCurrency must be finite, null, or omitted');
  }

  const raisePrice = financingPlan ? asNullableFiniteNumber(financingPlan.equity_raise_price_TargetCurrency) : undefined;
  if (financingPlan && financingPlan.equity_raise_price_TargetCurrency !== undefined && raisePrice === null && financingPlan.equity_raise_price_TargetCurrency !== null) {
    errors.push('financingPlan.equity_raise_price_TargetCurrency must be finite, null, or omitted');
  }

  const buildFundingNeed = asNullableFiniteNumber(body.buildFundingNeed_USD);
  if (body.buildFundingNeed_USD !== undefined && buildFundingNeed === null && body.buildFundingNeed_USD !== null) {
    errors.push('buildFundingNeed_USD must be finite, null, or omitted');
  }

  const projectsRaw = body.projects;
  if (!Array.isArray(projectsRaw) || projectsRaw.length === 0) {
    errors.push('projects must be a non-empty array');
  }

  const projects = Array.isArray(projectsRaw)
    ? projectsRaw.map((item, index) => {
        if (!isObject(item)) {
          errors.push(`projects[${index}] must be an object`);
          return null;
        }

        const projectId = typeof item.projectId === 'string' ? item.projectId.trim() : '';
        if (!projectId) {
          errors.push(`projects[${index}].projectId must be a non-empty string`);
        }

        if (!isObject(item.rawJson)) {
          errors.push(`projects[${index}].rawJson must be an object`);
        }

        return {
          projectId,
          rawJson: (isObject(item.rawJson) ? item.rawJson : {}) as Record<string, unknown>,
        };
      }).filter((item): item is { projectId: string; rawJson: Record<string, unknown> } => item !== null)
    : [];

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    value: {
      targetCurrency,
      discountRate: discountRate as number,
      fx_USD_to_TargetCurrency: fx as number,
      market: {
        shares_current: sharesCurrent as number,
        price_current_TargetCurrency: priceCurrent as number,
        preferredEquity_TargetCurrency: preferredEquity ?? null,
        minorityInterest_TargetCurrency: minorityInterest ?? null,
      },
      balanceSheet: {
        cash_t0_TargetCurrency: cashT0 ?? null,
        debt_t0_TargetCurrency: debtT0 ?? null,
      },
      financingPlan: {
        debt_fraction: debtFraction ?? null,
        equity_fraction: equityFraction ?? null,
        use_cash_first: typeof useCashFirst === 'boolean' ? useCashFirst : true,
        cash_use_cap_TargetCurrency: cashUseCap ?? null,
        equity_raise_price_TargetCurrency: raisePrice ?? null,
      },
      buildFundingNeed_USD: buildFundingNeed ?? null,
      projects,
    },
  };
}
