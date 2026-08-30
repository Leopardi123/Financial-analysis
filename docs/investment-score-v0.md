# Investment Score v0

Status: implementation foundation. Thresholds marked preliminary must be calibrated against real project JSON before the feature is considered complete. Runtime/build verification is still pending; do not treat this branch as verified until tests/CI run successfully.

## Purpose

Keep the existing Tier engine independent: Tier answers how strong the project is regardless of share price. Investment Score answers how attractive the equity is today given project quality, valuation, rerating potential, management and optionality.

Scale: 1 best, 10 worst.

- 1 Generational
- 2 Exceptional Buy
- 3 Strong Buy
- 4 Buy
- 5 Hold
- 6 Neutral / Low interest
- 7 Unattractive
- 8 Poor
- 9 Avoid
- 10 Broken / Extreme

## Hard implementation constraints

- Single source of truth: thresholds, gates, weights and adjustments live only in `src/lib/investmentScore`.
- Additive only: do not change Project, Corporate, Compare Stocks metrics, Tier, NAV, P/NAV, EV/EBITDA, AuEq, financing, PF shares, price decks or upstream project/producer calculations.
- Investment Score may consume canonical upstream outputs read-only.
- Missing required evidence must produce `Ej verifierad`; never infer zero, midpoint or hidden proxy.
- Tier is independent. Investment Score may read Tier but never modify it.
- Optionality is positive-only. Management is two-way.
- Hard gates always take precedence over continuous score.
- UI must never calculate or alter the score.

## Score 1 — Generational

All must pass:

- Tier 1.
- P/NAV <= 0.15x, or a separately defined equivalent producer valuation rule.
- Independent valuation convergence verified by a canonical rule.
- Exceptional management.
- Relevant execution track record itself must be Exceptional: Score 1 requires exact-fit prior execution, not merely a high management average.
- LOM >= 30 years, or LOM >= 20 years plus exceptional optionality.
- Tier-1 cycle resistance.
- No identified fatal flaw.

## Score 2 — Exceptional Buy

All must pass:

- Tier 1.
- P/NAV <= 0.25x (preliminary).
- Peak 6x / price >= 3x or future canonical equivalent (preliminary).
- Management >= Strong.
- LOM >= 20 years, or LOM >= 15 years plus exceptional optionality.
- Tier-1 cycle resistance.
- No identified fatal flaw.

## Score 3 — Strong Buy

All must pass:

- Tier 1-2.
- P/NAV <= 0.40x (preliminary).
- Peak 6x / price >= 2x (preliminary).
- Management >= Adequate/Good; final minimum to be calibrated.
- Downside robustness passes a canonical test.
- No identified fatal flaw.

## Scores 4-10

Primarily continuous and deliberately not locked yet. The v0 engine may use a provisional mapping for diagnostics, but no 4-10 boundary is final until calibration with real project JSON.

## Manual evidence

Management dimensions:

1. Relevant execution track record
2. Capital allocation / shareholder alignment
3. Delivery / credibility
4. Technical / team fit

Optionality dimensions:

1. Resource expansion
2. Mine-plan conversion
3. Expansion / debottlenecking
4. District / strategic optionality

Each assessment stores rating, assessment date and optional note. `unassessed` is distinct from a bad rating.

### Evidence ownership and persistence

Manual evidence is intentionally stored outside `project_json` so the scoring overlay cannot alter or contaminate the technical-report evidence contract.

- Management is company/team evidence and is stored once per ticker/symbol.
- Optionality is project evidence and is stored per symbol + project_id.
- Fatal-flaw assessment is project evidence and is stored per symbol + project_id.
- A project-list popup may edit both scopes in one dialog, but it only writes evidence. It must not calculate aggregate ratings or Investment Score.
- Aggregate management/optionality classes are derived only inside `src/lib/investmentScore`.
- An `unassessed` dimension makes the relevant aggregate unverified; it is never silently treated as neutral/none.

This split avoids duplicating company management ratings across several projects while retaining project-specific optionality.

### UI staging

`InvestmentScoreEvidenceDialog` is implemented as an isolated component but is deliberately not mounted into the existing Project editor yet. The first persistence/API layer and dialog can therefore be reviewed and tested without changing current Project, Corporate or Compare Stocks render paths. Wiring it to the project-list button is a separate additive step after this foundation is verified.

## Required diagnostics

Canonical engine output must expose at least:

- `investmentScore`
- `rawScore`
- `bestAllowedScore`
- gate results for Scores 1-3
- `gateFailures[]`
- verification status
- diagnostics
- component breakdown when continuous scoring is implemented

## Calibration plan

Test against a deliberately mixed set of 8-12 existing project JSONs: obvious Tier 1, expensive Tier 1, extremely cheap Tier 1, cheap Tier 2, long-LOM/high-cost case, high-IRR/short-LOM case, low-P/NAV/distant-cash-flow case, high Peak-6x/weaker-NAV case, mediocre asset at extreme discount and excellent asset at fair value.

No project-specific exception rules. All changes during calibration must be made centrally.
