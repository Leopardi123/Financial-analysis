# Arctic FS → project_json_v3 mapping

Source: Trilogy Metals, **Arctic Project – NI 43-101 Technical Report and Feasibility Study**, effective January 20, 2023.

Status: **IMPLEMENTED AS GOLDEN FIXTURE; CI verification pending for the current commit.** The report-relative model is implemented in `src/lib/project/jsonv3/__tests__/fixtures/arcticFs.ts`. Do not label it VERIFIED until the same-engine golden test passes on the branch.

## 1. Relative report timeline and runtime placement

Section 22.3 and Table 22-4 define three pre-production construction years, thirteen production years, and a final closure year:

- `t=0` = Year -3 = construction
- `t=1` = Year -2 = construction
- `t=2` = Year -1 = construction
- `t=3` = Year 1 = first production / ramp-up
- `t=4..15` = Years 2..13 = operations
- `t=16` = Year 14 = closure only

V3 contract:

- `masterN = 16`
- `productionStartPeriod = 3`
- `nameplateCapacityPeriod = 4`
- `reportPeriodLabels = ['-3','-2','-1','1',...,'14']`
- `phaseByPeriod = construction ×3, ramp_up ×1, operations ×12, closure ×1`

The process plant is designed for approximately 10,000 t/d or 3.65 Mt/y; Table 22-4 reaches 3.65 Mt in Year 2, supporting `nameplateCapacityPeriod=4`.

User-supplied runtime production start is 2032. Therefore the runtime calendar is `t=0 → 2029`, `t=3 → 2032`, `t=16 → 2045`. Only `runtimePlacement.productionStart` carries this calendar anchor. No FS-relative economic series is shifted.

## 2. Report deck and financial checkpoints

Section 19.2 / Table 19-1:

- Cu: US$3.65/lb → `CU_USD_LB`
- Zn: US$1.15/lb → `ZN_USD_LB`
- Pb: US$1.00/lb → `PB_USD_LB`
- Au: US$1,650/oz → `XAU_USD_TOZ`
- Ag: US$21/oz → `XAG_USD_TOZ`

All five price keys are verified repository keys; none is inferred.

Section 22 uses an 8% discount rate. Table 22-4 discounts Year -3 by one full annual period, so the report convention is `period_end_from_model_start`.

Report targets:

- Pre-tax NPV8: US$1,500.3m
- Pre-tax IRR: 25.8%
- Post-tax NPV8: US$1,108.1m
- Post-tax IRR: 22.8%
- Post-tax LOM tax: US$922.7m

Control sources: Table 22-2 pp.390-391, Table 22-3 p.392, Table 22-4 pp.393-394.

## 3. Commercial production

Table 22-4 publishes annual payable quantities directly. Every economic metal therefore uses `PAYABLE_DIRECT`; payability is not deducted again.

Year 1..13 report series:

