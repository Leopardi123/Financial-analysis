# PR #516 · next-chat handoff

This file is the durable handoff for continuing work on `docs/tier1-polymetallic-cost-foundation` after the current chat. Always read the current PR head and this file before making changes; do not rely on stale chat hashes.

## Repository / workflow

- Repository: `Leopardi123/Financial-analysis`
- PR: `#516` — `Implement product-based Tier scale policies and polymetallic cost foundation`
- Branch: `docs/tier1-polymetallic-cost-foundation`
- Base: `main`
- PR must remain **draft** and unmerged unless the user explicitly says otherwise.
- User explicitly wants **fewer Vercel deployments**. Prepare and validate a whole batch first, then make **one low-level Git branch update** (`create_blob` → `create_tree` → `create_commit` → `update_ref`) and let that single push create one preview. Do not use file-content writes to update PR metadata. Use `GitHub.update_pull_request` only for PR body/title metadata.

## Mandatory SSOT / reconciliation rules

Any future `project_json_v3` economic change must be reconciled period-for-period to the technical report: exact period count/order and construction/ramp/operations/closure placement, `productionStartPeriod`, CAPEX/closure/WC timing, report metal prices/payabilities/TC-RC/royalties/tax/FX, and report-defined after-tax/pre-tax cash flow. Before calling a Project JSON verified, state report table/page for prices and NPV/IRR, discount rate, NPV report vs JSON + difference, and IRR report vs JSON + difference. If anything is missing, state `Ej verifierad` and the exact blocker. Never guess API series names/keys/content.

No Project JSON economic fixture is changed by the public Cu curve batches described below, so the existing V3 reconciliation remains authoritative.

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

Base 2024 reference deck: Cu 4.16 USD/lb, Au 2,386 USD/oz, Ag 28.27 USD/oz, Mo 21.30 USD/lb. Batch2 adds Co 11.26 USD/lb with Jinchuan 2024 source. Batch3 adds Zn 2,779.02 USD/t with Nexa 2024 Form 20-F source. These are research-price sources only; no API key/series is inferred.

## Public curve status after batch 3

Files:
- `src/lib/tier1/publicCuCostCurve.ts`
- `src/lib/tier1/publicCuCostCurveBatch2.ts`
- `src/lib/tier1/publicCuCostCurveBatch3.ts`
- tests with matching names under `src/lib/tier1/__tests__/`
- `docs/tier1-public-cu-cost-curve-pilot.md`
- `docs/tier1-public-cu-cost-curve-batch2.md`
- `docs/tier1-public-cu-cost-curve-batch3.md`

After Batch3: **29 reviewed, 15 eligible, 14 partial, 1,743,346.633 t contained Cu**. Status must still be `NOT_READY`; Q1/P50/Q3 must be `null`; `comparisonEnabled=false`.

Eligible normalized observations, USD/lb contained Cu:

| Operation | Cost |
| --- | ---: |
| Kounrad | 0.801271 |
| Kamoa-Kakula | 1.602441 |
| Las Bambas | 1.653198 |
| Cozamin | 1.739713 |
| Constancia / Hudbay Peru | 1.799071 |
| Kansanshi | 1.931082 |
| Sentinel | 1.940000 |
| MVC | 2.094806 |
| Çayeli | 2.104130 |
| Centinela | 2.114236 |
| El Roble | 2.413998 |
| Mantos Blancos | 2.788146 |
| Mantoverde | 2.900981 |
| Kinsevere | 2.919331 |
| Copper Mountain | 3.023580 |

Important Batch3 source locks:
- Mantos Blancos: 44,574 t contained Cu; Ag 830 koz; common pool US$289.71414m.
- Mantoverde: 57,707 t contained Cu on 100% basis; Au 9,237 oz; common pool US$384.43835m.
- Cozamin: 24,907 t contained Cu; Ag 1.462 Moz; common pool US$112.81311m.
- Çayeli: 11,491 t Cu + 2,629 t Zn; annual C1 US$49m after US$8m by-product credits => pre-credit pool US$57m; fixed Zn reference price US$2,779.02/t.

Mount Milligan must remain **partial** despite its excellent cost bridge because Centerra explicitly calls the 2024 copper quantity `payable copper produced`; do not relabel it contained Cu. Other current partials include Caraíba, Candelaria, Caserones, Chapada, Antucoya, Zaldívar, Khoemacau, Los Pelambres, Pinto Valley, Lumwana, Quellaveco, Guelb Moghrein and New Afton. Read the batch docs/code for exact blockers; do not midpoint, annualize, double ownership, infer physical quantities or guess product prices to force eligibility.

## Next task

Continue public-disclosure research from **15 toward at least 20 source-complete operations**. Prefer mines with:
1. full-calendar 2024, full-operation contained Cu production;
2. complete physical economic co-product quantities;
3. a decomposable absolute cash-cost-before-by-product pool on the canonical boundary;
4. products already covered by the fixed deck or a separately source-lockable 2024 public reference price.

Do not chase the existing partial rows unless the exact blocker can actually be closed. It is better to add clean new mines. Once >=20 eligible operations are reached, calculate the production-weighted research Q1/P50/Q3 but **do not activate Tier**. First perform a separate sample audit: geographic/operator concentration, weight concentration, denominator consistency, common-pool consistency, sensitivity to fixed price deck, and comparison against the S&P external curve. Only after that should any proposal to replace the current Cu benchmark be made.

## Validation expectation

Before reporting a new batch complete, the single Vercel preview must show the public-curve tests, entire Tier suite, five technical-report cost bridges, `project_json_v3` reconciliation suite, Compare parity, TypeScript and Vite build passing. If a build fails, fix it, but avoid document-only/no-op pushes.
