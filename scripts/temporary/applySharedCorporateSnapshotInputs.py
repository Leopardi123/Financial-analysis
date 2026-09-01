from pathlib import Path
import re

single_path = Path('src/components/SingleStockDashboard.tsx')
single = single_path.read_text()

old_import = 'import type { CorporateSnapshot } from "../lib/corporate/snapshot/types.ts";\n'
new_import = old_import + 'import { resolveCanonicalCorporateSnapshotInputs } from "../lib/corporate/snapshotInputResolver.ts";\n'
if old_import not in single or 'snapshotInputResolver.ts' in single:
    raise SystemExit('SingleStock resolver import anchor missing or already patched')
single = single.replace(old_import, new_import, 1)

old_block = '''  const corporateFinancingPlan = useMemo(() => {
    if (companyProjects.length === 0) return undefined;
    const equityValues = companyProjects.map((project) => corporateProjectEquityPct[project.project_id] ?? 100);
    const avgEquityPct = equityValues.reduce((sum, value) => sum + value, 0) / equityValues.length;
    const equityFraction = Math.min(1, Math.max(0, avgEquityPct / 100));
    const financingPlanByProject = Object.fromEntries(
      companyProjects.map((project) => {
        const equityPct = corporateProjectEquityPct[project.project_id] ?? 100;
        const projectEquityFraction = Math.min(1, Math.max(0, equityPct / 100));
        return [project.project_id, {
          equity_fraction: projectEquityFraction,
          debt_fraction: 1 - projectEquityFraction,
        }];
      }),
    );
    return {
      equity_fraction: equityFraction,
      debt_fraction: 1 - equityFraction,
      use_cash_first: corporateUseQuarterlyCash,
      cash_use_percent: corporateCashUsedPct / 100,
      financingPlanByProject,
    };
  }, [companyProjects, corporateProjectEquityPct, corporateUseQuarterlyCash, corporateCashUsedPct]);

  const corporateSnapshotRequest = useMemo<SnapshotRequest | null>(() => {
    if (!ticker || companyProjects.length === 0) return null;
    const discountRatePct = toInputNumber(riskAdjustedDiscountRatePctInput);
    const discountRate = typeof discountRatePct === "number" && Number.isFinite(discountRatePct) ? discountRatePct / 100 : 0.1;
    const statementShares = resolveCommonSharesCurrent({ balance: data?.balance as Record<string, Array<number | null>> | undefined, income: data?.income as Record<string, Array<number | null>> | undefined });
    const profileShares = typeof profile?.sharesOutstanding === "number" && Number.isFinite(profile.sharesOutstanding) && profile.sharesOutstanding > 0 ? profile.sharesOutstanding : undefined;
    const quarterlyCash = [...getFieldSeries(data, "balance", "cashAndCashEquivalents")].reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
    const quarterlyDebt = [...getFieldSeries(data, "balance", "totalDebt")].reverse().find((value) => typeof value === "number" && Number.isFinite(value)) ?? 0;
    const currentPrice = typeof profile?.price === "number" && Number.isFinite(profile.price) && profile.price > 0 ? profile.price : 1;
    return {
      symbol: ticker, valuationYear: new Date().getUTCFullYear(), targetCurrency: lockedTargetCurrency, discountRate,
      market: { shares_current: statementShares ?? profileShares ?? 1, price_current_TargetCurrency: currentPrice },
      balanceSheet: { cash_t0_TargetCurrency: quarterlyCash, debt_t0_TargetCurrency: quarterlyDebt },
      financingPlan: corporateFinancingPlan, financingPlanByProject: corporateFinancingPlan?.financingPlanByProject,
      scenario: { mode: "spot" }, fx: { source: "auto", anchor: "today", scenario: { mode: "spot" } }, manualMetalPrices,
    } as unknown as SnapshotRequest;
  }, [corporateFinancingPlan, companyProjects.length, data, lockedTargetCurrency, manualMetalPrices, profile?.price, profile?.sharesOutstanding, riskAdjustedDiscountRatePctInput, ticker]);
'''
new_block = '''  const corporateFinancingPlanByProject = useMemo<SnapshotRequest["financingPlanByProject"]>(() => {
    if (companyProjects.length === 0) return undefined;
    return Object.fromEntries(
      companyProjects.map((project) => {
        const equityPct = corporateProjectEquityPct[project.project_id] ?? 100;
        const equityFraction = Math.min(1, Math.max(0, equityPct / 100));
        return [project.project_id, { equity_fraction: equityFraction, debt_fraction: 1 - equityFraction }];
      }),
    );
  }, [companyProjects, corporateProjectEquityPct]);

  const corporateFinancingPlan = useMemo<SnapshotRequest["financingPlan"]>(() => ({
    use_cash_first: corporateUseQuarterlyCash,
    cash_use_percent: corporateCashUsedPct / 100,
  }), [corporateUseQuarterlyCash, corporateCashUsedPct]);

  const corporateSnapshotInputResolution = useMemo(() => {
    if (!ticker || companyProjects.length === 0) return null;
    const discountRatePct = toInputNumber(riskAdjustedDiscountRatePctInput);
    const discountRate = typeof discountRatePct === "number" && Number.isFinite(discountRatePct)
      ? discountRatePct / 100
      : null;
    return resolveCanonicalCorporateSnapshotInputs({
      symbol: ticker,
      profile,
      statements: {
        balance: data?.balance as Record<string, Array<number | null>> | undefined,
        income: data?.income as Record<string, Array<number | null>> | undefined,
      },
      projectIds: companyProjects.map((project) => project.project_id),
      financingPlan: corporateFinancingPlan,
      financingPlanByProject: corporateFinancingPlanByProject,
      manualExtraShares: parseExtraShares(corporateExtraSharesInput),
      manualMetalPrices,
      discountRate,
      valuationYear: new Date().getUTCFullYear(),
      scenario: { mode: "spot" },
    });
  }, [companyProjects, corporateExtraSharesInput, corporateFinancingPlan, corporateFinancingPlanByProject, data?.balance, data?.income, manualMetalPrices, profile, riskAdjustedDiscountRatePctInput, ticker]);

  const corporateSnapshotRequest = corporateSnapshotInputResolution?.request ?? null;
'''
if old_block not in single:
    raise SystemExit('SingleStock Corporate request block anchor missing')
