# Corporate Survivability Analysis — Phase 1

## Verdict

**IMPLEMENTED BUT NOT VERIFIED** end-to-end because browser screenshots and
physical desktop/mobile interaction could not be executed in this container.
The feature is numerically verified and verified at source/build level. It is
Corporate-only and adds a third page after base valuation and metal-price
sensitivity. No Project View route or economic engine was changed.

## Producer–consumer contract

The normal Corporate snapshot pipeline remains the sole producer of project
economics, Corporate calendar aggregation and the financing waterfall. The page
consumes `series.fcffUSD`, valuation context (`NPV_today_TargetCurrency` and
`NAV_today_TargetCurrency`) and waterfall rows: opening/closing cash, operating
cash, construction CAPEX, reserve, internal cash, debt, equity, unfunded gap and
periodized/project shares. Project contribution detail comes from the
waterfall's operating, construction, debt, equity and share attribution maps.

No UI-side formula recreates revenue, EBITDA, EBIT, tax, NOPAT or FCFF.

### Analysis window

Survivability status and headline metrics now begin at the later of the canonical
valuation year and the first future `productionStartYear` published by Corporate
project markers. If a project is already producing at the valuation year, the
window begins at the valuation year. Rows before that boundary are retained in
the canonical waterfall for correct cash chronology, but are excluded from the
survivability chart, status, critical-year selection and metric table.

This distinction matches the checked-in Viscaria audit series: the early axis
contains very large initial CAPEX and pre-/ramp-production cash flows, while the
question addressed here is whether operating years can fund continuing costs.
The repository still has no complete Viscaria Corporate snapshot fixture, so the
production boundary itself is taken from the runtime project's saved JSON via
the canonical project marker, never inferred from cash-flow signs.

### Viscaria production-start audit

The checked-in Viscaria debug series has `productionStartPeriod = 2` (2027) and
still contains USD 105,389,029 of CAPEX in that period. Its 2027 FCFF is
USD -144,381,554; grossing the production-start CAPEX out leaves approximately
USD -38,992,525 of operating/working-capital cash deficit. The previous
waterfall boundary used `period < productionStartPeriod`, so the USD 105.4m was
incorrectly presented as operating funding in the survivability bar.

The corrected boundary treats initial/build CAPEX **through and including** the
production-start period as construction financing. It remains in the canonical
cash chronology and total financing, but is excluded from survivability status,
operating debt/equity bars and operating dilution. Any residual bar in 2027 is
therefore the ramp year's genuine operating/working-capital funding need, not a
debt stock, interest expense, amortization or a recurring debt cost. Empty bars
in later years mean those years require no new operating financing; they do not
mean that previously raised debt has been repaid.

For the deployed Viscaria case, the residual bar of roughly USD 28m is therefore
economically consistent with the checked-in series rather than another CAPEX
classification error. The checked-in series has about USD 39m negative operating
cash after grossing up production-start CAPEX; available opening cash/headroom in
the saved runtime case can reduce the external proceeds to roughly USD 28m. The
complete saved runtime JSON is not checked in, so that exact USD 11m bridge is
shown from live waterfall values in the UI rather than reconstructed here.

## Scenario definitions

Base reuses the already completed Corporate snapshot. Six lazy scenarios are
posted through the complete snapshot endpoint and cached by the stable pinned
request hash:

| Scenario | Pipeline request control |
|---|---|
| Spot -20% | resolved spot deck × 0.80 |
| Spot -30% | resolved spot deck × 0.70 |
| Spot -50% | resolved spot deck × 0.50 |
| OPEX +25% | `stressOptions.opex25` |
| Sustaining +50% | existing `stressOptions.sustainingCapex15` |
| Combined | spot × 0.70 plus `stressOptions.opex15` |

FX and the resolver-proven spot deck are pinned from Base, matching the existing
metal sensitivity isolation contract. `opex15` extends the existing stress
adapter; it scales the same raw operating-cost input before the unchanged full
project/Corporate pipeline runs.

Production stop is disabled and explicitly says that higher production-model
resolution is required.

## Financing modes

**Dynamic** is default and consumes the complete scenario waterfall: cash-first,
debt, equity, shares and reserve restoration all respond to stress.

Construction financing remains in the waterfall and cash roll-forward, but is
published separately from operating financing. Status, first financing year,
largest funding need, debt, equity, new shares and dilution on this page consume
only `operationalFundingNeed`, `operationalDebtAdded`,
`operationalEquityRaised` and `operationalNewShares` inside the analysis window.

**Fixed** is a presentation/diagnostic comparison. It reruns the stressed
operating and construction cash chronology while applying Base's period debt,
equity and shares. Any remaining reserve deficit is exposed as `unfundedGap`;
the UI never invents additional financing.

## Status rules

Rules are ordered, deterministic and contain no score:

1. `NOT_COMPUTABLE`: missing production boundary/rows, non-computable waterfall
   row, closing cash or FCFF.
2. `CRITICAL`: positive unfunded gap or closing cash below minimum reserve.
3. `FUNDING_REQUIRED`: positive total external funding need with no residual gap.
4. `PRESSURED`: no external need, but minimum headroom is zero or lower, or more
   than one FCFF year is negative.
