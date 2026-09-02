# Tier · public Cu cost curve · batch 3 audit

Status: **RESEARCH_ONLY / 15 of 20 minimum source-complete 2024 observations. No Tier percentile is activated.**

This batch continues the public-disclosure Cu cost curve without weakening any prior guard. Ten additional operations were reviewed; four are source-complete under the exact pilot definition and six remain fail-closed.

## Eligible additions

| Operation | 2024 contained Cu | Common pool | Physical co-products | Normalized Cu cost (USD/lb contained Cu) |
| --- | ---: | ---: | --- | ---: |
| Mantos Blancos | 44,574 t | US$289.71414m | Ag 830 koz | **2.788146** |
| Mantoverde | 57,707 t | US$384.43835m | Au 9,237 oz | **2.900981** |
| Cozamin | 24,907 t | US$112.81311m | Ag 1.462 Moz | **1.739713** |
| Çayeli | 11,491 t | US$57.0m | Zn 2,629 t | **2.104130** |

The expanded sample is now **29 reviewed operations, 15 eligible and 14 partial**, covering **1,743,346.633 t contained Cu produced in 2024**. This remains below the hard 20-observation threshold, so Q1/P50/Q3 remain `null` and `comparisonEnabled=false`.

## Capstone source locks

Capstone's 2024 MD&A provides both the physical production vectors and a decomposable annual cash-cost reconciliation.

- **Mantos Blancos:** contained production is 37,744 t Cu in concentrate plus 6,830 t cathode and 830 koz Ag. Annual cash production costs are US$264.9m; treatment/selling is US$0.26/lb on 95.439m payable lb. The pilot common pool is therefore US$289.71414m before issuer by-product credits and excluding royalties.
- **Mantoverde:** production is explicitly shown on a 100% basis: 57,707 t total contained Cu and 9,237 oz Au. Cash production costs are US$365.6m; treatment/selling is US$0.15/lb on 125.589m payable lb. Common pool: US$384.43835m.
- **Cozamin:** contained Cu production is 24,907 t and Ag production 1.462 Moz. Cash production costs are US$95.4m; treatment/selling is US$0.33/lb on 52.767m payable lb. Common pool: US$112.81311m.

The issuer's payable-Cu quantities are used only to reconstruct the absolute treatment/selling cost disclosed in the bridge. The pilot denominator remains independently source-locked **contained Cu produced**.

**Pinto Valley remains partial.** Capstone discloses Cu production and economic revenue from Ag/Au/Mo, but its AIF notes lag/estimation in precious-metal assay data. The exact 2024 physical co-product vector is therefore not source-locked strongly enough for the fixed-deck allocation. No missing product is assigned zero.

## Çayeli source lock and zinc price

First Quantum reports 2024 Çayeli production of 11,491 t Cu and 2,629 t Zn. Its annual cost reconciliation reports C1 of US$49m after US$8m of by-product credits, giving a canonical pre-by-product common pool of **US$57m**.

Zinc is added to this research allocation only with an explicit public 2024 price source. Nexa Resources' 2024 Form 20-F reports the average LME zinc price at **US$2,779.02/t**. This price is stored directly as a source-locked supplemental research price; no API series or key is inferred.

## Six reviewed operations kept partial

| Operation | Blocker |
| --- | --- |
| Pinto Valley | exact physical Ag/Au/Mo production vector not source-locked strongly enough for 2024 |
| Mount Milligan | Centerra explicitly labels the 54.342m lb quantity as **payable copper produced**, not contained Cu produced |
| Lumwana | site C1 and production are disclosed, but the absolute pre-by-product pool / exact cost denominator is not source-locked for a safe contained-production rebase |
| Quellaveco | exact 2024 pre-by-product common cash pool not source-locked |
| Guelb Moghrein | magnetite concentrate is an economic physical product but the public curve has no verified product-specific reference price |
| New Afton | Ag is an economic by-product, but exact 2024 physical silver production was not source-locked in this pass |

A particularly important correction is **Mount Milligan**. Its 2024 cost bridge is otherwise unusually good: US$306.3m production costs plus US$10.2m third-party smelting/refining/transport before credits, with 167,579 oz Au. However, Centerra's own reporting calls the copper quantity `payable copper produced`. Treating it as contained Cu would violate the pilot denominator rule, so the operation remains partial.

## Statistical status

The research curve is still `NOT_READY`: **15 < 20** source-complete mine observations. The extra research has nevertheless tested the methodology across cathode/concentrate combinations, precious-metal co-products and a Zn co-product without allowing denominator conversion or unsupported product prices by inference.

The next batch should seek at least five additional full-calendar-year, full-operation observations with source-locked contained Cu, complete physical co-product vectors and decomposable pre-by-product common cash pools. Reaching 20 only permits calculation of research Q1/P50/Q3; it does **not** activate the Compare Stocks Tier gate. A separate sample/activation audit is mandatory.
