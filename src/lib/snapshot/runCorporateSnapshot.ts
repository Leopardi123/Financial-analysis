import { validateSnapshotRequest } from '../api/validateSnapshotRequest.ts';
import { loadProjectsForSymbol } from '../api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../project/jsonv1/parse.ts';
import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../project/jsonv1/resolvePrices.ts';
import { aggregateProjectsCorporateV1 } from '../corporate/aggregateProjects.ts';
import { computeCorporateFinancing } from '../corporate/financing/compute.ts';
import { deriveBuildFundingNeedUSD } from '../corporate/financing/deriveBuildFundingNeed.ts';
import { buildCorporateSnapshot } from '../corporate/snapshot/buildCorporateSnapshot.ts';
import { resolveFxUSDToTarget } from '../prices/fx/resolveFx.ts';
import { getTodayUtcDateString } from '../prices/fx/date.ts';
import { fxKeyUSDTo } from '../prices/fx/keys.ts';
import { computeLista2CfDcfMetrics } from './lista2CfDcf.ts';

const CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS = 10;

type SnapshotDiagnostics = {
  warnings: string[];
  errors: string[];
  meta: {
    refresh: boolean;
    mode: 'inline' | 'symbol';
    projectCount: number;
    symbol?: string;
    fxSource?: 'auto' | 'manual';
  };
};

export type CorporateSnapshotRunResult =
  | { ok: true; snapshot: ReturnType<typeof buildCorporateSnapshot>; diagnostics: SnapshotDiagnostics }
  | { ok: false; diagnostics: SnapshotDiagnostics };

