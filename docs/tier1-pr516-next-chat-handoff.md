# PR #516 · next-chat handoff

This is the durable handoff for continuing work on `docs/tier1-polymetallic-cost-foundation`.

## Repository / workflow

- Repository: `Leopardi123/Financial-analysis`
- PR: #516 — `Implement product-based Tier scale policies and polymetallic cost foundation`
- Branch: `docs/tier1-polymetallic-cost-foundation`
- Base: `main`
- Keep PR **draft** and **unmerged** unless the user explicitly says otherwise.
- User wants few Vercel deployments. Prepare a whole batch, then use one low-level Git update (`create_blob` → `create_tree` → `create_commit` → `update_ref`). Do not use contents writes on `main` and do not create no-op/document-only deployment pushes.

## Mandatory Project JSON reconciliation

Any Project JSON economic change must reconcile period-for-period to the technical report: exact period count/order, construction/ramp/operations/closure, `productionStartPeriod`, CAPEX/closure/WC timing, report prices/payabilities/TC-RC/royalties/tax/FX, and report-defined cash flow. Before calling JSON verified, state report table/page for prices and NPV/IRR, discount rate, NPV report vs JSON + difference, IRR report vs JSON + difference. If anything is missing, state `Ej verifierad` and the exact blocker. Never guess API series names/keys/content.

No Project JSON economic series has been changed by the public Cu curve work through Batch 6 or by the 2026-09-02 methodology pivot.

## Tier architecture already in PR

- physical scale is product-based and price-independent;
- exact product identities (`U != U3O8`, `W != WO3`, contained Fe != saleable iron ore);
- active scale thresholds: Au 300 koz/y, Ag 15 Moz/y, Cu 100 kt/y, Zn 150 kt/y, Pb 100 kt/y, Ni 40 kt/y, Pt 100 koz/y, Pd 150 koz/y, Mo 10 kt/y, U3O8 5.0 Mlb/y, WO3 2,000 t/y;
- `costAllocation.ts`, `costNormalization.ts`, `costNormalizationRecipe.ts` are fail-closed;
- five source-locked technical-report Cu bridges: Vizcachitas, Berg, Warintza, Arctic, Copper Creek;
- S&P public evidence remains an external reference/cross-check; proprietary C1 component/allocation semantics remain unavailable and must not be guessed.

## Public Cu research curve after Batch 6

Research metric: `TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`.

Hard observation policy remains exact calendar 2024, 100% full-operation basis, contained Cu produced denominator, source-complete physical co-products, decomposable pre-by-product common pool, fixed public 2024 product-value allocation deck, no guessed quantity/price/FX/ownership, and fail-closed partials.

Current sample:
- 41 reviewed;
- 23 eligible;
- 18 partial;
- 2,017,969.466 t contained Cu;
- production-weighted Q1 1.6531976163511322;
- P50 1.9310821771315465;
- Q3 2.114235966665641 USD/lb contained Cu;
- largest observation 21.66%; top 3 49.11%; top 5 68.67%; top 10 85.08%;
- equal-mine Q1/P50/Q3 1.799071 / 2.094806 / 2.788146;
- leave-largest-out 1.739713 / 1.940000 / 2.114236;
- `comparisonEnabled=false` / research-only.

Batch 6 added Mount Milligan as source-complete: 2024 technical report historical table gives 57.6 Mlb contained Cu + 171.9 koz Au on 100% production basis; common pool US$316.5m; normalized public research cost 2.026319 USD/lb contained Cu. Mount Polley, Red Chris and Robinson remain fail-closed.

## IMPORTANT METHOD PIVOT · 2026-09-02

Read `docs/tier1-cost-position-method-pivot.md` before doing more cost-position work.

The previous trajectory was to build an increasingly precise cost curve and eventually classify technical-report projects by exact percentile. The user challenged that approach: a C1 from a 2022/2023/2026 study is not economically identical to a 2024 actual producer C1, and rebasing the mine to our own common-year model risks measuring our yardstick rather than the mine.

The binding new principle is:

> **Beräkna exakt. Klassificera bara med den precision som underlaget faktiskt bär.**

And:

> **Normalisera definitionen, men normalisera inte ekonomin för att få projektet att passa benchmarken.**

Do not “fix” the resulting apparent imprecision later. It is intentional.

### What this means

Keep exact semantic/source normalization. Preserve the project/report cost exactly. Carry `costBaseYear` and `costEvidenceClass` separately. Do not CPI-adjust, FX-rebase, invent a common-year C1, or create an arbitrary vintage uncertainty band.

New module: `src/lib/tier1/costPosition.ts`.

Evidence classes:
- `ACTUAL_OPERATION`
- `FS_ESTIMATE`
- `PFS_ESTIMATE`
- `PEA_ESTIMATE`
- `OTHER_ESTIMATE`
- `UNKNOWN`

The new layer returns the unadjusted raw relation to a reference curve:
- `BELOW_Q1_REFERENCE`
- `Q1_TO_P50_REFERENCE`
- `P50_TO_Q3_REFERENCE`
- `ABOVE_Q3_REFERENCE`

Comparability is explicit:
- `DIRECT_REFERENCE`
- `REFERENCE_ONLY`
- `NOT_COMPARABLE`

The module always returns `adjustedCost=null`, `adjustmentApplied=false`, `hardTier=null`.

`buildPublicCu2024CostPositionReference()` exposes the current Batch-6 public curve as `RESEARCH_ONLY`, `activationAllowed=false`. A Crean-Hill-like 2026 PFS may therefore show that an unadjusted project cost is below the 2024 Q1 reference, but it must remain `REFERENCE_ONLY`; it is not rebased to 2024 and does not become Cost Tier 1.

### Why this pivot exists

Technical-study estimates vs operating actuals, cost vintage, energy/labour/reagent/freight/TC-RC regimes and geography can move costs independently of underlying mine quality. Exact arithmetic does not imply exact classification. The public curve is now primarily a definitions-controlled reference distribution, not a promise of a precise universal percentile.

### What would justify stronger classification later

Do empirical work first: year-to-year cost-position movement for the same operating mines, and where possible study-estimate vs later actual cost errors. Only then may a robust-low-cost distance/tolerance be proposed. Do not invent ±x% in advance.

## Next task after this pivot

Do not immediately resume Batch 7 sampling. First validate the new method layer and then inspect where existing Tier/runtime cost logic still implicitly treats technical-study costs as hard percentile evidence. Any change to active gates should be fail-closed and explicit; do not silently weaken or strengthen current Tier classifications.

After the method is integrated safely, continue sample broadening only where it improves reference quality (underrepresented geographies/operators, clean common-pool semantics). The goal is no longer to accumulate observations just to create more decimal precision.

## Validation expectation

Any method-pivot commit must run through one Vercel preview and pass the Tier test chain, including the new cost-position regression, prior Batch2–Batch6 regressions, five technical-report bridges, project_json_v3 reconciliation, Compare parity, TypeScript and Vite production build. PR remains draft/unmerged.
