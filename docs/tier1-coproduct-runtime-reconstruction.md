# Tier · source-locked by-product → co-product runtime reconstruction

Status: **runtime diagnostic implemented; hard S&P Cu Cost Tier remains NOT_VERIFIED**.

This note records the runtime continuation of the earlier PR #516 cost-allocation work. It does not alter Project economics, does not rewrite any project_json_v3 economic series and does not activate the Cu Cost Tier.

## Why this exists

The generic allocator `allocateTier1CoProductCost()` already existed and the Berg golden audit had already demonstrated a period-by-period net-revenue allocation. The first cost-position preview stopped too early when a source recipe was labelled `net_by_product`. Runtime now continues one step further when a source-locked adapter can identify both the common C1 pool and an explicit allocation-revenue vector.

The sequence is now:

`canonical Project economics -> report-defined source recipe -> exact report C1 reconstruction -> source-locked co-product reconstruction -> raw S&P reference position -> hard benchmark readiness`.

The last arrow remains fail-closed.

## Berg

For `berg-c1-by-product-lom` runtime reuses the evidence already locked in `tier1-berg-cu-c1-bridge-audit.md`:

- common C1 pool = onsite operating cost + offsite cost + royalty;
- allocation vector = published annual Table 22-4 product-level **net revenue** for Cu/Mo/Ag/Au;
- allocation method = `MIXED_REVENUE_WEIGHTED`;
- denominator = payable Cu lb.

Regression target: **1.9233627515309155 USD/lb payable Cu** for the period-by-period report-deck net-revenue diagnostic.

This is not promoted to exact S&P equivalence because the S&P 2024 allocation price/revenue basis, full current C1 boundary and vintage-restatement method remain unverified.

## Warintza

For `warintza-c1-lom` the report-defined by-product C1 remains the source checkpoint, approximately **1.011 USD/lb payable Cu**.

Runtime then reconstructs a co-product diagnostic from:

- common pre-credit C1 pool = mining + processing + site G&A + concentrate deductions + royalties;
- allocation vector = report-deck retained product revenue for Cu/Au/Ag/Mo;
- explicit Royal Gold stream purchase revenue is added to the Au economic-revenue leg rather than disappearing from the allocation vector;
- allocation method = `MIXED_REVENUE_WEIGHTED`;
- denominator = payable Cu lb.

The expected diagnostic is approximately **1.81 USD/lb payable Cu** on the canonical rounded annual report rows.

This is deliberately labelled `REPORT_DECK_RETAINED_PRODUCT_REVENUE_WITH_STREAM_PURCHASE`, not S&P net revenue. Warintza does not publish the same product-level net-revenue vector that Berg does, and public S&P evidence still does not define stream treatment. The number is therefore a project/source-locked co-product reconstruction and only a contextual S&P read-off.

## Runtime/UI consequence

`api/tier1-pre-revenue.ts` now prefers a successful source-locked co-product reconstruction for the cost-position diagnostic. The original report measurement is retained in `sourceMeasurement`, and the reconstruction is retained in `coProductReconstruction` with allocation basis, source pool, Cu allocation, denominator, provenance and limitations.

The hard cost gate is unchanged. If a reconstruction exists while the hard gate remains unverified, the gate reason now states that a co-product value has been calculated and identifies why the S&P percentile still cannot be promoted. This replaces the misleading statement that no cost value can be calculated.

AISC/All-in source recipes are not silently converted by this C1 reconstruction layer.

## Anti-regression rules

- Never turn a by-product C1 directly into a percentile without the co-product reconstruction step.
- Never choose an allocation vector implicitly from current spot prices.
- Never treat Warintza's explicit stream purchase revenue as if the stream did not exist.
- Never call the Warintza retained-revenue vector exact S&P net revenue.
- Never let this diagnostic change `assessment.gates.cost` to PASS/Tier without the separate benchmark-readiness contract.
- Never CPI/FX-rebase the reconstructed value to 2024 without a separately verified method.