export async function runCorporateSnapshotPipeline(args: {
  body: unknown;
  refresh?: boolean;
}): Promise<CorporateSnapshotRunResult> {
  const refresh = args.refresh === true;
  const diagnostics: SnapshotDiagnostics = {
    warnings: [],
    errors: [],
    meta: {
      refresh,
      mode: 'inline',
      projectCount: 0,
    },
  };

  try {
    const validation = validateSnapshotRequest(args.body);
    diagnostics.warnings.push(...validation.warnings);

    if (!validation.ok) {
      diagnostics.errors.push(...validation.errors);
      return { ok: false, diagnostics };
    }

    const input = validation.value;

    const projects = typeof input.symbol === 'string'
      ? await loadProjectsForSymbol(input.symbol)
      : input.projects;

    if (typeof input.symbol === 'string') {
      diagnostics.meta.mode = 'symbol';
      diagnostics.meta.symbol = input.symbol;
      if (projects.length === 0) {
        diagnostics.errors.push(`No stored projects found for symbol=${input.symbol}`);
        return { ok: false, diagnostics };
      }
    }

    const resolverScenario = input.scenario.mode === 'percentile'
      ? { mode: 'percentile' as const, lookbackYears: input.scenario.lookbackYears, percentile: input.scenario.percentile }
      : input.scenario.mode === 'fixed'
        ? { mode: 'fixed' as const, fixedPriceByKey: input.scenario.fixedPriceByKey }
        : { mode: 'spot' as const };
    diagnostics.meta.projectCount = projects.length;
    diagnostics.meta.fxSource = input.fx.source;

    const requestedPriceKeys = new Set<string>();
    for (const project of projects) {
      const rawJson = project.rawJson as Record<string, unknown>;
      const metals = rawJson.metals;
      if (typeof metals === 'object' && metals !== null) {
        const priceKeyByMetal = (metals as Record<string, unknown>).priceKeyByMetal;
        if (typeof priceKeyByMetal === 'object' && priceKeyByMetal !== null) {
          for (const value of Object.values(priceKeyByMetal)) {
            if (typeof value === 'string') {
              requestedPriceKeys.add(value);
            }
          }
        }

        const auPriceKey = (metals as Record<string, unknown>).auPriceKey;
        if (typeof auPriceKey === 'string') {
          requestedPriceKeys.add(auPriceKey);
        }
      }
    }

    if (refresh && requestedPriceKeys.size > CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS) {
      diagnostics.errors.push(
        `refresh=1 exceeds max unique price keys (${CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS}); received ${requestedPriceKeys.size}`,
      );
      return { ok: false, diagnostics };
    }

    const projectsForBuildFunding = [] as Array<{
      projectId: string;
      productionStartPeriod: number;
      periodEndDatesUtc: string[];
    }>;

    const aggregation = await aggregateProjectsCorporateV1(
      {
        discountRate: input.discountRate,
        projects,
      },
      {
        projectToSeries: async ({ projectId, rawJson }) => {
          const parsed = parseProjectJsonV1(rawJson);
          const periodEndDatesUtc = parsed.engineInputWithoutPrices.periodEndDatesUtc;
          const productionStartPeriod = parsed.engineInputWithoutPrices.productionStartPeriod;
          if (!periodEndDatesUtc || periodEndDatesUtc.length === 0) {
            throw new Error(`Project ${projectId} is missing time.periodEndDatesUtc; required for corporate aggregation v1.`);
          }
          if (!Number.isInteger(productionStartPeriod)) {
            throw new Error(`Project ${projectId} is missing integer productionStartPeriod`);
          }

          projectsForBuildFunding.push({
            projectId,
            productionStartPeriod,
            periodEndDatesUtc,
          });

          const from = periodEndDatesUtc[0];
          const to = periodEndDatesUtc[periodEndDatesUtc.length - 1];

          const resolved = await resolveProjectPricesToEngineInput(
            { parsed, from, to, scenario: resolverScenario },
            {},
          );

          diagnostics.warnings.push(...(resolved.diagnostics?.warnings ?? []));

          for (const [metal, series] of Object.entries(resolved.spotPriceUSDByMetal)) {
            const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
            series.forEach((value, index) => {
              if (value === null) {
                diagnostics.warnings.push(
                  `Missing price coverage for project=${projectId} metal=${metal} priceKey=${priceKey} targetDate=${periodEndDatesUtc[index]}`,
                );
              }
            });
          }

          resolved.aisc.auPriceUSDPerOz.forEach((value, index) => {
            if (value === null) {
              diagnostics.warnings.push(
                `Missing price coverage for project=${projectId} metal=Au priceKey=${parsed.engineInputWithoutPrices.auPriceKey} targetDate=${periodEndDatesUtc[index]}`,
              );
            }
          });

          const out = computeProjectEngineFullProductionV1(resolved);

          return {
            periodEndDatesUtc,
            capexUSD: out.capexUSD_used,
            fcffUSD: out.phase1.fcffUSD,
            sustainingCostUSD: out.phase1.sustainingCostUSD,
            payableAuEqOz: out.aisc.payableAuEqOz,
          };
        },
      },
    );

    diagnostics.warnings.push(...aggregation.diagnostics.notes);

    const firstProjectPeriodEnd = typeof projects[0]?.rawJson?.time === 'object' && projects[0]?.rawJson?.time !== null
      ? (projects[0].rawJson.time as Record<string, unknown>).periodEndDatesUtc
      : undefined;
    const t0AnchorDate = Array.isArray(firstProjectPeriodEnd) && typeof firstProjectPeriodEnd[0] === 'string'
      ? firstProjectPeriodEnd[0]
      : null;
    const anchorDateUtc = input.fx.anchor === 't0_period_end'
      ? (t0AnchorDate ?? getTodayUtcDateString())
      : getTodayUtcDateString();

    let buildFundingNeedUSD = input.buildFundingNeed_USD;
    if (buildFundingNeedUSD === undefined) {
      diagnostics.warnings.push(
        'buildFundingNeed_USD derived from capex schedule using first production date window',
      );
      buildFundingNeedUSD = deriveBuildFundingNeedUSD({
        corporatePeriodEndDatesUtc: aggregation.corporatePeriodEndDatesUtc,
        capexUSD_total: aggregation.capexUSD_total,
        projects: projectsForBuildFunding,
      });

      if (buildFundingNeedUSD === null) {
        diagnostics.warnings.push(
          'buildFundingNeed_USD derivation returned null because capexUSD_total contains null in the build window',
        );
      }
    }

    let fxRate = input.fx_USD_to_TargetCurrency ?? null;
    if (input.fx.source === 'manual') {
      fxRate = input.fx.manual_fx_USD_to_TargetCurrency ?? input.fx_USD_to_TargetCurrency ?? null;
    } else {
      const fxScenario = input.fx.scenario.mode === 'percentile'
        ? { mode: 'percentile' as const, lookbackYears: input.fx.scenario.lookbackYears, percentile: input.fx.scenario.percentile }
        : input.fx.scenario.mode === 'fixed'
          ? {
              mode: 'fixed' as const,
              fixedFx: input.fx.scenario.fixedPriceByKey[fxKeyUSDTo(input.targetCurrency)],
            }
          : { mode: 'spot' as const };
      const resolvedFx = await resolveFxUSDToTarget({
        targetCurrency: input.targetCurrency,
        anchorDateUtc,
        scenario: fxScenario,
        allowRefresh: refresh,
      });
      diagnostics.warnings.push(...resolvedFx.warnings);
      fxRate = resolvedFx.fx;

      if (fxRate === null && input.fx_USD_to_TargetCurrency !== undefined) {
        fxRate = input.fx_USD_to_TargetCurrency;
        diagnostics.warnings.push('FX auto-resolve failed; using legacy fx_USD_to_TargetCurrency fallback');
      }
      if (fxRate === null) {
        diagnostics.errors.push('FX missing and auto-resolve failed.');
        return { ok: false, diagnostics };
      }
    }

    const financing = computeCorporateFinancing({
      NPV_today_USD: aggregation.NPV_today_USD,
      targetCurrency: input.targetCurrency,
      fx_USD_to_TargetCurrency: fxRate as number,
      cash_t0_TargetCurrency: input.balanceSheet?.cash_t0_TargetCurrency ?? null,
      debt_t0_TargetCurrency: input.balanceSheet?.debt_t0_TargetCurrency ?? null,
      shares_current: input.market.shares_current,
      price_current_TargetCurrency: input.market.price_current_TargetCurrency,
      financingPlan: input.financingPlan,
      buildFundingNeed_USD: buildFundingNeedUSD,
    });

    const productionStartIndices = projectsForBuildFunding
      .map((project) => {
        const productionDate = project.periodEndDatesUtc[project.productionStartPeriod];
        const corporateIndex = aggregation.corporatePeriodEndDatesUtc.indexOf(productionDate);
        return corporateIndex >= 0 ? corporateIndex : null;
      })
      .filter((value): value is number => value !== null);

    const corporateProductionStartPeriod =
      productionStartIndices.length > 0 ? Math.min(...productionStartIndices) : null;

    if (projectsForBuildFunding.length > 0 && corporateProductionStartPeriod === null) {
      diagnostics.warnings.push(
        'Lista2 CF+DCF productionStartPeriod unavailable after corporate date-grid alignment; outputs set to null',
      );
    }

    const lista2 = computeLista2CfDcfMetrics({
      fcfUSD_total: aggregation.fcffUSD_total,
      masterN: aggregation.corporateMasterN,
      productionStartPeriod: corporateProductionStartPeriod,
      discountRate: input.discountRate,
      shares_post_financing: financing.shares_post_financing,
      fx_USD_to_TargetCurrency: fxRate,
      npvToday_USD: aggregation.NPV_today_USD,
    });
    diagnostics.warnings.push(...lista2.warnings);
    diagnostics.errors.push(...lista2.errors);

    const snapshot = buildCorporateSnapshot({
      targetCurrency: input.targetCurrency,
      aggregation,
      financing,
      market: {
        shares_current: input.market.shares_current,
        price_current_TargetCurrency: input.market.price_current_TargetCurrency,
        preferredEquity_TargetCurrency: input.market.preferredEquity_TargetCurrency,
        minorityInterest_TargetCurrency: input.market.minorityInterest_TargetCurrency,
      },
      lista2CfDcf: lista2.metrics,
    });

    return { ok: true, snapshot, diagnostics };
  } catch (error) {
    diagnostics.errors.push((error as Error).message);
    return { ok: false, diagnostics };
  }
}