5. `ROBUST`: all mandatory periods computable and none of the above applies.

## Main graph

The fixed-height graph area has two keyboard-accessible views. **Liquidity** is
the default and retains two synchronized, independently scaled SVG panels on the
Corporate calendar:

1. closing cash, minimum reserve and zero line, with red shortfall fill;
2. stacked debt, equity and unfunded-gap bars.

The second panel is explicitly labeled **Operating debt/equity raised**. It
shows new proceeds in each year, not outstanding debt. The help text and drawer
separate initial/build CAPEX, construction funding need, operating cash and
operating funding so a large production-start build tranche cannot be mistaken
for operating distress.

An always-visible explanation below the charts identifies the largest funding
year and prints its operating cash, opening cash, reserve, new debt, new equity
and gap. It also states whether any later displayed year needs new financing.
This makes a solitary bar self-explanatory without requiring a table-cell click.

### Funding bars are not the complete risk signal

No financing bar in a year means only that accumulated opening cash is sufficient
to absorb that year's cash flow and reserve requirement. It does **not** mean the
year has positive FCFF or no economic weakness. In the deployed Spot -50% view,
the table reports two negative-FCFF years while only 2027 requires fresh funding;
the other negative year is absorbed by cash accumulated in intervening positive
years. The cash panel now marks every negative-FCFF year with a red triangle and
the explanation lists their calendar years, including years outside the initial
mobile viewport.

This remains a liquidity analysis, not debt-service analysis. The model still
does not contain annual interest, amortization, maturities or covenants, so the
absence of later financing bars cannot establish that outstanding debt is
serviceable or repaid.

There is no dual axis and the old value graph is not reused. Both panels are in
one horizontal mobile-safe scroll container and expose accessible labels and
point/bar titles.

**Value curves** reuses the same footprint rather than adding page length. It
draws scenario-specific annual `npvAbsolute` and `navAbsolute` rows from the
existing Corporate valuation timeline on one target-currency axis, with a zero
line and no financing bars. Clicking the Stress NPV or Stress NAV table row
selects this view automatically.

The value view is explicitly secondary: annual NPV is remaining valuation value,
while annual NAV is labeled **Canonical stress-NAV** because the canonical
timeline repeats its scalar net-cash bridge instead of consuming periodized
waterfall closing cash/debt service. The view therefore must not be interpreted
as a liquidity or debt-service forecast. No dual axis, currency mixing, or new
valuation calculation is introduced.

## Table and critical-year drawer

The table contains the seven requested scenarios and production-window status,
minimum headroom,
critical year, negative-FCFF, reserve, financing, cumulative debt/equity,
shares/dilution and secondary stress NPV/NAV rows. Every result cell is a native
button with `aria-pressed` and an explicit accessible value label.

Clicking a cell selects its scenario/metric, updates the graph highlight and
lazy-mounts the critical-year dialog. The drawer shows opening cash, operating
cash, construction, internal cash, debt, equity, gap, closing cash and FCFF plus
project-attributed operating cash, construction, debt, equity and shares.

## Cache, lazy loading and performance

The third page triggers no runs until it is opened. Base is reused; the other six
runs execute concurrently. The cache key is the existing stable normalized
request hash plus a survivability version suffix. Resolved Base FX and metal
prices are pinned, so reopening is a memory-cache hit and provider requests are
not repeated. The drawer is mounted only after a cell click.

## Verification

- Pure-model tests cover dynamic/full financing, fixed financing/unfunded gap,
  reserve, critical year, negative FCFF and dilution, plus a Viscaria-shaped
  2025–2029 axis proving that historical/construction years are excluded and
  only 2028+ operating funding drives the result.
- Request tests lock every scenario definition and immutability.
- Full Los Ricos project/Corporate pipeline integration runs all six stresses and
  verifies computable waterfall rows and zero gap under full financing.
- Source contracts verify native buttons, ARIA, dialog, disabled production stop,
  both graph panels and responsive CSS.
- Existing metal sensitivity, valuation graph, multiple contrast, Corporate
  financing and Project View suites remain in the repository test chain.
- TypeScript and Vite production build pass.

## Non-regression

The implementation does not edit revenue, EBITDA, EBIT, tax, NOPAT, FCFF, DCF,
NPV, NAV formulas, the metal sensitivity formula, existing value graph, Project
View, multiple analysis, manual extra shares, project FD extras or waterfall
funding identities. Additions are scenario orchestration, an OPEX 15% input
modifier using the established stress path, waterfall contribution diagnostics,
derived fixed-financing presentation and the new page.

## Limitations / EJ VERIFIERAT

1. Production stop, recovery/throughput stress, restart, production shift and
   closure simulation are not implemented by design.
2. DSCR, covenants, interest coverage, maturities and refinancing are not modeled.
3. No probabilistic score, Monte Carlo, VaR or AI assessment exists.
4. Browser screenshots and physical touch/swipe behavior are **EJ VERIFIERADE**:
   the container has no Chromium/Playwright/Puppeteer runtime. Responsive CSS,
   native interaction elements and source contracts are verified instead.
5. Real provider/server concurrency outside deterministic local fixtures is not
   load-tested.
