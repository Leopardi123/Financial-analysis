# Arctic FS 2023 — Cu cost bridge audit

Status: **REPORT COST BRIDGE VERIFIED / S&P CO-PRODUCT TIER NOT VERIFIED**

This note locks the source-derived Arctic cost semantics used by Compare Stocks → Pre Revenue Tier. It does not change project economics and does not promote the reported Arctic cost metrics to S&P-compatible C1.

## Source basis

Arctic NI 43-101 Feasibility Study, effective January 20, 2023.

Key report locations:

- Section 22.3 p.388: three construction years, 13 production years, real-dollar model, relative Year -3 as model base year, no escalation after that relative base.
- Table 22-1 p.389: LOM payable Cu/Zn/Pb/Au/Ag.
- Table 22-2 pp.390-391: recovered metal values, aggregate off-site cost, on-site cost, capital expenditure, 0.72 cash cost and 1.61 all-in cost.
- Table 22-3 p.392: post-tax NPV/IRR.
- Table 22-4 pp.393-394: annual production/cash-flow rows.
- Sections 19.4-19.7 pp.331-332: concentrate payabilities, TC/RC, penalties, transport, insurance, marketing/representation assumptions.

## Report cost identities

Table 22-2 reports:

- recovered metal value: Cu US$7,055.0m; Pb US$334.8m; Zn US$2,580.3m; Au US$697.8m; Ag US$757.0m; total US$11,424.9m;
- aggregate off-site operating costs: US$2,969.1m, explicitly including royalties, refining/treatment, penalties, insurance, marketing/representation and concentrate transportation;
- on-site operating costs: US$2,793.6m;
- payable Cu: 1,932.882m lb;
- initial capital US$1,176.8m; sustaining US$114.4m; closure/reclamation US$428.4m; total capital US$1,719.6m.

The reported **Cash Costs, Net of By-product Credits = 0.72 US$/lb Cu payable** reconstructs as:

```text
(onsite + offsite - Pb value - Zn value - Au value - Ag value) / payable Cu
= (2,793.6 + 2,969.1 - 334.8 - 2,580.3 - 697.8 - 757.0) / 1,932.882
= 0.720582 US$/lb payable Cu
```

This confirms the metric is an explicit **net-by-product** construction on payable Cu. It is not an S&P co-product C1 metric.

## All-in cost identity

Table 22-2 reports **All-in Cost, Net of By-product Credits = 1.61 US$/lb Cu payable** and footnotes that all-in cost includes all operating and sustaining capital costs.

The published table totals mathematically reproduce 1.61 only when the full reported capital total is added:

```text
(cash-cost numerator + total capital expenditure) / payable Cu
= 1.610238 US$/lb payable Cu
```

Adding sustaining capital alone produces only about **0.779780 US$/lb**.

Therefore the exact FS label must remain **All-in Cost, Net of By-product Credits**. The Tier engine must not silently rename 1.61 as conventional AISC. The apparent difference between the footnote wording and the arithmetic is preserved as source evidence rather than “corrected” by assumption.

## Co-product diagnostic

Arctic publishes a complete gross recovered-metal-value vector. If the same operating-cost pool were mechanically allocated by **gross metal value**, Cu's share would be about **61.7511%** and the diagnostic Cu cost would be about **1.84105 US$/lb payable Cu**.

This is intentionally not used for Tier. The benchmark contract requires **net-revenue pro-rata**, while Arctic's economic tables publish the off-site cost as one aggregate. Sections 19.4-19.7 disclose detailed concentrate commercial terms, but the canonical FS evidence does not expose an exact annual product-level net-revenue vector after all concentrate-specific TC/RC, penalties, transport, insurance, marketing, royalties and precious-metal credits. No allocation is inferred.

## Benchmark blockers

Arctic has no stream, so generic stream-treatment uncertainty is not project-applicable. S&P-compatible Cu Cost Tier nevertheless remains **Ej verifierad** because:

1. exact benchmark-compatible allocation revenue/price vector is not source-locked for Arctic;
2. the universal current S&P C1 component boundary remains unverified;
3. project-to-2024-benchmark cost-vintage alignment remains unverified.

Section 22.3 describes the FS as real dollars with **relative Year -3** as the base year. It does not provide a source-locked calendar cost year that may simply be equated with the 2024 S&P snapshot. The user-supplied runtime production-start placement is calendar placement only and must never be reused as cost-vintage evidence.

## SSOT / reconciliation guard

No Arctic project economic input is changed by this audit. Reported cost checkpoints remain evidence-only. The existing V3 report reconciliation remains the authoritative guard for timeline, price deck, CAPEX/closure, NPV and IRR.
