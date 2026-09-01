# Tier cost normalization recipes

Status: **explicit source-locked recipe/reference layer implemented; external S&P Cu Cost Tier remains NOT_VERIFIED.**

This layer connects canonical `project_json_v3` economics to the generic cost normalizer without storing a second economic ledger. A recipe contains references, semantic choices and provenance only. It does not contain `seriesUSD`, report numerator totals, copied cost arrays, implicit prices or inflation adjustments.

## Selection contract

A recipe is selected only by the exact `verification.report.sourceId` of a `project_json_v3`. Unknown sources return `NOT_AVAILABLE`; the runtime does not infer a recipe from project name, metal mix, component labels or report type.

Every recipe explicitly states:

- report metric identity and label;
- report basis (`net_by_product`, `co_product`, etc.);
- signed numerator references and their roles;
- denominator identity and target unit;
- report-period scope relative to the canonical timeline;
- source/page provenance;
- report checkpoint selector and tolerance;
- cost base year only when source-locked;
- known source conflicts.

## Canonical references

The resolver may read only canonical Project inputs/outputs: named site-cost components, aggregate site cost, named/aggregate selling costs, report-scenario fiscal deductions, report-locked fiscal items, capital arrays, report-deck metal revenue, stream purchase revenue and physical payable/metal-in-product quantities.

Report-deck metal revenue is recomputed from the canonical Project engine with the exact `verification.report.priceDeckByKey` / `priceDeckSeriesByKey`. No spot price, implicit FX or guessed price key is substituted.

Metal-equivalent denominators require an explicit base product and explicit included-product list. Streamed products are rejected in this path rather than assigning an implicit stream treatment.

## Runtime guard

The runtime sequence is:

`project_json_v3 -> exact source recipe -> canonical report-deck engine -> generic normalization -> report checkpoint reconciliation -> external benchmark readiness -> Cost Tier`

Every stage fails closed. A normalized result can reach the Cu cost gate only when there is exactly one eligible normalized recipe and `assessNormalizedCuC1BenchmarkReadiness()` is `VERIFIED`. Multiple eligible recipes are not ranked or selected implicitly.

Reported cost checkpoints remain evidence/oracles only. They validate the normalized canonical calculation and never replace Project economics.

## Current source-locked recipes

The registry covers ten report-defined metrics across the five Cu golden cases:

| Report source | Recipes | Runtime result |
| --- | --- | --- |
| Vizcachitas PFS 2023 | first-8-year C1; LOM C1 | normalized from mining + processing / produced Cu |
| Berg PFS 2026 | LOM by-product C1; LOM CuEq co-product C1 | normalized from canonical report-deck Project economics |
| Warintza PFS 2025 | LOM C1; LOM sustaining-inclusive cost | normalized with explicit Royal Gold stream references |
| Arctic FS 2023 | LOM cash cost; LOM all-in cost | normalized with exact report labels preserved |
| Copper Creek PEA 2023 | LOM by-product cash cost; LOM AISC | normalized with royalty source conflict preserved |

The recipe registry is deliberately reference-only. Regression tests assert that its serialized form contains neither `seriesUSD` nor `valueUSD`.

## External Cu benchmark status

The project recipe layer does **not** close the remaining S&P benchmark-definition gaps. S&P Cu Cost Tier therefore remains **Ej verifierad** until the exact allocation revenue/price vector, stream treatment where applicable, full current C1 component boundary and project-to-2024 cost-vintage alignment are source-locked.

No project fixture or project economic series is changed by this layer.
