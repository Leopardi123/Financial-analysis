# Tier · Cu C1 methodology audit · third public-source pass

Status: **public evidence materially strengthened; exact current S&P Cu C1 contract remains NOT_VERIFIED.**

Date: 2026-09-02.

This note extends `tier1-cu-c1-methodology-evidence.md`. It records the third targeted public-source search after the generic normalization and source-locked recipe layers were completed. It does not alter Project economics and does not activate the Cu percentile gate.

## 1. The exact S&P methodology manual exists, but is not publicly retrievable

A 2025 peer-reviewed Nature Communications paper cites the exact source:

`S&P Global Market Intelligence. Mine Economics Methodology, Market Intelligence Metals & Mining Database. S&P Capital IQ Pro (2021)`

and gives the help URL:

`https://www.snl.com/help/Mine_Economics_Methodology.htm`

That URL redirects to:

`https://www.capitaliq.spglobal.com/help/Mine_Economics_Methodology.htm`

The current public web session cannot retrieve the methodology contents after the Capital IQ redirect. This is important: the missing definition is not hypothetical. S&P has a named methodology resource, but the detailed field definitions appear to be product/help content rather than public marketing material.

Peer-reviewed source:

`https://www.nature.com/articles/s41467-025-62570-8`

## 2. Paid-metal basis is now independently corroborated

A STRADE policy brief explicitly based on SNL Mine Economics describes the dataset as a granular, bottom-up model calibrated to reported costs. It states that costs are presented in US dollars per unit of **paid metal produced**, where paid metal is the amount in the intermediary product for which the mining company receives revenue after smelting/refining losses.

Source:

`https://stradeproject.eu/fileadmin/user_upload/pdf/PolicyBrief_08-2016_Nov2016_FINAL.pdf`

A separate peer-reviewed 2022 study using S&P Global Mine Economics likewise describes total cash cost on a paid-metal basis and explains paid metal as processed metal adjusted for the payable amount retained after smelter/refinery economics.

Source:

`https://link.springer.com/article/10.1111/jiec.13239`

**Consequence:** the current Tier contract's exact Cu product / paid-or-payable denominator remains well supported. No change is needed.

## 3. Historical SNL cost-component evidence is stronger, but still does not define current C1

The STRADE brief identifies the Mine Economics cost-curve building blocks as:

- labour;
- energy;
- reagents;
- other onsite;
- TCRC & shipment;
- royalty & production taxes.

It defines TCRC & shipment as product transport plus treatment/refining charges; for integrated operations the TCRC portion reflects operating costs of the integrated processing facilities. It defines royalty & production taxes as state/company/private royalties and production- or NSR-linked taxes, excluding corporate income tax. It calls total cash cost the total onsite plus offsite cash operating cost of the mine.

This corroborates the earlier SNL evidence that Mine Economics explicitly models realization/offsite costs and royalties rather than ignoring them.

It **does not** prove that the 2024 chart labelled `cash operating costs (C1)` uses every one of these historical TCC components. `TCC` and `C1` remain distinct source labels, and the current S&P curve must not inherit the old TCC boundary by assumption.

## 4. Current S&P evidence reinforces the distinction between modeled inputs and cost metrics

The current Mine Economics product page says the model uses inputs including commodity prices, fuel, FX, country-specific cost inflators for labour/electricity/reagents, concentrate/refining charges and tax rates. It also exposes multiple cost metrics such as All-in Costs, AISC and cash-cost/margin measures.

Source:

`https://www.spglobal.com/market-intelligence/en/solutions/products/mine-economics`

Current 2026 S&P research separately reports copper `TCC per metric ton of ore treated` and `AISC on a coproduct basis`. A current S&P special report also presents a 2025 copper curve labelled `Total cash cost ¢/lb`, while the Ivanhoe Electric benchmark used by Tier is specifically a **2024 cash operating costs (C1), co-product basis, Paid Copper** curve.

Sources:

`https://www.spglobal.com/market-intelligence/en/news-insights/research/2026/01/mine-cost-outlook-2026-inflation-new-supply-reshape-global-mining-landscape`

`https://www.spglobal.com/en/research-insights/special-reports/copper-in-the-age-of-ai`

**Consequence:** current S&P itself uses multiple named cost metrics. A current TCC curve cannot be substituted for the specific 2024 C1 curve.

