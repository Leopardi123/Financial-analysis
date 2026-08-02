# Corporate financing operating-deficit fix

## Verdict

**FIXED / IMPLEMENTED AND VERIFIED.** The Corporate cash waterfall now finances
operating deficits as well as construction CAPEX, restores closing cash to the
applicable minimum reserve, publishes periodized financing/share diagnostics,
and retains the existing chronological cash-first and financing policies.

This is an engine/diagnostics correction. No UI page or visual behavior was
introduced, so visual verification is not applicable.

## Root cause and old formula

The waterfall previously computed external need only after allocating available
cash to construction:

```text
available = max(0, openingCash + operatingCashGenerated - reserve)
internalCashUsed = min(available, constructionCapex)
remainingExternalFundingNeed = constructionCapex - internalCashUsed
closingCash = openingCash + operatingCashGenerated
              + debtAdded + equityRaised - constructionCapex
```

Consequently, negative operating cash without construction CAPEX produced no
external need and could roll a negative closing balance into later periods.

## New period identity

The corrected waterfall retains the existing internal construction allocation,
then measures the complete post-operations/post-construction cash deficit:

```text
preFinancingCash = openingCash + operatingCashGenerated - constructionCapex
constructionFundingNeed = constructionCapex - internalCashUsed
totalExternalFundingNeed = max(0, minimumCashReserve - preFinancingCash)
operationalFundingNeed = max(0,
  totalExternalFundingNeed - constructionFundingNeed)

debtRaised + equityRaised + unfundedGap = totalExternalFundingNeed
closingCash = preFinancingCash + debtRaised + equityRaised
unfundedGap = max(0,
  totalExternalFundingNeed - debtRaised - equityRaised)
```

Within explicit floating-point tolerance, every fully financed computable row
must finish at or above `minimumCashReserve`. Construction CAPEX embedded in
FCFF is still grossed up once and the same construction CAPEX is deducted once.

## Producer-consumer map

| Value | Producer | Consumers |
|---|---|---|
| `openingCash` | initial modeled cash pool, then prior `closingCash` | current period cash availability and `preFinancingCash` |
| `operatingCashGenerated` | sum of project FCFF, plus construction gross-up where declared | internal construction cash and complete external need |
| `constructionCapex` / `projectCapexNeed` | project pre-production `capexUSD`, Corporate-calendar aligned | internal allocation, construction attribution and `preFinancingCash` |
| `preFinancingCash` | opening + operations - construction | total external need |
| `minimumCashReserve` | existing Corporate financing plan | cash availability and required closing cash |
| `constructionFundingNeed` | construction less allocated internal cash | project-attributed debt/equity |
| `operationalFundingNeed` | total need less construction need | deficit attribution and debt/equity |
| `debtAdded`, `equityRaised` | attributed total need under existing project/Corporate debt fractions | closing cash, financing snapshot, debt and share totals |
| `unfundedGap` | need less debt/equity | explicit financing identity diagnostic |
| `newShares` | actual period equity × canonical FX / existing issue price | period/cumulative share diagnostics and final canonical shares |
| `closingCash` | pre-financing cash + actual debt/equity | next opening cash and final Corporate cash |

Snapshot consumers retain the existing field names. The legacy
`remainingExternalFundingNeed` is now an alias of complete
`totalExternalFundingNeed`, not construction-only need.

## Cash-first and reserve semantics

- Reported cash enters the modeled pool once only when the existing
  `useLatestQuarterlyCash`/cash-first policy permits it.
- The existing cash-use percentage remains applied only to cash above the
  initial reserve.
- Available internal cash is allocated to same-period construction in stable
  construction-start/project-id order.
- Future cash is never inspected by an earlier row.
- After both operations and construction, external funding restores the row to
  reserve when the policy provides full debt/equity coverage.
- Negative reported cash retains the existing normalization policy: it cannot
  create usable cash; the modeled opening pool begins with the protected reserve.

## Construction versus operational attribution

Construction need remains attributed to the project whose pre-production CAPEX
is unfunded after internal cash allocation. Operational need is attributed pro
rata to projects with negative grossed-up operating-cash contributions, using
absolute deficits. A need caused only by negative opening cash or a reserve
step-up has no project operating provenance and uses the explicit
`__CORPORATE__` attribution rather than an arbitrary project.

Project-specific debt fractions continue to apply to project-attributed need;
the existing Corporate debt fraction applies to `__CORPORATE__`. Equity remains
the complement. No debt capacity, interest, amortization, fee, NAV, EBITDA or
DSCR rule was added.

## Debt/equity and issue-price bridge

Debt and equity amounts are produced in waterfall USD under the existing
project-specific debt fraction with Corporate fallback. New shares use the
existing scalar snapshot FX and issue-price precedence:

```text
newShares[t, attribution]
  = equityRaisedUSD[t, attribution]
    * fxUSDToTargetCurrency
    / issuePriceTargetCurrency[attribution]
```

Project issue price continues to override the Corporate financing-plan price,
which continues to fall back to current market price. A positive equity raise
with invalid/missing FX or issue price produces `newShares = null`, row status
`NOT_COMPUTABLE`, and an explicit diagnostic; it never produces infinite or
fabricated zero shares. Financing proceeds themselves remain calculable because
the existing financing policy defines the equity amount independently of its
share conversion.

## Periodized shares and denominator policy

The waterfall publishes:

