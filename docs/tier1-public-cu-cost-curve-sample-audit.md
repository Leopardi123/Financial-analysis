# Tier · public Cu cost curve · sample / activation audit after Batch 5

Status: **RESEARCH_CURVE_READY, NOT ACTIVATION READY.** The sample now contains 22 source-complete observations, but neither sample breadth nor robustness supports replacing or activating the current S&P Cu benchmark in Tier.

## 1. Sample size and production-weight concentration

The research sample contains **22 eligible mine observations** and **1,991,842.546 t contained Cu produced in calendar 2024**.

Production-weight concentration:
- largest observation (Kamoa-Kakula): **21.94%**;
- top 3: **49.75%**;
- top 5: **69.57%**;
- top 10: **86.20%**.

This is an improvement from Batch 4 (22.7% / 51.5% / 72.0% / 89.0%), but a handful of large mines still determines a large part of the cumulative production curve.

## 2. Geography and operator concentration

Approximate contained-Cu weights by country are:

| Country | Share |
| --- | ---: |
| DRC | 24.18% |
| Chile | 21.87% |
| Peru | 21.18% |
| Zambia | 20.18% |
| Australia | 4.10% |
| Canada | 2.56% |
| Botswana | 2.50% |
| Mexico | 1.88% |
| Kazakhstan | 0.67% |
| Turkey | 0.58% |
| Colombia | 0.31% |

DRC + Chile + Peru + Zambia now represent about **87.41%** of contained-Cu weight, down from about 90.5% after Batch 4 but still too concentrated for a neutral global proxy.

Largest operator/JV groups are approximately Ivanhoe/Zijin **21.94%**, First Quantum **20.76%**, and MMG **18.45%**. The top three therefore account for **61.15%**, versus ~63.3% after Batch 4. Sandfire's Motheo adds ~2.50% and Aeris' Tritton ~0.93%, improving breadth without adding to the dominant groups.

## 3. Denominator consistency

All emitted observations use **contained Cu produced**. Payable-Cu, Cu-sold, partial-year and incomplete physical-product rows remain fail-closed.

Batch 5 demonstrates two legitimate calendar-year reconstruction paths:
- Motheo: four issuer-disclosed fiscal quarters are summed to exact calendar 2024;
- Tritton: four issuer-disclosed calendar quarters are summed directly.

No quarter is annualized and no payable quantity is relabelled as contained production.

Denominator consistency remains a **PASS** for emitted observations.

## 4. Common-pool consistency

The canonical target remains mining + processing/milling + site G&A/indirect + direct treatment/refining/freight/realisation/smelter costs before issuer by-product credits, excluding royalties/production taxes, sustaining/deferred stripping capex, corporate G&A, D&A, exploration, financing, hedges and non-routine items.

Motheo is strong evidence because Sandfire discloses Gross C1 as an absolute quarterly bridge before by-product credits. Tritton is also strong because Aeris separately discloses every included and excluded line item each quarter.

Nevertheless the full 22-mine sample still mixes:
- absolute issuer cash-cost reconciliations;
- decomposed operating-cost tables rebuilt to the canonical boundary;
- source-compatible unit costs reconstructed to absolute pools in pure-Cu cases;
- explicit source-locked currency conversion in Australian-dollar disclosures.

Inventory/stockpile treatment remains the largest residual cross-issuer semantic issue. This remains an **activation blocker**.

## 5. Weighting / robustness diagnostics

The production-weighted research curve remains:
- Q1 **1.653198**;
- P50 **1.931082**;
- Q3 **2.114236** USD/lb contained Cu.

An equal-mine diagnostic gives:
- Q1 **1.799071**;
- P50 **2.094806**;
- Q3 **2.788146**.

The difference, especially at Q3, confirms that the production-weighted sample is still strongly influenced by the largest mines.

Removing only the largest observation, Kamoa-Kakula, changes the production-weighted thresholds to:
- Q1 **1.739713** (+5.23%);
- P50 **1.940000** (+0.46%);
- Q3 **2.114236** (unchanged).

The material Q1 movement from a single-mine removal is a direct robustness failure for activation. The curve is useful for research but is not yet a sufficiently stable industry boundary.

## 6. Fixed price-deck sensitivity

The fixed deck remains Cu US$4.16/lb, Au US$2,386/oz, Ag US$28.27/oz, Mo US$21.30/lb, Co US$11.26/lb, Zn US$2,779.02/t and Pb US$2,072/t.

The prior 29Metals public-2024 cross-check changed the three threshold costs by less than 0.1% and did not change threshold identities. Batch 5 does not alter that conclusion because the weighted threshold observations remain Las Bambas, Kansanshi and Centinela.

## 7. External S&P cross-check

The current public research Q1/P50/Q3 remains **1.653 / 1.931 / 2.114 USD/lb contained Cu** versus the digitised S&P Q4-2024 values of approximately **1.40 / 1.76 / 2.18 USD/lb**.

These remain semantically non-comparable as benchmark definitions: the public metric is fixed-deck gross-contained-metal-value allocation on contained Cu produced, whereas publicly available S&P evidence establishes C1/co-product/**Paid Copper** but not the proprietary component boundary, price/revenue vector, stream treatment or vintage methodology.

## Activation decision

**FAIL / keep research-only.** `comparisonEnabled=false` remains mandatory.

Batch 5 reduces concentration and adds explicit robustness diagnostics, but the leave-largest-out Q1 shift, the large production-vs-mine-weighted divergence, geographic/operator concentration and remaining common-pool heterogeneity all argue against activation.

Next research should preferentially add source-complete mines outside DRC/Chile/Peru/Zambia and outside Ivanhoe/Zijin, First Quantum and MMG. A later activation proposal should require a second robustness audit rather than a simple observation-count threshold.
