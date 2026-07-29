# Financing flow audit: Project View and Corporate View

## First divergences and correction

The first Project divergence was the `usePrecomputedFinancing: true` argument in
`SingleStockDashboard`'s `projectViewMetrics` memo. The snapshot's
`financing.shares_post_financing` therefore controlled Shares PF, while
`computeProjectViewMetrics` deliberately replaced cash used, remaining need, debt,
equity and new shares with zero. The checkbox and percentage were present in React
state and in both snapshot requests, but were ignored by that second, precomputed
rendering branch. This was a Corporate-only adapter pattern used in Project View.
It has been removed from Project View. Its list 5 result, Shares PF, every per-share
denominator, t0 debt/cash and financing-relevant NAV inputs now come from the same
`computeProjectViewMetrics` invocation.

The first Corporate divergence was not in chronological allocation: the waterfall
already was the sole cash allocator and the subsequent `computeCorporateFinancing`
call intentionally received residual need with cash disabled. The defect was the
initial usable-cash formula: percentage was applied before reserving minimum cash
(`cash * percent - reserve`) rather than to cash above reserve
(`(cash - reserve) * percent`). The waterfall now retains reserve in its roll-forward
and limits the initial funding pool to the latter amount. The Corporate box already
reads `snapshot.financing`, whose cumulative fields are replaced from the waterfall;
its Shares PF row alone failed to include the UI-only manual extra shares and now does.

## UI input trace

### Project

`projectEquityPct`, `projectDebtPct`, `projectUseQuarterlyCash`, and
`projectCashUsedPct` are independent React state. Debt/equity setters keep the pair
complementary, then `normalizedFinancingFractions` converts percentages to fractions
for `buildProjectsSnapshotRequest`. Cash state becomes `financingPlan.use_cash_first`
and `cash_use_percent`; minimum reserve is explicitly zero. Latest cash and debt are
the newest finite statement-series values. Market price and current shares come from
profile/statements. Manual extra shares are separately persisted under the scoped
`extraSharesStorageKey('project', ticker, projectId)` and added only after financing.

For Project presentation, the same state is passed directly to
`computeProjectViewMetrics` as percentages, latest cash, checkbox, and normalized
cash percentage. `getProjectInputs` supplies snapshot series, FX, current shares,
price, and the old precomputed share field, but the latter is only a missing-input
fallback now; it cannot override a computable canonical result. State is neither
shared with Corporate nor reset by Corporate state. The checkbox's `checked` value
and computation both use `projectUseQuarterlyCash`, so visual and calculation state
are identical.

### Corporate

`corporateUseQuarterlyCash`, `corporateCashUsedPct`, and the per-project
`corporateProjectEquityPct` map are separate React state. `corporateFinancingPlan`
normalizes each project's equity/debt pair and sends the checkbox, percentage and
price into the snapshot request. Latest cash/debt, current shares, and issue price use
the same statement/profile sources as Project. Minimum reserve is supported by the
request/engine and currently defaults to zero in this screen. Corporate manual extra
shares have their own ticker-scoped storage key and do not enter the waterfall; they
are added after canonical financing to every UI denominator and Shares PF display.

## Render/source trace

### Project box

`Latest Quarterly Cash` is the newest finite balance-series cash value. `Shares PF`
is `projectViewMetrics.marketBox.sharesPf`. The remaining rows are the fields of
`projectViewMetrics.list5`, all produced in one call to
`computeProjectViewMetrics`: `Initial_CAPEX_Target`, `cash_used_Target`,
`remaining_need_Target`, `Debt_Added_Target`, `Equity_Raise_Target`, `New_Shares`,
`debt_t0`, and `cash_t0`. Initial CAPEX uses `deriveInitialCapexUSD` over construction
periods; no UI recomputation or snapshot financing override occurs. All Project
per-share list 2/list 4 metrics use that call's local `sharesPf` denominator.

### Corporate box

The Corporate box reads the canonical `corporateSnapshotData.financing` object:

* Latest cash is `latest_quarterly_cash_TargetCurrency` (reported t0 balance).
* Initial cash used is `cash_used_for_build_TargetCurrency` (cumulative initial
  reported cash actually allocated by the waterfall).
* Internally generated and total internal cash are respectively
  `internally_generated_cash_used_TargetCurrency` and
  `total_internal_cash_used_TargetCurrency` (cumulative waterfall totals).
* Remaining Funding Need is `remaining_funding_need_TargetCurrency`, meaning
  cumulative external funding raised after internal cash—not a t0 shortfall.
* Debt Added, Equity Raise and New Shares are cumulative waterfall results in
  `new_debt_TargetCurrency`, `equity_raised_TargetCurrency`, and `new_shares`.
* Shares PF is snapshot `shares_post_financing` plus the UI manual-extra-share input.
* Closing Corporate Cash is the final waterfall balance in
  `closing_corporate_cash_TargetCurrency`.
* `debt_t0_post_TargetCurrency` is opening reported debt plus cumulative new waterfall
  debt. `cash_t0_post_TargetCurrency` is reported initial cash less initial cash used;
  `cash_for_nav_TargetCurrency` is the same post-financing balance. Future Corporate
  NAV points use the waterfall row's closing cash and cumulative debt for that year.

Thus Corporate rows are cumulative over the chronological waterfall, except latest
cash and the explicitly named t0 balance fields. Corporate per-share calculations
consume the snapshot's waterfall-derived post-finance shares, with manual extra
shares consistently added in the UI metric adapters. There is no second cash use:
`computeCorporateFinancing` receives zero cash, disabled cash-first, and only the
waterfall residual; its presentation fields are overwritten with waterfall totals.

## Regression matrix

Before correction, P1/P2/P3/P4/P5/P6 failed in the actual Project UI path because
precomputed mode displayed zero detailed financing while retaining snapshot Shares
PF. Unit-only recomputation cases passed but did not exercise that UI adapter. After
correction P1–P6 pass: 3.2bn no-cash equity, 1.4069bn cash-first, disabled-checkbox
independence, enabled percentage monotonicity, displayed/denominator reconciliation,
and debt-plus-equity identity.

Before correction C1, C2, C4, C5, C6, C7, C8 and the waterfall portions of C9 passed.
C3 failed whenever reserve and a percentage below 100% were combined. C9 failed for
manual extra shares because Corporate box Shares PF omitted them. After correction
C1–C9 pass in the deterministic waterfall and presentation-source checks. Per-period
and cumulative external-funding assertions now also execute in the engine.

No CAPEX placement, FCFF series, technical/economic assumption, issue price,
debt/equity control behavior, or NAV definition was changed.
