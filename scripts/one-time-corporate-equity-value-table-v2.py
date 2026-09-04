from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


path = 'src/lib/snapshot/runCorporateSnapshot.ts'
replace_once(
    path,
    "import { computeCorporateCashWaterfall } from '../corporate/financing/cashWaterfall.ts';\nimport { deriveBuildFundingNeedUSD }",
    "import { computeCorporateCashWaterfall } from '../corporate/financing/cashWaterfall.ts';\nimport { buildCorporateEquityValue } from '../corporate/valuation/corporateEquityValue.ts';\nimport { deriveBuildFundingNeedUSD }",
)

old_waterfall = r'''    // The waterfall is the sole cash allocator. computeCorporateFinancing receives
    // only its residual external need and cash-first is disabled there.
    const cashWaterfall = fxRate === null ? null : computeCorporateCashWaterfall({
      yearsByPeriod: aggregationEffective.corporateYearsByPeriod,
      latestQuarterlyCash: (input.balanceSheet?.cash_t0_TargetCurrency ?? 0) / fxRate,
      useLatestQuarterlyCash: input.financingPlan?.use_cash_first ?? true,
      cashUsedPercent: input.financingPlan?.cash_use_percent ?? 1,
      minimumCashReserve: (input.financingPlan?.minimum_cash_reserve_TargetCurrency ?? 0) / fxRate,
      debtPercent: input.financingPlan?.debt_fraction ?? 0,
      fxUSDToTargetCurrency: fxRate,
      equityRaisePriceTargetCurrency: input.financingPlan?.equity_raise_price_TargetCurrency ?? marketInput.price_current_TargetCurrency,
      sharesCurrent: marketInput.shares_current,
      fdExtraShares: totalFdExtraShares,
      projects: projectsForBuildFunding.map((project) => {
        const context = projectSeriesContexts.find((entry) => entry.projectId === project.projectId);
        const productionYear = project.yearsByPeriod[project.productionStartPeriod];
        const constructionStartPeriod = aggregationEffective.corporateYearsByPeriod.findIndex((year) => {
          const local = project.yearsByPeriod.indexOf(year);
          return local >= 0 && local < project.productionStartPeriod && (context?.economics.capexUSD[local] ?? 0) > 0;
        });
        return {
          projectId: project.projectId,
          constructionStartPeriod: constructionStartPeriod < 0 ? aggregationEffective.corporateYearsByPeriod.indexOf(productionYear) : constructionStartPeriod,
          fcffIncludesConstructionCapex: true,
          debtPercent: input.financingPlanByProject?.[project.projectId]?.debt_fraction ?? input.financingPlan?.debt_fraction ?? 0,
          equityRaisePriceTargetCurrency: input.financingPlanByProject?.[project.projectId]?.equity_raise_price_TargetCurrency
            ?? input.financingPlan?.equity_raise_price_TargetCurrency
            ?? marketInput.price_current_TargetCurrency,
          capexNeedByPeriod: aggregationEffective.corporateYearsByPeriod.map((year) => {
            const local = project.yearsByPeriod.indexOf(year);
            // Initial/build CAPEX can remain in the production-start (ramp) period.
            // Include that period in the construction leg so FCFF is grossed up once
            // and the amount is not mislabeled as an operating cash deficit.
            if (local < 0 || local > project.productionStartPeriod) return 0;
            const capex = context?.economics.capexUSD[local];
            return capex == null ? null : Math.max(0, capex);
          }),
          fcffByPeriod: aggregationEffective.corporateYearsByPeriod.map((year) => {
            const local = project.yearsByPeriod.indexOf(year);
            return local < 0 ? 0 : context?.economics.fcffUSD[local] ?? null;
          }),
        };
      }),
    });
'''
new_waterfall = r'''    // Preserve the canonical financing waterfall. The new Corporate equity-value
    // rows use a separate valuation-year-rebased waterfall so today's reported cash
    // cannot be consumed by historical model years (for example an already-producing
    // project's prior report year).
    const buildCashWaterfallForYears = (waterfallYears: number[]) => fxRate === null ? null : computeCorporateCashWaterfall({
      yearsByPeriod: waterfallYears,
      latestQuarterlyCash: (input.balanceSheet?.cash_t0_TargetCurrency ?? 0) / fxRate,
      useLatestQuarterlyCash: input.financingPlan?.use_cash_first ?? true,
      cashUsedPercent: input.financingPlan?.cash_use_percent ?? 1,
      minimumCashReserve: (input.financingPlan?.minimum_cash_reserve_TargetCurrency ?? 0) / fxRate,
      debtPercent: input.financingPlan?.debt_fraction ?? 0,
      fxUSDToTargetCurrency: fxRate,
      equityRaisePriceTargetCurrency: input.financingPlan?.equity_raise_price_TargetCurrency ?? marketInput.price_current_TargetCurrency,
      sharesCurrent: marketInput.shares_current,
      fdExtraShares: totalFdExtraShares,
      projects: projectsForBuildFunding.map((project) => {
        const context = projectSeriesContexts.find((entry) => entry.projectId === project.projectId);
        const productionYear = project.yearsByPeriod[project.productionStartPeriod];
        const constructionStartPeriod = waterfallYears.findIndex((year) => {
          const local = project.yearsByPeriod.indexOf(year);
          return local >= 0 && local < project.productionStartPeriod && (context?.economics.capexUSD[local] ?? 0) > 0;
        });
        const productionStartPeriodInWaterfall = waterfallYears.indexOf(productionYear);
        return {
          projectId: project.projectId,
          constructionStartPeriod: constructionStartPeriod >= 0
            ? constructionStartPeriod
            : productionStartPeriodInWaterfall >= 0 ? productionStartPeriodInWaterfall : 0,
          fcffIncludesConstructionCapex: true,
          debtPercent: input.financingPlanByProject?.[project.projectId]?.debt_fraction ?? input.financingPlan?.debt_fraction ?? 0,
          equityRaisePriceTargetCurrency: input.financingPlanByProject?.[project.projectId]?.equity_raise_price_TargetCurrency
            ?? input.financingPlan?.equity_raise_price_TargetCurrency
            ?? marketInput.price_current_TargetCurrency,
          capexNeedByPeriod: waterfallYears.map((year) => {
            const local = project.yearsByPeriod.indexOf(year);
            if (local < 0 || local > project.productionStartPeriod) return 0;
            const capex = context?.economics.capexUSD[local];
            return capex == null ? null : Math.max(0, capex);
          }),
          fcffByPeriod: waterfallYears.map((year) => {
            const local = project.yearsByPeriod.indexOf(year);
            return local < 0 ? 0 : context?.economics.fcffUSD[local] ?? null;
          }),
        };
      }),
    });
    const cashWaterfall = buildCashWaterfallForYears(aggregationEffective.corporateYearsByPeriod);
    const equityValueWaterfall = buildCashWaterfallForYears(valuationYears);
'''
replace_once(path, old_waterfall, new_waterfall)

