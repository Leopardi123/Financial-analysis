from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} anchor missing')
    return text.replace(old, new, 1)

compare_path = Path('src/components/CompareStocksDashboard.tsx')
compare = compare_path.read_text()
compare = replace_once(
    compare,
    "import type { CorporateSnapshot } from '../lib/corporate/snapshot/types.ts';\n",
    "import type { CorporateSnapshot } from '../lib/corporate/snapshot/types.ts';\nimport {\n  comparePreRevenueMetricValues,\n  defaultPreRevenueSortDirection,\n  isPreRevenueSortableMetricKey,\n  type PreRevenueSortableMetricKey,\n  type PreRevenueSortDirection,\n} from './preRevenueCompareSorting.ts';\n",
    'sorting import',
)
compare = replace_once(
    compare,
    "      ['lom', 'LOM', 'Antal år med positiv canonical payable produktion; oberoende av vald Eq-visningsmetall'],\n",
    "      ['lom', 'LOM', 'Kronologiskt årsspann från första till sista period med positiv fysisk payable produktion i någon metall, inklusive eventuella nollproduktionsår mellan dessa perioder. Closure efter sista payable-produktionsperiod räknas inte.'],\n",
    'LOM help text',
)
compare = replace_once(
    compare,
    "  const [rows, setRows] = useState<PreRevenueCompany[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [metalFilter, setMetalFilter] = useState<string>('ALL');\n",
    "  const [rows, setRows] = useState<PreRevenueCompany[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState<string | null>(null);\n  const [metalFilter, setMetalFilter] = useState<string>('ALL');\n  const [sortKey, setSortKey] = useState<'company' | PreRevenueSortableMetricKey | null>(null);\n  const [sortDirection, setSortDirection] = useState<PreRevenueSortDirection>('asc');\n",
    'sort state',
)
compare = replace_once(
    compare,
    "  const visibleRows = useMemo(() => metalFilter === 'ALL' ? rows : rows.filter((row) => row.metals.includes(metalFilter)), [rows, metalFilter]);\n  const referenceMetal = metalFilter === 'ALL' ? 'Au' : metalFilter; const groups = useMemo(() => metricGroups(referenceMetal), [referenceMetal]); const metricColumns = useMemo<MetricColumn[]>(() => groups.flatMap((group) => [...group.columns]), [groups]);\n  return <div className=\"pre-revenue-compare\">\n",
    "  const filteredRows = useMemo(() => metalFilter === 'ALL' ? rows : rows.filter((row) => row.metals.includes(metalFilter)), [rows, metalFilter]);\n  const referenceMetal = metalFilter === 'ALL' ? 'Au' : metalFilter;\n  const visibleRows = useMemo(() => {\n    const next = [...filteredRows];\n    if (sortKey === 'company') {\n      next.sort((left, right) => {\n        const compared = left.name.localeCompare(right.name, 'sv');\n        const ordered = compared !== 0 ? compared : left.ticker.localeCompare(right.ticker, 'sv');\n        return sortDirection === 'asc' ? ordered : -ordered;\n      });\n    } else if (sortKey) {\n      next.sort((left, right) => {\n        const compared = comparePreRevenueMetricValues(left.metrics, right.metrics, sortKey, referenceMetal, sortDirection);\n        return compared !== 0 ? compared : left.name.localeCompare(right.name, 'sv');\n      });\n    }\n    return next;\n  }, [filteredRows, referenceMetal, sortDirection, sortKey]);\n  const groups = useMemo(() => metricGroups(referenceMetal), [referenceMetal]);\n  const metricColumns = useMemo<MetricColumn[]>(() => groups.flatMap((group) => [...group.columns]), [groups]);\n  const requestSort = (key: 'company' | PreRevenueSortableMetricKey) => {\n    if (sortKey === key) {\n      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');\n      return;\n    }\n    setSortKey(key);\n    setSortDirection(key === 'company' ? 'asc' : defaultPreRevenueSortDirection(key));\n  };\n  const ariaSort = (key: 'company' | PreRevenueSortableMetricKey): 'ascending' | 'descending' | 'none' =>\n    sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';\n  const sortIndicator = (key: 'company' | PreRevenueSortableMetricKey) =>\n    sortKey === key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕';\n  return <div className=\"pre-revenue-compare\">\n",
    'sorted rows block',
)
old_head = """    {!loading && !error && <div className=\"pre-revenue-compare__table-wrap\"><table className=\"pre-revenue-compare__table\"><thead><tr className=\"pre-revenue-compare__group-row\"><th>BOLAG</th>{groups.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}</tr><tr><th>Bolag</th>{metricColumns.map(([, label, help]) => <th key={label} title={help}>{label}</th>)}</tr></thead><tbody>\n"""
new_head = """    {!loading && !error && <div className=\"pre-revenue-compare__table-wrap\"><table className=\"pre-revenue-compare__table\"><thead><tr className=\"pre-revenue-compare__group-row\"><th>BOLAG</th>{groups.map((group) => <th key={group.label} colSpan={group.columns.length}>{group.label}</th>)}</tr><tr><th aria-sort={ariaSort('company')}><button type=\"button\" className=\"pre-revenue-compare__sort-button\" onClick={() => requestSort('company')}>Bolag <span aria-hidden=\"true\" className=\"pre-revenue-compare__sort-indicator\">{sortIndicator('company')}</span></button></th>{metricColumns.map(([key, label, help]) => {\n      const sortable = isPreRevenueSortableMetricKey(key);\n      return <th key={label} title={help} aria-sort={sortable ? ariaSort(key) : undefined}>{sortable ? <button type=\"button\" className=\"pre-revenue-compare__sort-button\" onClick={() => requestSort(key)}>{label} <span aria-hidden=\"true\" className=\"pre-revenue-compare__sort-indicator\">{sortIndicator(key)}</span></button> : label}</th>;\n    })}</tr></thead><tbody>\n"""
compare = replace_once(compare, old_head, new_head, 'sortable header')
compare_path.write_text(compare)

