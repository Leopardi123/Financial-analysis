from pathlib import Path

run_path = Path('src/lib/snapshot/runCorporateSnapshot.ts')
text = run_path.read_text()

old = "import { computeLista3 } from '../metrics/lista3.ts';\n"
new = old + "import { deriveCorporateRealPayback } from '../corporate/payback.ts';\n"
if old not in text or "deriveCorporateRealPayback" in text:
    raise SystemExit('runCorporateSnapshot import anchor missing or already patched')
text = text.replace(old, new, 1)

old = """    const corporateLista3Result = computeLista3({
      masterN: aggregationEffective.corporateMasterN,
      tp: tp_main,
      fcfUSD: aggregationEffective.fcffUSD_total,
      initialCapexUSD: initialCapexUSD_main,
      discountRate: input.discountRate,
      strictRoi10Y: true,
      roiAsRatio: true,
      paybackRealUseInitialCapex: true,
      paybackApproxAsRatio: true,
    }, { debug: true });
    const discountFactors_toToday = Array.from(
"""
new = """    const corporateLista3Result = computeLista3({
      masterN: aggregationEffective.corporateMasterN,
      tp: tp_main,
      fcfUSD: aggregationEffective.fcffUSD_total,
      initialCapexUSD: initialCapexUSD_main,
      discountRate: input.discountRate,
      strictRoi10Y: true,
      roiAsRatio: true,
      paybackRealUseInitialCapex: true,
      paybackApproxAsRatio: true,
    }, { debug: true });
    // Canonical Corporate real payback is deliberately NOT valuation-rebased.
    // It carries the complete project FCFF balance into the first production period
    // on the same internal Corporate calendar axis. This prevents historical build
    // cash flow from becoming an accidental sunk-cost exclusion when valuationYear
    // is later than the project's first cash-flow year.
    const corporateRealPayback = deriveCorporateRealPayback({
      fcffUSD: aggregationEffective.fcffUSD_total,
      productionStartPeriod: tpEff,
      masterN: aggregationEffective.corporateMasterN,
    });
    if (corporateRealPayback.diagnostic) {
      diagnostics.warnings.push(`Corporate real payback unavailable: ${corporateRealPayback.diagnostic}`);
    }
    const discountFactors_toToday = Array.from(
"""
if old not in text:
    raise SystemExit('corporate Lista3 anchor missing')
text = text.replace(old, new, 1)

old = """    const corporateLista3 = {
      ...corporateLista3Result.metrics,
      AISC_LOM: additionalLista3ByMetric.AISC_LOM.value,
"""
new = """    const corporateLista3 = {
      ...corporateLista3Result.metrics,
      Payback_real_years: corporateRealPayback.paybackYears,
      AISC_LOM: additionalLista3ByMetric.AISC_LOM.value,
"""
if old not in text:
    raise SystemExit('corporate Lista3 output anchor missing')
text = text.replace(old, new, 1)

old = """    corporateLista3Debug.perMetric.Payback_real.inputs.initialCapexUSD_main_passed = initialCapexUSD_main;
    corporateLista3Debug.perMetric.Payback_real.intermediates.investmentAbs_used = initialCapexUSD_main === null
      ? null
      : Math.abs(initialCapexUSD_main);
"""
new = """    corporateLista3Debug.perMetric.Payback_real.formula = 'full-project cumulative FCFF carried into production start; linear interpolation at first zero crossing';
    corporateLista3Debug.perMetric.Payback_real.inputs = {
      fcfUSD_total: aggregationEffective.fcffUSD_total,
      corporateYearsByPeriod: aggregationEffective.corporateYearsByPeriod,
      productionStartPeriod_internal: tpEff,
    };
    corporateLista3Debug.perMetric.Payback_real.intermediates = {
      cumulativeAtProductionStartUSD: corporateRealPayback.cumulativeAtProductionStartUSD,
      initialDeficitUSD: corporateRealPayback.initialDeficitUSD,
      crossingPeriod: corporateRealPayback.crossingPeriod,
      interpolation: corporateRealPayback.interpolation,
      diagnostic: corporateRealPayback.diagnostic,
    };
    corporateLista3Debug.perMetric.Payback_real.missingInputs = corporateRealPayback.diagnostic ? [corporateRealPayback.diagnostic] : [];
"""
if old not in text:
    raise SystemExit('corporate payback debug anchor missing')
text = text.replace(old, new, 1)

old = "      Payback_real: ['initialCapexUSD_main', 'fcfUSD_total', 'tp_main'],\n"
new = "      Payback_real: ['fcfUSD_total', 'tp_payback_real'],\n"
if old not in text:
    raise SystemExit('Payback_real requirements anchor missing')
