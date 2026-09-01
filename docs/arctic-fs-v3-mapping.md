# Arctic FS → project_json_v3 mapping

Source: Trilogy Metals, **Arctic Project – NI 43-101 Technical Report and Feasibility Study**, effective January 20, 2023.

Status: **WORKING / NOT VERIFIED**. This note records source-backed mapping before a runnable V3 fixture is created. Do not treat it as a substitute for the final report-deck reconciliation.

## 1. Relative report timeline

Section 22.3 and Table 22-4 define three pre-production construction years, thirteen production years, and a final closure year:

- `t=0` = Year -3 = construction
- `t=1` = Year -2 = construction
- `t=2` = Year -1 = construction
- `t=3` = Year 1 = first production
- `t=4..15` = Years 2..13 = production
- `t=16` = Year 14 = closure only

Provisional V3 time contract:

- `masterN = 16`
- `productionStartPeriod = 3`
- `reportPeriodLabels = ['-3','-2','-1','1',...,'14']`
- `phaseByPeriod = ['construction','construction','construction', 13 x 'operations', 'closure']`

User-supplied runtime production start is 2032. This implies `t=0 = 2029` and closure in 2045. Only `runtimePlacement.productionStart` should carry this calendar anchor; the relative FS economics must not be shifted.

## 2. Report economic deck and checkpoints

Table 19-1 / Section 19.2 report economic prices:

- Cu: US$3.65/lb
- Zn: US$1.15/lb
- Pb: US$1.00/lb
- Au: US$1,650/oz
- Ag: US$21/oz

Verified canonical project price keys in the repository:

- Cu → `CU_USD_LB`
- Zn → `ZN_USD_LB`
- Pb → `PB_USD_LB`
- Au → `XAU_USD_TOZ`
- Ag → `XAG_USD_TOZ`

Section 22 uses an 8% discount rate. NPV is calculated at the beginning of construction in Year -3. Table 22-4 discounted rows show Year -3 cash flow discounted by one full annual period, so the V3 report convention is `period_end_from_model_start`.

Report targets:

- Pre-tax NPV8: US$1,500.3m
- Pre-tax IRR: 25.8%
- Post-tax NPV8: US$1,108.1m
- Post-tax IRR: 22.8%
- Post-tax LOM tax: US$922.7m

Control sources: Table 22-2 pp.390-391, Table 22-3 p.392, Table 22-4 pp.393-394.

## 3. Direct payable production

Table 22-4 publishes direct annual payable quantities. These should be canonical `PAYABLE_DIRECT`; do not rebuild payable production from grade × recovery × payability.

Year 1..13 annual series (report units):