css_path = Path('src/styles/compareStocks.css')
css = css_path.read_text()
css = replace_once(
    css,
    ".pre-revenue-compare__table .pre-revenue-compare__group-row th {\n",
    ".pre-revenue-compare__sort-button {\n  appearance: none;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  padding: 0;\n  font: inherit;\n  font-weight: inherit;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.pre-revenue-compare__sort-button:hover,\n.pre-revenue-compare__sort-button:focus-visible {\n  opacity: 0.68;\n  outline: none;\n}\n\n.pre-revenue-compare__sort-indicator {\n  margin-left: 3px;\n  font-size: 0.72em;\n  opacity: 0.52;\n}\n\n.pre-revenue-compare__table .pre-revenue-compare__group-row th {\n",
    'sort css',
)
css_path.write_text(css)

# Make old parallel Target/Peak fixtures deliberately divergent so source-path regressions
# cannot pass merely because the numbers happen to match.
metrics_test_path = Path('src/lib/corporate/__tests__/preRevenueMetrics.test.ts')
metrics_test = metrics_test_path.read_text()
metrics_test = replace_once(metrics_test, "      value_low: 12,\n      value_high: 18,\n      value_mid_if_any: 15,\n", "      value_low: 1200,\n      value_high: 1800,\n      value_mid_if_any: 1500,\n", 'divergent modeled target')
metrics_test = replace_once(metrics_test, "  corporateValuationTimeSeries: { rows: [{ year: 2029, evEbitda6xPerShare: 10 }, { year: 2030, evEbitda6xPerShare: 20 }] },\n", "  corporateValuationTimeSeries: { rows: [{ year: 2029, evEbitda6xPerShare: 1000 }, { year: 2030, evEbitda6xPerShare: 2000 }] },\n", 'divergent legacy peak')
metrics_test_path.write_text(metrics_test)

# Real-project cross-view/source-path guard: materialized values must point back to
# the canonical timeline and the canonical-period Corporate multiple rows.
parity_path = Path('src/lib/corporate/__tests__/preRevenueMetricsParity.test.ts')
parity = parity_path.read_text()
anchor = """  assertNear(derived.annualizedReturnToTarget, legacy.annualReturn, `${testCase.name} annual return`);
  assertNear(derived.peak6xValuePerShare, legacy.peak, `${testCase.name} peak 6x/share`);
  assertNear(derived.peak6xOverCurrentPrice, legacy.peakOverPrice, `${testCase.name} peak 6x/current`);

"""
insert = """  assertNear(derived.annualizedReturnToTarget, legacy.annualReturn, `${testCase.name} annual return`);
  assertNear(derived.peak6xValuePerShare, legacy.peak, `${testCase.name} peak 6x/share`);
  assertNear(derived.peak6xOverCurrentPrice, legacy.peakOverPrice, `${testCase.name} peak 6x/current`);
  assert.equal(derived.valuationSourcePath, 'snapshot.preRevenueValuation', `${testCase.name} valuation source path`);
  assert.equal(derived.targetSourcePath, 'canonicalValuationTimeline.projectStartMilestone', `${testCase.name} target source path`);
  assert.equal(derived.peak6xSourcePath, 'corporateValuationTimeSeries.canonicalPeriodRows', `${testCase.name} Peak 6x source path`);
  const canonicalTarget = snapshot.preRevenueValuation?.target ?? null;
  assert.ok(canonicalTarget, `${testCase.name} canonical Target must be materialized`);
  const targetPeriod = canonicalTarget ? snapshot.canonicalValuationTimeline?.periods[canonicalTarget.periodIndex] ?? null : null;
  assert.equal(targetPeriod?.calendarYear ?? null, canonicalTarget?.calendarYear ?? null, `${testCase.name} Target canonical year`);
  assertNear(targetPeriod?.navPerShareTarget ?? null, canonicalTarget?.lowNavPerShareTargetCurrency ?? null, `${testCase.name} Target canonical NAV`);
  assertNear(targetPeriod?.dcfPerShareTarget ?? null, canonicalTarget?.highDcfPerShareTargetCurrency ?? null, `${testCase.name} Target canonical DCF`);
  const canonicalPeak = snapshot.preRevenueValuation?.peak6x ?? null;
  assert.ok(canonicalPeak, `${testCase.name} canonical Peak 6x must be materialized`);
  const peakRow = canonicalPeak ? snapshot.corporateValuationTimeSeries?.rows.find((row) => row.period === canonicalPeak.periodIndex && row.year === canonicalPeak.calendarYear) ?? null : null;
  assertNear(peakRow?.evEbitda6xPerShare ?? null, canonicalPeak?.valuePerShareTargetCurrency ?? null, `${testCase.name} Peak 6x canonical row`);

"""
parity = replace_once(parity, anchor, insert, 'cross-view valuation assertions')
parity_path.write_text(parity)

package_path = Path('package.json')
package = package_path.read_text()
package = replace_once(
    package,
    "node --experimental-strip-types src/lib/corporate/__tests__/snapshotInputResolver.test.ts && node --experimental-strip-types src/lib/corporate/__tests__/preRevenueValuationOutput.test.ts",
    "node --experimental-strip-types src/components/__tests__/preRevenueCompareSorting.test.ts && node --experimental-strip-types src/lib/corporate/__tests__/snapshotInputResolver.test.ts && node --experimental-strip-types src/lib/corporate/__tests__/preRevenueValuationOutput.test.ts",
    'sorting test prebuild',
)
package_path.write_text(package)
