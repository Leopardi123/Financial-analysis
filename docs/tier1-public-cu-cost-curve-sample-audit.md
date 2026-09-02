# Tier · public Cu cost curve · sample / activation audit after Batch 4

Status: **RESEARCH_CURVE_READY, NOT ACTIVATION READY.** The hard minimum of 20 source-complete observations is now satisfied, but this audit does not support replacing or activating the current S&P Cu benchmark in Tier.

## 1. Sample size and weight concentration

The research sample contains **20 eligible mine observations** and **1,923,521.546 t contained Cu produced in calendar 2024**.

Production-weight concentration is high:

- largest observation (Kamoa-Kakula): **22.7%** of sample Cu;
- top 3 observations: **51.5%**;
- top 5 observations: **72.0%**;
- top 10 observations: **89.0%**.

This means the production-weighted quartiles are statistically valid under the declared method, but they are not yet a broad industry proxy. A handful of very large mines materially determines the cumulative thresholds.

## 2. Geography and operator concentration

Approximate contained-Cu weights by country are:

| Country | Share |
| --- | ---: |
| DRC | 25.0% |
| Chile | 22.6% |
| Peru | 21.9% |
| Zambia | 20.9% |
| Australia | 3.3% |
| Canada | 2.6% |
| Mexico | 1.9% |
| Kazakhstan | 0.7% |
| Turkey | 0.6% |
| Colombia | 0.3% |

DRC, Chile, Peru and Zambia together represent about **90.5%** of contained-Cu weight. This is directionally reasonable for a large-mine Cu sample but still too concentrated to treat as a neutral global cost curve without a broader sample audit.

Largest operator/JV groups by sample Cu weight are approximately Ivanhoe/Zijin **22.7%**, First Quantum **21.5%**, MMG **19.1%**, Antofagasta standalone **11.6%** plus Zaldívar JV **4.2%**, Capstone **6.6%** and Hudbay **6.5%**. The top three operator groups therefore account for roughly **63.3%** of sample weight.

## 3. Denominator consistency

All observations emitted into the research curve use **contained Cu produced** as the physical denominator. Rows with payable Cu, Cu sold, attributable production without a source-locked ownership bridge, or partial-year production remain fail-closed.

Two Batch-4 upgrades deserve explicit treatment:

- **New Afton:** physical Cu/Au/Ag production is sourced from the mine's NI 43-101 production-history table; the prior missing-Ag blocker is closed without converting sold/payable metal.
- **Zaldívar:** Antofagasta explicitly labels the disclosed 40.1 kt as its 50% attributable share. The full-operation 80.2 kt denominator is therefore an exact source-defined transformation. No ownership percentage is inferred.

Denominator consistency is therefore a **PASS for the emitted research rows**.

## 4. Common-pool consistency

The canonical target boundary remains mining + processing/milling + site G&A/indirect + direct treatment/refining/freight/realisation/smelter costs, before issuer by-product credits and excluding royalties/production taxes, sustaining/deferred stripping capex, corporate G&A, D&A, exploration, financing, hedges and non-routine items.

The sample is materially improved but not semantically homogeneous enough for Tier activation. Evidence forms still vary between:

- absolute issuer cash-cost reconciliations;
- decomposed operating-cost tables rebuilt to the canonical boundary;
- source-reported unit cost per contained pound reconstructed to an absolute pool for pure-Cu or source-compatible cases;
- one explicit AUD→USD conversion at Golden Grove using the issuer's disclosed FY2024 period-average FX.

Inventory/stockpile treatment also varies by issuer presentation. Batch 4 deliberately excludes Bolivar finished-inventory variation and Golden Grove stockpile movement from the production-basis pool, while some issuer C1 bridges incorporate inventory adjustments as part of reconciling financial COGS to production cash cost. This residual semantic heterogeneity is an **activation blocker**, even though every individual emitted row is source-locked under the research contract.

## 5. Fixed price-deck sensitivity

The fixed research deck is Cu US$4.16/lb, Au US$2,386/oz, Ag US$28.27/oz, Mo US$21.30/lb, plus source-locked Co US$11.26/lb, Zn US$2,779.02/t and Pb US$2,072/t.

As a direct public cross-check, 29Metals' 2024 Annual Financial Report reports Cu US$9,144/t (about US$4.147/lb), Au US$2,387/oz, Ag US$28/oz, Zn US$2,779/t and Pb US$2,072/t. Holding Mo unchanged and substituting those public 2024 values into the three observations that define the current weighted quartile thresholds changes their normalized costs only marginally:

| Threshold mine | Fixed deck | 29Metals cross-check deck | Relative change |
| --- | ---: | ---: | ---: |
| Las Bambas (Q1) | 1.653198 | 1.653093 | -0.006% |
| Kansanshi (P50) | 1.931082 | 1.930178 | -0.047% |
| Centinela (Q3) | 2.114236 | 2.113136 | -0.052% |

The identities of the threshold observations do not change. The current quartiles are therefore **not materially sensitive to these small differences between credible 2024 public price references**. This does not prove insensitivity to larger price-deck shocks; it only verifies the declared 2024 reference-deck choice against another source-complete 2024 public deck.

## 6. External S&P cross-check

The public research curve now emits:

- Q1 max **US$1.653198/lb contained Cu**;
- P50 max **US$1.931082/lb contained Cu**;
- Q3 max **US$2.114236/lb contained Cu**.

The existing S&P Q4-2024 digitised Cu curve in Tier uses approximately **US$1.40 / 1.76 / 2.18/lb** for Q1/P50/Q3. The numerical gaps are therefore about +US$0.253 (+18.1%), +US$0.171 (+9.7%) and -US$0.066 (-3.0%), respectively.

These differences **must not be interpreted as an error in either curve**. The public research metric is a fixed-deck, gross-contained-metal-value allocation on **contained Cu produced**, while the public evidence available for S&P establishes only 2024 cash operating costs (C1), co-product basis, **Paid Copper**. The exact proprietary S&P component boundary, price/revenue vector, stream treatment and vintage methodology remain unavailable. Semantic compatibility is therefore not proven.

## Activation decision

**FAIL / keep research-only.** `comparisonEnabled` must remain `false` and no Tier percentile gate may use the public curve yet.

Before activation can be reconsidered, the sample should be broadened to reduce mine/operator/geographic concentration, the remaining common-pool/inventory-treatment heterogeneity should be explicitly standardized or bounded, and the public definition should be compared against a source-complete external benchmark with matching denominator and allocation semantics. The current S&P curve remains the external cross-check, not something the public pilot can replace on the evidence presently available.
