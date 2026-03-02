type SnapshotScenarioControls = {
  delayPeriods?: number;
  capexMult?: number;
  opexMult?: number;
};

export type SnapshotScenario =
  | ({ mode: 'spot' } & SnapshotScenarioControls)
  | ({ mode: 'percentile'; lookbackYears: number; percentile: number; window: 'trailing'; sampling: 'eod_close'; anchor: 'period_end' } & SnapshotScenarioControls)
  | ({ mode: 'fixed'; fixedPriceByKey: Record<string, number> } & SnapshotScenarioControls);

export type SnapshotFxConfig = {
  source: 'auto' | 'manual';
  anchor: 'today' | 't0_period_end';
  scenario: SnapshotScenario;
  manual_fx_USD_to_TargetCurrency?: number;
};

export type SnapshotRequest = {
  targetCurrency: string;
  discountRate: number;
  // legacy/manual fallback; callers may still send top-level FX directly
  fx_USD_to_TargetCurrency?: number;
  market?: {
    shares_current: number | null;
    price_current_TargetCurrency: number | null;
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
  projectFinancingOverrides?: Record<string, {
    equity_fraction?: number | null;
    debt_fraction?: number | null;
  }>;
  buildFundingNeed_USD?: number | null;
  fx: SnapshotFxConfig;
  scenario: SnapshotScenario;
  projects: Array<{
    projectId: string;
    rawJson: Record<string, unknown>;
  }>;
  symbol?: string;
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

function applyScenarioControls(base: SnapshotScenario, scenarioRaw: Record<string, unknown>, errors: string[]): SnapshotScenario {
  const withControls: SnapshotScenario = { ...base };

  if (scenarioRaw.delayPeriods !== undefined) {
    const delayPeriods = readFiniteNumber(scenarioRaw.delayPeriods);
    if (delayPeriods === null || !Number.isInteger(delayPeriods) || delayPeriods < 0) {
      errors.push('scenario.delayPeriods must be an integer >= 0 when provided');
    } else {
      withControls.delayPeriods = delayPeriods;
    }
  }

  if (scenarioRaw.capexMult !== undefined) {
    const capexMult = readFiniteNumber(scenarioRaw.capexMult);
    if (capexMult === null || capexMult < 0) {
      errors.push('scenario.capexMult must be finite and >= 0 when provided');
    } else {
      withControls.capexMult = capexMult;
    }
  }

  if (scenarioRaw.opexMult !== undefined) {
    const opexMult = readFiniteNumber(scenarioRaw.opexMult);
    if (opexMult === null || opexMult < 0) {
      errors.push('scenario.opexMult must be finite and >= 0 when provided');
    } else {
      withControls.opexMult = opexMult;
    }
  }

  return withControls;
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

  const legacyFx = readFiniteNumber(body.fx_USD_to_TargetCurrency);
  if (body.fx_USD_to_TargetCurrency !== undefined && (legacyFx === null || !(legacyFx > 0))) {
    errors.push('fx_USD_to_TargetCurrency must be finite and > 0 when provided');
  }

  const symbolRaw = body.symbol;
  const symbol = typeof symbolRaw === 'string' ? symbolRaw.trim() : '';
  const hasSymbol = symbolRaw !== undefined;
  if (hasSymbol && !symbol) {
    errors.push('symbol must be a non-empty string when provided');
  }

  const projectsRaw = body.projects;
  const hasProjects = projectsRaw !== undefined;

  if (hasSymbol === hasProjects) {
    errors.push('Exactly one of symbol or projects must be provided');
  }

  if (hasSymbol && hasProjects) {
    errors.push('projects must be omitted when symbol is provided');
  }

  if (hasProjects && (!Array.isArray(projectsRaw) || projectsRaw.length === 0)) {
    errors.push('projects must be a non-empty array when provided');
  }

  const market = body.market;
  const isProjectsMode = hasProjects && !hasSymbol;
  if (!isProjectsMode && !isObject(market)) {
    errors.push('market is required and must be an object');
  }

  const shares = isObject(market) ? readFiniteNumber(market.shares_current) : null;
  if (!isProjectsMode && (shares === null || !(shares > 0))) {
    errors.push('market.shares_current must be finite and > 0');
  }

  const currentPrice = isObject(market) ? readFiniteNumber(market.price_current_TargetCurrency) : null;
  if (!isProjectsMode && (currentPrice === null || !(currentPrice > 0))) {
    errors.push('market.price_current_TargetCurrency must be finite and > 0');
  }

  if (isProjectsMode) {
    if (!isObject(market)) {
      warnings.push('market missing; EV/multiples will be null.');
    } else {
      if (shares === null || !(shares > 0)) {
        warnings.push('market.shares_current missing (resolved from statements); EV/multiples will be null.');
      }
      if (currentPrice === null || !(currentPrice > 0)) {
        warnings.push('market.price_current_TargetCurrency missing or invalid; EV/multiples will be null.');
      }
    }
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

  const projectFinancingOverridesRaw = body.projectFinancingOverrides;
  if (projectFinancingOverridesRaw !== undefined && projectFinancingOverridesRaw !== null && !isObject(projectFinancingOverridesRaw)) {
    errors.push('projectFinancingOverrides must be an object when provided');
  }

  const buildFundingNeed = readNullableFiniteNumber(body.buildFundingNeed_USD);
  if (body.buildFundingNeed_USD !== undefined) {
    if (buildFundingNeed === undefined || buildFundingNeed === null) {
      errors.push('buildFundingNeed_USD must be finite and >= 0 when provided');
    } else if (buildFundingNeed < 0) {
      errors.push('buildFundingNeed_USD must be >= 0 when provided');
    }
  }


  const scenarioRaw = body.scenario;
  let scenario: SnapshotScenario = { mode: 'spot' };
  if (scenarioRaw !== undefined) {
    if (!isObject(scenarioRaw)) {
      errors.push('scenario must be an object when provided');
    } else {
      const mode = scenarioRaw.mode;
      if (mode === 'spot') {
        scenario = applyScenarioControls({ mode: 'spot' }, scenarioRaw, errors);
      } else if (mode === 'percentile') {
        const lookbackYears = readFiniteNumber(scenarioRaw.lookbackYears) ?? 10;
        const percentile = readFiniteNumber(scenarioRaw.percentile) ?? 50;
        const window = scenarioRaw.window ?? 'trailing';
        const sampling = scenarioRaw.sampling ?? 'eod_close';
        const anchor = scenarioRaw.anchor ?? 'period_end';

        if (!Number.isInteger(lookbackYears) || lookbackYears < 1 || lookbackYears > 30) {
          errors.push('scenario.lookbackYears must be an integer in [1, 30] when mode=percentile');
        }
        if (!Number.isInteger(percentile) || percentile < 1 || percentile > 99) {
          errors.push('scenario.percentile must be an integer in [1, 99] when mode=percentile');
        }
        if (window !== 'trailing') {
          errors.push('scenario.window must be "trailing" when mode=percentile');
        }
        if (sampling !== 'eod_close') {
          errors.push('scenario.sampling must be "eod_close" when mode=percentile');
        }
        if (anchor !== 'period_end') {
          errors.push('scenario.anchor must be "period_end" when mode=percentile');
        }

        scenario = applyScenarioControls({
          mode: 'percentile',
          lookbackYears: Number.isInteger(lookbackYears) ? lookbackYears : 10,
          percentile: Number.isInteger(percentile) ? percentile : 50,
          window: 'trailing',
          sampling: 'eod_close',
          anchor: 'period_end',
        }, scenarioRaw, errors);
      } else if (mode === 'fixed') {
        const fixedPriceByKey = scenarioRaw.fixedPriceByKey;
        if (!isObject(fixedPriceByKey) || Object.keys(fixedPriceByKey).length === 0) {
          errors.push('scenario.fixedPriceByKey must be a non-empty object when mode=fixed');
        }

        const normalizedFixed: Record<string, number> = {};
        if (isObject(fixedPriceByKey)) {
          for (const [key, value] of Object.entries(fixedPriceByKey)) {
            const n = readFiniteNumber(value);
            if (n === null || n <= 0) {
              errors.push(`scenario.fixedPriceByKey.${key} must be finite and > 0`);
            } else {
              normalizedFixed[key] = n;
            }
          }
        }

        scenario = applyScenarioControls({ mode: 'fixed', fixedPriceByKey: normalizedFixed }, scenarioRaw, errors);
      } else {
        errors.push('scenario.mode must be one of: spot, percentile, fixed');
      }
    }
  }


  const fxRaw = body.fx;
  let fxSource: 'auto' | 'manual' = 'auto';
  let fxAnchor: 'today' | 't0_period_end' = 'today';
  let fxScenario: SnapshotScenario = { mode: 'spot' };
  let manualFx: number | undefined;

  if (fxRaw !== undefined) {
    if (!isObject(fxRaw)) {
      errors.push('fx must be an object when provided');
    } else {
      const source = fxRaw.source ?? 'auto';
      if (source !== 'auto' && source !== 'manual') {
        errors.push('fx.source must be one of: auto, manual');
      } else {
        fxSource = source;
      }

      const anchor = fxRaw.anchor ?? 'today';
      if (anchor !== 'today' && anchor !== 't0_period_end') {
        errors.push('fx.anchor must be one of: today, t0_period_end');
      } else {
        fxAnchor = anchor;
      }

      const fxScenarioRaw = fxRaw.scenario;
      if (fxScenarioRaw !== undefined) {
        if (!isObject(fxScenarioRaw)) {
          errors.push('fx.scenario must be an object when provided');
        } else {
          const mode = fxScenarioRaw.mode;
          if (mode === 'spot') {
            fxScenario = { mode: 'spot' };
          } else if (mode === 'percentile') {
            const lookbackYears = readFiniteNumber(fxScenarioRaw.lookbackYears) ?? 10;
            const percentile = readFiniteNumber(fxScenarioRaw.percentile) ?? 50;
            if (!Number.isInteger(lookbackYears) || lookbackYears < 1 || lookbackYears > 30) {
              errors.push('fx.scenario.lookbackYears must be an integer in [1, 30] when mode=percentile');
            }
            if (!Number.isInteger(percentile) || percentile < 1 || percentile > 99) {
              errors.push('fx.scenario.percentile must be an integer in [1, 99] when mode=percentile');
            }
            fxScenario = {
              mode: 'percentile',
              lookbackYears: Number.isInteger(lookbackYears) ? lookbackYears : 10,
              percentile: Number.isInteger(percentile) ? percentile : 50,
              window: 'trailing',
              sampling: 'eod_close',
              anchor: 'period_end',
            };
          } else if (mode === 'fixed') {
            const fixed = readFiniteNumber(fxScenarioRaw.fixedFx);
            if (fixed !== null && fixed > 0) {
              fxScenario = { mode: 'fixed', fixedPriceByKey: {} };
              manualFx = fixed;
            } else {
              fxScenario = { mode: 'fixed', fixedPriceByKey: {} };
            }
          } else {
            errors.push('fx.scenario.mode must be one of: spot, percentile, fixed');
          }
        }
      } else {
        fxScenario = scenario.mode === 'fixed' ? { mode: 'spot' } : scenario;
      }

      const manual = readFiniteNumber(fxRaw.manual_fx_USD_to_TargetCurrency);
      if (fxRaw.manual_fx_USD_to_TargetCurrency !== undefined) {
        if (manual === null || !(manual > 0)) {
          errors.push('fx.manual_fx_USD_to_TargetCurrency must be finite and > 0 when provided');
        } else {
          manualFx = manual;
        }
      }
    }
  } else {
    fxScenario = scenario.mode === 'fixed' ? { mode: 'spot' } : scenario;
  }

  if (legacyFx !== null && legacyFx !== undefined) {
    fxSource = 'manual';
    manualFx = legacyFx;
  } else if (fxSource === 'manual' && !(Number.isFinite(manualFx) && (manualFx as number) > 0)) {
    errors.push('fx.manual_fx_USD_to_TargetCurrency must be finite and > 0 when fx.source=manual');
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

  const valueBase = {
    targetCurrency,
    discountRate: discountRate as number,
    fx_USD_to_TargetCurrency: legacyFx ?? manualFx,
    fx: {
      source: fxSource,
      anchor: fxAnchor,
      scenario: fxScenario,
      manual_fx_USD_to_TargetCurrency: manualFx,
    },
    market: {
      shares_current: shares !== null && shares > 0 ? shares : null,
      price_current_TargetCurrency: currentPrice !== null && currentPrice > 0 ? currentPrice : null,
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
    projectFinancingOverrides:
      isObject(projectFinancingOverridesRaw)
        ? (projectFinancingOverridesRaw as SnapshotRequest['projectFinancingOverrides'])
        : undefined,
    buildFundingNeed_USD: buildFundingNeed,
    scenario,
  };

  return {
    ok: true,
    warnings,
    value: hasSymbol
      ? {
          ...valueBase,
          symbol,
          projects: [],
        }
      : {
          ...valueBase,
          projects,
        },
  };
}
