# Compare · Pre Revenue → Corporate audit

Status: implementation audit / no runtime behaviour change.

## Goal

Move every economic/valuation calculation used by `CompareStocksDashboard` Pre Revenue into a canonical Corporate-derived output, while keeping the existing Corporate snapshot, Corporate UI and Corporate calculations unchanged.

Compare must become a consumer: universe/filter/sort/render only. Tier and Investment Score remain separate scoring engines but must consume canonical Project/Corporate outputs rather than reconstruct economics.

## Non-regression rule

This migration is additive first:

1. Do not change existing `CorporateSnapshot` field values or existing Corporate UI behaviour.
2. Add a pure Corporate-domain derivation from an already-built `CorporateSnapshot`.
3. Parity-test every migrated metric against current Compare behaviour.
4. Switch Compare to the new output only after parity tests pass.
5. Remove old Compare calculation helpers only after the switch.
6. Missing canonical input => `null` + diagnostic. Never fall back to another engine.

## What Compare currently calculates locally

Source: `src/components/CompareStocksDashboard.tsx` on `feature/project-json-v3-foundation`.

### 1. Equivalent-metal production

Current local helpers:

- `metalRecordValue`
- `outputEqUnitAndDivisor`
- `eqSeries`
- `computeEqProductionStats`

Current formula:

`Eq[t] = totalRevenueUSD[t] / canonicalReferenceMetalPriceUSD[t]`

then display conversion:

- precious-metal canonical `toz` => oz
- base-metal canonical `lb` => metric tonnes via `2204.6226218 lb/t`
- tonne-native metal => tonnes

Current derived values:

- `annualEq` = LOM Eq / number of positive production periods
- `tenYearEq` = sum of first up to 10 positive production periods
- `lomEq` = sum over positive production periods
- `productionYears`
- `unit`

### Required Corporate output: ALL metal Eq values

Corporate must expose an Eq result keyed by **every canonical comparison/reference metal for which the snapshot has a valid scenario price basis**, not only the metal currently selected in Compare.

At minimum this must cover every metal represented by the company/project canonical metal set and preserve current Au fallback behaviour where Corporate already carries an Au scenario price series. Do not guess a missing price/key.

Proposed shape:

```ts
export type CorporateEquivalentMetalMetrics = {
  metal: string;
  unit: 'oz' | 't';
  series: Array<number | null>;
  annualEq: number | null;
  tenYearEq: number | null;
  lomEq: number | null;
  productionYears: number | null;
  priceKey: string | null;
  priceUnit: string | null;
  status: 'OK' | 'MISSING_PRICE' | 'MISSING_REVENUE' | 'UNIT_ERROR';
  diagnostic: string | null;
};

export type CorporateEquivalentMetalMap = Record<string, CorporateEquivalentMetalMetrics>;
```

Important: this is not an AuEq-only object. If the price context supports Au, Ag, Cu, Zn, Pb, Ni, Pt, Pd, Mo, Sn, Fe/iron ore, U etc., each resolvable reference metal gets its own Eq series/statistics. Exact supported names/keys must come from canonical price/unit registries; never invent API keys.

### 2. Canonical production life / LOM

Current local helper: `canonicalProductionYears`.

Current Compare definition counts periods where `snapshot.aggregation.payableAuEqOz_total > 0`.

Required Corporate field:

```ts
productionYears: number | null
```

Before migration, audit whether `payableAuEqOz_total` is still the desired metal-independent canonical production mask. Preserve behaviour for parity first; any definition change must be a separate change.

### 3. Post-financing share treatment

Current local helpers:

- `extraShareScale`
- `postFinancingShares`

Current behaviour:

`sharesPostFinancingAndManual = snapshot.financing.shares_post_financing + manualExtraShares`

and per-share valuation markers are scaled by:

`shares_post_financing / (shares_post_financing + manualExtraShares)`.

Required Corporate-derived fields:

```ts
sharesPostFinancingBase: number | null;
manualExtraShares: number;
sharesPostFinancingFullyAdjusted: number | null;
manualExtraShareScale: number | null;
```

The default financing policy remains 100% equity when no explicit financing override exists. The later financing-contract cleanup should make that default explicit, but this Compare migration must not change financing mathematics.

### 4. P/NAV PF

Current local helper: `pNavPostFinancing`.

Formula:

`(currentPrice * fullyAdjustedPostFinancingShares) / NAV_today_TargetCurrency`.

Required Corporate-derived field:

```ts
pNavPostFinancing: number | null;
```

No project-level fallback.

### 5. Peak 6x / current price

Current local helper: `peakSixTimesValuePerShare`.

Input currently comes from `corporateValuationTimeSeries.rows[].evEbitda6xPerShare` and is scaled for manual extra shares.

Required fields:

