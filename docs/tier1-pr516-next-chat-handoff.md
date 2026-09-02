# PR #516 · next-chat handoff

This file is the durable handoff for continuing work on `docs/tier1-polymetallic-cost-foundation`. Always read the current PR head and this file before making changes; do not rely on stale chat hashes.

## Repository / workflow

- Repository: `Leopardi123/Financial-analysis`
- PR: `#516` — `Implement product-based Tier scale policies and polymetallic cost foundation`
- Branch: `docs/tier1-polymetallic-cost-foundation`
- Base: `main`
- PR must remain **draft** and unmerged unless the user explicitly says otherwise.
- User explicitly wants **fewer Vercel deployments**. Prepare and validate a whole batch first, then make **one low-level Git branch update** (`create_blob` → `create_tree` → `create_commit` → `update_ref`) and let that single push create one preview. Do not use file-content writes to update PR metadata. Use `GitHub.update_pull_request` only for PR body/title metadata.

## Mandatory SSOT / reconciliation rules

Any future `project_json_v3` economic change must be reconciled period-for-period to the technical report: exact period count/order and construction/ramp/operations/closure placement, `productionStartPeriod`, CAPEX/closure/WC timing, report metal prices/payabilities/TC-RC/royalties/tax/FX, and report-defined after-tax/pre-tax cash flow. Before calling a Project JSON verified, state report table/page for prices and NPV/IRR, discount rate, NPV report vs JSON + difference, and IRR report vs JSON + difference. If anything is missing, state `Ej verifierad` and the exact blocker. Never guess API series names/keys/content.

No Project JSON economic fixture is changed by the public Cu curve batches, so the existing V3 reconciliation remains authoritative.

## Tier architecture already implemented

- `scale.ts`: generic exact physical-product scale, price-independent. Product identities are strict (`U != U3O8`, `W != WO3`, contained Fe != saleable iron-ore product).
- Active scale thresholds: Au 300 koz/y, Ag 15 Moz/y, Cu 100 kt/y, Zn 150 kt/y, Pb 100 kt/y, Ni 40 kt/y, Pt 100 koz/y, Pd 150 koz/y, Mo 10 kt/y, U3O8 5.0 Mlb/y, WO3 2,000 t/y. Iron ore remains research-only.
- `costAllocation.ts`: explicit fail-closed allocation foundation.
- `costNormalization.ts`: generic report-defined normalization kernel.
- `costNormalizationRecipe.ts`: source-locked reference layer; recipes contain references/semantics/provenance, not duplicate economic series.
- Runtime pre-revenue Tier executes recipes but only lets a cost reach an external benchmark when exact semantic readiness is verified.
- Five technical-report Cu golden bridges exist: Vizcachitas, Berg, Warintza, Arctic and Copper Creek.

## S&P path

The public evidence proves only the high-level target: S&P Q4-2024 `cash operating costs (C1)`, co-product basis, Paid Copper. Exact current C1 component boundary, exact co-product revenue/price vector, stream treatment and general vintage-restatement methodology remain unavailable behind Capital IQ Pro. Keep the S&P contract fail-closed. Do not promote historical SNL TCC methodology into current S&P C1. No generic CPI/FX restatement is allowed; current vintage guard permits exact benchmark-year equality only.

Relevant docs:
- `docs/tier1-cu-c1-methodology-third-pass.md`
- `docs/tier1-sp-cu-c1-methodology-query.md`
- `docs/tier1-cu-cost-golden-case-synthesis.md`
- `docs/tier1-cost-normalization-recipes.md`

## Public-disclosure Cu cost curve policy

Research metric: `TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`.

Hard policy:
- `RESEARCH_ONLY`; `comparisonEnabled=false`.
- exactly calendar-year 2024 and 100% full-operation basis;
- denominator = contained Cu produced;
- common cash pool = mining + processing/milling + site G&A/indirect + direct TC/RC/freight/realisation/smelter costs;
- exclude issuer by-product credits, royalties/production taxes, sustaining/deferred stripping capex, corporate G&A, D&A, exploration, financing, hedges and non-routine cost;
- allocate common pool by gross **contained-metal production value** using one fixed public 2024 reference deck;
- streams/hedges/offtakes do not alter physical allocation weights;
- no missing co-product can be set to zero and no unsupported product can receive a guessed price;
- research quartiles are contained-Cu-production weighted;
- at least 20 source-complete operations are required before Q1/P50/Q3 are emitted; even then `comparisonEnabled` stays false pending a separate sample/activation audit.

Base 2024 reference deck: Cu 4.16 USD/lb, Au 2,386 USD/oz, Ag 28.27 USD/oz, Mo 21.30 USD/lb. Batch2 adds Co 11.26 USD/lb. Batch3 adds Zn 2,779.02 USD/t. Batch4 adds Pb 2,072 USD/t from 29Metals' 2024 Annual Financial Report. These are research-price sources only; no API key/series is inferred.

## Public curve status after Batch 4

