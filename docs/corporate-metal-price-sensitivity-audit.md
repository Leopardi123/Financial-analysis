# Corporate metal-price sensitivity audit

## Verdict and scope

**IMPLEMENTED BUT NOT VISUALLY VERIFIED.** The feature is mounted and executable in the production Corporate List 2 card. Project View was not changed. Targeted numerical, integration, build, presentation-contract and Corporate chart non-regression tests pass; no browser automation is installed in this container, so no screenshot claim is made.

## Production mounting and shared presentation

The sole mount is in `SingleStockDashboard`, inside the `primaryView === "modeled"` Corporate section and the existing `FINANSIELLA NYCKELTAL OCH VÄRDERING` `<details>`. `baseContent` contains the pre-existing `ValueRangeSnapshotCard`, its existing Corporate inputs, debug expander and exact List 2 metric rows. Page 2 uses that same `ValueRangeSnapshotCard` with the selected scenario timeline/time series/quality output. No Project View branch imports or mounts the sensitivity component.

Shared producer–consumer map:

`cell/page open → stable input hash → seven isolated snapshot HTTP requests → validate spot multiplier → resolve each project's priceKeyByMetal → multiply resolved project/metal series → existing project engine → existing royalties/tax/FCFF → existing Corporate calendar aggregation/financing → canonical timeline → existing multiple-contrast builders → ValueRangeSnapshotCard → table adapter`.

Reused helpers/components: `postCorporateSnapshot`, `ValueRangeSnapshotCard`, `buildValuationChartRenderModel`, `buildStaticMultipleContrastSeries`, `buildQualityMultipleContrastSeries`, `buildCombinedTargetSeries`, `withManualExtraShares`, canonical timeline fields and the snapshot's `corporateQualityMultipleTimeSeries`.

## Scenario, price provenance and strict null

Exact formula before the project engine:

`scenarioPrice(project, metal, period) = resolvedSpotPrice(project, metal, period) × multiplier`

Multipliers are exactly 0.75, 0.85, 0.95, 1.00, 1.05, 1.15 and 1.25. Resolver keys and units come from each project's `priceKeyByMetal`; null remains null. The manual values used by this deterministic offline fixture audit are explicit valid resolver fallback entries (Au 2,330 USD/toz, Ag 26.80 USD/toz, Cu 4.00 USD/lb), not report-price substitution inside the sensitivity adapter. Production resolves the current spot/manual contract independently. The UI identifies the base page deck separately and never asserts that an arbitrary non-spot base equals sensitivity Spot 1.00.

Status is `NOT_COMPUTABLE` if timeline/chart core is absent, `PARTIAL` if mandatory main values or quality are unavailable or strict final diagnostics block fields, otherwise `COMPUTABLE`. Resolver-feed failure followed by a valid explicit manual resolved price is diagnostic but not incorrectly classified as missing.

## Lazy execution, cache and async isolation

Opening/swiping to page 2 triggers the first run. Rendering page 1 alone issues no sensitivity calls. Seven requests run in parallel outside React rendering. A canonical key-sorted hash covers projects, manual prices, FX, financing, shares, market values and all other request inputs. The module cache is keyed by that hash; changed economics invalidate state. A generation token prevents stale promises overwriting a newer input generation. Loading, partial failure, total/average/slowest timing and cached reopening states are visible.

## Spot parity and economic non-regression

Tolerance: **exact deep equality (`assert.deepEqual`, effectively 0 absolute/relative tolerance)** between a clean `mode=spot` run and `mode=spot, spotPriceMultiplier=1.00` for series, aggregation, canonical timeline, Corporate valuation time series, quality output and financing. Tests also prove 0.75/1.25 exact project-metal price multiplication, changed per-project revenue/EBITDA/FCFF, changed Corporate aggregation and NPV, immutable base/scenario requests, canonical fully diluted shares and same-scenario Combined composition.

The published per-project audit exposes resolved price/key/unit, revenue by metal, total revenue, EBITDA, EBIT, tax, FCFF, royalties, by-product credits and TC/RC. This confirms the adapter is upstream of existing streams/take/royalty/TC-RC/project economics rather than rescaling Corporate outputs. Existing Corporate and Project tests retain ownership of their detailed contractual formulas.

## Fixture audit

The following runs were measured on 2026-08-01 in this container. Values are raw deterministic engine outputs; display metrics use Swedish formatting. Diagnostics on Los Ricos include the fixture's existing normalized-series warning and LRN's unsupported EBITDA royalty item; no value was guessed.

