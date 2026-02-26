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
  balanceSheet?: {
    cash_t0_TargetCurrency?: number | null;
    debt_t0_TargetCurrency?: number | null;
  };
  financingPlan?: {
    debt_fraction?: number | null;
    equity_fraction?: number | null;
    use_cash_first?: boolean | null;
    cash_use_cap_TargetCurrency?: number | null;
    equity_raise_price_TargetCurrency?: number | null;
  };
  buildFundingNeed_USD?: number | null;
  projects: Array<{
    projectId: string;
    rawJson: Record<string, unknown>;
  }>;
};

type ValidationResult =
  | { ok: true; value: SnapshotRequest; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return readFiniteNumber(value);
}

export function validateSnapshotRequest(body: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(body)) {
    return { ok: false, errors: ['Request body must be a JSON object'], warnings };
  }

  const targetCurrency = typeof body.targetCurrency === 'string' ? body.targetCurrency.trim() : '';
  if (!targetCurrency) {
    errors.push('targetCurrency is required and must be a non-empty string');
  }

  const discountRate = readFiniteNumber(body.discountRate);
  if (discountRate === null || !(discountRate > 0 && discountRate <= 0.25)) {
    errors.push('discountRate must satisfy 0 < r <= 0.25');
  }

  const fx = readFiniteNumber(body.fx_USD_to_TargetCurrency);
  if (fx === null || !(fx > 0)) {
    errors.push('fx_USD_to_TargetCurrency must be finite and > 0');
  }

  const market = body.market;
  if (!isObject(market)) {
    errors.push('market is required and must be an object');
  }

  const shares = isObject(market) ? readFiniteNumber(market.shares_current) : null;
  if (shares === null || !(shares > 0)) {
    errors.push('market.shares_current must be finite and > 0');
  }

  const currentPrice = isObject(market) ? readFiniteNumber(market.price_current_TargetCurrency) : null;
  if (currentPrice === null || !(currentPrice > 0)) {
    errors.push('market.price_current_TargetCurrency must be finite and > 0');
  }

  const preferredEquity = isObject(market)
    ? readNullableFiniteNumber(market.preferredEquity_TargetCurrency)
    : undefined;
  if (
    isObject(market)
    && market.preferredEquity_TargetCurrency !== undefined
    && preferredEquity === null
    && market.preferredEquity_TargetCurrency !== null
  ) {
    errors.push('market.preferredEquity_TargetCurrency must be finite when provided');
  }

  const minorityInterest = isObject(market)
    ? readNullableFiniteNumber(market.minorityInterest_TargetCurrency)
    : undefined;
  if (
    isObject(market)
    && market.minorityInterest_TargetCurrency !== undefined
    && minorityInterest === null
    && market.minorityInterest_TargetCurrency !== null
  ) {
    errors.push('market.minorityInterest_TargetCurrency must be finite when provided');
  }

  const balanceSheetRaw = body.balanceSheet;
  if (balanceSheetRaw !== undefined && !isObject(balanceSheetRaw)) {
    errors.push('balanceSheet must be an object when provided');
  }

  const cash = isObject(balanceSheetRaw)
    ? readNullableFiniteNumber(balanceSheetRaw.cash_t0_TargetCurrency)
    : undefined;
  if (
    isObject(balanceSheetRaw)
    && balanceSheetRaw.cash_t0_TargetCurrency !== undefined
    && cash === null
    && balanceSheetRaw.cash_t0_TargetCurrency !== null
  ) {
    errors.push('balanceSheet.cash_t0_TargetCurrency must be finite when provided');
  }

  const debt = isObject(balanceSheetRaw)
    ? readNullableFiniteNumber(balanceSheetRaw.debt_t0_TargetCurrency)
    : undefined;
  if (
    isObject(balanceSheetRaw)
    && balanceSheetRaw.debt_t0_TargetCurrency !== undefined
    && debt === null
    && balanceSheetRaw.debt_t0_TargetCurrency !== null
  ) {
    errors.push('balanceSheet.debt_t0_TargetCurrency must be finite when provided');
  }

  const financingPlanRaw = body.financingPlan;
  if (financingPlanRaw !== undefined && financingPlanRaw !== null && !isObject(financingPlanRaw)) {
    errors.push('financingPlan must be an object or null when provided');
  }

  const buildFundingNeed = readNullableFiniteNumber(body.buildFundingNeed_USD);
  if (body.buildFundingNeed_USD !== undefined) {
    if (buildFundingNeed === undefined || buildFundingNeed === null) {
      errors.push('buildFundingNeed_USD must be finite and >= 0 when provided');
    } else if (buildFundingNeed < 0) {
      errors.push('buildFundingNeed_USD must be >= 0 when provided');
    }
  }

  const projectsRaw = body.projects;
  if (!Array.isArray(projectsRaw) || projectsRaw.length === 0) {
    errors.push('projects must be a non-empty array');
  }

  const projects: SnapshotRequest['projects'] = [];
  if (Array.isArray(projectsRaw)) {
    for (let i = 0; i < projectsRaw.length; i += 1) {
      const item = projectsRaw[i];
      if (!isObject(item)) {
        errors.push(`projects[${i}] must be an object`);
        continue;
      }

      const projectId = typeof item.projectId === 'string' ? item.projectId.trim() : '';
      if (!projectId) {
        errors.push(`projects[${i}].projectId must be a non-empty string`);
      }

      const rawJson = item.rawJson;
      if (!isObject(rawJson)) {
        errors.push(`projects[${i}].rawJson must be an object`);
        continue;
      }

      if (rawJson.version !== 'project_json_v1') {
        errors.push(`projects[${i}].rawJson.version must be "project_json_v1"`);
      }

      const time = rawJson.time;
      const periodEndDates = isObject(time) ? time.periodEndDatesUtc : undefined;
      if (!Array.isArray(periodEndDates) || periodEndDates.length === 0) {
        errors.push(`projects[${i}].rawJson.time.periodEndDatesUtc is required and must be a non-empty array`);
      }

      projects.push({
        projectId: projectId || `project-${i}`,
        rawJson,
      });
    }
  }

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
        shares_current: shares as number,
        price_current_TargetCurrency: currentPrice as number,
        preferredEquity_TargetCurrency: preferredEquity,
        minorityInterest_TargetCurrency: minorityInterest,
      },
      balanceSheet: isObject(balanceSheetRaw)
        ? {
            cash_t0_TargetCurrency: cash,
            debt_t0_TargetCurrency: debt,
          }
        : undefined,
      financingPlan:
        isObject(financingPlanRaw) || financingPlanRaw === null
          ? (financingPlanRaw as SnapshotRequest['financingPlan'])
          : undefined,
      buildFundingNeed_USD: buildFundingNeed,
      projects,
    },
  };
}