```ts
peakEvEbitda6xPerShare_TargetCurrency: number | null;
peakEvEbitda6xOverCurrentPrice: number | null;
```

Audit requirement: `corporateValuationTimeSeries` is currently treated as an ad-hoc extension to `CorporateSnapshot`; the canonical Corporate contract should own the required series/derived peak before Compare switches.

### 6. Next project marker / target / rerating

Current local helpers:

- `markerYear`
- `validValuationMarkers`
- `nextRelevantProjectMarker`
- `canonicalMarkerTarget`

Current rules:

- only markers with valid year, low and high
- choose first marker after current UTC year
- target = `value_mid_if_any`, else midpoint of low/high
- scale target for manual extra shares

Required fields:

```ts
nextRelevantProjectMarkerYear: number | null;
targetPrice_TargetCurrency: number | null;
targetOverCurrentPrice: number | null;
yearsToTarget: number | null;
annualizedReturnToTarget: number | null;
```

Current annualized formula:

`(target / currentPrice) ** (1 / yearsToTarget) - 1`.

The valuation date/year must be an explicit derivation input so tests do not depend on wall-clock time.

### 7. IRR

Current Compare code:

`corporate.lista3Metrics.IRR ?? project.modeled.npvSpotRange.base.irr`.

Required Corporate-derived field:

```ts
irr: number | null;
```

Migration rule: remove the Project fallback. If the canonical Corporate IRR is unavailable, return null + diagnostic.

### 8. Payback

Current priority:

1. `Payback_real_years`
2. `Payback_approx_years`

Required field:

```ts
paybackYears: number | null;
paybackBasis: 'REAL' | 'APPROX' | null;
```

Preserve current priority during parity migration.

### 9. Initial CAPEX

Current Compare source:

`nextRelevantProjectMarker.lista2Metrics.InitialCAPEX_incremental_TargetCurrency`, then converts TargetCurrency → USD through `fx_USD_to_TargetCurrency`.

Required fields:

```ts
initialCapexUSD: number | null;
initialCapex_TargetCurrency: number | null;
initialCapexMarkerYear: number | null;
```

Audit concern: initial CAPEX should eventually have a direct Corporate canonical definition independent of the display marker. For migration, preserve existing marker-based semantics exactly, then review separately.

### 10. Market cap and EV in USD

Current Compare converts:

- `MarketCap_TargetCurrency`
- `EV_TargetCurrency`

using `fx_USD_to_TargetCurrency`.

Required Corporate-derived fields:

```ts
marketCapUSD: number | null;
enterpriseValueUSD: number | null;
```

No duplicate FX calculation in Compare.

### 11. Scale / relative valuation metrics

Current local formulas to move:

- `capexPerAnnualEq = initialCapexUSD / annualEq`
- `eqPerShare = lomEq / fullyAdjustedPostFinancingShares`
- `marketCapPerTenYearEq = marketCapUSD / tenYearEq`
- `marketCapPerLomEq = marketCapUSD / lomEq`
- `evPerLomEq = enterpriseValueUSD / lomEq`

These must be available **per reference metal**, not only for Au.

Proposed nested shape:

```ts
byReferenceMetal: Record<string, {
  eq: CorporateEquivalentMetalMetrics;
  capexPerAnnualEqUSD: number | null;
  lomEqPerShare: number | null;
  marketCapPerTenYearEqUSD: number | null;
  marketCapPerLomEqUSD: number | null;
  evPerLomEqUSD: number | null;
}>;
```

### 12. Inputs currently assembled inside Compare

`loadCanonicalCompany` currently assembles/fetches:

- company ticker/name
- project summaries and raw project records
- current market price
- current shares
- latest cash
- latest debt
- target currency
- persisted financing state
- manual extra shares
- project-specific financing plans
- 100% equity default when no saved plan exists
- Spot scenario
- valuation year = current UTC year
- discount rate = 10%
- FX request

These are **not all metrics**. The audit recommendation is:

- universe loading/filtering remains Compare responsibility;
- market/balance/financing inputs should continue to be passed to the existing Corporate snapshot endpoint exactly as today during migration;
- no change to Corporate's existing runtime request semantics in this phase;
- after snapshot creation, all Compare metric derivation moves to Corporate-domain code.

This keeps Corporate behaviour unchanged.

## What stays in Compare

Compare may keep:

- company universe loading
- company/project presence filtering
- reference-metal filter UI
- choosing which precomputed `byReferenceMetal[metal]` object to display
- sorting
- formatting / Swedish labels / units
- links to Corporate
- Tier cell rendering
- Investment Score cell rendering

Compare must not retain economic formulas after migration.

## What does NOT move into Corporate

- Tier classification logic
- Investment Score classification/weighting

Those engines remain separate. They should receive canonical Corporate/Project metrics as inputs.

## Proposed additive Corporate contract

