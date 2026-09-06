# Panuco 2025 FS → project_json_v3 mapping

Source: Ausenco Engineering Canada ULC, **Panuco Project NI 43-101 Technical Report and Feasibility Study**, effective 4 November 2025, report date 2 December 2025.

## Why this supersedes the active v2 interpretation

The active `VZLA.TO / p2` v2 already uses the 2025 FS, but v3 can remove two important compromises:

1. **Tax no longer needs a calibrated 38.5% / depreciation proxy for report reconciliation.** Table 22-2 publishes the annual `Total Corporate Taxes` series. The report leg therefore uses that series directly. Runtime separately uses the disclosed 30% Mexican Federal Income Tax plus an explicit 8.5% Special Mining Tax rule. The FS does not publish annual tax depreciation by asset pool, so no depreciation series is invented.
2. **Salvage is no longer a by-product credit.** The US$10m report salvage value is placed in `capital.terminalProceedsUSD`.
3. **Pre-production royalties are not guessed.** The FS gives all-in annual pre-production costs and discloses total pre-production private royalties, but not their annual split between Y-1 and the first 60 days of Y1. V3 keeps the pre-production cost rows all-in. The separately disclosed Y1 commercial royalty (US$7.0m Government + US$25.9m private NSR) is source-locked, and dynamic royalty proxies start after Y1.
4. **Runtime schedule is updated.** The old v2 placed first metal in 2028. Vizsla's Aug. 5, 2026 release still targets first silver production in **H2 2027**. That current guidance is used only to place the unchanged report-relative economic axis on calendar years.

## Hard period mapping

Table 22-2 uses exactly:

`Y-2, Y-1, Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8, Y9, Y10, Y11, Y12`

Therefore:

- `masterN = 13`
- `productionStartPeriod = 1` because Y-1 contains 90 kt mill feed and payable Ag/Au
- `nameplateCapacityPeriod = 5` because Y4 is the first 1.46 Mt / 4,000 tpd Phase 2 year
- t0 = Y-2 pre-production construction
- t1 = Y-1 pre-commercial production/ramp-up
- t2-t11 = operating periods
- t12-t13 = closure/terminal periods
- closure and salvage are in Y11/t12
- final US$2m working-capital release is in Y12/t13

The FS states a 21-month pre-production period, including two months of metal production before commercial production, and a 9.4-year production life. It also states that calendar years in the economic analysis are conceptual. The relative period axis is therefore never stretched to fit current guidance.

## Current runtime calendar anchor

Vizsla Silver, Aug. 5, 2026: targeted first silver production in **H2 2027**.

With report `productionStartPeriod=1`:

- t0 / Y-2 → 2026
- t1 / Y-1 / first payable production → 2027
- t2 / Y1 → 2028

No separate `constructionStart` calendar anchor is encoded from the company's construction-decision milestone.

## Report deck and fiscal assumptions

Section 22.3 / Table 22-1:

- Ag: **US$35.50/oz**
- Au: **US$3,100/oz**
- 5% discount rate
- cash flows discounted to the start of construction using a **mid-period** convention
- constant Q3 2025 US dollars
- 100% ownership; 100% equity funding in the FS

Section 22.4:

- Federal Income Tax: **30%**
- Special Mining Tax: **8.5%** on revenue less offsite charges, operating expenses and sale of capital assets
- tax depreciation: 10% pre-production development; 12% mining capital assets
- Government royalty: **1.0%** of gross Au/Ag revenue
- private NSRs: **2.0% and 3.5%** depending on concession
- LOM total corporate taxes: **US$1.364bn**
- LOM total royalties: approximately **US$242m**

Table 22-2 publishes the annual commercial Government/EMD and private-NSR cash flows. Because concession-level annual production is not published, runtime uses the post-Y1 weighted private NSR rate derived directly from the table: US$154.5m private NSR / US$4,852m net revenue = **3.1842539%**. The report reconciliation always uses the annual report series, not this proxy.

## Capital checks

Section 21.2.1 / Table 21-1:

- initial capital: **US$238.7m**
- expansion capital: **US$15.4m**
- sustaining capital: **US$287.3m**
- closure: **US$37.5m**

Table 22-2 is rounded to whole US$M and places:

- initial capital: 82 / 154 / 3 in Y-2 / Y-1 / Y1 → US$239m
- expansion: US$15m in Y3
- sustaining: US$287m annual sum
- closure: US$38m in Y11
- salvage: US$10m in Y11
- final working-capital release: US$2m in Y12

The fixture keeps the annual Table 22-2 rows for NPV/IRR reconstruction and separately tests the more precise summary checkpoints. No rounding difference is balanced away.

## Reconciliation target

Source: Section 22.5 and Table 22-1 pp.457-459; annual cash flow Table 22-2 pp.460-461.

Report:

- post-tax NPV5: **US$1.802bn**
- post-tax IRR: **111.1%**
- pre-tax NPV5: **US$2.842bn**
- pre-tax IRR: **159.3%**
- payback: 0.6 years post-tax / 0.4 years pre-tax

The FS evaluates cash flow monthly through Year 3 and quarterly for Years 4-9. The public table is annual and rounded to whole US$M. The v3 reconciliation therefore uses the report's mid-period convention on the annual source rows and an explicit 2% relative tolerance. Annual FCFF differences are retained as diagnostics and are not hidden with balancing items.

Expected annual-table reconstruction before the repository test:

- post-tax NPV5 ≈ **US$1.767bn** vs US$1.802bn (≈ **-1.93%**)
- post-tax IRR ≈ **111.59%** vs 111.1% (≈ **+0.44% relative**)
- pre-tax NPV5 ≈ **US$2.798bn** vs US$2.842bn (≈ **-1.54%**)
- pre-tax IRR ≈ **156.70%** vs 159.3% (≈ **-1.63% relative**)

These are preliminary independent checks. The canonical repository reconciliation test is authoritative once the branch build runs.

## Source pages

- Periods / economic assumptions: Section 22.3-22.3.1, pp.455-456
- Taxes / working capital / royalties: Section 22.4-22.4.2, pp.456-457
- NPV / IRR: Section 22.5 and Table 22-1, pp.457-459
- Annual economics / physical schedule / capex / tax / FCFF: Table 22-2, pp.460-461
- Capital estimate: Section 21.2.1 / Table 21-1, pp.434-435
