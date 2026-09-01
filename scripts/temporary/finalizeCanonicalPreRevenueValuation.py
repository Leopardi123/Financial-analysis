from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} anchor missing')
    return text.replace(old, new, 1)

# Snapshot contract: publish one explicit Corporate pre-revenue valuation output.
types_path = Path('src/lib/corporate/snapshot/types.ts')
types = types_path.read_text()
types = replace_once(
    types,
    "import type { Lista3DebugPayload } from '../../metrics/lista3.ts';\n",
    "import type { Lista3DebugPayload } from '../../metrics/lista3.ts';\nimport type { CorporatePreRevenueValuationOutput } from '../preRevenueValuationOutput.ts';\n",
    'snapshot type import',
)
types = replace_once(
    types,
    "  series?: CorporateSnapshotSeries;\n  corporateValuationTimeSeries?: CorporateValuationTimeSeries;\n\n  project?: {\n",
    "  series?: CorporateSnapshotSeries;\n  corporateValuationTimeSeries?: CorporateValuationTimeSeries;\n  canonicalValuationTimeline?: import('../../valuation/canonicalValuationTimeline.ts').ValuationTimeline;\n  projectStartMilestones?: import('../../valuation/canonicalValuationTimeline.ts').CorporateProjectStartMilestone[];\n  preRevenueValuation?: CorporatePreRevenueValuationOutput;\n\n  project?: {\n",
    'snapshot valuation fields',
)
types_path.write_text(types)

# Corporate engine: materialize Target and Peak 6x from canonical Corporate valuation paths.
run_path = Path('src/lib/snapshot/runCorporateSnapshot.ts')
run = run_path.read_text()
run = replace_once(
    run,
    "import { computeCorporateQualityMultiples } from '../corporate/multipleContrast/engine.ts';\n",
    "import { computeCorporateQualityMultiples } from '../corporate/multipleContrast/engine.ts';\nimport { buildCorporatePreRevenueValuationOutput } from '../corporate/preRevenueValuationOutput.ts';\n",
    'run snapshot import',
)
old_block = """    (snapshot as Record<string, unknown>).canonicalValuationTimeline = corporateCanonicalTimeline;
    (snapshot as Record<string, unknown>).projectStartMilestones = selectCorporateProjectStartMilestones(
      corporateCanonicalTimeline,
      projectsForBuildFunding.map((project) => ({
        projectId: project.projectId, projectName: project.projectName,
        productionStartYear: project.yearsByPeriod[project.productionStartPeriod] ?? null,
      })),
    );
"""
new_block = """    const projectStartMilestones = selectCorporateProjectStartMilestones(
      corporateCanonicalTimeline,
      projectsForBuildFunding.map((project) => ({
        projectId: project.projectId, projectName: project.projectName,
        productionStartYear: project.yearsByPeriod[project.productionStartPeriod] ?? null,
      })),
    );
    snapshot.canonicalValuationTimeline = corporateCanonicalTimeline;
    snapshot.projectStartMilestones = projectStartMilestones;
"""
run = replace_once(run, old_block, new_block, 'canonical timeline publication')
run = replace_once(
    run,
    "    (snapshot as Record<string, unknown>).corporateValuationTimeSeries = corporateValuationTimeSeries;\n",
    "    snapshot.corporateValuationTimeSeries = corporateValuationTimeSeries;\n    snapshot.preRevenueValuation = buildCorporatePreRevenueValuationOutput({\n      valuationYear: input.valuationYear,\n      canonicalValuationTimeline: corporateCanonicalTimeline,\n      projectStartMilestones,\n      corporateValuationTimeSeries,\n    });\n",
    'pre-revenue valuation publication',
)
run_path.write_text(run)

# Compare-domain metric adapter: consume only the materialized Corporate valuation output.
metrics_path = Path('src/lib/corporate/preRevenueMetrics.ts')
metrics = metrics_path.read_text()
metrics = replace_once(
    metrics,
    "  computePreRevenuePeakSixTimesValuePerShare,\n",
    "",
    'remove local peak helper import',
)
metrics = replace_once(
    metrics,
    "  annualizedReturnToTarget: number | null;\n  equivalentByMetal: Record<string, EquivalentMetalMetrics>;\n",
    "  annualizedReturnToTarget: number | null;\n  valuationSourcePath: 'snapshot.preRevenueValuation' | null;\n  targetSourcePath: 'canonicalValuationTimeline.projectStartMilestone' | null;\n  peak6xSourcePath: 'corporateValuationTimeSeries.canonicalPeriodRows' | null;\n  equivalentByMetal: Record<string, EquivalentMetalMetrics>;\n",
    'valuation provenance type',
)
metrics = re.sub(
    r"type ValuationMarker = NonNullable<CorporateSnapshot\['modeledValuationTimeline'\]>\['markers'\]\[number\];\n\n",
    "",
    metrics,
    count=1,
)
metrics, count = re.subn(
    r"function markerYear\([\s\S]*?function canonicalMarkerTarget\([\s\S]*?\n}\n\n",
    "",
    metrics,
    count=1,
)
if count != 1:
    raise SystemExit('legacy marker helper block missing')