Do not modify existing Corporate fields or formulas. Add an optional derived section first:

```ts
export type CorporatePreRevenueMetrics = {
  valuationYear: number;
  productionYears: number | null;
  irr: number | null;
  paybackYears: number | null;
  paybackBasis: 'REAL' | 'APPROX' | null;

  sharesPostFinancingBase: number | null;
  manualExtraShares: number;
  sharesPostFinancingFullyAdjusted: number | null;

  navToday_TargetCurrency: number | null;
  pNavPostFinancing: number | null;
  marketCapUSD: number | null;
  enterpriseValueUSD: number | null;

  initialCapexUSD: number | null;

  peakEvEbitda6xPerShare_TargetCurrency: number | null;
  peakEvEbitda6xOverCurrentPrice: number | null;
  nextRelevantProjectMarkerYear: number | null;
  targetPrice_TargetCurrency: number | null;
  targetOverCurrentPrice: number | null;
  annualizedReturnToTarget: number | null;

  equivalentByMetal: CorporateEquivalentMetalMap;
  byReferenceMetal: Record<string, {
    capexPerAnnualEqUSD: number | null;
    lomEqPerShare: number | null;
    marketCapPerTenYearEqUSD: number | null;
    marketCapPerLomEqUSD: number | null;
    evPerLomEqUSD: number | null;
  }>;

  diagnostics: Array<{
    code: string;
    metric: string;
    message: string;
  }>;
};
```

Prefer implementing this as a pure function, e.g.:

```ts
deriveCorporatePreRevenueMetrics({
  snapshot,
  currentPrice,
  manualExtraShares,
  valuationYear,
})
```

rather than changing `buildCorporateSnapshot` calculations. The output can later be attached to an API response or called by Corporate consumers.

## Exact current Compare metric ownership map

| Compare column | Current source / local calculation | Target owner |
|---|---|---|
| Inv. score | separate `InvestmentScoreCell` | Investment Score engine |
| P/NAV PF | local price × PF shares / Corporate NAV | Corporate pre-revenue derivation |
| Peak 6x / pris | local peak of Corporate valuation series + share scaling + price ratio | Corporate pre-revenue derivation |
| Target / pris | local Corporate marker selection + midpoint + share scaling + price ratio | Corporate pre-revenue derivation |
| Årlig avk. → prod. | local CAGR to next marker | Corporate pre-revenue derivation |
| Tier | separate `Tier1StatusCell` | Tier engine |
| IRR | Corporate lista3 then Project fallback | Corporate only; fallback removed |
| Payback | local priority over two Corporate fields | Corporate pre-revenue derivation |
| LOM | local count of positive payable AuEq periods | Corporate pre-revenue derivation |
| Initial CAPEX | local next-marker Lista2 CAPEX + FX conversion | Corporate pre-revenue derivation |
| CAPEX / annual Eq | local | Corporate per-reference-metal derivation |
| Annual Eq | local revenue/reference-metal-price | Corporate Eq map |
| 10y Eq | local | Corporate Eq map |
| LOM Eq | local | Corporate Eq map |
| Eq / aktie | local Eq / PF shares | Corporate per-reference-metal derivation |
| MCap / 10y Eq | local | Corporate per-reference-metal derivation |
| MCap / LOM Eq | local | Corporate per-reference-metal derivation |
| EV / LOM Eq | local | Corporate per-reference-metal derivation |

## Implementation sequence

1. Add pure `deriveCorporatePreRevenueMetrics` + types; do not wire UI.
2. Port Eq logic first and calculate **all resolvable reference-metal Eq maps**.
3. Port financing/share, valuation marker, CAPEX, market-cap/EV and ratio derivations.
4. Add parity tests with representative Au, Ag, Cu, Zn/Pb and Mo/base-metal cases plus multi-project Corporate cases.
5. Add explicit missing-price/unit diagnostics; no guessed keys.
6. Add a Compare shadow/parity test: old local outputs == new Corporate-derived outputs within numerical tolerance.
7. Switch Compare column reads to the new Corporate-derived object.
8. Delete local calculation helpers/imports from `CompareStocksDashboard.tsx`.
9. Verify Corporate UI/snapshot regression suite is byte/numerically unchanged for existing fields.

## Hard acceptance criteria

- Existing Corporate pages and existing `CorporateSnapshot` fields remain numerically unchanged.
- Existing financing defaults remain unchanged: missing override means 100% equity.
- Compare contains no economic/valuation formula except display formatting after cutover.
- Every resolvable comparison metal has its own Eq series and Annual/10y/LOM Eq metrics.
- No price key, metal unit or Eq price is guessed.
- No cross-engine IRR/payback/NPV fallback remains.
- Missing input fails to `null` with a diagnostic, not to an invented zero.
- Multi-project Corporate aggregation remains the only company-level economic basis used by Compare.
