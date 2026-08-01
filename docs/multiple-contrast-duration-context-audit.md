# Duration context for positive quality premiums

## Verdict

**FIXED / IMPLEMENTED AND VERIFIED.** The quality multiple now applies continuous
duration context to positive Stability, Sustaining Intensity, and EBITDA Margin
premiums. No new quality factor or penalty was introduced.

> Positive operating-quality premiums are fully capitalized only when at least
> five effective economic years remain. With shorter economic duration, only
> premiums are scaled proportionally. Negative quality signals retain their full
> weight.

## Background and selected design

A short, even mine tail could previously earn the same positive operating-quality
premiums as a long-lived project. The earlier audit considered a binary five-year
gate. Continuous scaling was selected instead because it preserves legitimate local
improvement without a discontinuity at 5.0 years and without using absolute EBITDA.
It is duration context, not a terminal penalty, monotonicity rule, DCF/NAV adjustment,
or sixth factor.

## Exact formula

For every computable row, without intermediate rounding:

```text
durationContextFactor = clamp(effectiveEconomicYears / 5.0, 0.0, 1.0)

durationAdjustedX = originalX > 0
  ? originalX * durationContextFactor
  : originalX

rawQualityMultiple = 6.0
  + effectiveEconomicYearsAdjustment
  + fiveYearEbitdaConcentrationAdjustment
  + durationAdjustedStabilityAdjustment
  + durationAdjustedSustainingAdjustment
  + durationAdjustedMarginAdjustment
```

The existing 3x–10x midpoint clamp and clamped midpoint ±1x band are unchanged.
Existing adjustment fields retain the original policy outputs; explicit `original*`
and `durationAdjusted*` diagnostics make the interaction auditable.

## Producer–consumer map

| Stage | Producer | Consumer / contract |
|---|---|---|
| Raw metrics and original policy steps | `multipleContrast/engine.ts` | Existing row fields, unchanged |
| Duration factor and effective contributions | `multipleContrast/engine.ts` | Raw quality multiple and published diagnostic fields |
| EV/equity bridge | Existing bridge in the same engine | Annual and forward-average overlays, formula unchanged |
| Snapshot | Existing Corporate snapshot pipeline | Additive fields on each quality row |
| UI | `MultipleContrastPanel.tsx` | Duration factor and original → adjusted values when different |
| Chart/Combined | Existing presentation selectors | Corrected midpoint; tooltip/layout and 70/30 formula unchanged |

## Deterministic verification

The engine tests cover factors 0, .2, .4, .6, .8 and 1; 4.999999/5.0/5.000001;
positive, negative, zero and mixed-sign contributions; strict null propagation;
3x–10x clamp and ±1x band; and proportional scale neutrality. A four-year row,
for example, changes each +0.50x premium to +0.40x while leaving all original
diagnostics at +0.50x.

## Viscaria debug series: before / after

This table uses the checked-in Viscaria debug economic series. `S`, `U`, and `M`
are Stability, Sustaining, and Margin adjustments (original→adjusted). Raw and
midpoint are identical here because no row reaches a clamp.

