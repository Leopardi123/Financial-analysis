# PR #516 · next-chat handoff

This is the durable handoff for `docs/tier1-polymetallic-cost-foundation`. Always read current PR head and this file before changes.

## Repository / workflow
- Repository: `Leopardi123/Financial-analysis`
- PR #516: `Implement product-based Tier scale policies and polymetallic cost foundation`
- Branch: `docs/tier1-polymetallic-cost-foundation`; base `main`.
- Keep PR **draft and unmerged** unless user explicitly says otherwise.
- Minimize Vercel deployments: prepare a whole batch, then one low-level `create_blob -> create_tree -> create_commit -> update_ref` push. PR body/title updates use PR metadata APIs only. Never create no-op/document-only pushes.

## Mandatory SSOT / reconciliation rules
Any `project_json_v3` economic change must match its technical report period-for-period: exact timeline and productionStartPeriod, CAPEX/closure/WC placement, report prices/payabilities/TC-RC/royalties/tax/FX and report-defined cash flow. Before calling JSON verified, state report table/page for prices and NPV/IRR, discount rate, NPV report vs JSON + difference and IRR report vs JSON + difference. If anything is missing: `Ej verifierad` and exact blocker. Never guess API series names/keys/content.

The public Cu-curve batches do **not** change Project JSON economics; existing V3 reconciliations remain authoritative.

## Tier foundation
- Scale is exact physical-product and price-independent; strict identities (`U != U3O8`, `W != WO3`, contained Fe != saleable iron ore).
- Cost allocation/normalization is fail-closed and source-locked.
- Five technical-report Cu golden bridges remain: Vizcachitas, Berg, Warintza, Arctic, Copper Creek.
- S&P Q4-2024 remains the active external Cu reference/cross-check. Public evidence establishes C1/co-product/Paid Copper only; proprietary component/allocation semantics remain unavailable, so exact S&P compatibility stays fail-closed.

## Public Cu research contract
Metric: `TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`.

Hard policy: RESEARCH_ONLY; `comparisonEnabled=false`; exact calendar 2024; 100% full-operation; denominator contained Cu produced; common pool mining + processing + site G&A + direct TC/RC/freight/realisation/smelter before by-product credits; exclude royalties/production tax, sustaining/deferred stripping capex, corp G&A, D&A, exploration, financing, hedges and non-routine items; allocate by gross contained-metal production value using one fixed 2024 deck. Never zero missing co-products, relabel payable/sold as contained, annualize partial periods, guess ownership, FX, prices or API keys.

Fixed deck: Cu 4.16 USD/lb; Au 2,386 USD/oz; Ag 28.27 USD/oz; Mo 21.30 USD/lb; Co 11.26 USD/lb; Zn 2,779.02 USD/t; Pb 2,072 USD/t. Source-locked research AUD/USD 2024 = 0.660.

## Status after Batch 6
Batch 5 had 38 reviewed / 22 eligible / 16 partial / 1,991,842.546 t contained Cu. Batch 6 reviews four North American operations and genuinely closes the prior Mount Milligan blocker.

**Mount Milligan (Canada / Centerra) becomes eligible:** 2025 Technical Report Table 1-1 source-locks 2024 on 100% production basis at 57.6 Mlb contained Cu + 171.9 koz Au. Centerra FY2024 reconciliation source-locks US$306.3m production + US$10.2m third-party smelting/refining/transport before separately reported credits = US$316.5m common pool. Fixed-deck normalized research cost = **2.0263188755887858 USD/lb contained Cu**.

New partials remain fail-closed:
- Mount Polley: net cash cost includes by-product/other revenues; absolute pre-credit pool not source-locked.
- Red Chris: attributable 30% disclosure plus net by-product/other revenue; exact 100% physical vector + canonical pre-credit pool not jointly source-locked.
- Robinson: payable-Cu C1 after by-product value; mine-level contained vector + absolute pre-credit pool not source-locked.

Mount Milligan supersedes its old partial. Expected unique Batch6 sample: **41 reviewed / 23 eligible / 18 partial / 2,017,969.466 t contained Cu**. Weight concentration becomes approximately largest 21.66%, top3 49.11%, top5 68.67%, top10 85.08%. Builder/test recomputes weighted Q1/P50/Q3, equal-mine and leave-largest-out diagnostics. Regardless of values, `comparisonEnabled=false` is mandatory.

Files added/updated for Batch6:
- `src/lib/tier1/publicCuCostCurveBatch6.ts`
- `src/lib/tier1/__tests__/publicCuCostCurveBatch6.test.ts`
- `src/lib/tier1/__tests__/costBenchmarkBasis.test.ts` imports Batch6 test chain
- `docs/tier1-public-cu-cost-curve-batch6.md`
- this handoff

## Next task
Do not activate Tier. After Batch6 preview is green, use its logged exact diagnostics in PR metadata. Then continue broadening outside DRC/Chile/Peru/Zambia and Ivanhoe/Zijin/FQM/MMG, prioritizing exact contained production, complete physical co-product vectors, decomposable absolute pre-credit pools and underrepresented operators/geographies. Do not chase partials unless the exact blocker can actually be closed.

## Validation expectation
One Batch6 preview must pass Batch2-6 public curve tests, full Tier suite, five technical-report bridges, full `project_json_v3` reconciliation suite, Compare parity, TypeScript and Vite build. If it fails, make only a substantive corrective push.