old_derive = """  const marker = nextRelevantProjectMarker(snapshot, args.valuationYear);
  const rawTarget = canonicalMarkerTarget(marker);
  const targetPrice = finite(rawTarget) ? rawTarget * scale : null;
  const targetYear = markerYear(marker);
  const yearsToProduction = finite(targetYear) && targetYear > args.valuationYear ? targetYear - args.valuationYear : null;
  const annualizedReturnToTarget = finite(targetPrice) && finite(price) && price > 0 && finite(yearsToProduction) && yearsToProduction > 0
    ? (targetPrice / price) ** (1 / yearsToProduction) - 1
    : null;
  const peak6xValuePerShare = computePreRevenuePeakSixTimesValuePerShare(snapshot, extraShares);
"""
new_derive = """  const valuationOutput = snapshot.preRevenueValuation ?? null;
  const rawTarget = readFinite(valuationOutput?.target?.targetPriceTargetCurrency);
  const targetPrice = finite(rawTarget) ? rawTarget * scale : null;
  const targetYear = readFinite(valuationOutput?.target?.calendarYear);
  const yearsToProduction = finite(targetYear) && targetYear > args.valuationYear ? targetYear - args.valuationYear : null;
  const annualizedReturnToTarget = finite(targetPrice) && finite(price) && price > 0 && finite(yearsToProduction) && yearsToProduction > 0
    ? (targetPrice / price) ** (1 / yearsToProduction) - 1
    : null;
  const rawPeak6xValuePerShare = readFinite(valuationOutput?.peak6x?.valuePerShareTargetCurrency);
  const peak6xValuePerShare = finite(rawPeak6xValuePerShare) ? rawPeak6xValuePerShare * scale : null;
"""
metrics = replace_once(metrics, old_derive, new_derive, 'valuation derive block')
metrics = replace_once(
    metrics,
    "  const diagnostics: string[] = [];\n  if (productionLife.diagnostic) diagnostics.push(`LOM: ${productionLife.diagnostic}`);\n",
    "  const diagnostics: string[] = [];\n  if (valuationOutput?.diagnostics?.length) diagnostics.push(...valuationOutput.diagnostics.map((message) => `Valuation: ${message}`));\n  if (!valuationOutput) diagnostics.push('Canonical Corporate pre-revenue valuation output is unavailable; no modeledValuationTimeline/corporateValuationTimeSeries fallback is used.');\n  if (productionLife.diagnostic) diagnostics.push(`LOM: ${productionLife.diagnostic}`);\n",
    'valuation diagnostics',
)
metrics = replace_once(
    metrics,
    "    annualizedReturnToTarget,\n    equivalentByMetal,\n",
    "    annualizedReturnToTarget,\n    valuationSourcePath: valuationOutput?.sourcePath ?? null,\n    targetSourcePath: valuationOutput?.target?.sourcePath ?? null,\n    peak6xSourcePath: valuationOutput?.peak6x?.sourcePath ?? null,\n    equivalentByMetal,\n",
    'valuation provenance return',
)
metrics_path.write_text(metrics)

# Unit regression: deliberately leave divergent legacy valuation objects in the fixture;
# the canonical materialized output must win and provenance must be asserted.
test_path = Path('src/lib/corporate/__tests__/preRevenueMetrics.test.ts')
test = test_path.read_text()
test = replace_once(
    test,
    "  modeledValuationTimeline: {\n",
    "  preRevenueValuation: {\n    sourcePath: 'snapshot.preRevenueValuation',\n    valuationYear: 2026,\n    target: {\n      sourcePath: 'canonicalValuationTimeline.projectStartMilestone',\n      calendarYear: 2030,\n      periodIndex: 4,\n      lowNavPerShareTargetCurrency: 12,\n      highDcfPerShareTargetCurrency: 18,\n      targetPriceTargetCurrency: 15,\n    },\n    peak6x: {\n      sourcePath: 'corporateValuationTimeSeries.canonicalPeriodRows',\n      calendarYear: 2031,\n      periodIndex: 5,\n      valuePerShareTargetCurrency: 20,\n    },\n    diagnostics: [],\n  },\n  modeledValuationTimeline: {\n",
    'test canonical valuation fixture',
)
test = replace_once(
    test,
    "assert.ok(Math.abs((result.peak6xOverCurrentPrice ?? 0) - (20 * 100 / 120 / 2)) < 1e-12);\n",
    "assert.ok(Math.abs((result.peak6xOverCurrentPrice ?? 0) - (20 * 100 / 120 / 2)) < 1e-12);\nassert.equal(result.valuationSourcePath, 'snapshot.preRevenueValuation');\nassert.equal(result.targetSourcePath, 'canonicalValuationTimeline.projectStartMilestone');\nassert.equal(result.peak6xSourcePath, 'corporateValuationTimeSeries.canonicalPeriodRows');\n",
    'test provenance assertions',
)
test_path.write_text(test)

# Prebuild regression gate.
package_path = Path('package.json')
package = package_path.read_text()
package = replace_once(
    package,
    "node --experimental-strip-types src/lib/corporate/__tests__/snapshotInputResolver.test.ts && node --experimental-strip-types src/lib/corporate/__tests__/preRevenueProductionLife.test.ts",
    "node --experimental-strip-types src/lib/corporate/__tests__/snapshotInputResolver.test.ts && node --experimental-strip-types src/lib/corporate/__tests__/preRevenueValuationOutput.test.ts && node --experimental-strip-types src/lib/corporate/__tests__/preRevenueProductionLife.test.ts",
    'package pre-revenue test chain',
)
package_path.write_text(package)
