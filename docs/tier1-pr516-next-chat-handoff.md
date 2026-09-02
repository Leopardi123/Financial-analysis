# PR #516 · next-chat handoff

This file is the durable handoff for continuing work on `docs/tier1-polymetallic-cost-foundation`. Always read the current PR head and this file before making changes; do not rely on stale chat hashes.

## Repository / workflow

- Repository: `Leopardi123/Financial-analysis`
- PR: `#516` — `Implement product-based Tier scale policies and polymetallic cost foundation`
- Branch: `docs/tier1-polymetallic-cost-foundation`
- Base: `main`
- PR must remain **draft** and unmerged unless the user explicitly says otherwise.
- User wants **fewer Vercel deployments**. Prepare and validate a whole batch first, then make **one low-level Git branch update** (`create_blob` → `create_tree` → `create_commit` → `update_ref`) and let that single push create one preview. Use PR metadata APIs for PR body/title; do not create document-only/no-op pushes.

## Mandatory SSOT / reconciliation rules

Any future `project_json_v3` economic change must be reconciled period-for-period to the technical report: exact period count/order and construction/ramp/operations/closure placement, `productionStartPeriod`, CAPEX/closure/WC timing, report metal prices/payabilities/TC-RC/royalties/tax/FX, and report-defined after-tax/pre-tax cash flow. Before calling a Project JSON verified, state report table/page for prices and NPV/IRR, discount rate, NPV report vs JSON + difference, and IRR report vs JSON + difference. If anything is missing, state `Ej verifierad` and the exact blocker. Never guess API series names/keys/content.

No Project JSON economic fixture is changed by the public Cu curve batches, so the existing V3 reconciliation remains authoritative.

## Tier architecture already implemented

- `scale.ts`: exact physical-product scale, price-independent. Product identities are strict (`U != U3O8`, `W != WO3`, contained Fe != saleable iron-ore product).
- Active scale thresholds: Au 300 koz/y, Ag 15 Moz/y, Cu 100 kt/y, Zn 150 kt/y, Pb 100 kt/y, Ni 40 kt/y, Pt 100 koz/y, Pd 150 koz/y, Mo 10 kt/y, U3O8 5.0 Mlb/y, WO3 2,000 t/y. Iron ore remains research-only.
- `costAllocation.ts`: fail-closed allocation foundation.
- `costNormalization.ts`: generic report-defined normalization kernel.
- `costNormalizationRecipe.ts`: source-locked reference layer; recipes contain references/semantics/provenance, not duplicate economic series.
- Runtime pre-revenue Tier executes recipes but only lets a cost reach an external benchmark when exact semantic readiness is verified.
- Five technical-report Cu golden bridges: Vizcachitas, Berg, Warintza, Arctic and Copper Creek.

## S&P path

Public evidence proves only the high-level S&P target: Q4-2024 `cash operating costs (C1)`, co-product basis, Paid Copper. Exact current component boundary, co-product price/revenue vector, stream treatment and vintage-restatement methodology remain unavailable behind Capital IQ Pro. Keep the S&P contract fail-closed; do not promote historical SNL methodology into current S&P C1. No generic CPI/implicit FX restatement is allowed.

## Public-disclosure Cu research policy

Research metric: `TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`.

Hard policy:
- `RESEARCH_ONLY`; `comparisonEnabled=false`;
- exact calendar-year 2024 and 100% full-operation basis;
- denominator = contained Cu produced;
- common pool = mining + processing/milling + site G&A/indirect + direct TC/RC/freight/realisation/smelter costs;
- exclude issuer by-product credits, royalties/production taxes, sustaining/deferred stripping capex, corporate G&A, D&A, exploration, financing, hedges and non-routine items;
- allocate by gross contained-metal production value using one fixed public 2024 reference deck;
- streams/hedges/offtakes do not change physical allocation weights;
- no missing co-product can be zeroed and no unsupported product price/quantity can be guessed;
- quartiles are contained-Cu-production weighted;
- reaching >=20 permits research quartiles only, never automatic Tier activation.