replace_once(
    path,
    "    snapshot.canonicalValuationTimeline = corporateCanonicalTimeline;\n    snapshot.projectStartMilestones = projectStartMilestones;\n    // For an already-producing portfolio",
    "    snapshot.canonicalValuationTimeline = corporateCanonicalTimeline;\n    snapshot.projectStartMilestones = projectStartMilestones;\n    (snapshot as Record<string, unknown>).corporateEquityValue = buildCorporateEquityValue({\n      valuationYear: input.valuationYear,\n      reportedCashTarget: input.balanceSheet?.cash_t0_TargetCurrency ?? 0,\n      reportedDebtTarget: input.balanceSheet?.debt_t0_TargetCurrency ?? null,\n      fxUSDToTarget: fxRate,\n      waterfall: equityValueWaterfall,\n      dcfByYear: corporateCanonicalTimeline.periods.map((row) => ({\n        year: row.calendarYear,\n        dcfTargetCurrency: row.dcfAtPeriodTarget,\n      })),\n      productionStarts: projectStartMilestones.map((marker) => ({\n        projectId: marker.projectId,\n        year: marker.calendarYear,\n      })),\n    });\n    // For an already-producing portfolio",
)

path = 'src/components/SingleStockDashboard.tsx'
replace_once(
    path,
    "  }, [corporateExtraSharesInput, corporateSnapshotData, lockedTargetCurrency, riskAdjustedDiscountRatePctInput]);\n\n  useEffect(() => {\n    if (!debugEnabled) return;",
    "  }, [corporateExtraSharesInput, corporateSnapshotData, lockedTargetCurrency, riskAdjustedDiscountRatePctInput]);\n\n  const corporateEquityValue = (corporateSnapshotData as {\n    corporateEquityValue?: {\n      current?: { valueTargetCurrency: number | null } | null;\n      productionStarts?: Array<{ year: number; valueTargetCurrency: number | null }>;\n    } | null;\n  } | null)?.corporateEquityValue ?? null;\n\n  useEffect(() => {\n    if (!debugEnabled) return;",
)

replace_once(
    path,
    "                        ))}\n                      </div>\n                        </>}",
    "                        ))}\n                        <div className=\"compact-metric-row\">\n                          <span className=\"compact-metric-label\">Corporate equity value nuvärde</span>\n                          <span className=\"compact-metric-dots\" />\n                          <span className=\"compact-metric-value\">{\n                            isFiniteNumber(corporateEquityValue?.current?.valueTargetCurrency)\n                              ? formatMetricValue({ value: corporateEquityValue.current.valueTargetCurrency, reason: null }, \"money\", lockedTargetCurrency)\n                              : \"n/a\"\n                          }</span>\n                        </div>\n                        <div className=\"compact-metric-row\">\n                          <span className=\"compact-metric-label\">Corporate equity value produktionsstart</span>\n                          <span className=\"compact-metric-dots\" />\n                          <span className=\"compact-metric-value\">{\n                            corporateEquityValue?.productionStarts?.length\n                              ? corporateEquityValue.productionStarts.map((row) => (\n                                  `${row.year}: ${isFiniteNumber(row.valueTargetCurrency)\n                                    ? formatMetricValue({ value: row.valueTargetCurrency, reason: null }, \"money\", lockedTargetCurrency)\n                                    : \"n/a\"}`\n                                )).join(\", \")\n                              : \"n/a\"\n                          }</span>\n                        </div>\n                      </div>\n                        </>}",
)
