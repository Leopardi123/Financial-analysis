# Tier cost position · preview runtime wiring

Status: implementation note for PR #516. Read together with `docs/tier1-cost-position-method-pivot.md`, `docs/tier1-cu-c1-methodology-evidence.md`, `docs/tier1-cu-c1-methodology-third-pass.md` and `docs/tier1-cu-cost-golden-case-synthesis.md`.

## 2026-09-02 correction: the first preview wiring was too literal

The first preview implementation made project `metric` id equality with the public contained-Cu research metric a hard prerequisite for any raw reference position. That was an implementation error in the preview wiring, not a new methodology decision.

It bypassed the architecture already established by the five golden technical-report bridges. A metric id is a label. Benchmark compatibility must be determined from the source-locked normalized economics: cost basis, denominator product/basis, unit, source conflicts and the external benchmark contract.

The correction restores the older architecture:

`canonical Project economics -> source-locked recipe -> generic report-defined normalization -> semantic compatibility -> dated external reference -> conservative position statement`

The 2026-09-02 method pivot remains binding: no CPI/FX/common-year rewrite of the mine, no invented uncertainty band and no automatic hard percentile from a technical-study estimate.

## Which reference belongs in this runtime diagnostic

The source-locked Cu C1 recipes were designed against the S&P Cu C1 contract. Therefore the runtime diagnostic now uses the actual external reference they are attempting to approach:

- S&P Global Market Intelligence 2024 actual Cu C1 curve;
- co-product basis;
- paid/payable Cu denominator;
- Q1/P50/P75 ≈ 1.40 / 1.76 / 2.18 USD/lb;
- net-revenue pro-rata co-product method verified only at high level.

The separate 23-mine public curve remains a distinct research distribution:

- metric `TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`;
- contained Cu denominator;
- Q1/P50/P75 = 1.6531976 / 1.9310822 / 2.1142360 USD/lb;
- `RESEARCH_ONLY`.

It must not silently replace S&P in the source-locked C1 recipe diagnostic. Conversely, an S&P-compatible payable-Cu recipe must not be relabelled as the contained-Cu public metric.

## Semantic compatibility guard

`assessSAndPCuRawReferenceCompatibility()` evaluates the normalized output itself. A raw S&P reference position requires all of the following high-level structural facts:

- metric is Cu C1 (`C1_CU_USD_PER_LB`);
- cost basis is `co_product`;
- denominator product is exact Cu;
- denominator basis is payable primary metal;
- denominator/output units are lb / USD/lb;
- no unresolved source conflicts.

These conditions are deliberately narrower than the complete proprietary S&P contract. Passing them means only **structurally compatible enough to show an unadjusted raw contextual relation**. It does not mean the exact S&P methodology is verified.

If they fail, runtime returns `NOT_COMPARABLE` and lists the actual semantic blockers. It no longer says `Metric mismatch` merely because an internal project metric id differs from the public research-curve id.

## Remaining S&P limitations

The older S&P research remains authoritative. Public evidence supports paid/payable Cu and high-level net-revenue pro-rata co-product allocation, but the following remain unresolved:

- exact 2024 S&P allocation revenue/price vector;
- full current S&P C1 component boundary;
- stream/hedge/offtake treatment where applicable;
- a general S&P-compatible cost-vintage restatement method.

Accordingly the runtime S&P reference is diagnostic/reference-only. Even a structurally compatible PFS/FS C1 may show a raw Q1/P50/P75 relation while remaining `REFERENCE_ONLY`. It cannot set `hardTier`.

## Golden-case expectations

The preview must regression-lock the distinctions already documented:

- **Berg by-product C1**: `NOT_COMPARABLE` to S&P co-product C1 because the cost basis is by-product/net-credit, regardless of its very low or negative numeric value.
- **Berg CuEq co-product C1**: does not fail merely because of the old contained-Cu metric id; it proceeds to semantic checks and is blocked by CuEq/metal-equivalent denominator semantics.
- **Warintza C1**: does not fail on the string `C1_CU_USD_PER_LB`; that metric is the S&P contract metric. Its actual blockers include by-product rather than co-product basis, missing verified cost base year, stream treatment and unresolved external-contract fields.
- A future source-locked **co-product payable-Cu C1** can show an unadjusted raw S&P position. If it is a 2026 PFS against 2024 actual, the result remains `REFERENCE_ONLY`; no synthetic 2024 cost is created.

## UI contract

`Kostnadsposition · referensdiagnostik` remains diagnostic only. It shows:

- source-locked recipe;
- project cost and project metric;
- cost base year;
- evidence class;
- reference year/denominator/metric and Q1/P50/P75;
- raw position only when structural semantics permit it;
- comparability state;
- adjusted cost = none;
- hard Cost Tier = none;
- explanatory reason with semantic and/or contextual blockers.

The separate `Kostnadskurva · Cu` section continues to show the S&P benchmark source and its public evidence. The diagnostic and the benchmark are now aligned to the same external basis; the contained-Cu public curve remains research evidence elsewhere in the PR.

## Anti-regression rule

Do not reintroduce either of these shortcuts:

1. `project.metric === reference.metricId` as the sole compatibility test; or
2. “both are USD/lb, therefore comparable”.

The correct test is the source-locked semantic chain established by the golden cases. Metric identity is one semantic fact among several, not a substitute for the chain.