Files:
- `src/lib/tier1/publicCuCostCurve.ts`
- `src/lib/tier1/publicCuCostCurveBatch2.ts`
- `src/lib/tier1/publicCuCostCurveBatch3.ts`
- `src/lib/tier1/publicCuCostCurveBatch4.ts`
- matching tests under `src/lib/tier1/__tests__/`
- `docs/tier1-public-cu-cost-curve-pilot.md`
- `docs/tier1-public-cu-cost-curve-batch2.md`
- `docs/tier1-public-cu-cost-curve-batch3.md`
- `docs/tier1-public-cu-cost-curve-batch4.md`
- `docs/tier1-public-cu-cost-curve-sample-audit.md`

Batch4 adds three new clean operations and closes two prior source blockers:

| Operation | Normalized research cost USD/lb contained Cu |
| --- | ---: |
| New Afton | 1.878743 |
| CSA Copper Mine | 2.035203 |
| Bolivar | 2.337139 |
| Golden Grove | 2.998272 |
| Zaldívar | 3.020000 |

New Afton supersedes its prior missing-silver `PARTIAL`; the NI 43-101 Table 6-1 source-locks 2024 Cu 54.0 Mlb, Au 71,550 oz and Ag 144,741 oz. Zaldívar supersedes its prior attributable-basis `PARTIAL`; Antofagasta explicitly states the reported 40.1 kt is its 50% share, so full-operation 80.2 kt is an exact source-defined transformation rather than guessed ownership scaling.

Unique sample after Batch4: **32 reviewed, 20 eligible, 12 partial, 1,923,521.546 t contained Cu**.

The count threshold is now met and `buildBatch4PublicCuPilotCurve()` emits:
- status `RESEARCH_CURVE_READY`;
- Q1 max **1.6531976163511322** USD/lb (Las Bambas threshold);
- P50 max **1.931082177131546** USD/lb (Kansanshi threshold);
- Q3 max **2.114235966665641** USD/lb (Centinela threshold);
- **`comparisonEnabled=false` remains mandatory.**

## Batch4 source locks

- **CSA:** 41,128 t Cu + 114.0 koz Ag; C1 before by-product credits US$186.112m; royalties/sustaining separately excluded.
- **Bolivar:** 27.454 Mlb Cu + 812 koz Ag + 13,424 oz Au; common pool US$95.055m = total cash cost + T&R + selling + site G&A, excluding US$0.760m finished-inventory variation and sustaining capital.
- **Golden Grove:** Cu 21.9 kt, Zn 56.7 kt, Au 21.4 koz, Ag 822 koz, Pb 0.91 kt; mining+processing+site G&A+transport+TCRC A$474.6m; explicit FY average USD:AUD 0.660 -> US$313.236m. Stockpile movement, by-products, royalties and capital excluded. Pb fixed research price US$2,072/t is source-locked from the same 2024 Annual Financial Report.
- **New Afton:** technical-report production vector above; common pool US$160.7m operating expenses + US$19.7m T&R = US$180.4m before silver credit and excluding sustaining/reclamation.
- **Zaldívar:** pure Cu SX-EW; source states 50% attributable 40.1 kt and cash cost US$3.02/lb copper produced; full-operation denominator 80.2 kt and common pool scaled by the same explicit factor.

## Sample / activation audit result

The separate audit concludes **NOT ACTIVATION READY** even though the research curve has reached 20 observations.

Main blockers:
- weight concentration: largest mine 22.7%, top 3 51.5%, top 5 72.0%, top 10 89.0%;
- geography: DRC/Chile/Peru/Zambia together ~90.5% of contained-Cu weight;
- operator concentration: Ivanhoe/Zijin ~22.7%, First Quantum ~21.5%, MMG ~19.1%;
- residual common-pool/inventory-treatment heterogeneity across issuer disclosures.

Denominator consistency passes for emitted rows: all are contained Cu produced; payable/sold/unsupported cases remain fail-closed.

Fixed-deck sensitivity cross-check against 29Metals' public 2024 market-price table is tiny at the three current quartile threshold mines: Las Bambas -0.006%, Kansanshi -0.047%, Centinela -0.052%; threshold identities do not change.

S&P external cross-check remains semantically non-comparable: public research Q1/P50/Q3 = 1.653/1.931/2.114 vs S&P digitised 1.40/1.76/2.18, but S&P is Paid Copper and proprietary component/allocation semantics are still unavailable. Do not interpret the numerical gap as an error in either curve.

## Next task

Do **not** activate Tier. Broaden the sample beyond 20 with clean source-complete mines specifically to reduce mine/operator/geographic concentration and test common-pool consistency. Prefer operations that add underrepresented geographies/operators and have absolute, decomposable pre-by-product pools with exact contained-metal production vectors. Continue keeping existing partials fail-closed unless the exact blocker can genuinely be closed.

A later activation proposal requires a second audit after sample broadening. Until then, the S&P Cu curve remains the active external benchmark/cross-check and the public curve remains research-only.

## Validation expectation

Before reporting Batch4 complete, the single Vercel preview must show Batch4 plus prior public-curve tests, entire Tier suite, five technical-report cost bridges, `project_json_v3` reconciliation suite, Compare parity, TypeScript and Vite build passing. If a build fails, fix it, but avoid document-only/no-op pushes.
