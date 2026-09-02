# Tier cost position · preview runtime wiring

Status: implementation note for PR #516. Read together with `docs/tier1-cost-position-method-pivot.md`.

## Purpose

The 2026-09-02 methodology pivot is now exposed in the Pre Revenue Tier runtime and modal as **diagnostic evidence only**. This makes the new method user-testable without silently changing the existing Tier gate.

The UI must let the user inspect the mine/report measurement and the reference side by side:

- source-locked project cost and metric;
- verified `costBaseYear` or `Ej verifierad`;
- explicit `costEvidenceClass`;
- public 2024 Cu research reference and Q1/P50/P75;
- raw reference position only when the metric and unit are actually compatible;
- `DIRECT_REFERENCE`, `REFERENCE_ONLY` or `NOT_COMPARABLE`;
- adjusted cost = none;
- hard Cost Tier = none.

## Critical semantic guard

The public Cu curve metric is exactly:

`TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`

A report-defined `C1_CU_USD_PER_LB`, payable-Cu cash cost, by-product cash cost, CuEq cost or other superficially similar metric is **not** automatically that metric. If the source-locked recipe has not explicitly reconstructed the exact public contained-Cu/co-product research definition, runtime returns:

- `comparability = NOT_COMPARABLE`;
- `rawReferencePosition = UNAVAILABLE`;
- the original measured cost remains visible and unchanged;
- no relabelling or implicit conversion is performed.

This guard is intentionally stricter than merely checking that both numbers happen to be expressed in USD/lb.

## Evidence class mapping

For the five technical-report bridge sources already source-locked in PR #516, evidence class is explicit rather than inferred from publication year or project name:

- `vizcachitas-pfs-2023` → `PFS_ESTIMATE`;
- `berg-pfs-2026` → `PFS_ESTIMATE`;
- `warintza-pfs-2025` → `PFS_ESTIMATE`;
- `arctic-fs-2023` → `FS_ESTIMATE`;
- `copper-creek-pea-2023` → `PEA_ESTIMATE`.

Unknown source IDs fail to `UNKNOWN`.

## Runtime path

`api/tier1-pre-revenue.ts` runs the existing source-locked normalization recipes. For normalized Cu recipe outputs it now also creates `assessment.support.costPositionEvidence[]` against `buildPublicCu2024CostPositionReference()`.

This diagnostic is separate from `assessment.gates.cost`. It does not promote or demote Tier and does not alter `classificationReason` except through the pre-existing gate logic. The existing cost-gate migration is a later, explicit task.

## UI path

`src/components/Tier1StatusCell.tsx` renders a new section:

**Kostnadsposition · referensdiagnostik**

The section explicitly states **Påverkar inte Tier-gaten** and shows the project metric, cost, cost base year, evidence class, reference metric/year/boundaries, raw position, comparability, and the fact that no adjusted cost or hard Tier is produced.

A user seeing `Ej jämförbar` should not interpret it as missing implementation. It is the intended result when the technical-report cost definition does not equal the public research metric.

## Why this must not be “fixed” later

The apparent loss of decisiveness is the purpose of the pivot. Do not make the UI more decisive by:

- converting a report cost to the public metric without an explicit source-locked reconstruction;
- CPI/FX rebasing the mine to 2024;
- inferring `costBaseYear` from publication year;
- turning PEA/PFS/FS evidence into `ACTUAL_OPERATION`;
- showing a raw Q1 relation despite metric mismatch;
- wiring this diagnostic directly into Tier.

The next legitimate strengthening step is empirical: measure actual year-to-year cost-position movement and estimate-vs-actual error before proposing any robust-low-cost rule.