single = single.replace(old_block, new_block, 1)

old_effect = '''      setCorporateSnapshotLoading(true);
      setCorporateSnapshotError(null);
      try {
        const response = await fetch(withDebugQueryPath("/api/snapshot/corporate", debugEnabled), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(corporateSnapshotRequest),
        });
        const result = await response.json() as {
          ok?: boolean;
          snapshot?: Record<string, unknown>;
          diagnostics?: { errors?: string[] } & Record<string, unknown>;
        };
        if (!isMounted) return;
        setCorporateDiagnostics((result.diagnostics ?? null) as Record<string, unknown> | null);
        if (!result.ok || !result.snapshot) {
          setCorporateSnapshotData(null);
          const diagnosticsErrors = Array.isArray(result.diagnostics?.errors)
            ? result.diagnostics.errors.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
          const errorDetails = diagnosticsErrors.length > 0
            ? `\\n${diagnosticsErrors.join("\\n")}`
            : "";
          setCorporateSnapshotError(`Snapshot request failed.${errorDetails}`);
          return;
        }
        setCorporateSnapshotData(result.snapshot as unknown as Record<string, unknown>);
      } catch (error) {
'''
new_effect = '''      if (!corporateSnapshotRequest) {
        const inputErrors = corporateSnapshotInputResolution?.diagnostics ?? ["Canonical Corporate snapshot inputs are unavailable."];
        setCorporateSnapshotData(null);
        setCorporateDiagnostics({
          errors: inputErrors,
          canonicalInputSourceAudit: corporateSnapshotInputResolution?.sourceAudit ?? null,
        });
        setCorporateSnapshotError(`Canonical Corporate snapshot inputs unavailable.${inputErrors.length > 0 ? `\\n${inputErrors.join("\\n")}` : ""}`);
        return;
      }
      setCorporateSnapshotLoading(true);
      setCorporateSnapshotError(null);
      try {
        const result = await postCorporateSnapshot(corporateSnapshotRequest, {
          refresh: corporateSnapshotInputResolution?.targetCurrency !== "USD",
        });
        if (!isMounted) return;
        setCorporateDiagnostics({
          ...(result.diagnostics ?? {}),
          canonicalInputDiagnostics: corporateSnapshotInputResolution?.diagnostics ?? [],
          canonicalInputSourceAudit: corporateSnapshotInputResolution?.sourceAudit ?? null,
        });
        if (!result.ok || !result.snapshot) {
          setCorporateSnapshotData(null);
          const diagnosticsErrors = Array.isArray(result.diagnostics?.errors)
            ? result.diagnostics.errors.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
          const errorDetails = diagnosticsErrors.length > 0
            ? `\\n${diagnosticsErrors.join("\\n")}`
            : "";
          setCorporateSnapshotError(`Snapshot request failed.${errorDetails}`);
          return;
        }
        setCorporateSnapshotData(result.snapshot as unknown as Record<string, unknown>);
      } catch (error) {
'''
if old_effect not in single:
    raise SystemExit('SingleStock Corporate effect anchor missing')
