# Investment Score v0

Status: calibration implementation. Runtime/build verification is still pending; do not treat this branch as verified until tests/CI run successfully.

## Purpose

Keep the Tier engine conceptually independent: Tier answers how strong the project is regardless of share price. Investment Score answers how attractive the equity is today given project quality, valuation, rerating potential, management and optionality.

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

- Single source of truth: Investment Score thresholds, gates, weights and adjustments live only in `src/lib/investmentScore`.
- Investment Score consumes canonical upstream outputs read-only and never rewrites project economics.
- Missing required evidence must produce `Ej verifierad`; never infer zero, midpoint or hidden proxy.
- Tier remains independent from share price and Investment Score.
- Optionality is positive-only. Management is two-way.
- Hard gates always take precedence over continuous score.
- UI must never calculate or alter the score.
- The Tier scale precision rule described below is an explicit Tier policy change approved during calibration; it is not an Investment Score backdoor into Tier.

## Tier physical-scale precision

Physical production, unit normalization, per-product scale equivalents and sustained-window selection are calculated at full precision.

Only after the best sustained scale window has been selected is the final combined scale rounded to **one decimal** for Tier classification and presentation.

The Tier boundaries remain unchanged:

- Tier 1: combined scale >= 1.0x
- Tier 2: combined scale >= 0.4x
- Tier 3: combined scale < 0.4x

Examples:

- 0.993x full-precision combined scale -> 1.0x classification scale -> Tier 1.
- 0.949x -> 0.9x -> Tier 2.
- 0.350x -> 0.4x -> Tier 2.

Rounding must never happen before product aggregation or sustained-window selection.

## Canonical valuation convergence

Valuation convergence answers whether two fundamentally different valuation perspectives agree that the equity is undervalued. It is not a weighted score and one leg cannot compensate for a failure in the other.

Canonical inputs are the exact existing PRE REVENUE Compare Stocks metrics:

- `P/NAV PF`: current price × post-financing shares including manual extra shares / `NAV_today_TargetCurrency`.
- `Peak 6x / pris`: peak `evEbitda6xPerShare`, adjusted for the same post-financing/manual-extra-share basis, divided by current price.

The single classifier lives in `src/lib/investmentScore/valuationConvergence.ts` and returns:

- `EXTREME`: P/NAV PF <= 0.15x AND Peak 6x / pris >= 4.0x.
- `VERY_STRONG`: P/NAV PF <= 0.25x AND Peak 6x / pris >= 3.0x.
- `STRONG`: P/NAV PF <= 0.40x AND Peak 6x / pris >= 2.0x.
- `CONTRADICTORY`: P/NAV PF <= 0.40x but Peak 6x / pris < 1.5x; NAV discount is not confirmed by the earnings-based view.
- `MIXED`: all other verified combinations that do not reach Strong convergence.
- `NOT_VERIFIED`: either canonical input is missing/invalid.

`Target / pris`, annualized return to production and AuEq valuation metrics are not counted as a second independent convergence leg in v0. They can later be used as diagnostics or continuous-score inputs, but not to bypass the two-leg hard gate.

## Score 1 — Generational

All must pass:

- Tier 1.
- `EXTREME` canonical valuation convergence.
- Exceptional management.
- Relevant execution track record itself must be Exceptional: Score 1 requires exact-fit prior execution, not merely a high management average.
- LOM >= 30 years, or LOM >= 20 years plus exceptional optionality.
- Tier-1 cycle resistance.
- No identified fatal flaw.

The P/NAV <= 0.15x requirement is therefore still a hard requirement, but it is enforced once inside the central convergence classifier rather than duplicated inside the score gate.

## Score 2 — Exceptional Buy

All must pass:

- Tier 1.
- At least `VERY_STRONG` canonical valuation convergence.
- Management >= Strong.
- LOM >= 20 years, or LOM >= 15 years plus exceptional optionality.
- Tier-1 cycle resistance.
- No identified fatal flaw.

## Score 3 — Strong Buy

### Standard path

All must pass:

- Tier 1-2.
- At least `STRONG` canonical valuation convergence.
- Management >= Adequate.
- Seven-year survival downside robustness passes.
- No identified fatal flaw.

### Exceptional Tier-3 path

A Tier-3 project may reach Score 3 only when all of the following are true:

- Tier 3 is caused exclusively by **LOM and/or physical scale**. LOM and scale may both be Tier 3.
- Capital returns are no worse than Tier 2.
- Cycle resistance is no worse than Tier 2.
- `EXTREME` canonical valuation convergence.
- Management >= Strong.
- Optionality >= Strong.
- Seven-year survival downside robustness passes.
- No identified fatal flaw.

Tier 3 caused by Tier-3 capital returns or Tier-3 cycle resistance cannot use this exception. The exception therefore permits a small and/or short-life project to be a Strong Buy when price, team, optionality and downside survival are unusually strong, but it does not allow weak economics to be bought away by valuation.

## Score-3 downside robustness

Score-3 downside robustness is deliberately separate from the Tier cycle classification.

The canonical Tier cycle runtime already calculates two different stress views using the same historical-low price deck:

- Five-production-year revenue-normalized NPV10 downside beta: this determines cycle Tier.
- Seven-production-year survival NPV10: this is the Investment Score downside gate.

The Score-3 rule is:

- `7y survival NPV10 > 0` -> `downsideRobustnessPass = true`.
- `7y survival NPV10 <= 0` -> `downsideRobustnessPass = false`.
- Missing/uncomputable survival NPV10 -> `Ej verifierad`.

This removes the previous double penalty where a verified Cycle Tier 2 automatically failed Score 3. A project may therefore have Cycle Tier 2 yet still pass Score-3 downside robustness if it retains positive NPV10 through the seven-year stress.

## Scores 4-10 · continuous v0 calibration

The current raw score is calibration-only and uses the conceptual split:

- Asset quality 30 %.
- Valuation 30 %.
- Rerating 25 %.
- Management 15 %.
- Optionality is a positive-only bonus overlay.

Continuous management deliberately differs from the conservative hard-gate aggregate. It preserves all four assessed dimensions instead of flooring them into one class:

- Relevant execution track record: 40 % of the management component.
- Capital allocation / shareholder alignment: 20 %.
- Delivery / credibility: 20 %.
- Technical / team fit: 20 %.

The rating-to-score calibration remains `Exceptional 1.5`, `Strong 3`, `Adequate 5.5`, `Weak 9`. If any management dimension is `unassessed`, the continuous management component remains `Ej verifierad`; no neutral proxy is inserted.

Raw score is mapped to the nearest integer (`Math.round`) before hard gates are applied. Example: 7.02 -> 7, 7.50 -> 8. Hard gates can still make the final score worse, never better.

These breakpoints, dimension weights and the 4-10 mapping remain provisional until calibration against real project JSON.

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

The qualitative evidence dialog is mounted additively in the project editor. PRE REVENUE Compare Stocks has an Investment Score column whose cells open a read-only score breakdown popup. The popup displays canonical engine output and evidence; it must not implement separate scoring logic.

## Required diagnostics

Canonical engine output must expose at least:

- `investmentScore`
- `rawScore`
- `bestAllowedScore`
- gate results for Scores 1-3
- canonical valuation-convergence class
- `gateFailures[]`
- verification status
- diagnostics
- component breakdown when continuous scoring is implemented

## Calibration plan

Test against a deliberately mixed set of existing project JSONs, including Tier 1, Tier 2 cycle cases that survive the seven-year stress, Tier 3 caused only by scale/LOM, and Tier 3 caused by weak capital returns or cycle resistance.

No project-specific exception rules. All changes during calibration must be made centrally.
