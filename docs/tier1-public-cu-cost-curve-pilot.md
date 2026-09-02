# Tier · public-disclosure Cu cost curve pilot

Status: **RESEARCH_ONLY / 5 of 20 minimum source-complete 2024 observations. No Tier percentile is activated.**

This pilot is the fallback path for a copper cost-position benchmark that can be fully audited from public issuer disclosures. S&P remains a useful external reference, but the Tier engine must not depend on proprietary methodology that cannot be source-locked.

The pilot deliberately does **not** call its metric industry-standard `C1`. Issuers use materially different C1/cash-cost definitions and denominators. The canonical research metric is therefore named explicitly:

`TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`

## 1. Locked pilot definition

### Data vintage

Only **2024 actual** observations are eligible in this first curve. No CPI, FX or implicit cost-year restatement is allowed.

### Denominator

`contained Cu produced`, converted dimensionally from tonnes to pounds.

This differs deliberately from S&P's paid/payable-Cu curve. The reason is public reproducibility: contained copper production is broadly disclosed operation-by-operation, while issuer cash-cost denominators vary between payable production, contained production and contained sales. A source metric on another denominator cannot enter this pilot until its numerator can be independently rebuilt and rebased to contained Cu produced.

### Common cash pool

Include only source-backed operating and direct realization costs:

- mining;
- processing/milling;
- site G&A / site administration / indirect operating cost;
- treatment and refining;
- freight, transport, marketing and other direct realization cost;
- direct smelter cost when the issuer assigns it to the operation's cash-cost bridge.

Exclude:

- issuer by-product credits;
- royalties and production taxes;
- sustaining capital and deferred-stripping capital;
- corporate G&A;
- depreciation/amortization;
- exploration;
- financing;
- hedges;
- non-routine costs.

The central rule is important: **issuer-specific by-product credits are never accepted as the co-product allocation method.** The pilot first reconstructs cash cost *before* by-product credits and then applies one common allocation rule.

### Co-product allocation

The entire common pool is allocated by each physical product's share of **gross contained-metal production value** using one fixed 2024 reference deck. Streams, hedges and offtakes do not alter these weights. This is an explicit Tier benchmark definition, not an inference about issuer economics or S&P methodology.

Reference deck:

| Metal | 2024 average |
| --- | ---: |
| Cu | 4.16 USD/lb |
| Au | 2,386 USD/oz |
| Ag | 28.27 USD/oz |
| Mo | 21.30 USD/lb |

Source: Northern Dynasty Minerals 2025 MD&A, Market Trends table p.23. Its footnotes identify LME Official Cash Price for Cu, LBMA PM for Au and London PM fix for Ag via Argus Media/metalprices.com, and Platts for Mo.

### Quartiles

If the research set reaches at least **20 source-complete mine observations**, research quartiles are calculated as production-weighted cost-curve thresholds using contained Cu tonnes as weight. Q1/P50/Q3 are the first cost observations where cumulative verified Cu production reaches 25%/50%/75% of the sample.

Even reaching 20 observations does **not** automatically activate Compare Stocks. `comparisonEnabled` remains false until the sample and policy have received a separate benchmark audit.

## 2. First batch · ten operations