- `newSharesByPeriod`,
- `cumulativeNewSharesByPeriod`,
- `cumulativeCanonicalSharesByPeriod`,
- per-row/project `newSharesByProject`.

Cumulative shares are monotonic and change only in periods with actual equity.
The existing canonical valuation policy is intentionally unchanged: final
post-financing fully diluted shares remain the denominator across the modeled
valuation timelines. The new periodized arrays are separate financing/runway
diagnostics and do not silently change historical valuation denominators.
Manual/project FD extra shares enter `cumulativeCanonicalSharesByPeriod` and the
final canonical denominator once, but never create financing proceeds.

## Financing debug correction

`diagnostics.meta.corporateFinancingDebug.perProjectNewShares` and the new
`actualProjectFinancing` map now use actual waterfall debt, equity and shares.
The former hypothetical gross pre-waterfall calculation remains available only
under the explicit name `preWaterfallGrossFundingEstimate`.

## Deterministic tests

The waterfall suite covers negative operations with/without reserve, negative
reported cash policy, positive operations plus construction, combined deficits,
future-cash isolation, construction gross-up, cash reuse, reserve preservation,
cash-first disabled, debt/equity splits, full debt/equity, invalid issue price,
multi-project pro-rata attribution, reverse/same-year ordering, Corporate
attribution, periodized shares and strict null. The repository's existing
snapshot tests additionally cover manual/project FD extras, canonical denominator
reuse and sensitivity scenario isolation.

## Los Ricos North + South regression

The deterministic fixture used the same manual resolver deck in both the clean
HEAD worktree and the corrected worktree. Exact final canonical shares and NPV
were unchanged:

| Scenario | Shares before | Shares after | NPV before | NPV after |
|---|---:|---:|---:|---:|
| Spot -25% | 402,388,436.37417 | 402,388,436.37417 | -58,219,285.5246332 | -58,219,285.5246332 |
| Spot | 362,702,125.43736 | 362,702,125.43736 | 288,176,393.4242902 | 288,176,393.4242902 |
| Spot +25% | 340,836,000 | 340,836,000 | 634,357,431.115497 | 634,357,431.115497 |

Thus the issue price, debt/equity policy, resolver/scenario economics and
canonical valuation denominator did not change. Waterfall rows remain strictly
chronological, so LRS cash can fund later LRN construction only after that cash
has been generated.

## Stress before/after

Amounts below are USD millions. Fixture financing is full equity, reserve and
debt are zero, and `unfundedGap` is zero after the fix.

| Case / critical year | Operating | Construction | External before | Closing before | Operational need after | External/equity after | New shares after (m) | Closing after |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Abra Spot -50%, 2028 | -12.200 | 0 | 0 | -12.200 | 12.200 | 12.200 | 13.176 | 0 |
| Abra Spot -50%, 2035 | -10.200 | 0 | 0 | -83.600 | 10.200 | 10.200 | 11.016 | 0 |
| LRS Spot -50%, 2029 | -3.268 | 0 | 0 | -3.268 | 3.268 | 3.268 | 3.530 | 0 |
| LRS Spot -50%, 2038 | -27.558 | 0 | 0 | -57.325 | 27.558 | 27.558 | 29.762 | 0 |
| LRN+LRS Spot -50%, 2029 | -3.268 | 69.500 | 69.500 | -3.268 | 3.268 | 72.768 | 78.590 | 0 |
| LRN+LRS Spot -50%, 2038 | -24.113 | 0 | 0 | -42.431 | 24.113 | 24.113 | 26.042 | 0 |
| LRN+LRS 6m payable-loss approximation, 2029 | -3.268 | 69.500 | 69.500 | -3.268 | 3.268 | 72.768 | 78.590 | 0 |
| LRN+LRS Spot -30% + OPEX +15%, 2029 | 12.624 | 69.500 | 56.876 | 0 | 0 | 56.876 | 61.426 | 0 |

The combined case did not contain an uncaptured operating deficit: its existing
construction financing remains numerically unchanged. The corrected stress
cases fund only the amount required to restore the same-period reserve; later
positive cash is not used retroactively.

## Non-regression verdict

No project economics or valuation formula was edited. Repository tests confirm
the existing revenue, EBITDA/operating earnings, EBIT, tax, NOPAT, FCFF, DCF,
NPV, Corporate calendar aggregation, static multiples, quality factors, 70/30
Combined formula, Project View, price scenario isolation, manual extra shares,
project FD extras and denominator contracts. The production TypeScript/Vite
build passes.

The full `npm test` chain reaches a pre-existing unrelated resolver assertion:
`resolvePrices.test.ts` expects source label `live`, while production emits
`fmp`. All tests before that gate pass; the remaining relevant snapshot,
financing, sensitivity and presentation tests were also run directly and pass.

## EJ VERIFIERAT

1. Real-world ability to raise the modeled debt/equity; policy still assumes the
   calculated amount can be raised.
2. Debt capacity, interest, amortization, maturity, refinancing, fees, DSCR and
   covenants; these remain outside the model.
3. Time-varying FX or issue prices; the existing canonical scalar policy remains.
4. Corporate-only operating costs outside project FCFF; no such live input is
   currently passed to the waterfall.
5. GoGold/Parral, Vizsla and Viscaria Corporate fixture regression because the
   repository does not contain complete corresponding snapshot-request fixtures.
6. Visual rendering, because no UI was changed and visual verification is not
   relevant to this engine correction.
