# Canonical valuation timeline: audit and definitions

## Pre-change audit (completed before implementation)

The pre-change implementation had three valuation paths. `computeProjectViewMetrics`
calculated the Project table scalars directly from `fcfUSD`, `capexUSD`, the UI
financing inputs and `valuationPeriodOffset`. `computeLista2CfDcfMetrics` independently
calculated the snapshot/List 2 production-start scalars for any supplied period.
Finally, `runCorporateSnapshot` repeatedly invoked that second function in separate
loops for `chartFlows`, `corporateValuationTimeSeries`, milestone markers, and scalar
outputs. `ValueRangeSnapshotCard.projectChartModel` then rescaled, interpolated,
discounted, and ordered those chart values again.

The first possible divergence was therefore the boundary between
`computeProjectViewMetrics` and `runCorporateSnapshot`'s `chartFlows` loop: the table
used `valuationPeriodOffset`, UI cash/debt and UI-derived post-financing shares, while
the graph used snapshot period zero, snapshot net cash and snapshot shares. The chart
subsequently introduced another divergence by rescaling denominators and applying its
own before-production discount convention.

| Displayed value (old path) | Producer(s) | Input / anchor / factor | CAPEX / shares / scope | Duplicated? |
| --- | --- | --- | --- | --- |
| NPV today, per share | `computeProjectViewMetrics`; `discountedSum` in `runCorporateSnapshot` | all FCFF, today; `(1+r)^-(t+offset)` in Project, `(1+r)^-t` in snapshot | FCFF includes all CAPEX; PF shares; both | yes |
| NAV today, per share | `computeProjectViewMetrics`; financing/waterfall block in `runCorporateSnapshot` | NPV today plus selected cash less debt | reported/cash-waterfall balance; PF shares; both | yes |
| NPV/NAV at production start, per share | `computeProjectViewMetrics`; `computeLista2CfDcfMetrics` in scalar, marker, series loops | tail at `tp`, then subtract pre-`tp` initial CAPEX; NAV adds time-zero net cash | pre-`tp` CAPEX window; PF shares; both | yes, repeatedly |
| DCF at production start, per share | same producers | FCFF tail `tp..N`, discounted to `tp` | construction FCFF excluded by tail; PF shares; both | yes, repeatedly |
| DCF production start present value, per share | same producers plus earliest-milestone scalar helper | DCF at `tp` times `(1+r)^-tp` (Project also used offset) | unchanged; PF shares; both | yes |
| CF LOM / ETLV, per share | both metric helpers | undiscounted sum of all FCFF | FCFF CAPEX basis; PF shares; both | yes |
| Corporate values at project start | per-milestone `computeLista2CfDcfMetrics` and `buildCorporateModeledValuationTimeline` | aggregated corporate axis at the milestone period/year | incremental CAPEX windows; corporate PF shares | yes |
| Ordinary graph series | `runCorporateSnapshot` loops plus `ValueRangeSnapshotCard.projectChartModel` | rolling period metrics, then chart-side transforms | snapshot net cash/shares, then optional rescale | yes |
| Today/project/production markers | scalar props, modeled marker builder, and card fallbacks | mixed scalar and series sources | mixed table/snapshot denominator | yes |
| Labels / High / Low | `ValueRangeSnapshotCard`, `corporateChartRows`, `normalizeTpMarkers` | chart values; `min/max` could swap identity | High intended DCF; Low intended NAV | transformed again |

Calendar years came from `yearsByPeriod`; Project UI additionally inferred an offset
from the difference between the internal first year and chart first year. Corporate
projects were aligned by calendar year before aggregation, but milestone code could
use a project-local `productionStartPeriod` directly. This was the period/calendar
mapping risk audited here.

## Canonical semantics

The canonical convention is an end-of-period annual convention. Period `t` has
discount exponent `t + valuationPeriodOffset` from today and factor
`(1+r)^-(t+valuationPeriodOffset)`. Its value-at-period is the remaining FCFF
`t..N`, with FCFF at `t` undiscounted at that period. FCFF is the engine's unchanged
periodised FCFF, so construction and initial CAPEX, sustaining CAPEX, tax, working
capital unwind and closure are included exactly where the economic engine placed
them.

* **NPV today** is all non-pre-today FCFF discounted to today.
* **DCF at period / production start** is remaining FCFF from that period, discounted
  to that period. At production start, passed construction CAPEX is consequently not
  in the tail.
* **NPV at production start** preserves the established List 2 meaning: production
  DCF less the explicit initial-CAPEX window before production. It is nominal at the
  production-start period. This differs from DCF and the names are not aliases.
* **DCF at production start, present value** is production-start DCF multiplied by
  that period's canonical discount factor to today.
* **NAV at any period** is canonical NPV plus canonical net cash. The current model
  supplies a time-zero balance (not a forecast balance sheet), so cash, debt and net
  cash are explicitly constant along the timeline.
* **Per share** uses the explicit `sharesPf` stored on every period. The current
  financing model has one static post-financing fully diluted denominator; current,
  financing and manual-extra shares remain separately identifiable at timeline level.
* **P/NAV and EV/NAV** remain market-policy ratios outside timeline construction:
  P/NAV uses absolute market capitalisation and NAV; EV ratios use current-share EV.

The chart series have stable economic identities: **High = DCF excluding passed
construction CAPEX, per PF share** and **Low = NAV, per PF share**. The names do not
promise vertical order and must never be swapped when the curves cross.

## Canonical mapping and consumers

Project timelines retain the supplied period count, order, FCFF and
`productionStartPeriod`; `calendarYear` is read from the engine's `yearsByPeriod` (or
the valuation year plus the canonical exponent when only an offset is available).
Corporate timelines use the already calendar-aligned aggregate FCFF axis and retain
per-project contributions on each matching calendar row. A project milestone is a
selector by its mapped corporate calendar year, never a fresh valuation calculation.

Table selectors select `today`, `projectStart`, and `productionStart` period objects.
Chart selectors map those same objects to coordinates. Marker selectors return those
same object references. Debug and export rows serialize the same period objects.
No selector performs discounting, NAV, net-cash, or per-share arithmetic.

## Known model limitation

The economic model does not yet forecast period-specific corporate cash, debt or
share issuance. The canonical type supports period states, but current builders
therefore repeat the canonical time-zero net cash and PF denominator. This is now
visible rather than being silently recomputed by individual consumers.
