# S&P Mine Economics methodology query · copper co-product C1

Purpose: obtain enough current source evidence to decide whether `S_AND_P_CO_PRODUCT_C1_CU` can move from fail-closed to benchmark-compatible.

Target benchmark:

- S&P Global Market Intelligence Mine Economics;
- Q4 2024 dataset, dated June 2025 in Ivanhoe Electric material;
- chart label: `2024 cash operating costs (C1) on a co-product basis for global copper mines`;
- x-axis: `Paid Copper (thousand tonnes)`.

Reference chart:

`https://www.sec.gov/Archives/edgar/data/1879016/000110465925061364/tm2518281d1_ex99-2.htm`

Known S&P methodology help reference:

`https://www.capitaliq.spglobal.com/help/Mine_Economics_Methodology.htm`

## Ready-to-send request

Subject: Mine Economics methodology clarification — 2024 copper co-product C1

Hello,

We are normalizing technical-study project costs for comparison with the S&P Global Market Intelligence Mine Economics Q4-2024 copper cost curve shown as `2024 cash operating costs (C1) on a co-product basis`, with `Paid Copper` on the production axis.

To avoid comparing unlike cost definitions, could you please point us to the current Mine Economics methodology/field definitions, or confirm the following with the relevant methodology version or field names?

1. **C1 numerator boundary** — Which exact Mine Economics cost fields are included in copper `Cash Operating Costs / C1` on the co-product curve? In particular, please confirm inclusion/exclusion of mine-site mining, beneficiation/milling, site G&A, treatment charges, refining charges, penalties, concentrate/product freight, insurance, marketing, royalties and production/mining taxes. Please also state how integrated smelter/refinery operating costs are treated.

2. **Paid-copper denominator** — What is the exact definition of `Paid Copper` for this curve? Is it payable copper after commercial payability/smelter-refinery deductions, and how is it treated when the mine has a stream, metal purchase agreement or similar encumbrance?

3. **Co-product allocation formula** — For `co-product basis`, is common cost allocated using each product's net-revenue share? If so, what is the exact Mine Economics revenue field/formula used for the allocation, including which deductions are made before the revenue shares are calculated?

4. **Price basis for 2024 actual observations** — Which prices feed the revenue shares for the Q4-2024 actual cost curve: mine realized prices, S&P annual actual/benchmark prices, a standardized Mine Economics price deck, or another field? Please identify the relevant price field or methodology rule.

5. **Streams, hedges and offtakes** — How are streams, hedges, offtake agreements and metal purchase agreements reflected in the co-product revenue shares and/or C1 cost? If they are excluded from the modeled methodology, confirmation of that would also resolve the question.

6. **Cost vintage / normalization** — When comparing a development project's constant-dollar technical-study cost with a 2024 actual Mine Economics curve, does S&P prescribe a restatement method? If yes, which cost inflators/FX assumptions or Mine Economics fields should be used? If no, should like-for-like comparison use a cost estimate already expressed in the same calendar cost year as the curve?

For our audit trail, a link to the current methodology page, methodology version/date, or the names/definitions of the relevant Capital IQ Pro Mine Economics fields would be ideal.

Thank you.

## Evidence acceptance criteria

A response may change a Tier contract field to `VERIFIED` only when it is attributable to S&P Mine Economics methodology/help or a written S&P Mine Economics analyst/support response and is specific enough to implement without inference.

Minimum acceptance by blocker:

| Blocker | Evidence required |
| --- | --- |
| `full current C1 component boundary` | explicit current C1 inclusions/exclusions or exact field formula |
| `exact allocation revenue/price vector` | exact net-revenue field/formula + price basis + deduction order |
| `stream treatment` | explicit stream/hedge/offtake rule, or explicit statement that these are not represented |
| `project-to-benchmark cost-vintage alignment` | exact restatement procedure; alternatively a same-calendar-year project requires no restatement and may avoid this blocker project-specifically |
| paid/payable denominator refinement | exact `Paid Copper` field definition, especially relative to commercial deductions and streams |

Generic statements such as `normalized for like-for-like comparison`, `net revenue basis`, `paid metal basis`, or `uses actual costs` do **not** by themselves close the detailed blockers.

## Implementation rule after response

Do not modify project economics to force compatibility. Update the external definition contract first, add regression tests for the exact new rule, and then let the existing source-locked project recipes either pass or fail that contract naturally.

If the S&P response shows that the 2024 C1 curve uses a boundary or allocation basis that our canonical Project JSON cannot represent, the correct result remains **Ej verifierad** until the source model is extended without duplicate economic series.
