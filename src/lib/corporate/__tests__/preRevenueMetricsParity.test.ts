import assert from 'node:assert/strict';
import { runCorporateSnapshotPipeline } from '../../snapshot/runCorporateSnapshot.ts';
import { WARINTZA_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/warintzaPfs.ts';
import { ARCTIC_FS_V3 } from '../../project/jsonv3/__tests__/fixtures/arcticFs.ts';
import { COPPER_CREEK_PEA_V3 } from '../../project/jsonv3/__tests__/fixtures/copperCreekPea.ts';
import { getPriceKeyDefinition } from '../../prices/keys.ts';
import { canonicalUnitForMetal } from '../../units/metalUnits.ts';
import { convertPriceToCanonical } from '../../units/conversion.ts';
import { deriveCorporatePreRevenueMetrics } from '../preRevenueMetrics.ts';
import type { CorporateSnapshot } from '../snapshot/types.ts';

const LEGACY_LB_PER_TONNE = 2204.6226218;
const VALUATION_YEAR = 2026;
const PRICE = 2.5;
const SHARES = 250_000_000;
const EXTRA_SHARES = 12_500_000;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function recordValue<T>(record: Record<string, T> | undefined, metal: string): T | undefined {
  if (!record) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, metal)) return record[metal];
  const normalized = metal.trim().toLowerCase();
  const key = Object.keys(record).find((candidate) => candidate.trim().toLowerCase() === normalized);
  return key === undefined ? undefined : record[key];
}

function legacyEq(snapshot: CorporateSnapshot, metal: string) {
  const revenue = snapshot.series?.totalRevenue_USD ?? snapshot.aggregation?.grossRevenueUSD_total;
  if (!Array.isArray(revenue)) return null;
  const qtyUnit = canonicalUnitForMetal(metal);
  const unit: 'oz' | 't' = qtyUnit === 'toz' ? 'oz' : 't';
  const divisor = qtyUnit === 'lb' ? LEGACY_LB_PER_TONNE : 1;
  const seriesPrices = recordValue(snapshot.series?.priceUsedByMetal_USD, metal);
  const unitAudit = recordValue(snapshot.series?.unitAudit?.metals, metal);
  let prices: Array<number | null> | undefined;
  let priceUnit: string | null = null;
  if (Array.isArray(seriesPrices) && revenue.length === seriesPrices.length && unitAudit?.priceUnit) {
    prices = seriesPrices;
    priceUnit = unitAudit.priceUnit;
  } else {
    const priceKey = recordValue(snapshot.aggregation?.priceKeyByMetal, metal);
    prices = recordValue(snapshot.aggregation?.priceUSDByMetal, metal)
      ?? (metal.trim().toLowerCase() === 'au' ? snapshot.aggregation?.auPriceUSDPerOz : undefined);
    if (!Array.isArray(prices) || revenue.length !== prices.length) return null;
    try {
      priceUnit = priceKey
        ? getPriceKeyDefinition(priceKey).canonicalUnit.replace('_per_', '_')
        : metal.trim().toLowerCase() === 'au' ? 'USD_toz' : null;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(prices) || !priceUnit || prices.length !== revenue.length) return null;
  const values = revenue.map((value, index) => {
    const sourcePrice = prices?.[index];
    if (!finite(value) || value < 0 || !finite(sourcePrice) || sourcePrice <= 0) return null;
    const canonicalPrice = convertPriceToCanonical(metal, sourcePrice, priceUnit as string);
    return finite(canonicalPrice) && canonicalPrice > 0 ? (value / canonicalPrice) / divisor : null;
  });
  const first = values.findIndex((value) => finite(value) && value > 0);
  let last = -1;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (finite(values[i]) && (values[i] as number) > 0) { last = i; break; }
  }
  if (first < 0 || last < first) return null;
  const productionValues: number[] = [];
  for (let i = first; i <= last; i += 1) {
    const value = values[i];
    if (!finite(value) || value < 0) return null;
    if (value > 0) productionValues.push(value);
  }
  if (!productionValues.length) return null;
  const lomEq = productionValues.reduce((sum, value) => sum + value, 0);
  return {
    unit,
    lomEq,
    tenYearEq: productionValues.slice(0, 10).reduce((sum, value) => sum + value, 0),
    annualEq: lomEq / productionValues.length,
    productionYears: productionValues.length,
  };
}