single = single.replace(old_effect, new_effect, 1)

old_deps = '  }, [companyProjects.length, corporateSnapshotRequest, debugEnabled, primaryView, ticker]);\n'
new_deps = '  }, [companyProjects.length, corporateSnapshotInputResolution, corporateSnapshotRequest, primaryView, ticker]);\n'
if old_deps not in single:
    raise SystemExit('SingleStock Corporate effect dependency anchor missing')
single = single.replace(old_deps, new_deps, 1)

# withDebugQueryPath became dead after routing Corporate through the shared snapshot client.
old_debug_helper = '''function withDebugQueryPath(path: string, debugEnabled: boolean): string {
  if (!debugEnabled || typeof window === "undefined") return path;
  const asUrl = new URL(path, window.location.origin);
  asUrl.searchParams.set("debug", "1");
  return `${asUrl.pathname}${asUrl.search}`;
}

'''
if old_debug_helper in single:
    single = single.replace(old_debug_helper, '', 1)

single_path.write_text(single)

compare_path = Path('src/components/CompareStocksDashboard.tsx')
compare = compare_path.read_text()

old_import = "import { loadLiveCorporateFinancingState } from '../lib/client/corporateFinancingStateStore.ts';\n"
new_import = old_import + "import { postCorporateSnapshot } from '../lib/client/snapshotClient.ts';\nimport { getManualMetalPriceStore } from '../lib/engine/pricing/manualMetalPriceStore.ts';\nimport { resolveCanonicalCorporateSnapshotInputs } from '../lib/corporate/snapshotInputResolver.ts';\n"
if old_import not in compare or 'snapshotInputResolver.ts' in compare:
    raise SystemExit('Compare resolver import anchor missing or already patched')
compare = compare.replace(old_import, new_import, 1)

compare = compare.replace("type SnapshotResponse = { ok: boolean; snapshot?: CorporateSnapshot; diagnostics?: { errors?: string[]; warnings?: string[] } };\n", '', 1)
compare = compare.replace("const clamp01 = (value: unknown, fallback: number): number => finite(value) ? Math.max(0, Math.min(1, value)) : fallback;\n", '', 1)
old_last_finite = '''const lastFinite = (values: Array<number | null> | undefined): number | null => {
  if (!Array.isArray(values)) return null;
  for (let i = values.length - 1; i >= 0; i -= 1) if (finite(values[i])) return values[i] as number;
  return null;
};
'''
if old_last_finite not in compare:
    raise SystemExit('Compare lastFinite anchor missing')
compare = compare.replace(old_last_finite, '', 1)

old_local_resolvers = '''function resolveShares(statements: CompanyResponse): number | null {
  const candidates = [statements.balance?.commonStockSharesOutstanding, statements.balance?.commonStockSharesIssued, statements.income?.weightedAverageShsOutDil, statements.income?.weightedAverageShsOut];
  for (const series of candidates) { const value = lastFinite(series); if (value !== null && value > 0) return value; }
  return null;
}
function resolveLatestCash(statements: CompanyResponse): number | null { return lastFinite(statements.balance?.cashAndCashEquivalents) ?? lastFinite(statements.balance?.cashAndShortTermInvestments); }
function resolveLatestDebt(statements: CompanyResponse): number | null {
  const direct = lastFinite(statements.balance?.totalDebt); if (direct !== null) return direct;
  const shortTerm = lastFinite(statements.balance?.shortTermDebt); const longTerm = lastFinite(statements.balance?.longTermDebt);
  return shortTerm === null && longTerm === null ? null : (shortTerm ?? 0) + (longTerm ?? 0);
}
'''
if old_local_resolvers not in compare:
    raise SystemExit('Compare local market resolver block missing')
