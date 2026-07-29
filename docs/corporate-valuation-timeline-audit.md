# Corporate ValuationTimeline calendar audit

## Result and root cause

The audit found **two semantic defects**, not a formatting defect:

1. `runCorporateSnapshotPipeline` re-aggregated a multi-project company with
   `aggregateProjectsToCorporateTotals` by array position. That function has no calendar
   context, so local period `t` from every project was treated as the same corporate
   period. This could move FCFF, CAPEX and all derived valuation inputs.
2. `SingleStockDashboard.corporateViewMetrics` rebuilt the corporate timeline from the
   internal series while supplying the valuation rows as labels. When those arrays had
   different lengths, `computeProjectViewMetrics` was the **first function that replaced
   the absolute axis**: its length guard rejected `calendarYears` and generated
   `period + valuationPeriodOffset`. The dashboard additionally set the offset to
   `internalStartYear - valuationYear`; this produced labels such as `-1, 2, 5, 6` and
   wrong discount exponents. The UI now consumes the snapshot's canonical timeline and
   its exponent zero at the valuation-year period.

Thus the defect affected labels, FCFF placement, discounting, milestone selection,
peaks and chart clipping. The economics formulas were not changed; their inputs and
period distance were corrected.

## Time vocabulary and ownership

| Field | Producer | Unit / scope | Meaning and consumers |
|---|---|---|---|
| `periodIndex` | `buildValuationTimeline` | integer, corporate-global or project-local according to timeline | Array address only. Used by selectors, rows and coordinates; never a label. |
| `calendarYear` | `buildValuationTimeline` from `yearsByPeriod[periodIndex]` | absolute year | Table/chart/debug label and milestone join key. |
| `valuationYear` | snapshot request validation | absolute year, corporate-global | Corporate today anchor and first `valuationYears` entry. |
| `valuationPeriodOffset` | view caller | relative periods | Legacy project rebase input. Corporate canonical timeline uses zero; never presented. |
| `yearsByPeriod` | `resolveV2TimeAxis` (project), valuation rebase (corporate) | absolute years | Local-period-to-year lookup and canonical axis input. |
| `projectStartPeriod` | `buildValuationTimeline` caller/default | timeline-local index | Construction/initial-CAPEX boundary; not a year. |
| `productionStartPeriod` | project JSON/`resolveV2TimeAxis`; mapped for Corporate | project-local index in Project, corporate-global index in Corporate | Engine windows and phase selection. Project start year is always `yearsByPeriod[productionStartPeriod]`. |
| `projectStartYear` / `productionStartYear` | V2 time resolver/request | absolute year, project metadata | Mapped to the Corporate row having equal `calendarYear`. |
| `todayPeriod` | canonical builder/caller | corporate-global index | Normally zero on valuation axis; basis for chart today and discount exponent. |
| `todayYear` | selector (`periods[todayPeriod].calendarYear`) | absolute year | Today label and runtime trace. |
| `timelineStart` / `timelineEnd` | canonical builder | absolute years | Bounds and display clipping. |
| Corporate `valuationYears` | `runCorporateSnapshotPipeline` | absolute annual grid | `valuationYear ... last project year`; canonical Corporate `yearsByPeriod`. |
| project-local period | project engine/JSON | zero-based index | Only indexes that project's arrays. |
| corporate-global period | canonical Corporate builder | zero-based index | Indexes the common valuation-year calendar grid. |

`periodEndDatesUtc` is used when a model has dated periods. Annual V2 input is resolved
by the explicit production-start year, not guessed from another project's index.

## End-to-end mapping

For every project, `resolveV2TimeAxis` creates project `yearsByPeriod`. Aggregation now
aligns every economic series by looking up each Corporate year in that array before it
sums. The valuation rebase creates the absolute `valuationYears`; the canonical builder
creates `{periodIndex, calendarYear}` and project contributions for those years.
`selectCorporateProjectStartMilestones` joins each absolute project start year to that
same timeline and emits the shared table/chart/debug object:

```ts
{ projectId, projectName, corporatePeriodIndex, calendarYear,
  navPerShare, dcfPerShare, dcfPresentValueTodayPerShare }
```

Both dashboard milestone rows and chart `startPeriods` consume these objects. Chart
rows use `calendarYear`; marker coordinates use `corporatePeriodIndex`. Peak years and
`latestProjectStartYear` come from those chart points. The Corporate end is the later
of latest start/Low peak/High peak plus three, capped at the available timeline end.

## Runtime verification (2026 multi-project fixture)

Both projects deliberately use local `productionStartPeriod = 2`; A resolves to 2029
and B to 2032. They map to Corporate indices 3 and 6. At A's start, exponent=3,
NAV/share=1.1335757801 and DCF/share=2.0583718700. At B's start, exponent=6,
NAV/share=0.9596111627 and DCF/share=2.7986221514. Contributions are 95,785,000 for A
in 2029 and 95,785,000 for B in 2032; B contributes zero in 2029. The canonical labels
are 2026 through 2039, never `-1, 2, 5, 6`.

Interpretation of the reported bad labels: `-1` was an offset-derived today label;
`2` and `5` were relative positions representing 2029 and 2032; `6` was the following
relative position representing 2033. After the fix the displayed values are 2026,
2029, 2032 and 2033 respectively. The original production data for the user's external
runtime case is not stored in this repository, so its historical NAV/DCF numbers cannot
be reconstructed; the checked-in deterministic runtime case records the corrected
values above.

The single-project control remains period-for-period identical and reports today 2026,
start index 2/calendar year 2028 in the repository fixture, with DCF/share at start
1.7481623664 and present-value DCF/share 1.4447622863.

## Regression matrix A–O

The integration regression covers: A/B absolute axis and forbidden labels; C start year
identity; D/E shared table/chart year; F coordinate by matching year; G same local start
at distinct global periods; H year-aligned contributions; I global discount factors;
J absolute latest start; K absolute three-year clip; L existing single-project control;
M chronological starts; N non-presentational `periodIndex`; and O the single shared
milestone shape used by table, chart and debug.