Fixed deck: Cu 4.16 USD/lb, Au 2,386 USD/oz, Ag 28.27 USD/oz, Mo 21.30 USD/lb; Co 11.26 USD/lb; Zn 2,779.02 USD/t; Pb 2,072 USD/t. AUD conversions used in research are source-locked to 29Metals' 2024 period-average AU$:US$ 0.660; no API key/series is inferred.

## Public curve status after Batch 5

Files:
- `src/lib/tier1/publicCuCostCurve.ts`
- `src/lib/tier1/publicCuCostCurveBatch2.ts`
- `src/lib/tier1/publicCuCostCurveBatch3.ts`
- `src/lib/tier1/publicCuCostCurveBatch4.ts`
- `src/lib/tier1/publicCuCostCurveBatch5.ts`
- matching tests under `src/lib/tier1/__tests__/`
- `docs/tier1-public-cu-cost-curve-batch5.md`
- `docs/tier1-public-cu-cost-curve-sample-audit.md`

Batch 5 adds two source-complete observations:
- Motheo (Botswana / Sandfire): **1.654106 USD/lb contained Cu**, 49,721 t Cu + 1.929 Moz Ag, Gross C1 common pool US$203m.
- Tritton (Australia / Aeris): **2.784715 USD/lb**, 18.6 kt Cu + 5.3 koz Au + 159 koz Ag, canonical pool A$190.4m × 0.660 = US$125.664m.

Four additional rows remain deliberately partial:
- Riotinto: exact 2024 physical Ag production not source-locked;
- Gibraltar: exact 2024 physical Ag production not source-locked;
- Aitik: physical Cu/Au/Ag known, but absolute pre-byproduct common pool not source-locked because Normal C1 is already net of by-metal revenue;
- MATSA: exact contained 2024 Au production not source-locked.

Unique sample: **38 reviewed, 22 eligible, 16 partial, 1,991,842.546 t contained Cu**.

Production-weighted research curve remains:
- Q1 **1.6531976163511322**
- P50 **1.931082177131546**
- Q3 **2.114235966665641**
- `comparisonEnabled=false`.

## Batch 5 robustness diagnostics

The builder now emits diagnostics because count alone is not a readiness criterion.

Weight concentration:
- largest mine 21.94%
- top 3 49.75%
- top 5 69.57%
- top 10 86.20%

Geography:
- DRC 24.18%
- Chile 21.87%
- Peru 21.18%
- Zambia 20.18%
- Australia 4.10%
- Canada 2.56%
- Botswana 2.50%
- Mexico 1.88%
- Kazakhstan 0.67%
- Turkey 0.58%
- Colombia 0.31%
- DRC+Chile+Peru+Zambia = ~87.41%

Operator concentration:
- Ivanhoe/Zijin 21.94%
- First Quantum 20.76%
- MMG 18.45%
- top three ~61.15%

Equal-mine diagnostic Q1/P50/Q3:
- 1.799071 / 2.094806 / 2.788146

Leave-largest-out (remove Kamoa-Kakula) production-weighted:
- Q1 1.739713
- P50 1.940000
- Q3 2.114236

The Q1 change is material, so the curve remains **NOT ACTIVATION READY**.

## Next task

Do **not** activate Tier. Continue sample broadening with clean source-complete operations specifically outside the dominant DRC/Chile/Peru/Zambia and Ivanhoe/Zijin/FQM/MMG clusters, while tightening common-pool semantics.

Prefer:
1. exact full-calendar 2024 contained Cu;
2. complete physical economic co-product vector;
3. absolute/decomposable pre-by-product common pool;
4. products covered by the fixed deck or separately source-lockable public 2024 prices;
5. underrepresented geographies/operators.

Do not chase existing partials unless the exact blocker can genuinely be closed.

A later activation proposal requires another sample/robustness audit. S&P remains the active external benchmark/cross-check until semantic compatibility and public-sample robustness are adequate.

## Validation expectation

Before reporting Batch 5 complete, one Vercel preview must show Batch5 + prior public-curve tests, full Tier suite, five technical-report bridges, `project_json_v3` reconciliation suite, Compare parity, TypeScript and Vite build passing. If a build fails, fix it with a substantive corrective push only; avoid no-op/document-only deployments.