### Abra Minimal (1 projects, 590 ms)
|Scenario|Prices (project metal)|Revenue USD|EBITDA USD|FCFF USD|NPV target|NAV/sh|Fwd EBITDA|Margin|6x/sh|Quality x|Quality/sh|Combined|Shares|Status|
|-|-|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-|
|0.75|ABRA_MINIMAL Au=1747.5,Cu=3|2277600000.00|797600000.00|172648000.00|-14671260.09|−0,04|99 700 000 USD|35,02 %|1,82|6,75x|2,05|0,69|441 600 000|COMPUTABLE|
|0.85|ABRA_MINIMAL Au=1980.5,Cu=3.4|2581280000.00|1101280000.00|394334400.00|166762692.99|0,37|137 660 000 USD|42,66 %|2,51|6,75x|2,83|1,28|441 600 000|COMPUTABLE|
|0.95|ABRA_MINIMAL Au=2213.5,Cu=3.8|2884960000.00|1404960000.00|616020800.00|348196646.08|0,78|175 620 000 USD|48,7 %|3,21|7,25x|3,88|1,94|441 600 000|COMPUTABLE|
|1|ABRA_MINIMAL Au=2330,Cu=4|3036800000.00|1556800000.00|726864000.00|438913622.62|0,98|194 600 000 USD|51,26 %|3,56|7,25x|4,3|2,24|441 600 000|COMPUTABLE|
|1.05|ABRA_MINIMAL Au=2446.5,Cu=4.2|3188640000.00|1708640000.00|837707200.00|529630599.16|1,19|213 580 000 USD|53,59 %|3,91|7,25x|4,72|2,54|441 600 000|COMPUTABLE|
|1.15|ABRA_MINIMAL Au=2679.5,Cu=4.6|3492320000.00|2012320000.00|1059393600.00|711064552.25|1,6|251 540 000 USD|57,62 %|4,6|7,5x|5,76|3,2|441 600 000|COMPUTABLE|
|1.25|ABRA_MINIMAL Au=2912.5,Cu=5|3796000000.00|2316000000.00|1281080000.00|892498505.34|2,01|289 500 000 USD|61,01 %|5,3|7,5x|6,63|3,81|441 600 000|COMPUTABLE|

### Los Ricos South (1 projects, 841.4 ms)
|Scenario|Prices (project metal)|Revenue USD|EBITDA USD|FCFF USD|NPV target|NAV/sh|Fwd EBITDA|Margin|6x/sh|Quality x|Quality/sh|Combined|Shares|Status|
|-|-|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-|
|0.75|p6 Ag=20.1,Au=1747.5,Cu=3|1595265300.00|676085536.74|44913775.70|-73100927.45|−0,23|74 371 807,04 USD|50,85 %|1,5|4,99x|1,25|0,25|340 836 000|COMPUTABLE|
|0.85|p6 Ag=22.78,Au=1980.5,Cu=3.4|1807967340.00|888776941.63|183958279.13|15911468.24|0,03|93 872 047,98 USD|56,63 %|1,89|5,75x|1,81|0,67|340 836 000|COMPUTABLE|
|0.95|p6 Ag=25.46,Au=2213.5,Cu=3.8|2020669380.00|1101468346.53|323002782.56|104923863.94|0,29|113 372 288,92 USD|61,2 %|2,27|6x|2,27|1,05|340 836 000|COMPUTABLE|
|1|p6 Ag=26.8,Au=2330,Cu=4|2127020400.00|1207814048.98|392525034.27|149430061.79|0,42|123 122 409,39 USD|63,14 %|2,46|6x|2,46|1,23|340 836 000|COMPUTABLE|
|1.05|p6 Ag=28.14,Au=2446.5,Cu=4.2|2233371420.00|1314159751.43|462047285.99|193936259.63|0,55|132 872 529,86 USD|64,89 %|2,65|6,25x|2,76|1,44|340 836 000|COMPUTABLE|
|1.15|p6 Ag=30.82,Au=2679.5,Cu=4.6|2446073460.00|1526851156.33|601083251.61|282946374.97|0,82|152 372 770,8 USD|67,94 %|3,04|6,25x|3,17|1,8|340 836 000|COMPUTABLE|
|1.25|p6 Ag=33.5,Au=2912.5,Cu=5|2658775500.00|1739542561.23|739332664.80|371746409.77|1,08|171 873 011,74 USD|70,51 %|3,42|6,25x|3,57|2,17|340 836 000|COMPUTABLE|

