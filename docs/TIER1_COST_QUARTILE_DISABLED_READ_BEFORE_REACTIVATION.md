# TIER COST QUARTILE IS DISABLED — READ THIS BEFORE REACTIVATION

**Status: INACTIVE / N/A in the Tier engine from 2026-09-02.**

Cost quartile must not affect `Tier 1 / Tier 2 / Tier 3 / Not qualified` until the methodological problems below are solved generically and evidenced well enough to survive technical-report differences. The current cost-normalization, cost-position and co-product files remain in the repository as research/diagnostic infrastructure only.

## Why this was disabled

The attempt to make technical-report C1/AISC comparable to an external S&P cost curve exposed a structural mismatch that is larger than a missing formula or flag.

1. Technical reports publish different cost definitions: C1, cash cost, by-product cash cost, co-product C1, CuEq cost, all-in cost/AISC and issuer-specific variants.
2. Denominators differ: produced metal, payable metal and metal-equivalent units are all used.
3. Co-product allocation requires both a source-locked common pre-credit cost pool and a source-locked economic allocation vector by product. The generic arithmetic is easy; proving those inputs without introducing our own economic assumptions is not.
4. Study estimates are published in different cost vintages and are not the same population as operating-mine actuals. Repricing or CPI-rebasing would increasingly measure our normalization model rather than the mine described by the report.
5. The external S&P 2024 Cu curve is known to be co-product C1 on paid/payable Cu, but the exact current allocation revenue vector, full component boundary, stream treatment and vintage-normalization method are not publicly verified. That is insufficient for a hard Tier gate.

The methodology decision is therefore: **normalize definitions where the report supports it, but do not normalize the economics into a synthetic common vintage. Preserve report costs as diagnostics; do not classify Tier from cost quartiles.**

## Important audit finding: the JSONs were not the main problem

Golden `project_json_v3` fixtures already contain much more usable information than the first co-product implementation consumed.

- **Arctic**: direct payable Cu/Zn/Pb/Au/Ag series, report prices, source-locked site-cost components and aggregate offsite costs. The golden test reconciles the FS and period FCFF.
- **Vizcachitas**: both payable and metal-in-product Cu/Mo/Ag series, explicit payability basis, detailed site and selling/payability costs, and a fully reconciled PFS cash-flow fixture.
- **Copper Creek**: direct payable Cu/Ag/Mo, report prices, mining/processing/G&A, TC/RC/penalties, transport and royalty evidence, with reconciled period FCFF. A separate source conflict in the cost recipe remains real and must not be bypassed.
- **Berg**: strongest co-product evidence because Table 22-4 publishes product-level net revenue; runtime reconstruction produced about 1.92336 USD/lb payable Cu co-product C1.
- **Warintza**: runtime reconstruction produced about 1.81 USD/lb using report-deck retained product revenue plus explicit Royal Gold stream purchase revenue, with limitations documented.

The implementation in `src/lib/tier1/costCoProductReconstruction.ts` was nevertheless explicitly source-ID gated to Berg and Warintza. It therefore made the system look as if Arctic/Vizcachitas/Copper Creek lacked fundamental data when much of that data already existed in canonical project economics and golden tests.

## What a future fix should look like

Do **not** add more `if reportSourceId === ...` project adapters as the primary architecture.

A future reactivation should be recipe-driven and generic:

`canonical project economics -> source-locked common cost pool -> source-locked product economic vector -> generic co-product allocation -> payable denominator -> dated external reference`

Project-specific code should be limited to evidence mapping or genuinely unique contractual economics. Berg's published product net-revenue table can remain a higher-quality evidence path; it should not define the generic arithmetic.

Before reactivation, prove at minimum:

- the generic common-pool recipe can express required report cost boundaries without silently including/excluding material items;
- product allocation vectors can be produced from canonical report-deck economics without guessed prices, FX, payabilities, TC/RC, royalties or stream assumptions;
- denominator semantics are explicit and source-locked;
- unresolved source conflicts fail closed;
- AISC/all-in metrics are never silently transformed into C1;
- the external benchmark contract is sufficiently known to support a hard Tier interpretation;
- study-estimate vs operating-actual and cost-vintage comparability are handled without synthetic repricing that replaces mine economics with our own model;
- golden regression tests cover Berg, Warintza, Arctic, Vizcachitas and Copper Creek through the same generic path where evidence permits it.

## Active Tier policy after disabling cost quartile

Cost Quartile = **N/A / inactive**.

It must not:

- block Tier 1,
- lower Tier 1 to Tier 2/3,
- make Tier 2 provisional,
- or make an otherwise classifiable project `NOT_VERIFIED`.

The active Tier classification is based on **LOM, physical production scale, cycle resistance and capital returns**. The next methodology work should strengthen **cycle resistance** rather than substitute an unproven cost-quartile precision.

Cost normalization/reference panels may remain visible as research diagnostics, but must be clearly labelled as non-scoring and must never feed the active Tier result while this policy is in force.

## Where the dormant work lives

Start here when revisiting the problem:

- `docs/TIER1_COST_QUARTILE_DISABLED_READ_BEFORE_REACTIVATION.md` — this decision and restart checklist.
- `src/lib/tier1/preRevenue.ts` — active policy wrapper; Cost Quartile is N/A here.
- `src/lib/tier1/preRevenueLegacySnapshot.ts` — pre-disable Tier implementation retained for research compatibility.
- `src/lib/tier1/costCoProductReconstruction.ts` — current Berg/Warintza source-locked reconstruction prototype.
- `src/lib/tier1/costNormalizationRecipe.ts` — generic source-locked recipe machinery that is the more promising foundation.
- `docs/tier1-coproduct-runtime-reconstruction.md` — implemented Berg/Warintza path.
- `docs/tier1-cu-cost-golden-case-synthesis.md` — five-project synthesis.
- `docs/tier1-cost-position-method-pivot.md` — decision not to synthesize a common cost vintage.
- `docs/tier1-pr516-next-chat-handoff.md` — broader PR #516 handoff.

**Do not reactivate Cost Quartile merely because a cost value can be calculated. The missing proof is comparability, not arithmetic.**