- Cu ('000 lb): `[151175,146013,142583,137387,134852,141803,167411,142499,143517,163112,173249,144427,144855]`
- Zn ('000 lb): `[143256,149381,156519,170411,173700,151480,188011,186782,150724,186729,206931,191688,188157]`
- Pb ('000 lb): `[21068,23396,26443,27266,24590,22721,26400,28209,18325,24684,29618,30845,31220]`
- Au ('000 oz): `[22,29,31,34,26,26,30,34,28,38,45,38,40]`
- Ag ('000 oz): `[2362,2530,2593,2541,2355,2512,2755,2877,2446,3179,3449,3112,3336]`

The annual rows are rounded. At the report deck the rounded payable series gives approximately US$11,421.8m recovered metal value versus the report LOM checkpoint US$11,424.9m. No balancing revenue is added.

Mill feed kt, Year 1..13:

`[3012,3650,3650,3650,3650,3650,3650,3651,3650,3650,3650,3650,3529]`

## 4. Site OPEX

Table 22-4 annual components are used directly in `costModel.COMPONENTS`:

- Mining US$m: `[95.5,91.0,91.5,92.0,85.1,93.4,85.2,82.6,85.3,75.7,68.8,64.5,39.5]`
- Processing: `[72.0,81.5,82.1,82.1,82.1,82.1,82.1,82.1,82.1,82.1,82.1,82.1,80.3]`
- Water treatment: `[4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2,4.2]`
- G&A: `[21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0,21.0]`
- Road toll: `[9.1,9.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1,31.1]`

Published LOM on-site OPEX is US$2,793.6m. The rounded annual component rows sum to about US$0.8m less; this is retained as source rounding, not corrected with a hidden balancing component.

## 5. Capital

Table 22-4 gives exact report-period placement:

Initial CAPEX, US$m:

- Year -3: 234.4
- Year -2: 473.2
- Year -1: 469.2
- total: 1,176.8

Sustaining CAPEX, Year 1..13, US$m:

`[8.0,0,2.8,9.9,0.2,2.1,13.4,0.4,9.1,33.5,31.9,3.0,0]`

Rounded annual rows sum to 114.3m versus report checkpoint 114.4m. Closure/reclamation is US$428.4m entirely in Year 14 (`t=16`).

No separate working-capital or terminal-proceeds line is disclosed in the published FS cash-flow model. The V3 fields are therefore `null`, which compiles to no active cash-flow leg; zero is not fabricated as source evidence.

## 6. Off-site costs

Table 22-4 publishes one annual aggregate that already includes royalties, insurance, marketing/representation, refining, treatment, concentrate transport and penalties:

`[210.2,213.4,216.9,219.4,217.8,211.4,250.8,232.1,210.8,246.8,266.8,237.3,235.4]` US$m, LOM US$2,969.1m.

Section 19 separately discloses many contractual assumptions, including TC/RC, US$324.37/dmt transport, insurance at 0.15% of recovered concentrate value after specified deductions, US$2.50/wmt marketing, and the 1% NANA NSR included in the FS economics. However, the report does not disclose a complete annual decomposition of every penalty and price-responsive component.

The implemented golden fixture therefore uses `sellingModel.AGGREGATE` with the exact published annual off-site series and `fiscalTakeModel.NONE`. This is the only non-fabricated single source for report reconciliation and prevents double counting the royalty already embedded in the aggregate.

For normalized Spot/Bear, this means the published off-site dollar schedule is held fixed. That is an explicit model limitation, not a hidden decomposition. A future generic report-locked/runtime-proxy off-site contract could improve price responsiveness if needed, but Arctic is not blocked from report reconciliation or runtime solely because an exact penalty split is unavailable.

## 7. Tax — resolved without a tax-planning engine

The FS tax model was supplied by EY and includes US Federal Income Tax, Alaska State Income Tax (AST) and Alaska Mining License Tax (AMLT). The report discloses, among other items:

- federal corporate tax 21%
- federal percentage depletion: 15% for Au/Ag/Cu and 22% for Pb/Zn, subject to the report limits
- TCJA loss carryforward rules, including the 80% future-taxable-income offset limit
- Alaska state income tax graduated to 9.4%
- AMLT with a 3.5-year exemption after production starts, its own depletion treatment and no AMLT loss carryforward
- zero opening adjusted mineral-property basis, zero opening tax losses, zero EIC balance and no new EIC earned in the report case

The public FS does not disclose enough annual tax-pool detail to rebuild that statutory model exactly, and the dashboard must not become a tax-planning engine.

### Report leg

Table 22-4 annual cash tax, US$m, Year 1..13:

`[10.4,11.3,30.0,61.2,64.6,67.7,106.4,90.5,76.6,112.6,132.3,101.2,57.9]`

LOM = US$922.7m. `REPORT_LOCKED_WITH_RUNTIME_PROXY.reportTaxCashFlowUSD` uses this series exactly for report reconciliation.

### Runtime leg

Runtime uses a **19% conservative effective cash-tax proxy** through the existing simple rate + loss-carryforward engine mechanics. The 19% is **not** presented as the statutory combined tax rate.

Calibration on the same rounded Arctic report-deck inputs:

- report cash tax: US$922.7m
- 19% runtime proxy cash tax: approximately US$1,053.7m
- proxy/report: approximately **1.142x**, or **+14.2%**

This deliberately sits near the upper end of the V3 template's normal 5–15% conservative calibration range. It is intended to be somewhat too high rather than materially too low, while remaining economically plausible. The runtime proxy does not model depletion pools, EICs, AMLT holiday detail, depreciation classes or other tax-planning mechanics.

This resolves normalized post-tax runtime tax. Tax is no longer an `UNKNOWN`/blocked item for Arctic.

## 8. Reported cost checkpoints

Table 22-2 reports:

- `Cash Costs, Net of By-product Credits` = US$0.72/lb Cu payable
- `All-in Cost*, Net of By-product Credits` = US$1.61/lb Cu payable
- footnote: `*All-in cost includes all operating and sustaining capital costs`

The fixture preserves those labels verbatim in semantic checkpoint names/notes. US$0.72/lb is not silently renamed C1 and US$1.61/lb is not silently renamed AISC. They remain evidence/checkpoints and never override Project economics.

## 9. Reconciliation tolerance

The public annual payable and cash-flow rows are rounded. Using those rounded payable quantities with the exact report deck and the published annual cost/tax rows gives annual pre/post-tax FCFF differences below US$1m versus Table 22-4.

The rounded annual cash flows imply IRRs slightly above the headline rounded IRRs, so the Arctic fixture uses an explicit **2.25% relative NPV/IRR tolerance**. This is slightly wider than the normal 1–2% range and is documented specifically for published-table rounding. No hidden balancing inputs are permitted.

The golden test must report:

- report vs model NPV8, pre- and post-tax
- report vs model IRR, pre- and post-tax
- max annual FCFF difference
- runtime proxy tax / report tax ratio
- calendar mapping 2029 / 2032 / 2045

## 10. Implementation files

- `src/lib/project/jsonv3/__tests__/fixtures/arcticFs.ts`
- `src/lib/project/jsonv3/__tests__/arcticFs.test.ts`
- `src/lib/project/jsonv3/template.ts` now explicitly requires resolved runtime tax and documents conservative effective-cash proxy calibration.
- `package.json` includes the V3 golden suite in `prebuild`, so Arctic and the existing Vizcachitas/Berg/Warintza fixtures must pass before a deployment build succeeds.