### Los Ricos North + South (2 projects, 785 ms)
|Scenario|Prices (project metal)|Revenue USD|EBITDA USD|FCFF USD|NPV target|NAV/sh|Fwd EBITDA|Margin|6x/sh|Quality x|Quality/sh|Combined|Shares|Status|
|-|-|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-:|-|
|0.75|p5 Au=1747.5,Ag=20.1; p6 Ag=20.1,Au=1747.5,Cu=3|2494972800.00|1092493036.74|160799025.70|-58219285.52|−0,16|102 132 307,04 USD|49,52 %|1,27|6,25x|1,33|0,33|402 388 436,37|COMPUTABLE|
|0.85|p5 Au=1980.5,Ag=22.78; p6 Ag=22.78,Au=1980.5,Cu=3.4|2827635840.00|1425145441.63|383816229.13|80338986.05|0,2|129 629 947,98 USD|55,46 %|1,69|6,75x|1,91|0,84|379 719 186,62|COMPUTABLE|
|0.95|p5 Au=2213.5,Ag=25.46; p6 Ag=25.46,Au=2213.5,Cu=3.8|3160298880.00|1757797846.53|606833432.56|218897257.63|0,58|157 127 588,92 USD|60,15 %|2,1|6,75x|2,36|1,34|368 374 479,17|COMPUTABLE|
|1|p5 Au=2330,Ag=26.8; p6 Ag=26.8,Au=2330,Cu=4|3326630400.00|1924124048.98|718342034.27|288176393.42|0,78|170 876 409,39 USD|62,14 %|2,31|7x|2,7|1,63|362 702 125,44|COMPUTABLE|
|1.05|p5 Au=2446.5,Ag=28.14; p6 Ag=28.14,Au=2446.5,Cu=4.2|3492961920.00|2090450251.43|829850635.99|357455529.21|0,99|184 625 229,86 USD|63,94 %|2,53|7x|2,96|1,9|357 029 771,71|COMPUTABLE|
|1.15|p5 Au=2679.5,Ag=30.82; p6 Ag=30.82,Au=2679.5,Cu=4.6|3825624960.00|2423102656.33|1052859301.61|496011520.43|1,42|212 122 870,8 USD|67,08 %|3|6,75x|3,37|2,43|345 685 064,25|COMPUTABLE|
|1.25|p5 Au=2912.5,Ag=33.5; p6 Ag=33.5,Au=2912.5,Cu=5|4158288000.00|2755755061.22|1275081414.80|634357431.12|1,85|239 620 511,74 USD|69,71 %|3,42|6,75x|3,85|2,97|340 836 000|COMPUTABLE|

Additional fixture availability:

- GoGold Corporate including Parral: **EJ VERIFIERAD** — no complete Parral project fixture exists in the repository.
- Vizsla: **EJ VERIFIERAD** — no complete Corporate snapshot-request fixture exists in the repository.
- Viscaria: **EJ VERIFIERAD** — the repository has identity labels/tests but no complete Viscaria Corporate JSON fixture.

## Performance

Measured cold sequential audit totals (seven complete engine runs): Abra Minimal 590.0 ms; Los Ricos South 841.4 ms; Los Ricos North + South (2 projects) 785.0 ms. The two-project mean was 105.4 ms/scenario and its slowest scenario was 119.3 ms. The production UI launches seven independent HTTP requests in parallel, reports actual browser wall time, and reuses cached results at 0 ms engine/request cost on remount/reopen for an identical input hash. No worker was justified by these sub-second engine measurements; network/server contention remains environment-dependent.

## Cell → scenario → chart and accessibility

Every data cell is a native button. Clicking stores its multiplier and metric id, marks the whole column and the exact cell (`aria-pressed`), changes the full snapshot model passed to the shared chart and maps focus to NAV/DCF, natural, quality or Combined. `ValueRangeSnapshotCard` switches the existing overlay visibility to the focus while retaining DCF/NAV and the selected valuation overlays. Reset restores Spot. Navigation is labelled and exposes `aria-current`; active scenario/focus is announced through `aria-live`.

The outer pages use mandatory scroll snap and 100% flex basis. The table has contained internal horizontal scrolling/overscroll, 44 px buttons and visible focus rings. Page state and scenario state are component-local and use no storage or URL state.

## Visual and non-regression status

**IMPLEMENTED BUT NOT VISUALLY VERIFIED**: browser tooling is absent. Desktop/mobile screenshots, physical trackpad/swipe behavior and Google Chart tooltip interaction are **EJ VERIFIERADE**. CSS and source-level interaction contracts are automated, but are not represented as screenshot verification.

Non-regression verdict: base snapshot requests remain `mode=spot` without a multiplier; multiplier omission takes the original identity branch; validation is now read-only and does not add diagnostics to project JSON; page 1 receives the exact existing chart and rows; financing, net cash, timelines, shares, Corporate aggregation and Project View are not altered by page-2 state. Corporate/chart/sensitivity integration tests and the production build pass. The repository-wide `npm test` gate remains **EJ VERIFIERAD** because its pre-existing resolver test expects diagnostic source `live` while the current production contract emits `fmp` (`expected live, received fmp`); this sensitivity change neither introduces nor relies on that naming mismatch.
