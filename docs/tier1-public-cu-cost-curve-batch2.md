# Tier · public Cu cost curve · batch 2 audit

Status: **RESEARCH_ONLY / 11 of 20 minimum source-complete 2024 observations. No Tier percentile is activated.**

This batch extends the public-disclosure Cu cost curve from 10 reviewed operations (5 eligible) to 19 reviewed operations (11 eligible). The metric and first-batch policy are unchanged: `TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED`, 2024 actual, contained Cu produced, one common cash-cost boundary, and gross contained-metal production value allocation at one fixed reference deck.

## New hard guards

Two additional eligibility conditions are now explicit in code:

- the observation must cover the **full calendar year 2024**;
- the observation must be reported on a **100% full-operation basis**, not an attributable ownership share.

The curve therefore rejects partial-year acquisition periods and attributable mine statistics even if a reported cash-cost number is otherwise available.

Cobalt was added only because Kinsevere has source-locked 2024 contained cobalt production. No API key or price series is inferred. The fixed research deck adds **Co = US$11.26/lb**, source-locked to the 2024 average MB cobalt metal price disclosed by Jinchuan Group International.

## Eligible observations after batch 2

| Operation | 2024 contained Cu | Canonical common pool | Physical co-products used | Normalized Cu cost |
| --- | ---: | ---: | --- | ---: |
| Kamoa-Kakula | 437,061 t | US$1,544.039m | none | 1.602441 |
| Constancia / Hudbay Peru | 99,001 t | US$554.0m | Au, Ag, Mo | 1.799071 |
| Copper Mountain | 26,406 t | US$216.1m | Au, Ag | 3.023580 |
| Kansanshi | 170,929 t | 2.24 USD/lb pre-credit pool | Au | 1.931082 |
| Sentinel | 231,000 t | 1.94 USD/lb | none | 1.940000 |
| Centinela | 223,800 t | 2.60 USD/lb before by-products | Au, Ag, Mo | 2.114236 |
| Kounrad | 13,439 t | US$23.740m | none | 0.801271 |
| Las Bambas | 322,912 t | US$1,339.3m | Au, Ag, Mo | 1.653198 |
| Kinsevere | 44,597 t | US$338.0m | Co | 2.919331 |
| El Roble | 13.714 Mlb Cu = 6,220.566 t | US$46.295m | Au, Ag | 2.413998 |
| MVC | 64.6 Mlb Cu = 29,302.067 t | US$149.268m | Mo | 2.094806 |

Total eligible contained Cu: **1,604,667.633 tonnes**.

### Source locks added in this batch

**Centinela.** Antofagasta's 2024 Annual Report gives full-operation production of 223.8 kt Cu, 140.3 koz Au, 853.5 koz Ag and 2.4 kt Mo, and cash costs before by-product credits of 2.60 USD/lb of copper produced. This resolves the first-pass denominator concern: the detailed production/sales statistics define the subsidiaries' figures as total mine production, while only Zaldívar is explicitly attributable.

**Kounrad.** Central Asia Metals reports 2024 Kounrad C1 cash costs of US$23.740m and 13,439 t copper production. With no disclosed economic co-product in the operation, the canonical allocation share is 100% Cu.

**Las Bambas.** MMG's 2024 Annual Results separate production expenses (US$1,254.1m), freight (US$85.2m), royalties and inventory/corporate `Other`. The canonical pool is therefore US$1,339.3m. MMG's later appendix publishes the FY2024 contained production vector: 322,912 t Cu, 63,427 oz Au, 3,938,602 oz Ag and 3,108 t Mo.

**Kinsevere.** MMG separates US$327.8m production expenses, US$10.2m freight and US$26.6m royalties. The canonical pool is US$338.0m. The FY2024 production report gives 44,597 t copper cathode and 2,926 t contained cobalt. Cobalt is weighted with the separately source-locked 2024 MB average of US$11.26/lb.

**El Roble.** Atico's MD&A gives a complete cash bridge. The common pool is aggregate cash production cost US$39.122m + refining US$4.256m + transportation US$2.917m = US$46.295m, before issuer by-product credits and excluding royalties. Physical production is 13.714 Mlb Cu, 9,106 oz Au and 35,451 oz Ag.

**MVC.** Amerigo reports 64.6 Mlb Cu and 1.3 Mlb Mo production. Its reconciliation requires an important correction to the first working draft: tolling/production costs include D&A. The canonical cash pool is therefore US$147.364m tolling/production **less US$23.351m D&A**, plus US$25.199m smelting/refining, US$1.645m transportation and the -US$1.589m inventory adjustment = **US$149.268m**. Royalties and issuer by-product credits are excluded. This yields 2.094806 USD/lb, not the higher preliminary number that resulted when D&A was accidentally left in the pool.

## Still partial after batch 2

| Operation | Blocker |
| --- | --- |
| Caraíba | copper-segment physical by-product quantities are not source-locked for the common fixed-deck allocation |
| Candelaria | issuer cash-cost denominator is contained Cu sold, not produced |
| Caserones | issuer cash-cost denominator is contained Cu sold, not produced |
| Chapada | issuer cash-cost denominator is contained Cu sold, not produced |
| Antucoya | issuer source conflict: 80.4 kt in operating review vs 80.5 kt in detailed production statistics |
| Zaldívar | Antofagasta explicitly reports the mine on attributable 50% basis rather than full-operation basis |
| Khoemacau | MMG's 2024 economics cover 23 March-31 December after acquisition, not the full calendar year |
| Los Pelambres | issuer source conflict: 8.4 kt Mo in operating snapshot vs 8.3 kt in detailed production statistics |

Nothing is midpointed, doubled, annualized or silently reconciled to force these rows into the curve.

## Statistical status

The curve remains `NOT_READY` because only **11** observations are eligible and the hard minimum is **20**. Q1/P50/Q3 remain `null`, and `comparisonEnabled` remains `false`.

The next batch should therefore continue to prioritize full-year, full-operation disclosures with decomposable pre-by-product operating cash pools. The goal remains 20 source-complete observations first; only then should the sample composition and production-weighted quartile policy receive a separate activation audit.
