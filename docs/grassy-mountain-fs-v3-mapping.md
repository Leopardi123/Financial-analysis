# Grassy Mountain 2026 FS → project_json_v3 mapping

Source: Ausenco Engineering Canada ULC et al., **Grassy Mountain Project S-K 1300 Technical Report Summary and Feasibility Study**, effective 27 May 2026, report date 14 July 2026.

## Status

**Ej verifierad.** The public FS is unusually good for annual cash-flow reconstruction, but it explicitly withholds the detailed closure timing used by the financial model: Table 19-2 states that yearly closure cash flows extend **20+ years beyond the end of mine life and are not shown**. The public table collapses the US$21.1m total closure cost into Y10. In addition, the report states that cash flows are taken at the **midpoint of each period**, while the annualized rounded table cannot reproduce the headline NPV/IRR within the locked 2% tolerance under that convention.

No balancing item, altered discount convention or widened tolerance is used to manufacture a match.

## Hard period mapping

Table 19-2 uses exactly:

`Y-2, Y-1, Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8, Y9, Y10`

Therefore:

- `masterN = 11`
- `productionStartPeriod = 1`: Y-1 already contains 5.2 kt resource mined, 0.8 koz recovered/payable Au, 0.9 koz recovered/payable Ag and US$2.9m revenue
- t0 / Y-2 = construction
- t1 / Y-1 = pre-commercial ramp-up
- t2-t10 = operating periods
- t11 / Y10 = mixed final-production / annualized closure period
- Table 19-2 places US$21.1m closure and US$15.8m salvage in Y10

The report states an **18-month construction period** and a **9.3-year mine life**. Those durations do not authorize inventing calendar years.

## Runtime calendar placement

`time.runtimePlacement = null` intentionally.

A current-source check through Paramount's September 2, 2026 BLM announcement and current Grassy Mountain project page confirms that the company has federal approvals and is sequencing work toward a construction decision, but it does **not** publish a construction-start year or first-production year. Therefore a 2027/2028/etc. runtime anchor would be a guess.

The fixture consequently fails closed when `requireRuntimePlacement=true`. It must not be activated in Project / Corporate / Compare Stocks until Paramount publishes a sourced calendar anchor.

## Report deck and assumptions

Sections 19.2-19.5, pp.292-295, and Tables 19-1/19-2:

- Au: **US$3,600/oz**
- Ag: **US$48/oz**
- discount rate: **5%**
- cash flows: **midpoint of each period**, discounted to start of construction
- Real Q2 2026 US dollars; no inflation
- 100% equity funding in the FS; financing costs excluded
- mine life: **9.3 years**
- US federal corporate income tax: **21%**
- Oregon tax: **7.6%** for net proceeds above US$1m
- total undiscounted tax: **US$117.2m**
- Sherry and Yates royalty: **1.5% of gross proceeds**, covering the Grassy Mountain deposit
- Seabridge: **10% NPI**, explicitly excluded from the FS because the model assumes conversion into Paramount equity when sufficient construction financing is secured
- other Project-area royalties do not cover claims hosting current Mineral Resources or Mineral Reserves

The report tax leg uses the exact rounded annual Table 19-2 tax series. Runtime uses only a transparent 28.6% nominal proxy with loss carryforward; it does not pretend to reconstruct MNP's unpublished tax pools.

## Production and revenue

Table 19-2 publishes annual recovered and payable metal. V3 uses the payable rows directly as the revenue quantities:

- payable Au: **385.5 koz** total
- payable Ag: **477.7 koz** total
- recovered Au: **385.8 koz** total
- recovered Ag: **480.1 koz** total

At the locked report deck, the rounded payable quantities reconstruct annual revenue to within US$0.2m per period of Table 19-2, which is consistent with the table's 0.1 koz / US$0.1m rounding.

The process plant design is **750 short tons/day** (Section 1.16 p.15). Table 19-2's `Total Resource Mined` row is preserved as `oreMinedTonnes`; it is not silently relabelled as an annual mill-feed series.

## Cost, royalty and capital mapping

Table 19-2's annual top-level `Operating Cost` row is canonical for project economics because pre-commercial mining/processing costs are capitalized by the FS. The separate mine/mill/G&A detail is retained as source evidence but is not simultaneously added as a second cost source.

- refining charges: exact annual Table 19-2 row
- royalty: exact annual Table 19-2 row in the report leg; dynamic 1.5% gross-proceeds rule in runtime
- initial CAPEX: **US$189.8m** = 55.4 / 134.4 in Y-2 / Y-1
- sustaining CAPEX annual Table 19-2 sum: **US$64.9m**
- sustaining CAPEX Table 19-1 summary: **US$65.1m**
- report-internal sustaining difference: **US$0.2m**, preserved explicitly and never balanced away
- closure total: **US$21.1m**
- salvage: **US$15.8m**
- no separate working-capital line is disclosed in Table 19-2; its published pre-tax FCF identity closes without one, so the annual-table fixture has a zero WC series rather than an invented schedule

The US$21.1m annualized Y10 closure placement is **not** claimed to reproduce the detailed financial-model closure schedule. The report expressly says that detailed closure cash flows extend more than 20 years beyond mine life.

## Annual cash-flow reproduction

Using only Table 19-2 payable metal, report prices, annual operating/refining/royalty/capital rows and the published tax row, the Project engine reproduces each annual pre- and post-tax FCFF period within approximately US$0.2m. The residual is explained by the report's rounded 0.1 koz and US$0.1m inputs.

Report headline, Section 19.6 / Table 19-1:

- pre-tax NPV5: **US$458.9m**
- pre-tax IRR: **42.8%**
- post-tax NPV5: **US$374.7m**
- post-tax IRR: **38.9%**
- pre-tax undiscounted FCF: **US$658.0m**
- post-tax undiscounted FCF: **US$540.7m**

The canonical reconciliation uses the report-required **5% mid-period convention**, not the period-end convention that happens to fit the annualized table more closely.

Expected annual-table reconstruction from the fixture is approximately:

- post-tax NPV5: **US$364.9m** vs US$374.7m, about **-2.62%**
- post-tax IRR: **37.85%** vs 38.9%, about **-2.70% relative**
- pre-tax NPV5: **US$447.0m** vs US$458.9m, about **-2.60%**
- pre-tax IRR: **41.63%** vs 42.8%, about **-2.74% relative**

With `toleranceRelative = 0.02`, the JSON therefore remains **Ej verifierad**. This is intentional: the missing detailed closure timing / intra-period timing is material enough to prevent the public annual table from satisfying the hard reconciliation guard.

## Cost checkpoints

Table 19-1:

- cash cost net of silver by-product: **US$1,217.95/oz Au**
- project-level AISC net of silver by-product: **US$1,441.57/oz Au**

The report defines cash cost as mining + processing + mine-level G&A + refining + royalties. AISC adds sustaining capital and closure; corporate G&A is excluded.

## Source pages

- property royalties / encumbrances: Sections 3.2-3.3, pp.35-38
- process capacity: Section 1.16, p.15
- methodology / midpoint convention: Sections 19.2-19.3, pp.292-293
- taxes: Section 19.4, pp.293-294
- royalty treatment: Section 19.5, pp.293-295
- NPV / IRR: Section 19.6 and Table 19-1, pp.294-296
- annual economics, production, capital and FCFF: Table 19-2, pp.296-298