compare = compare.replace(old_local_resolvers, '', 1)

pattern = r"async function loadCanonicalCompany\(company: \{ ticker: string; name: string \}\): Promise<PreRevenueCompany \| null> \{.*?\n\}\n\nfunction PreRevenueCompareDashboard\(\) \{"
replacement = '''async function loadCanonicalCompany(company: { ticker: string; name: string }): Promise<PreRevenueCompany | null> {
  const projects = await listCompanyProjects(company.ticker);
  if (projects.length === 0) return null;
  const localExtraShares = readManualExtraShares(company.ticker);
  try {
    const [profileRes, statementsRes, persistedFinancing, projectRecords] = await Promise.all([
      fetch(`/api/company/profile?ticker=${encodeURIComponent(company.ticker)}`),
      fetch(`/api/company?ticker=${encodeURIComponent(company.ticker)}&period=fy`),
      loadLiveCorporateFinancingState(company.ticker),
      Promise.all(projects.map((project) => getCompanyProject(company.ticker, project.project_id))),
    ]);
    const profileBody = await profileRes.json() as ProfileResponse;
    const statements = await statementsRes.json() as CompanyResponse;
    const profile = profileBody.profile ?? null;
    const metals = extractMetals(projectRecords.map((record) => record.raw_json));
    const resolution = resolveCanonicalCorporateSnapshotInputs({
      symbol: company.ticker,
      profile,
      statements,
      projectIds: projects.map((project) => project.project_id),
      financingPlan: persistedFinancing?.financingPlan,
      financingPlanByProject: persistedFinancing?.financingPlanByProject,
      manualExtraShares: persistedFinancing?.extraShares ?? localExtraShares,
      manualMetalPrices: getManualMetalPriceStore(),
      valuationYear: new Date().getUTCFullYear(),
      discountRate: 0.1,
      scenario: { mode: 'spot' },
    });
    const price = resolution.currentPriceTargetCurrency;
    const sharesCurrent = resolution.sharesCurrent;
    const targetCurrency = resolution.targetCurrency;
    const manualExtraShares = resolution.manualExtraShares;
    if (!resolution.request) {
      return {
        ...company,
        projects,
        metals,
        snapshot: null,
        metrics: null,
        price,
        sharesCurrent,
        targetCurrency,
        manualExtraShares,
        metricError: resolution.diagnostics.join(' · ') || 'Kanoniska Corporate-inputs saknas.',
      };
    }

    const body = await postCorporateSnapshot(resolution.request, { refresh: targetCurrency !== 'USD' });
    const snapshot = body.ok && body.snapshot ? body.snapshot : null;
    const metrics = snapshot
      ? deriveCorporatePreRevenueMetrics({
          snapshot,
          currentPriceTargetCurrency: price,
          valuationYear: resolution.valuationYear,
          manualExtraShares,
          referenceMetals: metals,
        })
      : null;
    return {
      ...company,
      projects,
      metals,
      snapshot,
      metrics,
      price,
      sharesCurrent,
      targetCurrency,
      manualExtraShares,
      metricError: snapshot ? null : (body.diagnostics?.errors?.join(' · ') || 'Corporate snapshot kunde inte beräknas.'),
    };
  } catch (error) {
    return {
      ...company,
      projects,
      metals: [],
      snapshot: null,
      metrics: null,
      price: null,
      sharesCurrent: null,
      targetCurrency: null,
      manualExtraShares: localExtraShares,
      metricError: (error as Error).message,
    };
  }
}

function PreRevenueCompareDashboard() {'''
compare, count = re.subn(pattern, replacement, compare, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'Compare loadCanonicalCompany replacement count={count}')
compare_path.write_text(compare)

package_path = Path('package.json')
package = package_path.read_text()
old_script = '"test:pre-revenue-corporate": "node --experimental-strip-types src/lib/corporate/__tests__/preRevenueProductionLife.test.ts'
new_script = '"test:pre-revenue-corporate": "node --experimental-strip-types src/lib/corporate/__tests__/snapshotInputResolver.test.ts && node --experimental-strip-types src/lib/corporate/__tests__/preRevenueProductionLife.test.ts'
if old_script not in package:
    raise SystemExit('package pre-revenue test anchor missing')
package = package.replace(old_script, new_script, 1)
package_path.write_text(package)
