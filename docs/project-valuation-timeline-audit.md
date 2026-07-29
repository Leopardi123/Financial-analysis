# Project ValuationTimeline calendar audit

## Root cause and exact fallback

The working Project supplied `project.chartFlows.yearsByPeriod` with the same length as
FCFF. The two failing Projects did not: their snapshot valuation axis and internal
project FCFF axis had different lengths. In `computeProjectViewMetrics` the condition

```ts
input.calendarYears?.length === input.fcfUSD.length
```

was false, so the legacy branch generated presentation years with
`input.fcfUSD.map((_, period) => period + valuationPeriodOffset)`. Offset `-1` therefore
made period 0/4 display as `-1/3`; offset `4` made period 0/2 display as `4/6`. The chart
adapter did not invent the labels: it correctly read `timeline.periods[].calendarYear`,
but the timeline had already been given relative values.

This was a **length-mismatch plus timeline-builder input fallback**. It was not caused by
project JSON, a reduced Corporate contribution, or the chart formatter. Project opening
always calls `getCompanyProject(ticker, projectId)` and passes its complete `raw_json` to
the snapshot, including when selection started in a Corporate project list.

## Audited projects

| Project | JSON | masterN (inclusive) | periods / FCFF length | production index/year | Before | After |
|---|---:|---:|---:|---:|---|---|
| AbraSilver control | v2 | 6 | 7 | 3 / 2029 | 2026 … 2029 | 2026 … 2029 |
| p6 Los Ricos South | v1 | 18 | 19 | 4 / 2029 | `-1 … 3` fallback | 2025 … 2029 |
| p5 Los Ricos North | v1 | 13 | 14 | 5 / 2031 | `4 … 6` fallback branch | 2026 … 2031 |

The checked-in South period dates/years are 2025, 2026, 2027, 2028, 2029, 2030, 2031,
2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042, 2043. North uses
2026 through 2039. For each row, `periodIndex` remains 0 through `masterN`, while
`calendarYear` is the corresponding value above. Both use the shared
`buildValuationChartRenderModel` / `selectValuationChart` selector.

V1 does not carry a separate `productionStartYear`; the verified value is the year in
`periodEndDatesUtc[productionStartPeriod]`. V2 must additionally reconcile its explicit
`productionStartYear` with that date.

## Fix and reconciliation

`verifyProjectCalendarAxis` now requires the complete project time object and checks:

1. FCFF, period dates and resolved years are all `masterN + 1` long (`masterN` is an
   inclusive final index in this codebase).
2. Every resolved year equals the year in the same canonical period-end date.
3. Dates are strictly chronological.
4. The production marker year equals the canonical production-period year.
5. V2's explicit production year agrees with that period.

The dashboard takes presentation years and dates only from this verified project axis.
It retains `valuationPeriodOffset` solely as the existing discount-distance input, so
valuation amounts are unchanged. A missing or inconsistent axis returns an explicit
`Ej verifierad Project timeline: …` UI error; the chart is not rendered. The metrics
adapter's verified policy also throws on a length mismatch rather than silently making
relative years.

Direct and Corporate-origin navigation use the same full stored project and the tests
run the same object through both paths, requiring identical years. Corporate
contributions remain joined by those same absolute years.

## Regression A–J

The regression covers the working control (A), South `-1/3` (B), North `4/6` (C),
direct-versus-Corporate equality (D), no index fallback (E), explicit missing/mismatch
errors (F), production marker identity (G), Corporate year identity (H), all length/date
checks (I), and rejection of relative x-axis years for 2000s project dates (J).
