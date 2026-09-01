# Tier Cu cost golden-case synthesis

Status: **five source-locked report bridges implemented; external S&P Cu Cost Tier remains NOT_VERIFIED.**

This note summarizes what the Vizcachitas, Berg, Warintza, Arctic and Copper Creek report audits prove about a generic polymetallic Cu cost engine. It does not activate a Cu percentile gate and it does not modify project economics.

## Golden cases

| Project | Report cost convention | Denominator | What the bridge proves | Benchmark consequence |
| --- | --- | --- | --- | --- |
| Vizcachitas | C1 = mining + processing | produced Cu | Reported 0.93 first 8 years and 1.25 LOM are reproducible from canonical site-cost rows. | Produced-Cu denominator is not the S&P paid/payable-Cu denominator. |
| Berg | By-product C1 and co-product CuEq C1 | payable Cu / CuEq | Both report conventions reproduce. CuEq is mathematically a gross payable-metal-value equivalent, while annual product net revenue is separately published. | CuEq must not be relabelled S&P net-revenue co-product C1; net-revenue diagnostics remain diagnostics until benchmark allocation basis is exact. |
| Warintza | By-product C1 incl. TCRC, royalties and Royal Gold stream | payable Cu | Full 1.01 C1 bridge and stream economics reproduce. | Stream treatment is a real benchmark blocker, not a theoretical edge case. |
| Arctic | Cash Costs, Net of By-product Credits | payable Cu | 0.72 reproduces from on-site + aggregate off-site − non-Cu metal value. Reported 1.61 All-in Cost requires the report's full capital total, not sustaining capex alone. | Aggregate off-site evidence is insufficient to manufacture an exact product-level net-revenue vector. |
| Copper Creek | Cash Cost (By-Product Basis) + AISC | payable Cu | Table 22-3 reproduces 1.67 cash cost and 1.85 AISC from published LOM totals and independently in Year 1 from annual canonical rows. | Report metric is by-product, not S&P co-product; Q1-2023 constant-dollar cost vintage is not 2024 actual. |

## Copper Creek source conflict

Copper Creek exposes a source-level inconsistency that the engine must preserve rather than normalize away.

Table 22-3 is mathematically self-consistent with:

- `Cash Cost = (Operating cost + TC/RC/penalties + transportation − Ag revenue − Mo revenue) / payable Cu`
- LOM: `(5,130.2 + 916.1 − 194 − 586) / 3,162 = 1.66550 USD/lb`, reported as `1.67`.
- `AISC = Cash Cost numerator + royalties + sustaining capital + closure`, divided by payable Cu.
- LOM: `(5,266.3 + 337.8 + 68.8 + 169.8) / 3,162 = 1.84779 USD/lb`, reported as `1.85`.

The Table 22-1 footnote instead says royalties are part of cash costs. The exact Table 22-3 identities place royalties in the AISC bridge rather than the 1.67 cash-cost numerator. This is a **SOURCE_CONFLICT**. Neither statement may be silently rewritten to make the other one true.

Copper Creek also source-locks the denominator as payable Cu: the first production year reproduces approximately `2.34180 USD/lb` cash cost and `2.44404 USD/lb` AISC using the published payable quantities and report price deck, matching the rounded `2.34` and `2.44` annual rows.

## Generic engine requirements established by the five cases

1. **Preserve the report metric identity.** `C1`, `Cash Cost`, `Cash Costs, Net of By-product Credits`, `AISC`, `All-in Cost` and `CuEq C1` are not synonyms.
2. **Make the denominator explicit.** Produced Cu, recovered Cu, payable/paid Cu and CuEq are distinct economic quantities.
3. **Build a source component bridge before benchmarking.** Every included/excluded component must be traceable to report evidence; contradictions must surface as conflicts rather than be auto-resolved.
4. **Separate by-product crediting from co-product allocation.** A low or negative by-product C1 does not become an S&P co-product C1 by renaming it.
5. **Require an explicit allocation revenue vector.** Gross payable-metal value is not an acceptable fallback for a benchmark defined as net-revenue pro-rata.
6. **Treat streams as a separate economic transformation.** A stream can materially change the revenue available for co-product allocation and therefore needs benchmark-specific treatment.
7. **Source-lock cost vintage.** A report cost year or constant-dollar base must not be silently escalated to the benchmark year. If the benchmark is 2024 actual and the project is Q1-2023 constant USD, a verified index/method is required or the comparison remains NOT_VERIFIED.
8. **Keep benchmark compatibility separate from report reconstruction.** A report cost can be reconstructed exactly while still being incompatible with the external percentile curve.
9. **Reported checkpoints are evidence, not parallel economics.** They validate canonical rows but may not overwrite the project's single-source cash-flow model.

## Resulting architecture

The safe sequence is:

`canonical project economics -> report-defined cost bridge -> definition/denominator check -> optional co-product allocation using verified net-revenue evidence -> cost-vintage normalization using a verified method -> external benchmark comparison`.

Every arrow is fail-closed. A project-specific hidden formula, implicit price assumption, inferred stream treatment, guessed off-site split or silent vintage conversion is prohibited.

The five golden cases therefore support the current design: the generic allocator can exist independently of benchmark readiness, while the S&P-compatible Cu Cost Tier remains **Ej verifierad** until the outstanding benchmark definition and vintage requirements are source-locked.