function markerYear(marker: any): number | null {
  const raw = marker?.yearLabelUsed;
  if (finite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function legacyMetrics(snapshot: CorporateSnapshot, metals: string[]) {
  const markers = Array.isArray(snapshot.modeledValuationTimeline?.markers)
    ? snapshot.modeledValuationTimeline.markers
      .filter((marker) => markerYear(marker) !== null && finite(marker.value_low) && finite(marker.value_high))
      .sort((a, b) => (markerYear(a) ?? Infinity) - (markerYear(b) ?? Infinity))
    : [];
  const marker = markers.find((entry) => (markerYear(entry) ?? -Infinity) > VALUATION_YEAR) ?? null;
  const modeledShares = snapshot.financing?.shares_post_financing;
  const scale = EXTRA_SHARES > 0 && finite(modeledShares) && modeledShares > 0
    ? modeledShares / (modeledShares + EXTRA_SHARES)
    : 1;
  const sharesPf = finite(modeledShares) && modeledShares > 0 ? modeledShares + EXTRA_SHARES : null;
  const targetRaw = marker
    ? finite(marker.value_mid_if_any)
      ? marker.value_mid_if_any
      : ((marker.value_low as number) + (marker.value_high as number)) / 2
    : null;
  const targetPrice = finite(targetRaw) ? targetRaw * scale : null;
  const targetYear = markerYear(marker);
  const years = finite(targetYear) && targetYear > VALUATION_YEAR ? targetYear - VALUATION_YEAR : null;
  const peakRows = snapshot.corporateValuationTimeSeries?.rows;
  let peak: number | null = null;
  if (Array.isArray(peakRows)) {
    for (const row of peakRows) {
      if (!finite(row.evEbitda6xPerShare)) continue;
      const adjusted = row.evEbitda6xPerShare * scale;
      peak = peak === null ? adjusted : Math.max(peak, adjusted);
    }
  }
  const fx = snapshot.fx_USD_to_TargetCurrency;
  const toUsd = (value: unknown) => finite(value) && finite(fx) && fx > 0 ? value / fx : null;
  const productionYears = Array.isArray(snapshot.aggregation?.payableAuEqOz_total)
    ? snapshot.aggregation.payableAuEqOz_total.filter((value) => finite(value) && value > 0).length || null
    : null;
  const eqByMetal = Object.fromEntries(metals.map((metal) => [metal, legacyEq(snapshot, metal)]));
  return {
    irr: snapshot.corporate?.lista3Metrics?.IRR ?? snapshot.project?.modeled?.npvSpotRange?.base?.irr ?? null,
    payback: finite(snapshot.Payback_real_years) ? snapshot.Payback_real_years : finite(snapshot.Payback_approx_years) ? snapshot.Payback_approx_years : null,
    lom: productionYears,
    sharesPf,
    pNav: finite(sharesPf) && sharesPf > 0 && finite(snapshot.NAV_today_TargetCurrency) && snapshot.NAV_today_TargetCurrency > 0
      ? PRICE * sharesPf / snapshot.NAV_today_TargetCurrency
      : null,
    initialCapexUsd: toUsd(marker?.lista2Metrics?.InitialCAPEX_incremental_TargetCurrency),
    marketCapUsd: toUsd(snapshot.MarketCap_TargetCurrency),
    evUsd: toUsd(snapshot.EV_TargetCurrency),
    targetYear,
    targetPrice,
    targetOverPrice: finite(targetPrice) ? targetPrice / PRICE : null,
    annualReturn: finite(targetPrice) && finite(years) && years > 0 ? (targetPrice / PRICE) ** (1 / years) - 1 : null,
    peak,
    peakOverPrice: finite(peak) ? peak / PRICE : null,
    eqByMetal,
  };
}

function assertNear(actual: number | null, expected: number | null, label: string, relativeTolerance = 1e-9) {
  if (actual === null || expected === null) {
    assert.equal(actual, expected, label);
    return;
  }
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= scale * relativeTolerance, `${label}: actual=${actual} expected=${expected}`);
}

function testDeck(raw: any): Record<string, number> {
  const report = raw.verification?.report;
  assert.ok(report, `${raw.meta?.projectName ?? raw.meta?.projectId} requires verification.report`);
  const deck: Record<string, number> = { ...(report.priceDeckByKey ?? {}) };
  for (const [key, series] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const first = Array.isArray(series) ? series.find((value) => finite(value)) : null;
    if (finite(first)) deck[key] = first;
  }
  return deck;
}

async function buildRealProjectSnapshot(rawInput: any, productionStartYear: number): Promise<CorporateSnapshot> {
  const raw = clone(rawInput);
  raw.time.runtimePlacement = {
    productionStart: {
      year: productionStartYear,
      sourceId: 'USER_SUPPLIED_2026-09-01',
      pageOrTable: 'Runtime placement used by Compare parity regression',
      asOfDate: '2026-09-01',
    },
  };
  const result = await runCorporateSnapshotPipeline({
    refresh: false,
    body: {
      targetCurrency: 'USD',
      valuationYear: VALUATION_YEAR,
      discountRate: 0.1,
      market: { shares_current: SHARES, price_current_TargetCurrency: PRICE },
      balanceSheet: { cash_t0_TargetCurrency: 50_000_000, debt_t0_TargetCurrency: 10_000_000 },
      financingPlan: {
        equity_fraction: 1,
        debt_fraction: 0,
        use_cash_first: false,
        cash_use_percent: 1,
        minimum_cash_reserve_TargetCurrency: 0,
        equity_raise_price_TargetCurrency: PRICE,
      },
      scenario: { mode: 'fixed', fixedPriceByKey: testDeck(raw) },
      fx: { source: 'manual', anchor: 'today', manual_fx_USD_to_TargetCurrency: 1, scenario: { mode: 'spot' } },
      projects: [{ projectId: raw.meta.projectId, rawJson: raw }],
    },
  });
  assert.equal(result.ok, true, result.ok ? 'snapshot ok' : JSON.stringify(result.diagnostics));
  if (!result.ok) throw new Error('unreachable');
  return result.snapshot as unknown as CorporateSnapshot;
}

const cases = [
  { name: 'Warintza PFS', raw: WARINTZA_PFS_V3, productionStartYear: 2030 },
  { name: 'Arctic FS', raw: ARCTIC_FS_V3, productionStartYear: 2032 },
  { name: 'Copper Creek PEA', raw: COPPER_CREEK_PEA_V3, productionStartYear: 2032 },
];

for (const testCase of cases) {
  const snapshot = await buildRealProjectSnapshot(testCase.raw, testCase.productionStartYear);
  const metals = Object.keys(testCase.raw.metals.priceKeyByMetal ?? {});
  const legacy = legacyMetrics(snapshot, metals);
  const derived = deriveCorporatePreRevenueMetrics({
    snapshot,
    currentPriceTargetCurrency: PRICE,
    valuationYear: VALUATION_YEAR,
    manualExtraShares: EXTRA_SHARES,
    referenceMetals: metals,
  });

  assertNear(derived.irr, legacy.irr, `${testCase.name} IRR`);
  const canonicalCorporatePayback = snapshot.corporate?.lista3Metrics?.Payback_real_years ?? null;
  assertNear(derived.paybackYears, canonicalCorporatePayback, `${testCase.name} canonical Corporate payback`);
  if (testCase.name === 'Copper Creek PEA') {
    assert.equal(legacy.lom, null, 'Legacy Compare LOM was unavailable for Copper Creek because it depended on payable AuEq.');
    assert.equal(derived.lomYears, 32, 'Canonical Corporate LOM must resolve from the physical payable-metal production span.');
  } else {
    assertNear(derived.lomYears, legacy.lom, `${testCase.name} LOM`);
  }
  assertNear(derived.sharesPostFinancing, legacy.sharesPf, `${testCase.name} PF shares`);
  assertNear(derived.pNavPostFinancing, legacy.pNav, `${testCase.name} P/NAV PF`);
  assertNear(derived.initialCapexUSD, legacy.initialCapexUsd, `${testCase.name} initial CAPEX`);
  assertNear(derived.marketCapUSD, legacy.marketCapUsd, `${testCase.name} market cap USD`);
  assertNear(derived.enterpriseValueUSD, legacy.evUsd, `${testCase.name} EV USD`);
  assertNear(derived.nextProjectMarkerYear, legacy.targetYear, `${testCase.name} next marker`);
  assertNear(derived.targetPrice, legacy.targetPrice, `${testCase.name} target`);
  assertNear(derived.targetOverCurrentPrice, legacy.targetOverPrice, `${testCase.name} target/current`);
  assertNear(derived.annualizedReturnToTarget, legacy.annualReturn, `${testCase.name} annual return`);
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

  for (const metal of metals) {
    const oldEq = legacy.eqByMetal[metal];
    const nextEq = derived.equivalentByMetal[metal];
    assert.ok(oldEq, `${testCase.name} legacy ${metal}Eq must resolve`);
    assert.ok(nextEq, `${testCase.name} Corporate ${metal}Eq must resolve`);
    assert.equal(nextEq.status, 'OK', `${testCase.name} ${metal}Eq status`);
    assert.equal(nextEq.unit, oldEq?.unit, `${testCase.name} ${metal}Eq unit`);
    assertNear(nextEq.annualEq, oldEq?.annualEq ?? null, `${testCase.name} ${metal} annual Eq`, 1e-9);
    assertNear(nextEq.tenYearEq, oldEq?.tenYearEq ?? null, `${testCase.name} ${metal} 10y Eq`, 1e-9);
    assertNear(nextEq.lomEq, oldEq?.lomEq ?? null, `${testCase.name} ${metal} LOM Eq`, 1e-9);
    assertNear(nextEq.productionYears, oldEq?.productionYears ?? null, `${testCase.name} ${metal} production years`);

    const ref = derived.byReferenceMetal[metal];
    assertNear(ref.capexPerAnnualEqUSD, oldEq && finite(legacy.initialCapexUsd) ? legacy.initialCapexUsd / oldEq.annualEq : null, `${testCase.name} ${metal} CAPEX/annual Eq`, 1e-9);
    assertNear(ref.tenYearEqPerShare, oldEq && finite(legacy.sharesPf) ? oldEq.tenYearEq / legacy.sharesPf : null, `${testCase.name} ${metal} 10y Eq/share`, 1e-9);
    assertNear(ref.marketCapPerTenYearEqUSD, oldEq && finite(legacy.marketCapUsd) ? legacy.marketCapUsd / oldEq.tenYearEq : null, `${testCase.name} ${metal} MCap/10y Eq`, 1e-9);
    assertNear(ref.marketCapPerLomEqUSD, oldEq && finite(legacy.marketCapUsd) ? legacy.marketCapUsd / oldEq.lomEq : null, `${testCase.name} ${metal} MCap/LOM Eq`, 1e-9);
    assertNear(ref.evPerLomEqUSD, oldEq && finite(legacy.evUsd) ? legacy.evUsd / oldEq.lomEq : null, `${testCase.name} ${metal} EV/LOM Eq`, 1e-9);
  }

  console.log(`Compare parity OK | ${testCase.name} | metals=${metals.join(',')}`);
}

console.log('preRevenueMetricsParity.test.ts passed');
