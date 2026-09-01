# Tier · Cu C1 benchmark definition evidence

Status: **DENOMINATOR + CO-PRODUCT METHOD VERIFIED AT HIGH LEVEL / FULL COMPONENT CONTRACT STILL NOT VERIFIED**

Syfte: source-locka vad som faktiskt går att säga om S&P Global Market Intelligence / tidigare SNL Mine Economics co-product C1 för koppar, och tydligt separera det från sådant som fortfarande saknar tillräcklig offentlig metoddefinition.

Detta dokument är definitionsevidens för Tier. Det ändrar ingen Project-ekonomi och ger inte i sig rätt att aktivera en Cu-cost percentile gate.

## 1. Current curve actually used by Tier

Ivanhoe Electrics Santa Cruz-material visar den aktuella externa kurvan som:

- **2024 cash operating costs (C1)**;
- **co-product basis**;
- x-axis **Paid Copper (thousand tonnes)**;
- global copper mines;
- note: **excluding processing facilities**;
- source: **S&P Global Market Intelligence, 2025**;
- Q4 2024 dataset dated June 2025 according to Ivanhoe Electrics accompanying release.

Sources:

- `https://www.sec.gov/Archives/edgar/data/1879016/000110465925061364/tm2518281d1_ex99-2.htm`
- `https://www.sec.gov/Archives/edgar/data/1879016/000110465925061364/tm2518281d1_ex99-1.htm`

### Definition consequence

**Verified:** Tier denominator for this benchmark must be paid/payable copper mass, not produced CuEq, AuEq or gross contained Cu.

This does not by itself prove every numerator component.

## 2. Co-product allocation method

SNL Metals & Mining, the predecessor Mine Economics platform now within S&P Global Market Intelligence, publicly described two cost methods:

- by-product / normal costing: secondary-product revenue is netted from primary-metal cost;
- co-product / pro-rata costing: costs are shared among metals **on a net revenue basis**.

The same public description states that Mine Economics normalizes costs for like-for-like comparison and bases production economics on paid-metal content.

Source:

- `https://www.prweb.com/releases/for_immediate_release_snl_metals_mining_launches_additional_mine_economics_data/prweb12594768.htm`

Current S&P research is directionally consistent with that definition. Its copper-cobalt analysis says changing cobalt prices changes cobalt revenue share and thereby changes copper cost under coproduct costing; it expresses the copper curve on a paid-copper basis.

Source:

- `https://www.spglobal.com/market-intelligence/en/news-insights/research/the-cobalt-expansion-drive-is-a-copper-story`

### Definition consequence

**Verified at method level:** a canonical co-product allocator may use **net-revenue pro-rata weighting** for common costs.

**Still not verified:** the exact revenue vector used by the 2024 S&P dataset — e.g. exact price vintage, realized vs benchmark pricing, treatment of payability/off-site charges, and treatment of streams/encumbrances.

Therefore Tier must not silently use Project accounting revenue or current spot revenue as the S&P allocation vector.

## 3. What older Mine Economics material says about cost components

The public SNL Mine Economics description says its cost analysis covers:

- mining/extraction;
- milling/beneficiation;
- smelting/refining including TC/RCs;
- transport;
- royalty costs;
- labor, power, fuel and consumables breakdowns.

It also describes **total cash costs** as including mine-site cash costs, milling/processing costs, by-product credits, royalties and production taxes.

This is important methodology evidence, but it is **not sufficient to equate historical `total cash cost` with the exact current `Cash Operating Costs / C1` curve used by Santa Cruz**. Metric names differ and the current curve carries the additional note `excluding processing facilities`.

Accordingly, this evidence narrows the search space but does not authorize a full current C1 component boundary.

## 4. Santa Cruz definition control

The 2025 Santa Cruz PFS reports LOM:

- mining: **0.85 USD/lb Cu produced**;
- SX/EW plant and infrastructure: **0.33 USD/lb**;
- G&A: **0.14 USD/lb**;
- total: **1.32 USD/lb**.

The same PFS separately reports royalties of **5.26 USD/t processed** and nevertheless labels 1.32 USD/lb as C1 cash cost. Thus Santa Cruz's published 1.32 is exactly its mining + processing + G&A operating-cost bridge, excluding the separately shown royalty line.

Sources:

- `https://www.sec.gov/Archives/edgar/data/1879016/000110465925061364/tm2518281d1_ex96-1.htm`
- `https://ivanhoeelectric.com/site/assets/files/10849/scp-gr-rep-0001_ra_s-k_1300_final_june22_1930-compressed.pdf`

Ivanhoe Electric explicitly compares that 1.32 USD/lb project C1 against the S&P co-product C1 curve.

### Definition consequence

This is strong compatibility evidence for a **mine-site mining + processing + G&A** core C1 pool in this comparison.

It is **not sufficient evidence that every mine on S&P's current curve excludes royalties, TC/RC, freight or other realization costs in exactly the same manner**. The external curve definition still needs direct current methodology evidence before we encode those inclusions/exclusions as universal.

## 5. Supporting industry evidence, not S&P authority

Other current mining disclosures demonstrate why Tier must keep the boundary explicit rather than assume that the label `C1` is standardized. For example, Central Asia Metals states that its C1 includes direct production costs, local administration and realization charges such as freight and treatment charges, while royalties, stream commitments, taxes/duties and D&A are excluded. Other issuers use different reconciliations.

This confirms that `C1` alone is not a sufficient schema contract.

## 6. Current Tier definition contract

The evidence now supports locking these parts:

| Contract item | Status | Tier rule |
|---|---|---|
| Metric | Verified | `C1_CU_USD_PER_LB` |
| Denominator product | Verified | exact `Cu` |
| Denominator basis | Verified | paid/payable Cu |
| Denominator unit | Verified | lb |
| Costing method | Verified at high level | co-product / pro-rata |
| Common-cost allocation principle | Verified at high level | net-revenue share |
| Benchmark data year | Verified | 2024 actual |
| Exact allocation price/revenue vector | **Ej verifierad** | fail closed |
| Exact stream treatment | **Ej verifierad** | fail closed |
| Full current C1 component inclusion/exclusion | **Ej verifierad** | fail closed |
| Project-cost-year normalization to 2024 | **Ej verifierad** unless same vintage | fail closed |

## 7. Implementation consequence

The generic allocator may now safely support `MIXED_REVENUE_WEIGHTED` as the high-level co-product mechanism, provided the allocation-revenue vector is supplied explicitly and source-locked.

The allocator must not decide which Project cost components belong in the benchmark numerator. It must not choose spot prices as allocation prices. It must not decide stream treatment. Those belong to a separate benchmark-definition contract.

Until all mandatory definition fields are verified, the externally benchmarked Cu Cost Tier remains **Ej verifierad**, even if a canonical allocation can be mathematically computed.
