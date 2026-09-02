# Tier · public Cu cost curve · batch 4 audit

Status: **RESEARCH_ONLY / 20 source-complete 2024 observations. Research quartiles may now be emitted, but no Tier percentile is activated.**

Batch 4 adds three new operations and closes two prior fail-closed blockers with new exact source evidence. The unique reviewed set is now **32 operations: 20 eligible and 12 partial**, covering **1,923,521.546 t contained Cu produced in 2024**.

## Eligible additions / upgrades

| Operation | 2024 contained Cu | Common pool | Physical co-products | Normalized Cu cost (USD/lb contained Cu) |
| --- | ---: | ---: | --- | ---: |
| CSA Copper Mine | 41,128 t | US$186.112m | Ag 114 koz | **2.035203** |
| Bolivar | 12,452.925 t (27.454 Mlb) | US$95.055m | Ag 812 koz; Au 13,424 oz | **2.337139** |
| Golden Grove | 21,900 t | A$474.6m × 0.660 = US$313.236m | Zn 56.7 kt; Au 21.4 koz; Ag 822 koz; Pb 0.91 kt | **2.998272** |
| New Afton | 24,493.988 t (54.0 Mlb) | US$180.4m | Au 71,550 oz; Ag 144,741 oz | **1.878743** |
| Zaldívar | 80,200 t full-operation | US$3.02/lb × 80.2 kt | none | **3.020000** |

New Afton and Zaldívar supersede their earlier `PARTIAL` rows rather than being double-counted. The curve builder removes those two old blockers before combining Batch 4.

## Source locks

### CSA Copper Mine

MAC Copper's 2024 Annual Report provides a complete C1 bridge. COGS net D&A, treatment/refining, freight and distribution/selling are reconciled to **US$186.112m C1 before by-product credits**, with government royalties and sustaining capital separately excluded. The denominator table reports **41.13 kt Copper Tons Produced**; the operating summary reports **41,128 t copper and 114.0 koz silver produced**. The pilot uses 41,128 t as the physical contained-Cu quantity and the absolute US$186.112m pre-credit pool.

### Bolivar

Sierra Metals reports FY2024 Bolivar production of **27.454 Mlb Cu, 812 koz Ag and 13,424 oz Au**. Its cash-cost bridge reports Total Cash Cost US$70.047m, T&R US$9.656m, selling US$9.981m, site G&A US$5.371m and a US$0.760m finished-inventory variation. Because the research metric is production-basis, the inventory variation is excluded; the canonical common pool is therefore **US$95.055m**. Sustaining capital is separately excluded.

### Golden Grove

29Metals' December 2024 Quarterly gives a fully decomposed annual boundary: mining A$248.2m, processing A$93.9m, site G&A A$25.1m, concentrate transport A$28.7m and TCRC A$78.7m. Stockpile movements, issuer by-product credits, royalties and capital are separately disclosed and excluded. The report states that production guidance/actuals are on a **contained metal in concentrate basis** and reports Cu 21.9 kt, Zn 56.7 kt, Au 21.4 koz, Ag 822 koz and Pb 0.91 kt. The same filing reports FY average USD:AUD **0.660**, producing a source-locked common pool of **US$313.236m**. No implicit FX is used.

Golden Grove introduces Pb into the fixed research allocation only with an explicit public 2024 reference price. 29Metals' 2024 Annual Financial Report reports average lead at **US$2,072/t**. No API series/key is inferred.

### New Afton blocker closed

The prior blocker was the missing exact 2024 physical silver quantity. The February 2025 NI 43-101 Technical Report, Table 6-1, source-locks the complete 2024 mine production vector: **54.0 Mlb Cu, 71,550 oz Au and 144,741 oz Ag**. New Gold's FY2024 cash-cost reconciliation supplies **US$160.7m operating expenses + US$19.7m treatment/refining**; issuer silver by-product revenue, sustaining capital and reclamation are excluded from the research common pool. The old `2024_ECONOMIC_SILVER_BYPRODUCT_PHYSICAL_PRODUCTION_NOT_SOURCE_LOCKED` failure is therefore superseded.

### Zaldívar blocker closed without guessed ownership

The earlier row failed because Antofagasta reported its **50% attributable** share. The 2024 production-statistics table explicitly labels Zaldívar as `attributable basis – 50%`, with **40.1 kt Cu** and **US$3.02/lb cash cost**. Because the ownership factor is explicit, not inferred, the full-operation physical denominator is exactly **80.2 kt** and the same factor is applied to the cash pool. Antofagasta defines cash cost as cost of production in US dollars per pound of copper produced. Zaldívar is an SX-EW copper-cathode operation, so no co-product allocation is required.

## Research quartiles now emitted

The minimum count is now met. Using the locked **contained-Cu-production-weighted nearest cumulative threshold** method:

- **Q1 max: US$1.653198/lb** — Las Bambas is the threshold observation.
- **P50 max: US$1.931082/lb** — Kansanshi is the threshold observation.
- **Q3 max: US$2.114236/lb** — Centinela is the threshold observation.

`status` may now be `RESEARCH_CURVE_READY`, but **`comparisonEnabled=false` remains mandatory**. These quartiles are research outputs, not a Tier benchmark.

## Guard

No Project JSON economic fixture is changed by Batch 4. Existing `project_json_v3` report reconciliation remains authoritative. No payable-to-contained relabelling, partial-year annualisation, implicit FX, guessed ownership factor, missing co-product zero, or guessed API series/key is used.

A separate sample/activation audit is required before any proposal to use this curve in Tier. See `docs/tier1-public-cu-cost-curve-sample-audit.md`.