- Cu ('000 lb): `[151175,146013,142583,137387,134852,141803,167411,142499,143517,163112,173249,144427,144855]`
- Zn ('000 lb): `[143256,149381,156519,170411,173700,151480,188011,186782,150724,186729,206931,191688,188157]`
- Pb ('000 lb): `[21068,23396,26443,27266,24590,22721,26400,28209,18325,24684,29618,30845,31220]`
- Au ('000 oz): `[22,29,31,34,26,26,30,34,28,38,45,38,40]`
- Ag ('000 oz): `[2362,2530,2593,2541,2355,2512,2755,2877,2446,3179,3449,3112,3336]`

LOM reported payables: Cu 1,932,882 klb; Zn 2,243,771 klb; Pb 334,785 klb; Au 423 koz; Ag 36,047 koz. Annual rows are rounded and therefore need explicit reconciliation tolerance rather than hidden balancing adjustments.

## 4. Ore and concentrate schedule

Mill feed kt, Year 1..13:

`[3012,3650,3650,3650,3650,3650,3650,3651,3650,3650,3650,3650,3529]`

Concentrate dry tonnes, Year 1..13:

- Cu kt: `[232.4,227.7,223.4,213.4,210.7,221.9,258.0,219.9,226.8,252.4,265.3,221.9,221.2]`
- Zn kt: `[142.2,149.8,156.6,169.7,172.6,152.1,186.0,184.9,151.3,184.8,203.3,189.4,185.7]`
- Pb kt: `[19.7,21.3,23.3,23.5,21.7,20.8,24.1,24.4,17.7,22.7,26.4,26.2,26.4]`

Process design specifies 6% final filter-cake moisture for Cu, Pb and Zn concentrate. This is relevant to the report's US$2.50/wmt marketing allowance.

## 5. On-site OPEX

Use Table 22-4 annual dollars, not repeated LOM $/t averages.

Year 1..13, US$m:

- Mining: `[95.5,91.0,91.5,92.0,85.1,93.4,85.2,82.6,85.3,75.7,68.8,64.5,39.5]`
- Processing: `[72.0,81.5,82.1,82.1,82.1,82.1,82.1,82.1,82.1,82.1,82.1,82.1,80.3]`
- Water treatment: `[4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2]`
- G&A: `[21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0]`
- Road toll: `[9.1,9.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1]`

LOM total = US$2,793.6m. V3 mapping should use `COMPONENTS`, with water treatment and road toll retained as distinct `other_site_opex` components.

## 6. Capital mapping

Table 22-4 gives report-period placement explicitly.

Initial CAPEX, US$m:

- Year -3: 234.4
- Year -2: 473.2
- Year -1: 469.2
- total: 1,176.8

Sustaining CAPEX after first production, US$m, Year 1..13:

`[8.0,0,2.8,9.9,0.2,2.1,13.4,0.4,9.1,33.5,31.9,3.0,0]`

Rounded annual rows sum to 114.3m while the report checkpoint is 114.4m. Do not create a balancing dollar series solely to force the rounded total.

Closure/reclamation: US$428.4m entirely in Year 14 (`t=16`).

No working-capital line or working-capital discussion was found in the FS, and Table 22-4 pre-tax cash flow is reproduced period-by-period (within US$0.1m row rounding) by recovered metal value less off-site charges, on-site OPEX and CAPEX. This is evidence that no separate working-capital cash-flow leg is present in the published economic model; final fixture should preserve this audit note if `workingCapitalDeltaUSD` is set to zero.

## 7. Published off-site aggregate — V3 semantic blocker

Table 22-4 publishes only one annual aggregate for:

`Royalties, Insurance, Marketing and Representation Fees, Refining, Treatment, Concentrate Transport, and Penalties`

Year 1..13, US$m:

`[210.2,213.4,216.9,219.4,217.8,211.4,250.8,232.1,210.8,246.8,266.8,237.3,235.4]`

LOM = US$2,969.1m.

Section 19 provides source terms:

- Cu TC US$80/dmt; Cu RC US$0.08/payable lb; Ag RC US$0.50/payable oz where applicable.
- Zn TC US$215/dmt; no price participation.
- Pb TC US$160/dmt; Au RC US$20/payable oz; Ag RC US$1.25/payable oz.
- Transport US$324.37/dmt all concentrates.
- Insurance = 0.15% of recovered concentrate value less refining, smelting/TC and penalties.
- Marketing/representation = US$2.50/wmt.
- NANA surface-use royalty = 1.0% NSR and is included in the FS economics.
- Alaska 3% production royalty does not apply to Arctic because the project is on patented federal claims.

The report also discloses penalty chemistry, but not enough to reconstruct every modelled penalty exactly. In particular, lead concentrate is described with 0.55% Se, 1,500 ppm F for marketing evaluation, and an indicated 4–6% Mg/MgO range; the exact MgO point used by the economic model is not disclosed. Copper selenium is described as close to relevant limits but an exact economic-model value is not published in the identified tables.

### Why current V3 cannot yet represent this safely

Current `sellingModel` accepts only fixed annual USD series (`AGGREGATE`) or fixed annual USD component series (`COMPONENTS`). That is sufficient for report-deck reproduction but would freeze the 0.15% insurance leg under Spot/Bear. The published aggregate also contains the 1% NANA NSR, so using the aggregate while separately adding a dynamic royalty would double count.

Do **not** solve this by guessing a penalty split, choosing the midpoint of 4–6% MgO, or silently freezing the whole US$2.9691bn aggregate for normalized price scenarios.

Arctic therefore exposes a real V3 capability gap: a report may disclose an exact aggregate annual deduction for reconciliation while also disclosing that part of that aggregate is price-responsive, without disclosing a complete exact decomposition.

Candidate architecture for review: add an explicit report-locked/runtime-proxy contract for off-site deductions, analogous in intent to `REPORT_LOCKED_WITH_RUNTIME_PROXY` tax. Report reconciliation would consume Table 22-4's exact aggregate; normal runtime would only use source-backed dynamic/fixed terms and must fail closed for any unresolved material component rather than invent assumptions. This should be designed generically, not as an Arctic-specific exception.

## 8. Tax

Table 22-4 publishes annual total cash tax, US$m, Year 1..13:

`[10.4,11.3,30.0,61.2,64.6,67.7,106.4,90.5,76.6,112.6,132.3,101.2,57.9]`

Report tax model includes:

- US federal corporate tax 21%
- Alaska state income tax, graduated to 9.4%
- Alaska Mining License Tax, including a 3.5-year production exemption
- federal percentage depletion by metal
- TCJA loss carryforward rules / 80% taxable-income limit
- report assumptions of zero opening depletable/depreciable property basis, zero opening loss carryforward and zero EIC balance / no EIC earned

The public FS does not expose enough annual tax-pool detail to claim an exact dynamic normalized-price reconstruction. Report reconciliation should therefore use the Table 22-4 annual tax series. Do not invent a single blended runtime tax rate. Arctic normalized post-tax Spot/Bear remains `NOT VERIFIED` until a defensible runtime tax contract is implemented or an explicitly source-backed proxy policy is approved.

## 9. Reported cost checkpoints

Table 22-2 reports:

- `Cash Costs, Net of By-product Credits` = US$0.72/lb Cu payable
- `All-in Cost*, Net of By-product Credits` = US$1.61/lb Cu payable
- footnote: `*All-in cost includes all operating and sustaining capital costs`

Preserve the report labels and definition. The FS does **not** call the second metric AISC. Do not silently relabel US$1.61/lb as AISC.

The US$0.72/lb measure may be mapped to the canonical comparable C1 evidence path only with the report wording preserved and explicit definition metadata; it remains an evidence/checkpoint, never a parallel Project-engine cost input.

## 10. Table 22-4 arithmetic control

Using the published annual recovered-metal-value, off-site, on-site OPEX and sustaining/initial/closure rows reproduces each published pre-tax annual cash flow within ±US$0.1m, consistent with table rounding.

Using the rounded Table 22-4 annual cash-flow row with 8% period-end-from-model-start discounting gives values close to, but not exactly equal to, the published NPV/IRR because the public annual table is rounded and is not the underlying detailed model. A final V3 fixture must state the explicit annual-row and NPV/IRR tolerances; it must not add hidden balancing inputs.

## 11. Next implementation sequence

1. Add a generic V3 representation for report-locked off-site aggregate + source-backed runtime semantics, or formally fail runtime when a material price-responsive component is unresolved.
2. Add Arctic report fixture with exact relative timeline, direct payable quantities, annual OPEX, CAPEX, closure and report tax.
3. Reconcile pre-tax and post-tax NPV8/IRR through the same Project engine at the report deck.
4. Add 2032 as the runtime production-start anchor only after the report-relative golden case passes.
5. Keep normalized post-tax Spot/Bear `NOT VERIFIED` until tax runtime semantics are defensible.