| Operation | Operator | Pilot status | Key 2024 source fact | Result / blocker |
| --- | --- | --- | --- | --- |
| Kamoa-Kakula | Ivanhoe Mines / Zijin JV | ELIGIBLE | C1 cash costs US$1,544.039m; contained Cu in concentrate 437,061 t | normalized 1.60244 USD/lb contained Cu |
| Constancia / Peru BU | Hudbay | ELIGIBLE | cash cost before by-products US$554.0m; Cu 99,001 t, Au 98,226 oz, Ag 2.708 Moz, Mo 1,323 t | Cu reference-value share 70.878%; normalized 1.79907 USD/lb |
| Copper Mountain | Hudbay | ELIGIBLE | cash cost before by-products US$216.1m; Cu 26,406 t, Au 19,789 oz, Ag 280,499 oz | Cu share 81.452%; normalized 3.02358 USD/lb |
| Kansanshi | First Quantum | ELIGIBLE | 2024 unit bridge: mining 0.79 + processing 0.94 + site admin 0.16 + TC/RC/freight 0.18 + smelter 0.17 = 2.24 USD/lb before Au credit; Cu 170,929 t, Au 105,103 oz | Cu share 86.209%; normalized 1.93108 USD/lb |
| Sentinel | First Quantum | ELIGIBLE | 2024 unit bridge sums to 1.94 USD/lb; Cu 231 kt; no by-product credit row | normalized 1.94000 USD/lb |
| Caraíba | Ero Copper | PARTIAL | C1 1.97 USD/lb on Cu produced and detailed cost bridge disclosed | copper-segment physical by-product quantities are not yet source-locked for the common reference-value allocation |
| Candelaria | Lundin Mining | PARTIAL | 2024 cash cost 1.73 USD/lb | issuer reconciliation denominator is contained Cu **sold**, not contained Cu produced |
| Caserones | Lundin Mining | PARTIAL | 2024 cash cost 2.51 USD/lb | issuer reconciliation denominator is contained Cu sold |
| Chapada | Lundin Mining | PARTIAL | 2024 cash cost 1.58 USD/lb | issuer reconciliation denominator is contained Cu sold |
| Centinela | Antofagasta | PARTIAL | cash cost before by-products 2.60 USD/lb; production 223.8 kt Cu, 140.3 koz Au, 2.4 kt Mo | cost measure is defined on payable Cu produced; exact payable-Cu quantity needed to rebuild/rebase the numerator is not source-locked in this pass |

The five eligible observations represent about **964 kt of contained Cu production**. This is enough to test the normalization architecture, not enough to claim a market quartile curve.

## 3. Why the pilot uses contained Cu produced

The first ten operations immediately demonstrate the denominator problem:

- Kamoa reports C1 on **payable copper produced**, but also publishes the absolute C1 numerator and contained production, so it can be safely rebased.
- Hudbay explicitly defines the Peru and British Columbia cash-cost denominator as **contained copper in concentrate produced**.
- First Quantum publishes mine production and a unit cost bridge that can be applied directly to its production denominator.
- Lundin's reconciliation uses **contained metal sales volumes**, creating inventory timing mismatch against annual production.
- Antofagasta defines cash cost as cost per **payable copper produced**.

Using whichever denominator an issuer happens to publish would create a false curve. The pilot instead selects one physical denominator and rejects/rebuilds anything that cannot be put on that basis without inference.

## 4. Why streams are ignored in allocation weights

This metric is designed to measure operating cost position of the physical mine, not the financing/encumbrance package attached to one owner. A gold/copper stream can materially change the owner's realized revenue but does not change how many ounces/tonnes the mine physically produces.

Therefore the fixed reference-value allocation deliberately ignores streams, hedges and offtake pricing. The economic effect of those contracts belongs elsewhere in Project/Corporate cash flow and cycle resistance. This prevents otherwise identical mines from moving around the cost curve merely because one owner financed the asset with a stream.

## 5. Fail-closed rules

An observation is `NOT_VERIFIED` for this curve if any of the following applies:

- year is not exactly 2024;
- cost numerator cannot be isolated on the canonical common-pool boundary;
- contained Cu production is not source-backed;
- a physical co-product quantity is missing;
- the fixed deck has no verified price for a disclosed economic co-product;
- quantity units do not match the explicit product identity;
- numerator is tied only to sales/payable volume and cannot be safely rebased to contained production;
- source/provenance is missing.

No missing product is assigned zero and no unsupported product gets an inferred price.

## 6. Implementation

`src/lib/tier1/publicCuCostCurve.ts` contains only the research policy, public-source evidence rows and deterministic normalization/production-weighted curve math. It is not included in `TIER1_COST_BENCHMARKS` and cannot affect the Tier gate.

`publicCuCostCurve.test.ts` locks:

- the 2024 reference deck and sources;
- all ten first-batch source statuses;
- exact normalized values for the five source-complete observations;
- rejection of wrong-year, wrong-denominator and unsupported-product inputs;
- minimum 20-observation guard;
- `comparisonEnabled=false` even when a synthetic 20-observation research set is sufficient to calculate quartiles.

## 7. Next research batch

The next goal is not to force the five partial mines into the curve. It is to add another batch of operations with genuinely compatible public disclosure until the sample reaches at least 20 source-complete mines. Priority should go to issuers with operation-level 2024 production plus cash-cost-before-byproduct or decomposable C1 bridges.

S&P remains a cross-check, not the canonical source for this public pilot.
