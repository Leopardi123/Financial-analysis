# Scottie Gold Mine Project - 2025 PEA -> project_json_v3 mapping

Status: **Ej verifierad**.

Source: Tetra Tech Canada Inc., *Preliminary Economic Assessment, NI 43-101 Technical Report, for the Scottie Gold Mine Project in Northwestern British Columbia, Canada*, effective 28 October 2025.

This document records exactly what was retained from the prior active `SCOT.V / p1 / Scottie hypo expenses` model, what was corrected against the PEA, and why the new V3 must remain explicitly unverified.

## Report-relative time axis

The PEA economic model states one pre-production construction period and a seven-year mine life. Figure 22-1 also carries a terminal Year 8 cash-flow period. The V3 therefore preserves nine periods:

`-1, Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8`

- `masterN = 8`
- `productionStartPeriod = 1`
- t0 = construction / pre-production
- t1 = production Y1 / ramp-up
- t2-t7 = operations Y2-Y7
- t8 = terminal / closure cash-flow period

Figure 24-1 shows construction in 2028 and `Full Scale Commercial Production` in 2029. Runtime uses only the sourced 2029 production anchor, which maps t0 to 2028 without changing the relative report axis.

The economic production schedule uses Table 25-1: 199 / 352 / 326 / 341 / 380 / 318 / 270 kt feed and 7.4 / 8.2 / 7.8 / 7.0 / 5.8 / 5.4 / 6.6 g/t Au for Y1-Y7.

The report contains an internal mine-schedule discrepancy: Table 16-20 shows 2.191 Mt across Y1-Y8 including a 4 kt Y8 tail, while Table 25-1 shows 2.186 Mt across Y1-Y7 and is the schedule repeated in the economic interpretation. The V3 does not blend the two; Table 25-1 is canonical for the economic leg and Y8 remains terminal.

## Audit of the old `hypo expenses` model

| Item | Old p1 treatment | PEA audit / new V3 treatment |
| --- | --- | --- |
| Relative periods | `masterN=8`, `tp=1` | Retained. This was the strongest part of p1 and matches the economic axis better than the disabled p3. |
| Calendar | 2029 production | Retained and source-linked to Figure 24-1; t0 maps to 2028. |
| Au quantity | 457,600 oz used directly as revenue quantity | Corrected. 457,600 oz is essentially contained gold after 94.7% recovery (`483 koz x 94.7%`) while Table 22-2 separately applies 86.5-89.0% smelter payability, LOM average 88.3%. V3 stores 457,600 oz as `metalInProductQtyByMetal` and 404,060.8 oz as revenue-bearing payable Au. |
| Annual Au shape | Prior annual shape normalized to 457,600 oz | Retained only as an explicit derived runtime proxy because the public PEA does not print an annual payable-Au table. |
| Sorted concentrate | 1.24 Mt allocated pro-rata to annual plant feed | Retained as an explicit proxy. The 1.24 Mt LOM total is reported; annual product tonnes are not. |
| TC / RC / freight / insurance | Report unit terms applied to the concentrate proxy | Retained structurally, but RC and invoice-value charges are recalculated after explicit 88.3% payability. |
| On-site OPEX | C$185.38/t x annual feed | Retained as a report-grounded LOM-average proxy. V3 exposes the six disclosed Table 21-3 components instead of hiding them inside one aggregate row. |
| Sustaining CAPEX | C$61.7m non-closure sustaining allocated pro-rata to feed | Still only a runtime proxy. Report discloses C$76.7m sustaining including C$15m closure, but not annual sustaining values. |
| Closure | C$15m spread equally over Y1-Y7 | Still only a runtime proxy. The report says closure is distributed over LOM but does not disclose the annual schedule. |
| Working capital | One month of annual at-mine revenue, fully released in Y8 | Still only a runtime proxy. The report states WC varies year-by-year and is recovered at mine-life end but gives no values. The proxy is recomputed after correcting payability. |
| Depreciation | 27.5% declining-balance proxy | Retained only as runtime tax-shield proxy; not report evidence. |
| Tax | 33% effective rate calibrated partly toward report IRR | Removed. V3 uses the disclosed general corporate 27% (15% federal + 12% BC) with loss carryforward as an explicit runtime proxy. It does **not** claim to reconstruct BC Mineral Tax, CDE/Class 41 pools or the new-mine allowance. |
| NPI | Not separately modeled | Remains unmodeled. Section 22.1 says NPI payments are included in PEA economics, but the public report does not disclose a rate, formula or annual series. No amount is guessed. |
| Salvage | C$12.9m stored as `byproductCreditsUSD` | Corrected to `capital.terminalProceedsUSD` in Y8. It is not metal revenue. |
| Royalty | 2% Franco-Nevada gross production royalty | Retained as a canonical fiscal rule on gross metal value. |
| Reported AISC | US$1,452/oz checkpoint | Retained as report evidence only. |

## Report assumption lock

- Au: **US$2,600/oz**
- FX: **CAD1.00 = USD0.72**
- Discount rate: **5%**
- Discount convention: **mid-year**
- Initial CAPEX: **C$128.6m**
- Sustaining CAPEX including closure: **C$76.7m**
- Closure/reclamation included above: **C$15.0m**
- Salvage: **C$12.9m**
- Franco-Nevada gross production royalty: **2.0%**
- Smelter payability: **86.5-89.0%, LOM 88.3%**
- TC: **US$70 + US$65/t dry product**
- RC: **US$6/payable Au oz**
- Product moisture: **3%**
- Site-to-port: **C$26.03/t wet product**
- Port handling: **C$33.50/t wet product**
- Ocean shipping: **US$50/t wet product**
- Insurance: **0.125% of invoiced product value**
- Product transport loss: **0.10% of product value**
- Corporate income tax rates: **15% federal + 12% BC**
- BC Mineral Tax: separate 2% / 13% regime with tax pools/new-mine allowance in the report model

## Mandatory reconciliation status

Report economic targets, translated to canonical USD with the report FX:

- Pre-tax NPV5: C$326.1m = **US$234.792m**
- Pre-tax IRR: **82.5%**
- After-tax NPV5: C$215.8m = **US$155.376m**
- After-tax IRR: **60.3%**
- Before-tax undiscounted FCF: C$419.1m
- After-tax undiscounted FCF: C$283.5m

The source-grounded proxy gets close to report pre-tax NPV in an independent cash-flow cross-check, but IRR cannot be reproduced because the annual cost/WC/tax/NPI timing needed to determine IRR is not public. The V3 golden test therefore deliberately requires `reconcileProjectJsonV3ToReport(...).status === 'NOT_VERIFIED'`.

Missing report evidence that prevents VERIFIED status:

1. annual sustaining-capital / closure allocation;
2. annual working-capital balances and unwind amount;
3. annual Federal / BC corporate tax and BC Mineral Tax cash-flow series, including tax pools and new-mine allowance;
4. NPI rate/formula or annual NPI cash-flow series;
5. exact annual payability/product settlement schedule rather than only the LOM 88.3% average.

No balancing item, calibrated tax rate or invented NPI is permitted to force NPV/IRR to match.
