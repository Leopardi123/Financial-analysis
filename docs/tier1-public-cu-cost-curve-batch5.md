# Tier · public Cu cost curve · batch 5 audit

Status: **RESEARCH_ONLY / 22 source-complete 2024 observations. No Tier percentile is activated.**

Batch 5 deliberately prioritizes diversification rather than merely raising the observation count. Six additional operations were reviewed. Two are source-complete under the exact public-curve contract; four remain fail-closed.

## Eligible additions

| Operation | Country | 2024 contained Cu | Common pool | Physical co-products | Normalized Cu cost (USD/lb contained Cu) |
| --- | --- | ---: | ---: | --- | ---: |
| Motheo | Botswana | 49,721 t | US$203.0m | Ag 1.929 Moz | **1.654106** |
| Tritton | Australia | 18,600 t | A$190.4m = US$125.664m | Au 5.3 koz; Ag 159 koz | **2.784715** |

The expanded sample is now **38 reviewed operations, 22 eligible and 16 partial**, covering **1,991,842.546 t contained Cu produced in calendar 2024**. The production-weighted Q1/P50/Q3 threshold observations remain unchanged at **1.653198 / 1.931082 / 2.114236 USD/lb**.

## Motheo source lock

Sandfire's December 2024 Quarterly Report contains the four calendar quarters required to reconstruct calendar 2024 despite the issuer reporting on a June financial year.

Contained production:
- Mar-2024 quarter: 10,809 t Cu and 318 koz Ag;
- Jun-2024: 13,624 t Cu and 535 koz Ag;
- Sep-2024: 12,684 t Cu and 538 koz Ag;
- Dec-2024: 12,604 t Cu and 538 koz Ag.

Calendar total is therefore **49,721 t Cu and 1.929 Moz Ag**.

The same table reports Gross C1 Costs of US$44m, US$59m, US$53m and US$47m for those quarters, or **US$203m**. Sandfire defines C1 as mining + processing + G&A + transport; TCRC is then added to produce Gross C1 and by-product credit is deducted afterward. We therefore use Gross C1 as the source-locked pre-by-product common pool. Royalties appear in Sandfire's broader Underlying Operating Cost definition, not in the C1 definition used here.

## Tritton source lock

Aeris reports Tritton consistently by quarter with physical Cu/Au/Ag production and the exact cost components needed by the canonical boundary.

Calendar 2024 totals from Mar/Jun/Sep/Dec quarter tables:
- contained Cu **18.6 kt**;
- Au **5.3 koz**;
- Ag **159.0 koz**.

For each quarter the common pool includes mining + processing + site G&A + TC/RC + product handling and excludes by-product credit, royalty, corporate G&A, inventory movements and sustaining capital. The four canonical pools are A$43.0m, A$53.7m, A$47.9m and A$45.8m, or **A$190.4m**.

The conversion uses the already source-locked independent 2024 period-average AU$:US$ **0.660** from 29Metals' Annual Financial Report, giving **US$125.664m**. No FX API key or series is inferred.

## Four reviewed operations kept partial

| Operation | Country | Blocker |
| --- | --- | --- |
| Proyecto Riotinto | Spain | exact physical 2024 silver production not source-locked |
| Gibraltar | Canada | exact physical 2024 silver production not source-locked |
| Aitik | Sweden | physical Cu/Au/Ag is source-locked, but reported Normal C1 is already net of by-metal revenue and the absolute pre-by-product common pool is not separately disclosed |
| MATSA | Spain | exact contained 2024 gold production not source-locked; the quarterly table gives gold only on payable/sales basis |

These are intentionally not repaired with zero by-products, payable-to-contained relabelling, reverse-engineered issuer credits or inferred price/ownership assumptions.

## New robustness diagnostics

Batch 5 adds diagnostics to the research builder rather than treating observation count as sufficient evidence.

Production-weight concentration improves but remains high:
- largest mine: **21.94%**;
- top 3: **49.75%**;
- top 5: **69.57%**;
- top 10: **86.20%**.

The mine-weighted (equal-operation) diagnostic distribution is:
- Q1 **1.799071**;
- P50 **2.094806**;
- Q3 **2.788146** USD/lb.

This is deliberately diagnostic only; Tier continues to use no public-curve percentile. The gap versus the production-weighted 1.653/1.931/2.114 curve demonstrates that the present sample remains weight-sensitive.

A leave-largest-out test removes Kamoa-Kakula. The production-weighted thresholds then become:
- Q1 **1.739713**;
- P50 **1.940000**;
- Q3 **2.114236** USD/lb.

The Q1 movement is material enough that activation remains unjustified.

## Decision

**Keep research-only.** `comparisonEnabled=false` remains mandatory. Batch 5 improves geographic/operator breadth by adding Botswana/Sandfire and another Australian operator, but the curve still needs broader sampling and tighter common-pool semantic consistency before a second activation audit could support Tier use.
