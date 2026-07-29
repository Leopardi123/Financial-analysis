# Corporate chart runtime audit (before correction)

The actual Corporate runtime chain was traced before changing code:

1. `runCorporateSnapshot` builds `snapshot.canonicalValuationTimeline` on the
   calendar-aligned corporate axis and separately publishes the earliest-milestone
   scalar `DCF_prodStart_present_*` used by the table.
2. `SingleStockDashboard.corporateViewMetrics` did **not** pass that snapshot timeline
   to the chart. It rebuilt another timeline through `computeProjectViewMetrics`, with
   `getProjectInputs().tp` as its single `productionStartPeriod`.
3. The table's “Corporate DCF vid projektstartåret, nuvärde/aktie” bypassed that
   rebuilt timeline and rendered `snapshot.DCF_prodStart_present_TargetCurrency`
   divided by the UI-adjusted share count.
4. `ValueRangeSnapshotCard` received the rebuilt `corporateViewMetrics.valuationTimeline`
   plus all mapped project-start periods. However, `selectValuationChart` ignored that
   list when choosing today High and always read
   `timeline.productionStartPeriod`.
5. `buildValueRangeChartRow` preserved the selector value for the ordinary High
   coordinate and today High marker/label. The loss therefore occurred **before** the
   row builder: table and chart selected their Corporate start period by two different
   rules.

For multiple projects, the existing table scalar explicitly uses the earliest valid
Corporate milestone (`computeEarliestMilestoneDcfPresentScalars`). The shared rule is
therefore: Corporate today High refers to the earliest calendar-aligned project-start
period. All project starts still receive their own start markers.

The correction must use one start-period selector for table and chart, and an
integration-level render model must expose the raw selector value, ordinary row High,
today-marker coordinate, and today-marker label input so equality can be tested before
formatting.