## 5. Cost-vintage policy is now hardened: exact benchmark year only

The current public Mine Economics material shows that cost changes are modeled through multiple drivers: labour, energy, reagents, fuel, FX and treatment charges, with country-specific inflators. This is incompatible with inventing a generic `project cost × CPI` restatement and calling it S&P-equivalent.

Tier policy is therefore:

**A project may pass the S&P 2024 Cu C1 vintage gate only when its normalized cost is source-locked to 2024, unless a separate S&P-compatible restatement method is later verified.**

No CPI, generic mining inflation, implicit FX or interpolation is permitted as a hidden fallback.

The runtime already enforces exact `costBaseYear === benchmarkDataYear`; `costVintagePolicy.test.ts` now regression-locks 2023 and 2025 as `NOT_VERIFIED` against the 2024 curve even when every other contract field is synthetically marked verified.

`costVintageAlignmentStatus` remains globally `NOT_VERIFIED` because no S&P restatement procedure has been obtained. Same-year equality is a project-specific way to avoid needing restatement; it is not evidence that S&P's general restatement methodology has been learned.

## 6. Exact 2024 allocation price/revenue vector is still not public

Public SNL material supports **net-revenue pro-rata** at a high level. Current S&P research demonstrates that commodity-price assumptions materially affect coproduct/by-product cost outcomes and that users can change commodity prices in the Mine Economics model.

What remains unknown for the exact 2024 actual curve is whether the revenue share uses, for example:

- actual/realized mine revenue;
- S&P annual benchmark prices;
- an S&P standardized price deck;
- payable metal value before or after specified TCRC/shipment/royalty deductions;
- another internal revenue field.

No public source found in this pass authorizes Tier to choose one of these possibilities. `revenueVectorStatus` therefore remains **NOT_VERIFIED**.

## 7. Stream / hedge / offtake treatment remains unknown

No public S&P source found in this pass defines how Mine Economics coproduct allocation treats streams, metal purchase agreements, hedges or similar encumbrances.

For a project with canonical evidence of no stream, this remains project-not-applicable. For Warintza and any other streamed project it remains a hard blocker. The global `streamTreatmentStatus` remains **NOT_VERIFIED**.

## 8. Full current C1 boundary remains unknown

The following can all be supported individually from public material, but they still cannot be assembled into a universal 2024 C1 formula without the current methodology definition:

- Mine Economics historically models onsite costs, TCRC/shipment and royalty/production taxes;
- current Mine Economics continues to model treatment charges and granular cost drivers;
- Santa Cruz's own reported C1 is mining + processing + G&A with royalties separately shown and is compared directly with the S&P C1 curve;
- current industry C1 definitions vary materially between companies;
- current S&P also publishes TCC and AISC as separate named metrics.

Therefore `componentBoundaryStatus` remains **NOT_VERIFIED**.

## 9. Contract state after third pass

| Contract item | Status after pass | Reason |
| --- | --- | --- |
| Exact Cu product | VERIFIED | current curve + paid-metal corroboration |
| Paid/payable denominator | VERIFIED | current curve + SNL/STRADE + peer-reviewed S&P-derived work |
| Co-product method | VERIFIED at high level | SNL net-revenue pro-rata evidence |
| Exact 2024 revenue/price vector | **NOT_VERIFIED** | no public field/formula definition |
| Stream treatment | **NOT_VERIFIED globally** | no public methodology found |
| Current C1 component boundary | **NOT_VERIFIED** | historical TCC evidence cannot be promoted to current C1 |
| Cost-year handling | exact-year-only guard VERIFIED as Tier policy; general S&P restatement **NOT_VERIFIED** | current S&P model is multi-driver, so no invented CPI restatement |

## 10. Remaining source needed

The next unlock requires the current S&P Mine Economics methodology/help definition or a written S&P Mine Economics analyst response that identifies the relevant fields/formulas for the 2024 copper co-product C1 curve.

A generic sales statement such as `costs are normalized` or `co-product costs use net revenue` is insufficient. To change a contract field to VERIFIED, evidence must identify the current metric/field definition and answer the specific questions captured in `tier1-sp-cu-c1-methodology-query.md`.

Until then the correct runtime result is **Ej verifierad** and no Cu percentile cost gate may activate.