text = text.replace(old, new, 1)

old = """      tp_main,
      masterN: aggregationEffective.corporateMasterN,
"""
new = """      tp_main,
      tp_payback_real: tpEff,
      masterN: aggregationEffective.corporateMasterN,
"""
if old not in text:
    raise SystemExit('commonInputValues tp anchor missing')
text = text.replace(old, new, 1)
run_path.write_text(text)

metrics_path = Path('src/lib/corporate/preRevenueMetrics.ts')
text = metrics_path.read_text()
old = "    paybackYears: readFinite(snapshot.Payback_real_years) ?? readFinite(snapshot.Payback_approx_years),\n"
new = "    paybackYears: readFinite(snapshot.corporate?.lista3Metrics?.Payback_real_years),\n"
if old not in text:
    raise SystemExit('Compare payback source anchor missing')
text = text.replace(old, new, 1)
old = "  if (irr === null) diagnostics.push('Corporate IRR is unavailable; no Project-engine fallback is used.');\n"
new = old + "  if (readFinite(snapshot.corporate?.lista3Metrics?.Payback_real_years) === null) diagnostics.push('Canonical Corporate real payback is unavailable; no root Lista3a/Project/JSON fallback is used.');\n"
if old not in text:
    raise SystemExit('Compare diagnostics anchor missing')
text = text.replace(old, new, 1)
metrics_path.write_text(text)

test_path = Path('src/lib/corporate/__tests__/preRevenueMetrics.test.ts')
text = test_path.read_text()
old = "  Payback_real_years: 3,\n  Payback_approx_years: 4,\n  corporate: { lista3Metrics: { IRR: 0.25 } },\n"
new = "  Payback_real_years: 99,\n  Payback_approx_years: 88,\n  corporate: { lista3Metrics: { IRR: 0.25, Payback_real_years: 3 } },\n"
if old not in text:
    raise SystemExit('preRevenue snapshot payback anchor missing')
text = text.replace(old, new, 1)

old = """const noFallback = deriveCorporatePreRevenueMetrics({ snapshot: noCorporateIrr, currentPriceTargetCurrency: 2, valuationYear: 2026 });
assert.equal(noFallback.irr, null, 'Corporate derivation must not fall back to Project IRR');
assert.ok(noFallback.diagnostics.some((message) => message.includes('no Project-engine fallback')));

await import('./preRevenueMetricsParity.test.ts');
"""
new = """const noFallback = deriveCorporatePreRevenueMetrics({ snapshot: noCorporateIrr, currentPriceTargetCurrency: 2, valuationYear: 2026 });
assert.equal(noFallback.irr, null, 'Corporate derivation must not fall back to Project IRR');
assert.ok(noFallback.diagnostics.some((message) => message.includes('no Project-engine fallback')));

const noCorporatePayback = {
  ...snapshot,
  Payback_real_years: 7,
  Payback_approx_years: 6,
  corporate: { lista3Metrics: { IRR: 0.25, Payback_real_years: null } },
} as unknown as CorporateSnapshot;
const noPaybackFallback = deriveCorporatePreRevenueMetrics({ snapshot: noCorporatePayback, currentPriceTargetCurrency: 2, valuationYear: 2026 });
assert.equal(noPaybackFallback.paybackYears, null, 'Compare must not fall back to root Lista3a/Project/JSON payback');
assert.ok(noPaybackFallback.diagnostics.some((message) => message.includes('no root Lista3a/Project/JSON fallback')));

await import('./payback.test.ts');
await import('./preRevenueMetricsParity.test.ts');
"""
if old not in text:
    raise SystemExit('preRevenue no-fallback test anchor missing')
text = text.replace(old, new, 1)
test_path.write_text(text)

# The old migration parity intentionally reproduces the old Compare source path.
# Payback has now been semantically corrected, so its regression must compare
# Compare to canonical Corporate rather than Compare to the obsolete root Lista3a value.
parity_path = Path('src/lib/corporate/__tests__/preRevenueMetricsParity.test.ts')
text = parity_path.read_text()
old = "  assertNear(derived.paybackYears, legacy.payback, `${testCase.name} payback`);\n"
new = """  const canonicalCorporatePayback = snapshot.corporate?.lista3Metrics?.Payback_real_years ?? null;
  assertNear(derived.paybackYears, canonicalCorporatePayback, `${testCase.name} canonical Corporate payback`);
"""
if old not in text:
    raise SystemExit('legacy payback parity assertion anchor missing')
text = text.replace(old, new, 1)
parity_path.write_text(text)