| Year | Effective years | Factor | S | U | M | Raw/mid before | Raw/mid after |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2028 | 10.296 | 1.000 | +0.25→+0.25 | 0→0 | +0.75→+0.75 | 7.000 | 7.000 |
| 2029 | 9.727 | 1.000 | +0.50→+0.50 | +0.25→+0.25 | +0.75→+0.75 | 7.250 | 7.250 |
| 2030 | 8.919 | 1.000 | +0.50→+0.50 | +0.25→+0.25 | +0.75→+0.75 | 7.250 | 7.250 |
| 2031 | 8.005 | 1.000 | +0.50→+0.50 | +0.25→+0.25 | +0.75→+0.75 | 7.000 | 7.000 |
| 2032 | 7.314 | 1.000 | +0.50→+0.50 | +0.25→+0.25 | +0.75→+0.75 | 7.000 | 7.000 |
| 2033 | 6.420 | 1.000 | +0.25→+0.25 | +0.25→+0.25 | +0.75→+0.75 | 6.250 | 6.250 |
| 2034 | 5.432 | 1.000 | 0→0 | +0.25→+0.25 | +0.75→+0.75 | 5.750 | 5.750 |
| 2035 | 4.498 | 0.900 | -0.25→-0.25 | +0.25→+0.225 | +0.75→+0.675 | 5.250 | 5.150 |
| 2036 | 3.553 | 0.711 | -0.50→-0.50 | +0.25→+0.178 | +0.75→+0.533 | 5.000 | 4.711 |
| 2037 | 3.774 | 0.755 | -0.25→-0.25 | 0→0 | +0.50→+0.377 | 5.000 | 4.877 |
| **2038** | **3.560** | **0.712** | **-0.25→-0.25** | **0→0** | **+0.25→+0.178** | **5.000** | **4.928** |
| **2039** | **4.574** | **0.915** | **+0.25→+0.229** | **+0.25→+0.229** | **+0.25→+0.229** | **5.750** | **5.686** |
| **2040** | **4.655** | **0.931** | **+0.50→+0.465** | **0→0** | **+0.25→+0.233** | **5.750** | **5.698** |
| **2041** | **3.678** | **0.736** | **-0.50→-0.50** | **0→0** | **+0.25→+0.184** | **4.750** | **4.684** |
| 2042 | 2.762 | 0.552 | -0.50→-0.50 | 0→0 | +0.25→+0.138 | 4.250 | 4.138 |
| 2043 | 1.815 | 0.363 | -0.50→-0.50 | -0.25→-0.25 | +0.25→+0.091 | 4.000 | 3.841 |

Peak years with at least five effective years are unchanged. The 2038–2039 local
recovery remains because the profile improves, but its premiums are continuously
tempered. No negative adjustment changes.

## Fixture and clamp audit

| Fixture | Computable rows | Raw mean before→after | Mean shift | Largest reduction | Rows affected | Clamp before→after | Peak before→after |
|---|---:|---:|---:|---:|---:|---:|---:|
| Abra Minimal | 8 | 6.641→6.547 | -0.094x | -0.500x | 2 (25.0%) | 0→0 | 7.25→7.25 |
| Los Ricos South | 9 | 2.542→2.542 | 0.000x | 0.000x | 0 | 8→8 | 3.25→3.25 |
| Los Ricos North + South Corporate | 8 | 2.391→2.391 | 0.000x | 0.000x | 0 | 7→7 | 3.25→3.25 |
| Viscaria 2028–2043 | 16 | 5.766→5.701 | -0.065x | -0.289x | 9 (56.3%) | 0→0 | 7.25→7.25 |

Scaling normally preserves the count and sign of positive premiums; it only changes
their magnitude. A premium becomes zero only at a zero duration factor. Negative
premium counts are exactly unchanged. Observed peak multiples are unchanged, and
no fixture gains a larger multiple. Los Ricos North separately remains non-computable
under strict-null rules and was not backfilled.

## Regression verdict

The full automated suite verifies that the quality calculation is additive and does
not mutate the snapshot's revenue, EBITDA, sustaining-adjusted operating earnings,
EBIT, tax, FCFF, DCF/NPV/NAV, IRR/payback, financing, net cash, shares, Corporate
aggregation, static 5x/6x/7x, enterprise/equity bridge, Project View, or valuation
series. Effective Years, Concentration, CV, Sustaining Intensity, Margin, calendar and
short-window policies retain their previous computations. Presentation tests retain
the chart, overlay colors, tooltip contract and exact Combined 70/30 calculation.

## Not verified

* A complete canonical Viscaria snapshot is not checked in. Viscaria per-share,
  canonical NPV, financing, debt, shares, closure/reclamation, and Corporate overhead
  are therefore **NOT VERIFIED**; no values were guessed.
* Los Ricos North standalone is **NOT VERIFIED** because strict-null economic tails
  prevent computable quality rows.
* No interactive browser executable is available in this environment. The UI was
  verified by TypeScript build and source-contract tests, but visual browser review
  and screenshot are **NOT VERIFIED**.
