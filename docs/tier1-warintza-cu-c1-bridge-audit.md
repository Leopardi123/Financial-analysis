# Tier · Warintza Cu C1 bridge audit

Status: **REPORT C1 BRIDGE VERIFIED / S&P CO-PRODUCT COST TIER = EJ VERIFIERAD**

Scope: Warintza 2025 PFS golden fixture in `project_json_v3`. This audit does not modify Project economics. It source-locks the report-defined C1/AISC bridge and identifies exactly why that bridge still cannot be promoted to the 2024 S&P co-product Cu cost curve.

## Report sources

Primary source: Solaris Resources Inc., *Warintza Project – Pre-Feasibility Study and Updated Mineral Resource Estimate*, effective 1 November 2025.

- Section 21.3 / Table 21.7 pp.335-336: LOM mining, processing and G&A costs.
- Section 21.3.2.1 p.338: processing operating-cost estimate base date Q1 2025.
- Section 22.1.1 / Table 22.1 p.342: economic metal-price deck.
- Section 22.1.2 / Table 22.2 pp.342-343: payable factors, concentrate treatment/refining and freight assumptions.
- Section 22.1.4 pp.344-345: Royal Gold stream, Royal Gold royalty, Ecuador government royalty, South32 royalty and Orion offtake.
- Table 22.4 p.345: published C1/AISC bridge.
- Tables 22.5-22.6 pp.346-347: NPV/IRR, LOM payable metal, revenue, opex, deductions, royalties, stream revenue and capital totals.
- Table 22.8 pp.350-351: rounded annual economic cash-flow and payable-metal rows.

## Report-defined C1 reconstruction

Table 22.4 reports all rows in USD/lb **payable Cu**:

| Component | Report | Reconstructed from Table 22.6 |
| --- | ---: | ---: |
| Mine cost | 0.43 | 0.42752 |
| Plant cost | 0.99 | 0.99472 |
| G&A | 0.14 | 0.13857 |
| TCRCs for Cu & Mo concentrate | 0.44 | 0.43960 |
| Royalty and streaming | 0.33 | 0.32901 |
| By-products (Au, Ag & Mo) | -1.32 | -1.31838 |
| **C1 Cash cost** | **1.01** | **1.01105** |
| Sustaining capital | 0.24 | 0.23503 |
| **AISC** | **1.25** | **1.24608** |

The denominator is the Table 22.6 LOM payable Cu total of **3,306 kt**, converted dimensionally to pounds. The annual Table 22.8 payable rows are rounded and sum to 3,308 kt in the V3 fixture; the report LOM total is therefore the correct oracle for reconstructing the published unit-cost checkpoint.

The C1 numerator identity is:

```text
mining
+ processing
+ G&A
+ concentrate freight/TCRC/other deductions
+ total royalties
- stream purchase revenue
- post-stream Au revenue
- Ag revenue
- Mo revenue
```

Using Table 22.6 totals:

```text
3,116 + 7,250 + 1,010 + 3,204 + 2,529 - 131 - 2,140 - 677 - 6,792 = US$7,369m
```

Dividing by 3,306 kt payable Cu gives approximately **US$1.011/lb payable Cu**, matching the published US$1.01/lb after rounding.

## Royal Gold stream is not an abstract blocker here

Warintza has a real, material gold stream.

The report states that Royal Gold receives **20 oz Au per 1 million lb Cu produced**. Solaris receives **20% of spot gold for the first 90,000 oz delivered**, then **60%** thereafter. The report also applies royalties to post-stream NSR and states Royal Gold covers refining charges on streamed gold.

The V3 fixture preserves this as a separate Au stream with `inputPayableBasis = POST_STREAM`. Its rounded annual stream-delivery series totals **146 koz**. Applying the report's tiered purchase-price terms to the report gold-price series reconstructs **US$130.86m** of stream purchase revenue, which rounds to the **US$131m** Table 22.6 stream-revenue total.

This matters for cost allocation: Warintza's post-stream Au revenue, stream purchase revenue, royalties and by-product credits cannot be collapsed into an ordinary unencumbered Au revenue share without an explicit benchmark rule for streams.

## Canonical Project reconciliation check

No economic Project fixture was changed by this audit.

The existing `WARINTZA_PFS_V3` annual canonical rows reconcile to the report LOM totals within the expected rounding of Table 22.8:

- mining: US$3,116m exactly;
- processing: US$7,253m from rounded annual rows vs US$7,250m Table 22.6;
- G&A: US$1,015m from rounded annual rows vs US$1,010m Table 22.6;
- selling/deductions: US$3,204m exactly;
- payable Au: 836 koz exactly;
- payable Ag: 24,180 koz from rounded annual rows vs 24,179 koz Table 22.6;
- payable Mo: 154.1 kt from rounded annual rows vs 154 kt Table 22.6;
- payable Cu: 3,308 kt from rounded annual rows vs 3,306 kt Table 22.6.

Existing report reconciliation remains:

- report post-tax NPV8: US$4,617m;
- V3 post-tax NPV8: approximately US$4,625.958m;
- relative difference: approximately +0.194%;
- report post-tax IRR: 26.0%;
- V3 post-tax IRR: approximately 25.577%;
- difference: approximately -0.423 percentage points, or -1.626% relative.

The explicit reconciliation tolerance is 2%.

## Why S&P-compatible Cu Cost Tier remains Ej verifierad

Warintza's published C1 is a **by-product-credit** metric, not the required S&P **co-product net-revenue allocation**.

The report is unusually strong on the physical and contractual chain: payable quantities, metal prices, commercial terms, stream terms, annual opex, TCRCs/deductions, royalties and LOM C1 are all disclosed. It still does not establish the exact allocation vector required by the current S&P 2024 co-product benchmark.

Four blockers therefore remain active for Warintza:

1. **Exact allocation revenue/price vector.** The PFS report deck and its aggregate deduction rows cannot be assumed to equal the S&P 2024 allocation basis.
2. **Stream treatment.** The Royal Gold gold stream is material and project-applicable; the public S&P methodology evidence does not establish how streamed metal is treated in the co-product revenue vector.
3. **Full current C1 component boundary.** Warintza includes TCRCs, royalties and streaming in its reported C1; the exact universal boundary of the current S&P curve remains unverified.
4. **Cost-vintage alignment.** The S&P benchmark is 2024 actual. Warintza explicitly states a Q1 2025 base date for **processing operating costs**; the report does not source-lock one common base date for every component of the reported C1. No inflation/index bridge may be invented.

Therefore the Warintza report C1 **must remain evidence/checkpoint only** for S&P Tier purposes.

## Regression guard

`warintzaCostBridge.test.ts` locks:

- exact payable-Cu denominator semantics;
- reconstruction of every Table 22.4 C1/AISC row from Table 22.6;
- canonical annual-row vs LOM-total rounding tolerances;
- exact Royal Gold stream purchase-price tiers;
- 146 koz rounded delivered stream quantity and US$130.86m reconstructed stream purchase revenue;
- fail-closed S&P readiness with all four Warintza blockers active.

No allocation metadata is written into the golden Project fixture and no Cu percentile gate is activated.
