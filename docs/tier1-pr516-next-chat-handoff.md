# PR #516 · next-chat handoff

This is the durable handoff for continuing work on `docs/tier1-polymetallic-cost-foundation`.

## STOP / ACTIVE POLICY · COST QUARTILE IS N/A

**Read `docs/TIER1_COST_QUARTILE_DISABLED_READ_BEFORE_REACTIVATION.md` before doing any more cost-quartile work.**

Decision dated **2026-09-02**:

- Cost Quartile is **N/A** in the pre-revenue Tier engine;
- it is **not an active Tier gate**;
- it must not promote, cap, downgrade, block, or make a Tier result provisional;
- existing cost normalization, cost references and co-product work are retained only as diagnostics/research/evidence;
- do not resume project-by-project co-product adapter work as a way to reactivate the gate;
- the next methodology direction is to strengthen **cycle resistance** as the replacement quality discriminator, but no new formula/threshold is chosen yet and none may be guessed.

The latest audit found that Arctic, Vizcachitas and Copper Creek golden JSONs already contain much of the canonical payable/product/cost economics that a generic reconstruction would need. The runtime bottleneck is partly architectural: `costCoProductReconstruction.ts` currently admits only Berg and Warintza through project-specific branches. If this work is ever resumed, the correct direction is a generic recipe-driven reconstruction from source-locked canonical inputs, not more corporate/project adapters. The external S&P methodology contract also remains unresolved, so a hard quartile gate is not justified.

The active wrapper is `src/lib/tier1/preRevenue.ts`. Historical cost-scoring behavior is retained only in `src/lib/tier1/preRevenueLegacySnapshot.ts` for research/backward-reference. **The active `classifyTier()` must ignore cost unconditionally, even if a caller passes an old populated cost gate.**

## Repository / workflow

- Repository: `Leopardi123/Financial-analysis`
- PR: #516 — `Implement product-based Tier scale policies and polymetallic cost foundation`
- Branch: `docs/tier1-polymetallic-cost-foundation`
- Base: `main`
- Keep PR **draft** and **unmerged** unless the user explicitly says otherwise.
- User wants few Vercel deployments. Prepare a whole batch, then use one low-level Git update (`create_blob` → `create_tree` → `create_commit` → `update_ref`). Do not use contents writes on `main` and do not create no-op/document-only deployment pushes.

## Mandatory Project JSON reconciliation

Any Project JSON economic change must reconcile period-for-period to the technical report: exact period count/order, construction/ramp/operations/closure, `productionStartPeriod`, CAPEX/closure/WC timing, report prices/payabilities/TC-RC/royalties/tax/FX, and report-defined cash flow. Before calling JSON verified, state report table/page for prices and NPV/IRR, discount rate, NPV report vs JSON + difference, IRR report vs JSON + difference. If anything is missing, state `Ej verifierad` and the exact blocker. Never guess API series names/keys/content.

No Project JSON economic series has been changed by the public Cu curve work through Batch 6, by the 2026-09-02 methodology pivot, or by disabling Cost Quartile in Tier scoring.

## Tier architecture already in PR

- physical scale is product-based and price-independent;
- exact product identities (`U != U3O8`, `W != WO3`, contained Fe != saleable iron ore);
- active scale thresholds: Au 300 koz/y, Ag 15 Moz/y, Cu 100 kt/y, Zn 150 kt/y, Pb 100 kt/y, Ni 40 kt/y, Pt 100 koz/y, Pd 150 koz/y, Mo 10 kt/y, U3O8 5.0 Mlb/y, WO3 2,000 t/y;
- `costAllocation.ts`, `costNormalization.ts`, `costNormalizationRecipe.ts` are fail-closed and retained as diagnostics/evidence infrastructure;
- five source-locked technical-report Cu bridges: Vizcachitas, Berg, Warintza, Arctic, Copper Creek;
- S&P public evidence remains an external reference/cross-check; proprietary C1 component/allocation semantics remain unavailable and must not be guessed;
- **Cost Quartile is N/A for Tier scoring**.

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

Read `docs/tier1-cost-position-method-pivot.md` for the reasoning that preceded the later decision to disable cost quartiles entirely in Tier scoring.

The previous trajectory was to build an increasingly precise cost curve and eventually classify technical-report projects by exact percentile. The user challenged that approach: a C1 from a 2022/2023/2026 study is not economically identical to a 2024 actual producer C1, and rebasing the mine to our own common-year model risks measuring our yardstick rather than the mine.

The binding principle remains:

> **Beräkna exakt. Klassificera bara med den precision som underlaget faktiskt bär.**

And:

> **Normalisera definitionen, men normalisera inte ekonomin för att få projektet att passa benchmarken.**

Do not “fix” the resulting apparent imprecision later. It is intentional.

Keep exact semantic/source normalization where useful for diagnostics. Preserve the project/report cost exactly. Carry `costBaseYear` and `costEvidenceClass` separately. Do not CPI-adjust, FX-rebase, invent a common-year C1, or create an arbitrary vintage uncertainty band.

`src/lib/tier1/costPosition.ts` keeps raw, unadjusted reference relations and explicit comparability classes. `adjustedCost=null`, `adjustmentApplied=false`, `hardTier=null` remain intentional.

## Latest architecture audit

The 2026-09-02 audit after reviewing actual golden fixtures/tests established:

- Arctic tests verify direct payable production for Cu/Zn/Pb/Au/Ag and full report reconciliation;
- Vizcachitas stores payable plus metal-in-product Cu/Mo/Ag and full reconciled economics;
- Copper Creek stores PAYABLE_DIRECT Cu/Ag/Mo plus detailed reconciled cost/offsite/royalty economics;
- `costNormalizationRecipe.ts` already has generic references for cost/selling/fiscal/revenue/payable inputs;
- `costCoProductReconstruction.ts` is nevertheless hard-coded to Berg and Warintza adapters.

That means missing project adapters are not proof that the JSON lacks economic data. If cost reconstruction is ever revisited, generalize the runtime around canonical/source-locked recipes. Do not proliferate project-specific adapters.

## Next methodology task

**Strengthen cycle resistance.** Treat this as a fresh methodology audit, not a parameter tweak made to compensate mechanically for removing Cost Quartile.

The current cycle gate is essentially a qualification test: the defined bear scenario must retain positive NPV10. The user wants cycle resistance to carry more of the quality-discrimination role formerly intended for cost quartile.

Do not invent the replacement rule. First inspect the existing historical low-cycle methodology, scenario construction and current project outputs. Then propose/test candidate ways to distinguish genuinely resilient Tier-1 economics from projects that merely remain marginally positive. Any thresholds or Tier bands must be explicit, evidence-backed and regression-tested across known projects rather than selected to reproduce preferred labels.

Cost work is frozen as diagnostics unless the user explicitly chooses to reopen it.

## Validation expectation

Any Tier policy commit must run through one Vercel preview and pass the Tier test chain, prior Batch2–Batch6 regressions, five technical-report bridges, project_json_v3 reconciliation, Compare parity, TypeScript and Vite production build. PR remains draft/unmerged.
